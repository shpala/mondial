// The Zustand bracket store holds the user's overrides. Its pick/reset/undo
// logic was unverified; these exercise it via getState() (no React needed).
import { beforeEach, describe, expect, it } from "vitest";
import { useBracketStore } from "@/store/bracket";

beforeEach(() => {
  useBracketStore.setState({ overrides: {}, lastCleared: null });
});

describe("useBracketStore", () => {
  it("pick adds an override", () => {
    useBracketStore.getState().pick("R0-0", 5);
    expect(useBracketStore.getState().overrides).toEqual({ "R0-0": 5 });
  });

  it("picking the same team again clears that override (toggle)", () => {
    const { pick } = useBracketStore.getState();
    pick("R0-0", 5);
    pick("R0-0", 5);
    expect(useBracketStore.getState().overrides).toEqual({});
  });

  it("picking a different team replaces the override", () => {
    const { pick } = useBracketStore.getState();
    pick("R0-0", 5);
    pick("R0-0", 9);
    expect(useBracketStore.getState().overrides).toEqual({ "R0-0": 9 });
  });

  it("reset clears all picks and stashes them for undo", () => {
    const { pick, reset } = useBracketStore.getState();
    pick("R0-0", 5);
    pick("R1-0", 9);
    reset();
    const s = useBracketStore.getState();
    expect(s.overrides).toEqual({});
    expect(s.lastCleared).toEqual({ "R0-0": 5, "R1-0": 9 });
  });

  it("undoReset restores the picks cleared by the last reset", () => {
    const { pick, reset, undoReset } = useBracketStore.getState();
    pick("R0-0", 5);
    reset();
    undoReset();
    expect(useBracketStore.getState().overrides).toEqual({ "R0-0": 5 });
    expect(useBracketStore.getState().lastCleared).toBeNull();
  });

  it("a fresh pick after a reset invalidates the pending undo", () => {
    const { pick, reset } = useBracketStore.getState();
    pick("R0-0", 5);
    reset();
    pick("R2-0", 1);
    expect(useBracketStore.getState().lastCleared).toBeNull();
  });
});
