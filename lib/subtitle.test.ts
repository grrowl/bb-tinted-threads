import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { modelLabel, type ThreadModelMetadata } from "./subtitle";

const thread = { providerId: "claude-code" } as PluginSidebarThread;

test("model labels never invent a provider default while metadata is unavailable", () => {
  assert.equal(modelLabel(thread), "Loading…");
  assert.equal(
    modelLabel(thread, {
      providerId: "claude-code",
      model: null,
      displayName: null,
      status: "unknown",
    }),
    "Unknown model",
  );
});

test("model labels prefer the provider catalog display name", () => {
  const metadata: ThreadModelMetadata = {
    providerId: "claude-code",
    model: "claude-fable-5-1",
    displayName: "Fable 5.1",
    status: "known",
  };
  assert.equal(modelLabel(thread, metadata), "Fable 5.1");
});

test("model labels apply compact provider-specific display rules", () => {
  assert.equal(
    modelLabel(thread, {
      providerId: "codex",
      model: "gpt-5.6-terra",
      displayName: "GPT-5.6-Terra",
      status: "known",
    }),
    "5.6-Terra",
  );
  assert.equal(
    modelLabel(thread, {
      providerId: "claude-code",
      model: "claude-opus-5[1m]",
      displayName: "Opus 5 (1M)",
      status: "known",
    }),
    "Opus 5",
  );
  assert.equal(
    modelLabel(thread, {
      providerId: "acp-opencode",
      model: "opencode-big-pickle",
      displayName: "OpenCode Big Pickle",
      status: "known",
    }),
    "Big Pickle",
  );
});

test("a known but unlisted model has a readable, non-default fallback", () => {
  assert.equal(
    modelLabel(thread, {
      providerId: "codex",
      model: "gpt-5.6-terra",
      displayName: null,
      status: "known",
    }),
    "GPT 5.6 Terra",
  );
});
