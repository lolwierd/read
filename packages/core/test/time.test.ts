import { describe, expect, it } from "vitest";
import { addDays, dayInTz, parseKoDatetime, todayInTz, weekdayLabel } from "../src/time.js";

describe("parseKoDatetime", () => {
  it("parses IST wall-clock to epoch and round-trips through dayInTz", () => {
    const t = parseKoDatetime("2026-05-26 22:45:35");
    expect(dayInTz(t)).toBe("2026-05-26");
  });

  it("keeps a just-after-midnight IST time on the same IST day (not UTC's previous day)", () => {
    const t = parseKoDatetime("2026-01-15 00:30:00");
    expect(dayInTz(t)).toBe("2026-01-15");
    // 00:30 IST is 19:00 UTC the day before — prove we bucket in IST, not UTC.
    expect(dayInTz(t, "UTC")).toBe("2026-01-14");
  });

  it("treats one wall-clock hour as 3600 seconds", () => {
    const a = parseKoDatetime("2026-01-15 11:00:00");
    const b = parseKoDatetime("2026-01-15 12:00:00");
    expect(b - a).toBe(3600);
  });

  it("accepts the ISO 'T' separator", () => {
    expect(parseKoDatetime("2026-05-26T22:45:35")).toBe(parseKoDatetime("2026-05-26 22:45:35"));
  });

  it("returns 0 for an unparseable string", () => {
    expect(parseKoDatetime("not a date")).toBe(0);
    expect(parseKoDatetime("")).toBe(0);
  });
});

describe("dayInTz / todayInTz", () => {
  it("formats a Date in the reading tz", () => {
    const d = new Date("2026-06-01T20:00:00Z"); // 01:30 IST next day
    expect(todayInTz(d)).toBe("2026-06-02");
  });

  it("formats epoch seconds", () => {
    expect(dayInTz(0, "UTC")).toBe("1970-01-01");
  });
});

describe("addDays", () => {
  it("adds and subtracts within a month", () => {
    expect(addDays("2026-06-10", 5)).toBe("2026-06-15");
    expect(addDays("2026-06-10", -3)).toBe("2026-06-07");
  });
  it("rolls across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("handles leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("weekdayLabel", () => {
  it("labels known days", () => {
    expect(weekdayLabel("2026-06-01")).toBe("Mon");
    expect(weekdayLabel("2026-06-07")).toBe("Sun");
  });
});
