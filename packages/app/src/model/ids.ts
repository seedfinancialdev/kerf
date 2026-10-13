// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Ids for what the user makes in the app (a board, a joint, a roundover). The engine requires ULIDs
// (Domain model: "ULID, stable, never reused"); the app, unlike core, may read the clock.

import type { Id } from "@kerf/core";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/** A new ULID: 48 bits of milliseconds then 80 random bits, as 26 Crockford base-32 characters. */
export function newId(
  now: number = Date.now(),
  random: (n: number) => Uint8Array = randomBytes,
): Id {
  let time = now;
  const head: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    head.unshift(CROCKFORD[time % 32] as string);
    time = Math.floor(time / 32);
  }
  const tail = [...random(16)].map((byte) => CROCKFORD[byte % 32] as string);
  return head.join("") + tail.join("");
}
