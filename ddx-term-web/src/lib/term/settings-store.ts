/**
 * src/lib/term/settings-store.ts — localStorage-backed terminal appearance store.
 *
 * Appearance (font size, font family, color theme) is a per-page UI preference
 * that must survive refresh but does NOT belong in the URL — the design-system
 * rule for survivable-but-not-shareable state is localStorage (§12/§14). It is
 * also NOT broker state: themes and font size are pure client-render concerns
 * (xterm options), never sent over the WS, so persisting them client-side keeps
 * the bridge protocol untouched.
 *
 * A tiny pub/sub lets every mounted component (the side panel, the controls, the
 * active XtermClient) react to a change without prop-drilling or a context
 * provider. useSyncExternalStore gives a concurrent-safe subscription with an
 * SSR-safe server snapshot (defaults), so the first paint matches the server.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { useCallback, useSyncExternalStore } from 'react';

import {
  DEFAULT_APPEARANCE,
  clampFontSize,
  resolveFont,
  resolveTheme,
  type TermAppearance,
} from './appearance';

const STORAGE_KEY = 'ddx.terminal.appearance';

// ── In-memory cache + subscribers ────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot to return a STABLE reference when the
// value is unchanged (else it loops). So we cache the parsed object and only swap
// the reference when a setter actually mutates it.

let cache: TermAppearance | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): TermAppearance {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<TermAppearance>;
    // Validate every field through the resolvers so a stale/garbage value (e.g. a
    // theme id removed in a later release) degrades to the default, never crashes.
    return {
      fontSize: clampFontSize(parsed.fontSize ?? DEFAULT_APPEARANCE.fontSize),
      fontId: resolveFont(parsed.fontId ?? DEFAULT_APPEARANCE.fontId).id,
      themeId: resolveTheme(parsed.themeId ?? DEFAULT_APPEARANCE.themeId).id,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function getSnapshot(): TermAppearance {
  cache ??= readFromStorage();
  return cache;
}

function getServerSnapshot(): TermAppearance {
  // SSR + first client paint use defaults so markup matches; the store rehydrates
  // from localStorage on the first client effect via subscribe().
  return DEFAULT_APPEARANCE;
}

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-tab sync: a change in another tab updates this one.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = readFromStorage();
      emit();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Persist a new appearance, swap the cache reference, and notify subscribers. */
function write(next: TermAppearance): void {
  cache = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full / disabled — keep the in-memory value, lose persistence only
    }
  }
  emit();
}

// ── Public mutators (usable outside React too) ───────────────────────────────

export function setFontSize(size: number): void {
  write({ ...getSnapshot(), fontSize: clampFontSize(size) });
}

export function setFontId(fontId: string): void {
  write({ ...getSnapshot(), fontId: resolveFont(fontId).id });
}

export function setThemeId(themeId: string): void {
  write({ ...getSnapshot(), themeId: resolveTheme(themeId).id });
}

export function resetAppearance(): void {
  write({ ...DEFAULT_APPEARANCE });
}

// ── React hook ───────────────────────────────────────────────────────────────

export interface UseTermAppearance {
  appearance: TermAppearance;
  setFontSize: (size: number) => void;
  setFontId: (fontId: string) => void;
  setThemeId: (themeId: string) => void;
  reset: () => void;
}

/** Subscribe a component to the appearance store. */
export function useTermAppearance(): UseTermAppearance {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    appearance,
    setFontSize: useCallback((s: number) => setFontSize(s), []),
    setFontId: useCallback((f: string) => setFontId(f), []),
    setThemeId: useCallback((t: string) => setThemeId(t), []),
    reset: useCallback(() => resetAppearance(), []),
  };
}
