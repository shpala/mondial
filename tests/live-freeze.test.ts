import { describe, it, expect } from "vitest";
import { reconcileLive, type LiveSnapshot } from "@/lib/liveFreeze";
import type { Fixture } from "@/lib/types";

// Minimal fixture builder — reconcileLive only reads status/score/minute/goals.
const fx = (over: Partial<Fixture>): Fixture =>
  ({
    id: 1,
    status: "scheduled",
    kickoff: "2026-06-26T18:00:00Z",
    homeGoals: null,
    awayGoals: null,
    minute: null,
    goals: [],
    ...over,
  }) as unknown as Fixture;

const T0 = 1_000_000;

describe("reconcileLive", () => {
  it("shows a live fixture as-is and remembers its snapshot", () => {
    const live = fx({ status: "live", homeGoals: 1, awayGoals: 0, minute: "57'" });
    const r = reconcileLive(live, null, T0);
    expect(r.fixture.status).toBe("live");
    expect(r.stale).toBe(false);
    expect(r.asOf).toBe(T0);
    expect(r.remember).toMatchObject({ homeGoals: 1, awayGoals: 0, minute: "57'", asOf: T0 });
  });

  it("freezes the last-known live score when the overlay drops (reverts to scheduled)", () => {
    const remembered: LiveSnapshot = {
      homeGoals: 1,
      awayGoals: 0,
      minute: "57'",
      goals: [],
      asOf: T0,
    };
    // ESPN dropped → the facade returns the spine fixture: back to scheduled, no score.
    const dropped = fx({ status: "scheduled", homeGoals: null, awayGoals: null, minute: null });
    const r = reconcileLive(dropped, remembered, T0 + 60_000);
    expect(r.fixture.status).toBe("live"); // still presented as live…
    expect(r.fixture.homeGoals).toBe(1); // …with the frozen score
    expect(r.fixture.awayGoals).toBe(0);
    expect(r.fixture.minute).toBe("57'");
    expect(r.fixture.liveOverlaid).toBe(false); // frozen, not a fresh real overlay
    expect(r.stale).toBe(true);
    expect(r.asOf).toBe(T0); // anchored to when it was last actually live
    expect(r.remember).toBe(remembered); // keep remembering while frozen
  });

  it("stops freezing once the match is finished (real result wins)", () => {
    const remembered: LiveSnapshot = {
      homeGoals: 1,
      awayGoals: 0,
      minute: "57'",
      goals: [],
      asOf: T0,
    };
    const finished = fx({ status: "finished", homeGoals: 2, awayGoals: 1, minute: null });
    const r = reconcileLive(finished, remembered, T0 + 120_000);
    expect(r.fixture.status).toBe("finished");
    expect(r.fixture.homeGoals).toBe(2); // the real final, not the frozen 1-0
    expect(r.stale).toBe(false);
    expect(r.remember).toBeNull(); // forget — it's over
  });

  it("does not freeze a fixture that was never live", () => {
    const scheduled = fx({ status: "scheduled" });
    const r = reconcileLive(scheduled, null, T0);
    expect(r.fixture.status).toBe("scheduled");
    expect(r.stale).toBe(false);
    expect(r.asOf).toBeNull();
    expect(r.remember).toBeNull();
  });

  it("refreshes the snapshot + asOf each tick while genuinely live", () => {
    const remembered: LiveSnapshot = {
      homeGoals: 1,
      awayGoals: 0,
      minute: "57'",
      goals: [],
      asOf: T0,
    };
    const stillLive = fx({ status: "live", homeGoals: 2, awayGoals: 0, minute: "63'" });
    const r = reconcileLive(stillLive, remembered, T0 + 60_000);
    expect(r.stale).toBe(false);
    expect(r.asOf).toBe(T0 + 60_000);
    expect(r.remember).toMatchObject({ homeGoals: 2, minute: "63'", asOf: T0 + 60_000 });
  });
});
