/* eslint-disable no-irregular-whitespace -- espaces insécables attendus dans les formats français */
import { describe, expect, it } from "vitest";
import { formatClock, formatDistance, formatDuration, formatKm, formatPace } from "./format";

// Intl insère des espaces insécables : on les normalise pour la comparaison.
const n = (s: string) => s.replace(/ | /g, " ");

describe("formatage", () => {
  it("distances", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(n(formatDistance(5234))).toBe("5,23 km");
    expect(n(formatDistance(21_097))).toBe("21,1 km");
    expect(n(formatKm(10_000))).toBe("10 km");
    expect(n(formatKm(21_097))).toBe("21,1 km");
  });
  it("durées et allures", () => {
    expect(formatDuration(42 * 60)).toBe("42 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05");
    expect(formatPace(330)).toBe("5:30 /km");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(65)).toBe("1:05");
  });
});
