import { describe, expect, it } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import {
  countTintedTones,
  tintedToneForThread,
  worstTintedTone,
} from "./tone.js";

const NO_ACTIVITY = {
  workflows: 0,
  backgroundAgents: 0,
  backgroundCommands: 0,
  planMode: 0,
  goals: 0,
};

function makeThread(overrides: Parameters<typeof makeSidebarThread>[0] = {}) {
  return makeSidebarThread({
    archivedAt: null,
    indicator: "none",
    hasPendingInteraction: false,
    runtimeStatus: "idle",
    activity: NO_ACTIVITY,
    ...overrides,
  });
}

describe("tintedToneForThread", () => {
  it("is idle with nothing going on", () => {
    expect(tintedToneForThread(makeThread())).toBe("idle");
  });

  it("is blocked when the thread needs the user", () => {
    expect(
      tintedToneForThread(makeThread({ hasPendingInteraction: true })),
    ).toBe("blocked");
    expect(
      tintedToneForThread(makeThread({ indicator: "unread-error" })),
    ).toBe("blocked");
    expect(tintedToneForThread(makeThread({ runtimeStatus: "error" }))).toBe(
      "blocked",
    );
  });

  it("is working while the runtime or background work is live", () => {
    expect(tintedToneForThread(makeThread({ runtimeStatus: "active" }))).toBe(
      "working",
    );
    expect(
      tintedToneForThread(
        makeThread({ activity: { ...NO_ACTIVITY, backgroundAgents: 1 } }),
      ),
    ).toBe("working");
  });

  it("prefers blocked over working", () => {
    expect(
      tintedToneForThread(
        makeThread({ runtimeStatus: "active", hasPendingInteraction: true }),
      ),
    ).toBe("blocked");
  });

  it("never tints archived threads", () => {
    expect(
      tintedToneForThread(
        makeThread({ archivedAt: 1, hasPendingInteraction: true }),
      ),
    ).toBe("idle");
  });
});

describe("countTintedTones", () => {
  it("counts each tone and reports the worst", () => {
    const counts = countTintedTones([
      makeThread({ runtimeStatus: "active" }),
      makeThread(),
      makeThread(),
    ]);
    expect(counts).toEqual({ blocked: 0, working: 1, idle: 2 });
    expect(worstTintedTone(counts)).toBe("working");
    expect(worstTintedTone(countTintedTones([]))).toBeNull();
  });
});
