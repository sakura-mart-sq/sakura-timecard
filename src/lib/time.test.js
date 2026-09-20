import { describe, expect, it } from "vitest";
import { addDays, dateKey, dateTimeFromFields, mondayOf, roundToQuarter, shortDateLabel, weekDates } from "./time.js";

describe("time helpers", () => {
  it("uses Vancouver date keys", () => {
    const date = new Date("2026-08-28T06:30:00.000Z");
    expect(dateKey(date)).toBe("2026-08-27");
  });

  it("builds week ranges from Monday", () => {
    expect(mondayOf("2026-08-27")).toBe("2026-08-24");
    expect(weekDates("2026-08-24")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    expect(addDays("2026-08-30", 1)).toBe("2026-08-31");
  });

  it("formats dates compactly for manager lists", () => {
    expect(shortDateLabel("2026-09-19")).toBe("9/19");
  });

  it("converts Vancouver local fields into ISO timestamps", () => {
    const date = dateTimeFromFields("2026-08-27", "10:00");
    expect(date?.toISOString()).toBe("2026-08-27T17:00:00.000Z");
  });

  it("rounds to the nearest quarter hour in Vancouver time", () => {
    const rounded = roundToQuarter(new Date("2026-08-27T17:07:00.000Z"));
    expect(rounded.toISOString()).toBe("2026-08-27T17:00:00.000Z");
  });
});
