/**
 * AppearanceControls.tsx — font-size, font-family, and color-theme controls.
 *
 * Custom Dudoxx controls (no native <select> per design-system §7) bound to the
 * localStorage-backed appearance store. Each change is applied live to the active
 * XtermClient by the page (which subscribes to the same store). All strings via
 * t(); semantic @theme tokens only; lucide-react icons only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useTranslations } from 'next-intl';
import { Minus, Plus, Palette, Type, RotateCcw } from 'lucide-react';

import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  TERM_FONTS,
  TERM_THEMES,
} from '@/lib/term/appearance';
import { useTermAppearance } from '@/lib/term/settings-store';

/**
 * Typed key maps for the `terminal.fonts.*` / `terminal.themes.*` namespaces —
 * replaces the `t(... as never)` escape with a real keyof union so t() type
 * checks against messages/en.json without any `any`/`never` bypass. Each
 * registry `labelKey` MUST have a matching entry here (mirrors messages/*.json
 * in lockstep — see appearance.ts's TERM_FONTS/TERM_THEMES).
 */
const FONT_LABEL_KEYS = {
  jetbrains: 'fonts.jetbrains',
  fira: 'fonts.fira',
  menlo: 'fonts.menlo',
  system: 'fonts.system',
} as const satisfies Record<string, string>;

const THEME_LABEL_KEYS = {
  dudoxxNavy: 'themes.dudoxxNavy',
  midnightBlack: 'themes.midnightBlack',
  solarizedDark: 'themes.solarizedDark',
  solarizedLight: 'themes.solarizedLight',
  dracula: 'themes.dracula',
  gruvboxDark: 'themes.gruvboxDark',
  nord: 'themes.nord',
  highContrast: 'themes.highContrast',
} as const satisfies Record<string, string>;

type FontLabelKey = keyof typeof FONT_LABEL_KEYS;
type ThemeLabelKey = keyof typeof THEME_LABEL_KEYS;

export function AppearanceControls(): React.JSX.Element {
  const t = useTranslations('terminal');
  const { appearance, setFontSize, setFontId, setThemeId, reset } = useTermAppearance();

  const atMin = appearance.fontSize <= FONT_SIZE_MIN;
  const atMax = appearance.fontSize >= FONT_SIZE_MAX;

  return (
    <div className="flex flex-col gap-4 p-3">

      {/* ── Font size ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Type aria-hidden className="size-3.5" />
          {t('appearance.fontSize')}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFontSize(appearance.fontSize - FONT_SIZE_STEP)}
            disabled={atMin}
            aria-label={t('appearance.fontSmaller')}
            className="grid size-7 place-items-center rounded bg-elevated text-foreground hover:bg-tab-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus aria-hidden className="size-4" />
          </button>
          <span
            aria-live="polite"
            className="min-w-10 text-center text-sm font-medium tabular-nums text-foreground"
          >
            {t('appearance.fontSizeValue', { size: appearance.fontSize })}
          </span>
          <button
            type="button"
            onClick={() => setFontSize(appearance.fontSize + FONT_SIZE_STEP)}
            disabled={atMax}
            aria-label={t('appearance.fontLarger')}
            className="grid size-7 place-items-center rounded bg-elevated text-foreground hover:bg-tab-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </section>

      {/* ── Font family ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('appearance.fontFamily')}
        </span>
        <div role="radiogroup" aria-label={t('appearance.fontFamily')} className="flex flex-col gap-1">
          {TERM_FONTS.map((font) => {
            const active = font.id === appearance.fontId;
            return (
              <button
                key={font.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFontId(font.id)}
                style={{ fontFamily: font.stack }}
                className={[
                  'rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-elevated text-foreground hover:bg-tab-hover',
                ].join(' ')}
              >
                {t(FONT_LABEL_KEYS[font.labelKey as FontLabelKey])}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Color theme ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Palette aria-hidden className="size-3.5" />
          {t('appearance.colorTheme')}
        </span>
        <div role="radiogroup" aria-label={t('appearance.colorTheme')} className="grid grid-cols-2 gap-1.5">
          {TERM_THEMES.map((theme) => {
            const active = theme.id === appearance.themeId;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setThemeId(theme.id)}
                className={[
                  'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'ring-2 ring-primary bg-elevated text-foreground'
                    : 'bg-elevated text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                ].join(' ')}
              >
                {/* Swatch — the only legitimate inline colors, sourced from the
                    selected theme's own palette (not a Tailwind token). The thin
                    edge + inner ring come from the theme's fg/bg, not a container
                    border, so the no-borders surface rule is respected. */}
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full"
                  style={{
                    background: theme.colors.background,
                    boxShadow: `inset 0 0 0 2px ${theme.colors.foreground}, 0 0 0 1px ${theme.colors.cursor}`,
                  }}
                />
                <span className="truncate">
                  {t(THEME_LABEL_KEYS[theme.labelKey as ThemeLabelKey])}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Reset ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={reset}
        className="flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-tab-hover hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        {t('appearance.reset')}
      </button>
    </div>
  );
}
