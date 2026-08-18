import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarPullRequest,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

function MenuItem({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: (event: Event) => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded px-2 py-1.5 outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive hover:text-destructive",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function MenuSeparator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}

export function ThreadContextMenu({
  thread,
  title,
  pullRequest,
  onNavigate,
  children,
}: {
  thread: PluginSidebarThread;
  title: string;
  pullRequest: PluginSidebarPullRequest | null;
  onNavigate: () => void;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();

  return (
    <li className="list-none">
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Thread actions"
            className="z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md"
          >
            <MenuItem
              onSelect={() => {
                actions.open(thread.id);
                onNavigate();
              }}
            >
              Open
            </MenuItem>
            <MenuItem
              onSelect={() => {
                actions.open(thread.id, { split: true });
                onNavigate();
              }}
            >
              Open in split
            </MenuItem>
            {pullRequest?.url ? (
              <>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => {
                    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open pull request #{pullRequest.number}
                </MenuItem>
              </>
            ) : null}
            <MenuSeparator />
            <MenuItem
              onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
            >
              {thread.isPinned ? "Unpin" : "Pin"}
            </MenuItem>
            <MenuItem
              onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
            >
              {thread.isUnread ? "Mark read" : "Mark unread"}
            </MenuItem>
            <MenuItem
              onSelect={(event) => {
                event.preventDefault();
                window.setTimeout(() => {
                  const next = window.prompt("Rename thread", title);
                  if (next && next.trim() && next.trim() !== title) {
                    void actions.rename(thread.id, next.trim());
                  }
                }, 0);
              }}
            >
              Rename
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => actions.archive(thread.id)}>Archive</MenuItem>
            <MenuItem destructive onSelect={() => actions.requestDelete(thread.id)}>
              Delete
            </MenuItem>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}
