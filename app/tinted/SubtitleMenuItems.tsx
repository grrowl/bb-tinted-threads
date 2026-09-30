import { useAtom } from "jotai";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  subtitleDiffAtom,
  subtitleModelAtom,
  subtitleProjectAtom,
  subtitlePullRequestAtom,
  subtitleWorkspaceAtom,
} from "./atoms.js";

function ToggleItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={(event) => {
        event.preventDefault();
        onToggle();
      }}
    >
      {label}
      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center">
        {checked && <Icon name="Check" className="size-4" />}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * Subtitle toggles for the Display menu. The workspace
 * item switches between "smart" and "off"; the branch/worktree/host modes are
 * set with `bb <plugin> prefs set subtitleWorkspace <mode>`.
 */
export function SubtitleMenuItems() {
  const [model, setModel] = useAtom(subtitleModelAtom);
  const [pullRequest, setPullRequest] = useAtom(subtitlePullRequestAtom);
  const [diff, setDiff] = useAtom(subtitleDiffAtom);
  const [project, setProject] = useAtom(subtitleProjectAtom);
  const [workspace, setWorkspace] = useAtom(subtitleWorkspaceAtom);
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Subtitle
      </DropdownMenuLabel>
      <ToggleItem label="Model" checked={model} onToggle={() => setModel(!model)} />
      <ToggleItem
        label="Project"
        checked={project}
        onToggle={() => setProject(!project)}
      />
      <ToggleItem
        label="Pull request"
        checked={pullRequest}
        onToggle={() => setPullRequest(!pullRequest)}
      />
      <ToggleItem
        label="Workspace"
        checked={workspace !== "off"}
        onToggle={() => setWorkspace(workspace === "off" ? "smart" : "off")}
      />
      <ToggleItem
        label="Uncommitted diff"
        checked={diff}
        onToggle={() => setDiff(!diff)}
      />
    </>
  );
}
