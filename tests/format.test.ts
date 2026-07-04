import { describe, it, expect } from "vitest";
import {
  formatKickoff,
  formatShootout,
  visibleShootout,
  dateKey,
  isToday,
  deviceTimeZone,
} from "@/lib/format";

// 23:30 UTC — late enough that the calendar day differs across zones.
const ISO = "2026-06-26T23:30:00Z";

describe("formatKickoff", () => {
  it("renders the UTC time with a zone label by default", () => {
    const s = formatKickoff(ISO);
    expect(s).toContain("23:30");
    expect(s).toContain("UTC");
  });

  it("renders the wall-clock time of the given timezone", () => {
    // Tokyo is UTC+9 → 08:30 next morning; not labelled UTC.
    const s = formatKickoff(ISO, "Asia/Tokyo");
    expect(s).toContain("08:30");
    expect(s).not.toContain("UTC");
  });

  it("returns the raw input on a bad date", () => {
    expect(formatKickoff("not-a-date")).toBe("not-a-date");
  });
});

describe("dateKey", () => {
  it("keys to the UTC calendar day by default", () => {
    expect(dateKey(ISO)).toBe("2026-06-26");
  });

  it("rolls to the next day east of UTC", () => {
    expect(dateKey(ISO, "Asia/Tokyo")).toBe("2026-06-27"); // +9h → 08:30 the 27th
  });

  it("stays on the same day west of UTC", () => {
    expect(dateKey(ISO, "America/Los_Angeles")).toBe("2026-06-26"); // -7h → 16:30 the 26th
  });
});

describe("isToday", () => {
  it("is true for the current instant and false for a distant one", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday("2000-01-01T00:00:00Z")).toBe(false);
  });
});

describe("deviceTimeZone", () => {
  it("returns a non-empty IANA zone string", () => {
    expect(typeof deviceTimeZone()).toBe("string");
    expect(deviceTimeZone().length).toBeGreaterThan(0);
  });
});

describe("visibleShootout", () => {
  it("marks an unequal tally on a finished tie as decided", () => {
    expect(
      visibleShootout({ status: "finished", shootout: { home: 4, away: 2 } }),
    ).toEqual({ tally: { home: 4, away: 2 }, decided: true });
  });

  it("treats any tally on a live match as running, never decided", () => {
    // 3–2 mid-shootout is a lead, not a result — no winner may be declared.
    expect(
      visibleShootout({ status: "live", shootout: { home: 3, away: 2 } }),
    ).toEqual({ tally: { home: 3, away: 2 }, decided: false });
  });

  it("suppresses a level tally on a finished tie (malformed feed data)", () => {
    expect(
      visibleShootout({ status: "finished", shootout: { home: 3, away: 3 } }),
    ).toBeNull();
  });

  it("returns null when there is no shootout", () => {
    expect(visibleShootout({ status: "finished", shootout: null })).toBeNull();
    expect(visibleShootout({ status: "live", shootout: undefined })).toBeNull();
  });
});

describe("formatShootout", () => {
  it("labels a decided shootout in home–away orientation", () => {
    expect(formatShootout({ home: 4, away: 2 })).toBe("4–2 pens");
    expect(formatShootout({ home: 2, away: 4 })).toBe("2–4 pens");
  });

  it("returns null when there was no shootout", () => {
    expect(formatShootout(null)).toBeNull();
    expect(formatShootout(undefined)).toBeNull();
  });
});
