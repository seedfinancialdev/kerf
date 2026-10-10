// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Typed errors for parameter expressions. Messages are written for the field they appear on.

export class ExpressionError extends Error {
  /** Zero-based character offset into the expression source. */
  readonly position: number;
  readonly source: string;

  constructor(message: string, source: string, position: number) {
    super(message);
    this.name = "ExpressionError";
    this.source = source;
    this.position = position;
  }
}
