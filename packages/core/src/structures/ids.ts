// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Identifiers for generated objects. They are derived from the structure's id and the part of the
// structure an object stands for, so the same project always generates the same ids: saved
// references to a detached board, and joints that name generated boards, stay valid when the
// project is regenerated.

import type { Id } from "../types";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 64-bit FNV-1a of the text, as a bigint. */
function fnv1a(text: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

/** A ULID-shaped id for `key` within `structure`. Keys must be unique per structure. */
export function generatedId(structure: Id, key: string): Id {
  // Two independent hashes give 10 characters (50 bits) plus 6 more from the structure id's own
  // time part, so ids of different structures never collide on the same key.
  let value = fnv1a(`${structure}\u0000${key}`);
  let tail = "";
  for (let i = 0; i < 10; i += 1) {
    tail += CROCKFORD[Number(value & 31n)];
    value >>= 5n;
  }
  return `${structure.slice(0, 16)}${tail}`;
}
