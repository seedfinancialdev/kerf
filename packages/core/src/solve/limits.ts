// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Limits shared by the file reader and the solver. They live apart so neither has to import the
// other.

/** Most members one pattern may expand to. Bounds both the work and the file. */
export const MAX_PATTERN_COUNT = 10_000;
