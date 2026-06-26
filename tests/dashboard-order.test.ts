import { describe, it, expect } from "vitest";
import { compareTodayFixtures } from "@/lib/dashboardOrder";
import type { Fixture } from "@/lib/types";

const fx = (id: number, status: Fixture["status"], kickoff: string) =>
  ({ id, status, kickoff }) as unknown as Fixture;

describe("compareTodayFixtures", () => {
  it("orders still-to-play fixtures before finished ones", () => {
    const finished = fx(1, "finished", "2026-06-26T13:00:00Z");
    const scheduled = fx(2, "scheduled", "2026-06-26T18:00:00Z");
    expect(
      [finished, scheduled].sort(compareTodayFixtures).map((f) => f.id),
    ).toEqual([2, 1]);
  });

  it("puts a finished match after a scheduled one even if it kicked off earlier", () => {
    const lateScheduled = fx(1, "scheduled", "2026-06-26T20:00:00Z");
    const earlyFinished = fx(2, "finished", "2026-06-26T10:00:00Z");
    expect(
      [earlyFinished, lateScheduled].sort(compareTodayFixtures).map((f) => f.id),
    ).toEqual([1, 2]);
  });

  it("keeps kickoff order within the same status", () => {
    const later = fx(1, "scheduled", "2026-06-26T18:00:00Z");
    const sooner = fx(2, "scheduled", "2026-06-26T15:00:00Z");
    expect(
      [later, sooner].sort(compareTodayFixtures).map((f) => f.id),
    ).toEqual([2, 1]);
  });
});
