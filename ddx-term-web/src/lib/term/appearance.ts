/**
 * src/lib/term/appearance.ts — terminal appearance model (font size + color themes).
 *
 * xterm.js consumes a plain ITheme object of hex/rgb strings — it cannot parse
 * OKLCH or CSS var() references (see globals.css note + XtermClient.buildTheme).
 * So the color "templates" the user picks from are a TS registry of literal hex
 * ITheme objects. This is the ONE place raw hex is legitimate in the web app —
 * the same exemption the `--xterm-*-hex` @theme mirrors already carve out — and
 * it lives in a `.ts` file (never a `.tsx`) per the design-system separation rule.
 *
 * Font size affects the CSS render size ONLY. The grid stays pinned at the
 * broker's 120×30 (XtermClient.COLS/ROWS) — a larger font means a physically
 * bigger pane, never a renegotiated column count, so cursor-relative escapes
 * still resolve identically on both sides of the bridge.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

/** The subset of xterm's ITheme we expose as a selectable color template. */
export interface TermColorTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/** A named, user-selectable color template. */
export interface TermThemeDef {
  /** Stable id persisted to localStorage. Never change once shipped. */
  readonly id: string;
  /** i18n key suffix under `terminal.themes.*` for the display label. */
  readonly labelKey: string;
  readonly colors: TermColorTheme;
}

// ── Theme registry ───────────────────────────────────────────────────────────
// Each entry is a complete 16-color ANSI palette + chrome. Ordered light→dark
// intent; the first entry is the default and mirrors the existing globals.css
// `--xterm-*-hex` values so the out-of-box look is unchanged.

export const TERM_THEMES: readonly TermThemeDef[] = [
  {
    id: 'dudoxx-navy',
    labelKey: 'dudoxxNavy',
    colors: {
      background: '#18192b', foreground: '#e8e9f0',
      cursor: '#7c8aff', cursorAccent: '#18192b', selectionBackground: '#3a3d60',
      black: '#1c1d2e', red: '#ff6b6b', green: '#6bd968', yellow: '#f2c94c',
      blue: '#7c8aff', magenta: '#c792ea', cyan: '#56d4dd', white: '#d6d8e6',
      brightBlack: '#5a5d78', brightRed: '#ff8787', brightGreen: '#95e094',
      brightYellow: '#f7d774', brightBlue: '#9aa5ff', brightMagenta: '#d7aef0',
      brightCyan: '#7fe0e6', brightWhite: '#f4f5fb',
    },
  },
  {
    id: 'midnight-black',
    labelKey: 'midnightBlack',
    colors: {
      background: '#000000', foreground: '#e0e0e0',
      cursor: '#ffffff', cursorAccent: '#000000', selectionBackground: '#3a3a3a',
      black: '#000000', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
  },
  {
    id: 'solarized-dark',
    labelKey: 'solarizedDark',
    colors: {
      background: '#002b36', foreground: '#839496',
      cursor: '#93a1a1', cursorAccent: '#002b36', selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'solarized-light',
    labelKey: 'solarizedLight',
    colors: {
      background: '#fdf6e3', foreground: '#657b83',
      cursor: '#586e75', cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'dracula',
    labelKey: 'dracula',
    colors: {
      background: '#282a36', foreground: '#f8f8f2',
      cursor: '#bd93f9', cursorAccent: '#282a36', selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  {
    id: 'gruvbox-dark',
    labelKey: 'gruvboxDark',
    colors: {
      background: '#282828', foreground: '#ebdbb2',
      cursor: '#ebdbb2', cursorAccent: '#282828', selectionBackground: '#504945',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
      blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26',
      brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
      brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
    },
  },
  {
    id: 'nord',
    labelKey: 'nord',
    colors: {
      background: '#2e3440', foreground: '#d8dee9',
      cursor: '#d8dee9', cursorAccent: '#2e3440', selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  {
    id: 'high-contrast',
    labelKey: 'highContrast',
    colors: {
      background: '#000000', foreground: '#ffffff',
      cursor: '#00ff00', cursorAccent: '#000000', selectionBackground: '#ffffff',
      black: '#000000', red: '#ff0000', green: '#00ff00', yellow: '#ffff00',
      blue: '#0000ff', magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff',
      brightBlack: '#808080', brightRed: '#ff0000', brightGreen: '#00ff00',
      brightYellow: '#ffff00', brightBlue: '#5c5cff', brightMagenta: '#ff00ff',
      brightCyan: '#00ffff', brightWhite: '#ffffff',
    },
  },
] as const;

export const DEFAULT_THEME_ID = 'dudoxx-navy';

/** Resolve a theme by id, falling back to the default if the id is unknown. */
export function resolveTheme(id: string): TermThemeDef {
  return TERM_THEMES.find((t) => t.id === id) ?? TERM_THEMES[0]!;
}

// ── Font size ────────────────────────────────────────────────────────────────

export const FONT_SIZE_MIN = 9;
export const FONT_SIZE_MAX = 28;
export const FONT_SIZE_STEP = 1;
export const DEFAULT_FONT_SIZE = 14;

/** Selectable monospace font families. Values are CSS font-family stacks. */
export interface TermFontDef {
  readonly id: string;
  readonly labelKey: string;
  readonly stack: string;
}

export const TERM_FONTS: readonly TermFontDef[] = [
  { id: 'jetbrains', labelKey: 'jetbrains', stack: '"JetBrains Mono", "Fira Code", monospace' },
  { id: 'fira', labelKey: 'fira', stack: '"Fira Code", "JetBrains Mono", monospace' },
  { id: 'menlo', labelKey: 'menlo', stack: 'Menlo, Monaco, "Courier New", monospace' },
  { id: 'system', labelKey: 'system', stack: 'ui-monospace, SFMono-Regular, monospace' },
] as const;

export const DEFAULT_FONT_ID = 'jetbrains';

export function resolveFont(id: string): TermFontDef {
  return TERM_FONTS.find((f) => f.id === id) ?? TERM_FONTS[0]!;
}

/** Clamp a font size into the allowed range. */
export function clampFontSize(size: number): number {
  if (Number.isNaN(size)) return DEFAULT_FONT_SIZE;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)));
}

// ── Aggregate appearance ─────────────────────────────────────────────────────

/** The complete, resolved appearance applied to an xterm instance. */
export interface TermAppearance {
  fontSize: number;
  fontId: string;
  themeId: string;
}

export const DEFAULT_APPEARANCE: TermAppearance = {
  fontSize: DEFAULT_FONT_SIZE,
  fontId: DEFAULT_FONT_ID,
  themeId: DEFAULT_THEME_ID,
};
