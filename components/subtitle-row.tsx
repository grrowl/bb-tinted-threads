import type {
  PluginSidebarPullRequest,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { HermesIcon } from "@/hermes-icon";
import {
  modelLabel,
  parseDiffStat,
  pullRequestAttentionLabel,
  pullRequestBadgeLabel,
  workspaceLabel,
  type ThreadModelMetadata,
} from "@/lib/subtitle";
import type { ListSettings } from "@/lib/settings";
import { PullRequestCell } from "@/components/pull-request-cell";

function DiffCell({
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

function WorkspaceCell({ label }: { label: string }) {
  return (
    <span className="min-w-0 flex-[0_1_5.25rem] truncate font-mono">{label}</span>
  );
}

function ClaudeIcon() {
  return (
    <svg
      viewBox="0 0 149 149"
      fill="currentColor"
      role="img"
      aria-label="Claude"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M29 98.5 58.2 82.2l.5-1.4-.5-.8h-1.4l-4.9-.3-16.6-.5-14.5-.6-14-.7-3.5-.8L0 72.8l.3-2.2 3-2 4.2.4 9.4.6 14 1 10.2.6 15.1 1.6h2.4l.3-1-.8-.6-.6-.6-14.6-9.9-15.7-10.4-8.3-6-4.4-3-2.3-2.9-1-6.2 4.1-4.5 5.4.4 1.4.4 5.5 4.2 11.8 9.1 15.3 11.3 2.3 1.9.9-.7.1-.4-1-1.7-8.3-15.1-8.9-15.4-4-6.3-1-3.9c-.4-1.5-.7-2.9-.7-4.4L38.8.8 41.3 0l6.2.8 2.6 2.3 3.8 8.7 6.2 13.8 9.6 18.7 2.8 5.5 1.5 5.2.6 1.6h1v-.9l.8-10.6 1.4-12.9L79.2 15.5l.5-4.7 2.3-5.6L86.6 2.2l3.6 1.7 3 4.2-.4 2.8-1.8 11.4-3.4 17.9-2.3 12h1.3l1.5-1.5 6.1-8 10.2-12.8 4.5-5 5.2-5.6 3.4-2.7h6.4l4.7 7-2.1 7.2-6.6 8.3-5.4 7-7.8 10.6-4.9 8.4.5.7 1.1-.1 17.7-3.8 9.5-1.7 11.4-2 5.1 2.4.6 2.5-2 5-12.2 3-14.2 2.8-21.2 5-.3.2.3.4 9.6.9 4 .2h10l18.7 1.4 4.8 3.2 3 4-.5 3-7.5 3.8-10.2-2.4-23.6-5.6-8.1-2H97v.7l6.8 6.6 12.3 11.2 15.5 14.4.8 3.5-2 2.8-2.1-.3-13.6-10.2-5.2-4.6-12-10h-.7v1l2.7 4 14.5 21.8.7 6.7-1 2.1-3.7 1.4-4.2-.8-8.4-11.9-8.8-13.4-7-12-.9.5-4.2 44.8-1.9 2.3-4.5 1.7-3.8-2.8-2-4.7 2-9 2.4-11.9 2-9.5 1.7-11.7 1.1-3.9-.1-.3-.9.1-8.8 12.2-13.5 18.2-10.6 11.4-2.6 1-4.4-2.3.4-4 2.5-3.7 14.7-18.7 8.9-11.6 5.8-6.7v-1h-.4l-39.1 25.4-7 .9-3-2.8.4-4.6 1.4-1.5 11.8-8.1z" />
    </svg>
  );
}

function CodexIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Codex"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.03l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .03.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.54-3.02l.15.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86L13.1 8.36l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.03l-.14-.08-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.4.68zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Cursor" className="size-3 shrink-0 text-muted-foreground/80">
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

function PiIcon() {
  return (
    <svg viewBox="100 100 600 600" fill="currentColor" fillRule="evenodd" role="img" aria-label="Pi" className="size-3 shrink-0 text-muted-foreground/80">
      <path d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29V165.29ZM282.65 282.65V400H400V282.65H282.65Z" />
      <path d="M517.36 400H634.72V634.72H517.36V400Z" />
    </svg>
  );
}

function OpenCodeIcon() {
  return (
    <svg viewBox="-72 -42 384 384" fill="currentColor" role="img" aria-label="OpenCode" className="size-3 shrink-0 text-muted-foreground/80">
      <path d="M180 240H60V120H180V240Z" fillOpacity={0.45} />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
    </svg>
  );
}

function titleCaseToken(part: string): string {
  return part.slice(0, 1).toUpperCase() + part.slice(1);
}

function labelize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

function providerInitial(providerId: string): string {
  return labelize(providerId).slice(0, 1).toUpperCase() || "?";
}

function ProviderIcon({ providerId }: { providerId: string }) {
  if (providerId === "claude-code" || providerId.startsWith("claude")) {
    return <ClaudeIcon />;
  }
  if (providerId === "codex" || providerId.startsWith("openai")) {
    return <CodexIcon />;
  }
  if (providerId === "pi") return <PiIcon />;
  if (providerId === "acp-cursor") return <CursorIcon />;
  if (providerId === "acp-opencode") return <OpenCodeIcon />;
  if (providerId === "acp-hermes-agent") return <HermesIcon />;
  return (
    <span
      aria-label={labelize(providerId)}
      role="img"
      className="flex size-3 shrink-0 items-center justify-center rounded-full bg-muted text-[7px] font-semibold text-muted-foreground"
    >
      {providerInitial(providerId)}
    </span>
  );
}

function ModelCell({
  label,
  providerId,
}: {
  label: string;
  providerId: string;
}) {
  return (
    <span className="flex min-w-0 max-w-[5.75rem] shrink items-center gap-1">
      <ProviderIcon providerId={providerId} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function buildSubtitleParts({
  thread,
  settings,
  gitStat,
  modelMetadata,
  pullRequest,
}: {
  thread: PluginSidebarThread;
  settings: Pick<
    ListSettings,
    "showModel" | "showDiff" | "showPullRequest" | "workspaceLabel"
  >;
  gitStat: string | null | undefined;
  modelMetadata: ThreadModelMetadata | undefined;
  pullRequest: PluginSidebarPullRequest | null;
}): string[] {
  const parts: string[] = [];
  if (settings.showModel) {
    parts.push(modelLabel(thread, modelMetadata));
  }
  if (settings.showPullRequest && pullRequest) {
    const status = pullRequestAttentionLabel(pullRequest.attention);
    parts.push(
      status === "PR"
        ? pullRequestBadgeLabel(pullRequest.number)
        : `${pullRequestBadgeLabel(pullRequest.number)} ${status}`,
    );
  }
  const workspace = workspaceLabel(thread, settings.workspaceLabel);
  if (workspace) parts.push(workspace);
  const diff = settings.showDiff && gitStat ? parseDiffStat(gitStat) : null;
  if (diff) parts.push(`+${diff.additions} -${diff.deletions}`);
  return parts;
}

export function SubtitleRow({
  thread,
  settings,
  gitStat,
  modelMetadata,
  pullRequest,
}: {
  thread: PluginSidebarThread;
  settings: Pick<
    ListSettings,
    "showModel" | "showDiff" | "showPullRequest" | "workspaceLabel"
  >;
  gitStat: string | null | undefined;
  modelMetadata: ThreadModelMetadata | undefined;
  pullRequest: PluginSidebarPullRequest | null;
}) {
  const model = settings.showModel ? modelLabel(thread, modelMetadata) : null;
  const diff = settings.showDiff && gitStat ? parseDiffStat(gitStat) : null;
  const workspace = workspaceLabel(thread, settings.workspaceLabel);

  if (!model && !pullRequest && !workspace && !diff) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pl-4 text-2xs leading-none text-muted-foreground">
      {settings.showModel && model ? (
        <ModelCell
          label={model}
          providerId={modelMetadata?.providerId ?? thread.providerId}
        />
      ) : null}
      {settings.showPullRequest && pullRequest ? (
        <PullRequestCell pullRequest={pullRequest} />
      ) : null}
      {workspace ? <WorkspaceCell label={workspace} /> : null}
      {settings.showDiff && diff ? <DiffCell diff={diff} /> : null}
    </div>
  );
}
