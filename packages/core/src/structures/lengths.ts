// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Writing lengths into the expressions a generator produces.

import { INCH } from "../units";

/** An exact length of `units` as an expression the solver reads back unchanged. */
export const lit = (units: number): string => (units === 0 ? "0in" : `${units}/${INCH}in`);

/** An expression in parentheses, so it can sit inside a larger one. */
export const wrap = (expr: string): string => `(${expr})`;
