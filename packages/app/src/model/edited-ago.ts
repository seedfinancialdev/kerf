// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// When a project was last changed, as a person says it (design spec §2, "Recent files": "the name and
// when it was last changed"): minutes and hours today, "yesterday", days this week, then the date.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Days back that are counted ("6 days ago"); further back, the date is clearer. */
const DAYS_COUNTED = 6;

/** "1 minute ago", "5 minutes ago": `n` of `unit`, plural unless one. */
const count = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** Local calendar days from `earlier` to `later`; whole days, so a change of clocks does not count. */
function daysBetween(earlier: Date, later: Date): number {
  const midnight = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(later) - midnight(earlier)) / (24 * HOUR_MS));
}

/**
 * When `modified` (an ISO time, as the library keeps it) was, seen from `now`: "just now" under a
 * minute (or a little ahead of this computer's clock), "5 minutes ago", "3 hours ago" earlier the
 * same day, "yesterday" for any time the day before, "3 days ago" up to six days back, and the date
 * in the browser's own way of writing it after that. A time that is not a time gives "on an unknown
 * date", never a wrong count.
 */
export function editedAgo(modified: string, now: Date): string {
  const then = new Date(modified);
  if (Number.isNaN(then.getTime())) return "on an unknown date";
  const ago = now.getTime() - then.getTime();
  if (ago < MINUTE_MS) return "just now";
  if (ago < HOUR_MS) return count(Math.floor(ago / MINUTE_MS), "minute");
  const days = daysBetween(then, now);
  if (days === 0) return count(Math.floor(ago / HOUR_MS), "hour");
  if (days === 1) return "yesterday";
  if (days <= DAYS_COUNTED) return count(days, "day");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(then);
}
