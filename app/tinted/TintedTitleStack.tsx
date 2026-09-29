import type { ReactNode } from "react";

/**
 * Stacks a row's title over its subtitle. It always takes the row's free
 * space, pushing the PR glyph, sub-thread badge and chevron to the right edge
 * beside the row actions; the title keeps its own height in the column.
 */
export function TintedTitleStack({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle: ReactNode;
}) {
  return (
    <span
      data-tinted-title-stack=""
      className="pointer-events-none flex min-w-0 flex-col justify-center gap-0.5 flex-1 self-stretch [&>*:first-child]:flex-none"
    >
      {children}
      {subtitle}
    </span>
  );
}
