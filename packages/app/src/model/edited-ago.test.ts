// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Recent files": each card says when its project was last changed, as a person
// would ("just now", "yesterday"), and as a date once that is clearer. The dates are local times,
// so the calendar-day cases hold in any time zone.

import { describe, expect, it } from "vitest";
import { editedAgo } from "./edited-ago";

/** Thursday 15 October 2026, 14:30 local time. */
const NOW = new Date(2026, 9, 15, 14, 30, 0);

/** `local` as the ISO string the library keeps. */
const kept = (local: Date): string => local.toISOString();

describe("editedAgo()", () => {
  it("says just now under a minute ago", () => {
    // 59 seconds before 14:30:00.
    expect(editedAgo(kept(new Date(2026, 9, 15, 14, 29, 1)), NOW)).toBe("just now");
  });

  it("says just now for a time a little ahead of this computer's clock", () => {
    expect(editedAgo(kept(new Date(2026, 9, 15, 14, 30, 20)), NOW)).toBe("just now");
  });

  it("counts whole minutes from one minute", () => {
    // 14:30 - 14:29 = 1 minute.
    expect(editedAgo(kept(new Date(2026, 9, 15, 14, 29, 0)), NOW)).toBe("1 minute ago");
    // 14:30 - 14:25 = 5 minutes.
    expect(editedAgo(kept(new Date(2026, 9, 15, 14, 25, 0)), NOW)).toBe("5 minutes ago");
  });

  it("counts whole hours earlier the same day", () => {
    // 14:30 - 13:30 = 1 hour; 14:30 - 09:10 = 5 h 20 min, so 5 hours.
    expect(editedAgo(kept(new Date(2026, 9, 15, 13, 30, 0)), NOW)).toBe("1 hour ago");
    expect(editedAgo(kept(new Date(2026, 9, 15, 9, 10, 0)), NOW)).toBe("5 hours ago");
  });

  it("says yesterday for any time on the day before", () => {
    // 14 October, at 23:59 and at 00:01.
    expect(editedAgo(kept(new Date(2026, 9, 14, 23, 59, 0)), NOW)).toBe("yesterday");
    expect(editedAgo(kept(new Date(2026, 9, 14, 0, 1, 0)), NOW)).toBe("yesterday");
  });

  it("counts calendar days from two to six days back", () => {
    // 15 - 12 = 3 days; 15 - 9 = 6 days.
    expect(editedAgo(kept(new Date(2026, 9, 12, 18, 0, 0)), NOW)).toBe("3 days ago");
    expect(editedAgo(kept(new Date(2026, 9, 9, 8, 0, 0)), NOW)).toBe("6 days ago");
  });

  it("gives the date in the browser's own way of writing dates from a week back", () => {
    // 15 - 8 = 7 days: past "6 days ago", so the date as the browser's locale writes it.
    const weekBack = new Date(2026, 9, 8, 10, 0, 0);
    const asTheBrowserWritesIt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
    expect(editedAgo(kept(weekBack), NOW)).toBe(asTheBrowserWritesIt.format(weekBack));
  });

  it("says the date is unknown for a time that does not read as a date, rather than a wrong count", () => {
    expect(editedAgo("not a date", NOW)).toBe("on an unknown date");
  });
});
