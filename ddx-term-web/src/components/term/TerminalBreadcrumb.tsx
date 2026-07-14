/**
 * TerminalBreadcrumb.tsx — §13 breadcrumb primitive for the terminal entity.
 *
 * Reconstructible from the URL alone: the caller derives its segment list from
 * the route it's rendering (list/[mode], view/[terminalId], new) — this
 * component just renders "Terminals / {segments…}" with the root always
 * linking back to list/grid. No client-side route inspection needed here;
 * each page already knows its own position in the tree.
 *
 * Grepped for an existing breadcrumb primitive first (Cardinal #20) — none
 * existed in ddx-term-web before this task.
 *
 * All strings via t(); semantic @theme tokens only; lucide-react icons only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** One trailing breadcrumb segment. Either a translated label key, or a raw
 *  literal (e.g. a terminal's title, which is user data, not an i18n key). */
export type BreadcrumbSegment =
  | { labelKey: string; params?: Record<string, string | number>; href?: string }
  | { literal: string; href?: string };

export interface TerminalBreadcrumbProps {
  locale: string;
  /** Segments AFTER the root "Terminals" crumb. */
  segments: readonly BreadcrumbSegment[];
}

export function TerminalBreadcrumb({ locale, segments }: TerminalBreadcrumbProps): React.JSX.Element {
  const t = useTranslations('terminal');
  const rootHref = `/${locale}/terminal/list/grid`;

  return (
    <nav aria-label={t('breadcrumb.nav')} className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href={rootHref} className="hover:text-foreground transition-colors">
        {t('breadcrumb.root')}
      </Link>
      {segments.map((seg, i) => {
        const label = 'labelKey' in seg
          // `t()`'s key union is namespace-scoped to 'terminal' string leaves;
          // BreadcrumbSegment.labelKey is a plain `string` (breadcrumb usages
          // span multiple leaf keys — breadcrumb.list/root/list.grid/etc — so a
          // literal union would have to be duplicated here). Resolve through
          // next-intl's raw formatter, which accepts any dotted key at runtime
          // and is exactly what t() does internally — no `any`/`unknown` cast.
          ? t.has(seg.labelKey) ? t(seg.labelKey, seg.params) : seg.labelKey
          : seg.literal;
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight aria-hidden className="size-3" />
            {seg.href && !isLast ? (
              <Link href={seg.href} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            ) : (
              <span className={isLast ? 'text-foreground font-medium' : undefined}>{label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
