// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The right-angle orientations the generators use, by what they mean in a case or a box (the full
// table is ADR 003). A board's length, width and thickness are its local X, Y and Z; the frame is
// X across (left to right), Y depth (back at 0, front at the larger Y), Z up.

/** Length up, width front to back, thickness across: a side of a case, or a partition. */
export const STANDING_ACROSS = 17;

/** The left side of a case: the same board mirrored, so its inside face points the other way. */
export const STANDING_ACROSS_MIRRORED = 23;

/** Length up, width across, thickness front to back: the back panel of a case. */
export const FACING_FRONT = 16;

/** Length across, width up, thickness toward the front of the box: the front wall. */
export const WALL_FRONT = 1;

/** Length across, width up (downward from the top), thickness toward the back: the back wall. */
export const WALL_BACK = 3;

/** Length front to back, width up, thickness toward the left: the box's left side. */
export const WALL_SIDE_A = 12;

/** Length front to back, width up, thickness toward the right: the box's right side. */
export const WALL_SIDE_B = 8;
