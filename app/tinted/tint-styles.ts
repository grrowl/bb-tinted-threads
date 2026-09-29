// Row tints live in one injected stylesheet rather than Tailwind classes: the
// host only ships the utilities its own source uses, and unlayered rules win
// over its layered hover/selected utilities without specificity games. The
// inset shadow draws the tint's edge without shifting the row's layout.

// A row with a subtitle is one fixed, taller height (not auto) so the host's
// sticky parent stack can still space pinned rows by a known stride. An empty
// subtitle (every part off, or nothing to show) leaves the row alone.
const WITH_SUBTITLE = ":has([data-tinted-subtitle-row]:not(:empty))";
const SUBTITLE_STYLESHEET = `
:root {
  --tinted-subtitle-row-height: calc(var(--bb-sidebar-row-height) + 0.5rem);
}
@media (max-width: 767px) and (pointer: coarse) {
  :root {
    --tinted-subtitle-row-height: calc(var(--bb-sidebar-row-height-coarse) + 0.625rem);
  }
}
[data-tinted-subtitle-row]:empty {
  display: none;
}
[data-tinted-tone]${WITH_SUBTITLE} {
  height: var(--tinted-subtitle-row-height);
  min-height: var(--tinted-subtitle-row-height);
  --bb-sidebar-sticky-tier-height: var(--tinted-subtitle-row-height);
}
[data-sidebar-sticky-stack]:has([data-sidebar-sticky-tier="parent"] [data-tinted-subtitle-row]:not(:empty)) {
  --bb-sidebar-sticky-parent-stride: calc(
    var(--tinted-subtitle-row-height) + var(--bb-sidebar-sticky-child-row-gap)
  );
}
`;

// Density raises bb's row height token on <html> (set by DensitySync), which
// every row, the sticky stack, and the subtitle row height derive from.
// "compact" leaves bb's stock 1.75rem alone.
const DENSITY_STYLESHEET = `
:root[data-tinted-density="default"] {
  --bb-sidebar-row-height: 2rem;
}
:root[data-tinted-density="comfortable"] {
  --bb-sidebar-row-height: 2.25rem;
}
`;

// Native reserves room on the right of rows for things that are only there
// on hover. Rows without a disclosure drop their empty status slot at rest
// (fine pointer, not hovered, focused, or with a menu open), so their titles
// truncate later; parent rows keep every reservation so the disclosure never
// moves under the pointer. Gaps between the trailing glyphs go too.
const AT_REST =
  "[data-tinted-tone]:not(:hover):not(:has(:focus-visible)):not(:has([data-sidebar-hover-actions-open=true])):not(:has([data-state=open]))";
const HAS_DISCLOSURE = ":has(> span > button[aria-expanded])";
const ROW_SPACING_STYLESHEET = `
[data-tinted-tone],
[data-tinted-tone] > span:has(> [data-tinted-title-stack]) {
  column-gap: 0;
}
[data-tinted-title-stack]:not(:last-child) {
  margin-right: 0.25rem;
}
@media not ((max-width: 767px) and (pointer: coarse)) {
  ${AT_REST}:not(${HAS_DISCLOSURE}) > [data-sidebar-thread-trailing]:has(.bb-sidebar-hover-actions-fade):not(:has([data-sidebar-thread-trailing-indicator])) {
    display: none;
  }
  /* Hover actions are 24px wide rather than 28px (height unchanged), and the
     reserved space is exactly their overhang past the 28px status slot
     (24 + 2 + 24 - 28): always on parent rows (native's pr-7.5), on hover
     elsewhere. The disclosure sits flush beside them without overlapping. */
  [data-tinted-tone] [data-sidebar-row-controls] button {
    width: 1.5rem;
  }
  [data-tinted-tone] > span.pr-7\\.5,
  [data-tinted-tone]:is(:hover, :has(:focus-visible), :has([data-sidebar-hover-actions-open=true]), :has([data-state=open])):has([data-sidebar-row-controls]) > span:has(> [data-tinted-title-stack]) {
    padding-right: 1.375rem;
  }
}
`;

// Tinted rows keep their tone in every state; selection deepens the fill and
// edge rather than swapping to bb's grey. Parent rows are sticky, and bb paints
// those with an opaque background-image (grey when selected) so scrolled rows
// don't show through; tinted sticky rows get the same treatment in their tone.
// Unread idle rows take a fainter blue tint (--tinted-strength scales every
// fill and edge), so they read as quieter than working or blocked rows.
const TONES =
  '[data-tinted-tone="working"], [data-tinted-tone="blocked"], [data-tinted-tone="idle"][data-tinted-unread]';
const mix = (percent: number) =>
  `color-mix(in oklab, var(--tinted-tone) calc(${percent}% * var(--tinted-strength, 1)), transparent)`;
const TINT_STYLESHEET = `
[data-tinted-tone="working"] {
  --tinted-tone: var(--color-emerald-500);
}
[data-tinted-tone="blocked"] {
  --tinted-tone: var(--destructive);
}
[data-tinted-tone="idle"][data-tinted-unread] {
  --tinted-tone: var(--timeline-accent);
  --tinted-strength: 0.6;
}
:is(${TONES}) {
  --tinted-fill: ${mix(10)};
  background-color: var(--tinted-fill);
  box-shadow: inset 0 0 0 1px ${mix(28)};
}
:is(${TONES}):is(:hover, .bb-sidebar-open-in-split-row) {
  --tinted-fill: ${mix(14)};
}
:is(${TONES}).bb-sidebar-selected-row {
  --tinted-fill: ${mix(18)};
  box-shadow: inset 0 0 0 1px ${mix(40)};
}
[data-sidebar-sticky-stack] [data-sidebar-sticky-tier]:is(${TONES}) {
  background-color: transparent;
  background-image: linear-gradient(var(--tinted-fill), var(--tinted-fill)),
    linear-gradient(var(--sidebar), var(--sidebar));
}
[data-tinted-unread-dot] {
  background-color: var(--timeline-accent);
}
[data-tinted-unread] [data-tinted-title-stack] > :first-child {
  font-weight: 500;
}
${SUBTITLE_STYLESHEET}${DENSITY_STYLESHEET}${ROW_SPACING_STYLESHEET}`;

const STYLE_ELEMENT_ID = "bb-tinted-threads-styles";

export function installTintStyles(): () => void {
  if (typeof document === "undefined") return () => {};
  // A plugin reload can leave the previous build's element behind; refresh
  // its rules so the new stylesheet takes effect without a page reload.
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing) {
    existing.textContent = TINT_STYLESHEET;
    return () => {};
  }
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = TINT_STYLESHEET;
  document.head.appendChild(style);
  return () => style.remove();
}
