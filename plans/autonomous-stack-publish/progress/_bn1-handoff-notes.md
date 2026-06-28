# bn1 handoff notes (from Wave B lead-verification — READ before bundling)

GROUND TRUTH verified on disk 2026-06-28:
1. `ws` is ABSENT from ddx-term-web/.next/standalone/node_modules/ (nft traces server.js,
   not the custom server.mjs). bn1 MUST copy ws (+ bufferutil, utf-8-validate if present)
   into dist/web/node_modules/ or the /term/* WS-upgrade proxy breaks at runtime.
2. `.next/static` is NOT inside .next/standalone by default — bn1 MUST copy it to the
   NESTED path .next/standalone/ddx-term-web/.next/static/ (standalone nests under a
   ddx-term-web/ subdir per Neo's on-disk layout) or browser assets 404.
3. The standalone server entry is the custom server.mjs (NOT the scaffolded server.js).
   dist/web runnable set (verified by Neo on disk):
   - .next/standalone/*  (traced bundle, copy verbatim)
   - .next/static  -> copy to .next/standalone/ddx-term-web/.next/static/
   - server.mjs   (real entrypoint, sits adjacent to standalone)
   - messages/    (next-intl en/de/fr JSONs — MUST be runtime-reachable)
   - public/      DOES NOT EXIST — nothing to copy (do not chase it)
   - ws ABSENT from traced node_modules (see #1) — inject before packing.
4. Supervisor (s1) sets DDX_TERM_BROKER_WS + BROKER_BASE_URL (web env) — not DDX_TERM_BROKER_URL.
