export function DiffStatPills({
  diff,
}: {
  diff: { additions: number; deletions: number };
}) {
  return (
    <span
      aria-label={`+${diff.additions} -${diff.deletions}`}
      className="flex shrink-0 items-center gap-0.5 font-mono tabular-nums"
    >
      <span
        className="rounded border border-emerald-500/25 bg-emerald-500/10 px-0.5 font-medium"
        style={{ color: "var(--color-emerald-500)" }}
      >
        +{diff.additions}
      </span>
      <span
        className="rounded border border-destructive/25 bg-destructive/10 px-0.5 font-medium"
        style={{ color: "var(--destructive)" }}
      >
        -{diff.deletions}
      </span>
    </span>
  );
}
