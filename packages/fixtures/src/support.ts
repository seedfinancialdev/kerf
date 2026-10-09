// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { NotImplemented } from "@kerf/core";
import { expect } from "vitest";

/**
 * Asserts that fn throws a real validation error. A stub's NotImplemented must not satisfy it,
 * otherwise an "expected to throw" test would pass before the feature exists.
 */
export function expectRealError(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected the call to throw").toBeInstanceOf(Error);
  expect(caught).not.toBeInstanceOf(NotImplemented);
}
