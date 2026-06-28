#!/usr/bin/env node
/**
 * server.ts — the stdio JSON-RPC MCP server (the agent channel).
 *
 * Mirrors the stdio MCP shape of dudoxx-ai-hms/ddx-fhir-r4-mcp: a low-level
 * `Server` + setRequestHandler(ListTools / CallTool). DIFFERENCES from fhir-mcp:
 *   - ALL tool I/O schemas come from @ddx/term-contract (zod/v4) — never inlined.
 *   - inputSchema (JSON Schema) is derived from the contract via z.toJSONSchema.
 *   - the server holds NO PTY — every verb shells out to tmux via TmuxClient.
 *
 * Env (MCP-SPEC §2): DDX_TERM_SOCKET, DDX_TERM_SESSION, DDX_TERM_DEFAULT,
 * DDX_TERM_ALLOWLIST, DDX_TERM_MAX_READ_LINES, DDX_TERM_MAX_TERMINALS,
 * plus DDX_TERM_BROKER_URL (when set → broker-attached; else standalone).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { realpathSync } from 'node:fs';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  TERM_TOOL_INPUT_SCHEMAS,
  TERM_TOOL_NAMES,
  type TermToolName,
} from '@ddx/term-contract';
import { z } from 'zod/v4';

import { AllowList } from './allow-list.js';
import { loadConfig, type ToolContext } from './context.js';
import { ReadCursor } from './read-cursor.js';
import { toErrorBody } from './errors.js';
import { buildResolver } from './resolver-factory.js';
import { TmuxClient } from './tmux/tmux.client.js';
import { TERM_TOOL_DESCRIPTIONS, dispatch } from './tools/registry.js';

/** Assemble the ToolContext from env (broker- or standalone-mode resolver). */
export function buildContext(env: NodeJS.ProcessEnv): ToolContext {
  const config = loadConfig(env);
  const tmux = new TmuxClient({ socket: config.socket, session: config.session });
  const resolver = buildResolver(env, tmux);
  const cursor = new ReadCursor();
  const allowList = AllowList.fromPath(config.allowlistPath);
  return { tmux, resolver, cursor, allowList, config };
}

/** Build a low-level MCP Server wired to the term verbs. */
export function buildServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: 'ddx-term-mcp', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Shared-terminal agent channel over a single tmux session. Address terminals ' +
        'by terminalId (durable); signal/observe by pid (transient). term_send is ' +
        'literal text + a separate Enter; control keys / TUI nav go through term_signal.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TERM_TOOL_NAMES.map((name) => ({
      name,
      description: TERM_TOOL_DESCRIPTIONS[name],
      inputSchema: z.toJSONSchema(TERM_TOOL_INPUT_SCHEMAS[name], { io: 'input' }) as {
        type: 'object';
        properties?: Record<string, unknown>;
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    if (!TERM_TOOL_NAMES.includes(name as TermToolName)) {
      const body = toErrorBody(new Error(`unknown tool: ${name}`));
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
    }
    const toolName = name as TermToolName;
    const inputSchema = TERM_TOOL_INPUT_SCHEMAS[toolName];
    const parsed = inputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      const body = toErrorBody(new Error(`invalid args for ${toolName}: ${parsed.error.message}`));
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
    }
    try {
      const result = await dispatch(ctx, toolName, parsed.data);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const body = toErrorBody(err);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const ctx = buildContext(process.env);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[ddx-term-mcp] connected. socket=${ctx.config.socket} session=${ctx.config.session} default=${ctx.config.defaultTerminal}\n`,
  );
}

// Only auto-start when run as the entry point (not when imported by a test).
// Compare REALPATH-resolved file URLs: import.meta.url is symlink-resolved by
// the runtime (macOS /tmp → /private/tmp), so argv[1] must be realpath'd too,
// then URL-encoded via pathToFileURL — a plain `file://${argv[1]}` never matches.
function isEntryPoint(): boolean {
  const entryArg = argv[1];
  if (entryArg === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entryArg)).href;
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  main().catch((err: unknown) => {
    process.stderr.write(`[ddx-term-mcp] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  });
}
