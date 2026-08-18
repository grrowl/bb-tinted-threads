import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export function threadTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}
