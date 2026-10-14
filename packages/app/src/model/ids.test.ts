// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Domain model: ids are ULIDs. The time prefix example is the ULID specification's own
// (time 1469918176385 → "01ARYZ6S41").

import { describe, expect, it } from "vitest";
import { newId } from "./ids";

const zeros = (n: number): Uint8Array => new Uint8Array(n);

describe("newId()", () => {
  it("encodes the time in the first ten characters, as the ULID specification's example", () => {
    expect(newId(1_469_918_176_385, zeros).slice(0, 10)).toBe("01ARYZ6S41");
  });

  it("is 26 Crockford base-32 characters, the form the engine accepts", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("differs between two calls in the same millisecond", () => {
    expect(newId(1)).not.toBe(newId(1));
  });
});
