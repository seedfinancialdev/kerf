// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Space to fill (ADR 016, D6): a piece sized to an opening, leaving a gap at each side and at the top so it
// slides in. Whole-number lengths only.

import { INCH, type Len, MM } from "@kerf/core";

/** A width, height and depth (project units). */
export interface Size3 {
  w: Len;
  h: Len;
  d: Len;
}

/** The piece's outside size, or why the space and gap cannot make one. */
export type Outside = { ok: true; size: Size3 } | { ok: false; message: string };

/** The gap a new imperial project starts with: 1/8" (ADR 016, D6). */
export const DEFAULT_GAP: Len = INCH / 8;

/** The gap a new metric project starts with: 3 mm (ADR 016, D6). */
export const DEFAULT_GAP_METRIC: Len = 3 * MM;

/**
 * The outside size of a piece that fills `space`, leaving `gap` at each side and at the top (all in project
 * units). Depth is the space's depth as typed. A negative gap, or one that leaves no width or height, comes
 * back as `ok: false` with a message to show.
 */
export function outsideFromSpace(space: Size3, gap: Len): Outside {
  if (gap < 0) return { ok: false, message: "The gap can't be less than zero." };
  const size = { w: space.w - 2 * gap, h: space.h - gap, d: space.d };
  if (size.w <= 0 || size.h <= 0)
    return { ok: false, message: "The gap is bigger than the space." };
  return { ok: true, size };
}
