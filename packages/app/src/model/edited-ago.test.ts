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

/** `editedAgo` in American English, which writes dates "Oct 8, 2026". */
const ago = (when: Date): string => editedAgo(kept(when), NOW, "en-US");

/** `when` this long before `NOW`. */
const before = (ms: number): Date => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("editedAgo()", () => {
  it("says just now up to 59 seconds ago", () => {
    expect(ago(before(59 * SECOND))).toBe("just now");
  });

  it("says just now for any time ahead of now, as a computer whose clock is behind sees it", () => {
    expect(ago(new Date(2026, 9, 15, 14, 30, 20))).toBe("just now");
    expect(ago(new Date(2026, 9, 16, 9, 0))).toBe("just now");
  });

  it("counts whole minutes from 60 seconds to 59 minutes", () => {
    expect(ago(before(60 * SECOND))).toBe("1 minute ago");
    // 14:30 - 14:25 = 5 minutes.
    expect(ago(before(5 * MINUTE))).toBe("5 minutes ago");
    expect(ago(before(59 * MINUTE + 59 * SECOND))).toBe("59 minutes ago");
  });

  it("counts whole hours from 60 minutes, earlier the same day", () => {
    expect(ago(before(HOUR))).toBe("1 hour ago");
    // 14:30 - 09:10 = 5 h 20 min, so 5 hours.
    expect(ago(new Date(2026, 9, 15, 9, 10))).toBe("5 hours ago");
    // 14:30 - 14 h 30 min = 00:00 today.
    expect(ago(before(14 * HOUR + 30 * MINUTE))).toBe("14 hours ago");
  });

  it("says yesterday for any time on the day before, by the calendar, not by 24 hours", () => {
    // 14 October at 23:59, 14:31 (23 h 59 min ago), 14:30 (24 h ago) and 00:01.
    expect(ago(new Date(2026, 9, 14, 23, 59))).toBe("yesterday");
    expect(ago(before(23 * HOUR + 59 * MINUTE))).toBe("yesterday");
    expect(ago(before(DAY))).toBe("yesterday");
    expect(ago(new Date(2026, 9, 14, 0, 1))).toBe("yesterday");
  });

  it("counts calendar days from two to six days back", () => {
    // 47 h before 15 Oct 14:30 is 13 Oct 15:30; 48 h is 13 Oct 14:30: both 15 - 13 = 2 days.
    expect(ago(before(47 * HOUR))).toBe("2 days ago");
    expect(ago(before(48 * HOUR))).toBe("2 days ago");
    // 15 - 12 = 3 days; 6 days back is 9 October.
    expect(ago(new Date(2026, 9, 12, 18, 0))).toBe("3 days ago");
    expect(ago(before(6 * DAY))).toBe("6 days ago");
  });

  it("gives the date, written the way the locale writes it, from seven days back", () => {
    // 7 days back is 8 October 2026.
    expect(ago(before(7 * DAY))).toBe("Oct 8, 2026");
    expect(editedAgo(kept(before(7 * DAY)), NOW, "en-GB")).toBe("8 Oct 2026");
    expect(ago(new Date(2025, 2, 3, 12, 0))).toBe("Mar 3, 2025");
  });

  it("says the date is unknown for a time that does not read as a date, rather than a wrong count", () => {
    expect(editedAgo("not a date", NOW, "en-US")).toBe("on an unknown date");
  });
});
