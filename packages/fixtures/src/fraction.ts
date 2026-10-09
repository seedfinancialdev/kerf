// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Independent reader for the spec's fractional-inch notation ("35-1/16", "72", "3/4").
// Used only to check that fixture integers equal the fractions the spec prints.

import { INCH } from "@kerf/core";

export function inchesToUnits(text: string): number {
  const m = text.replace(/"$/, "").match(/^(?:(\d+)-)?(?:(\d+)\/(\d+)|(\d+))$/);
  if (!m) throw new Error(`not a fractional-inch literal: ${text}`);
  const whole = m[1] ?? m[4];
  let units = whole ? Number(whole) * INCH : 0;
  if (m[2] && m[3]) units += (INCH * Number(m[2])) / Number(m[3]);
  return units;
}
