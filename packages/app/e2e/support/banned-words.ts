// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The words the interface must never show (CLAUDE.md, "Hard rules"; Interaction spec, "Shop
// language"). Used by the screen tests and by the end-to-end wording check.

export const BANNED_WORDS = [
  "mesh",
  "vertex",
  "face",
  "component",
  "instance",
  "material",
  "extrude",
  "boolean",
] as const;

/** Shop phrases that use "face" the way a woodworker does (Interaction spec, "Shop language"). */
const SHOP_FACE = /\b(show|inside|outside) faces?\b|\bface to face\b/gi;

/** The banned words found in `text` (whole words, any case, singular or plural), in list order. */
export function bannedWordsIn(text: string): string[] {
  const plain = text.replace(SHOP_FACE, " ");
  return BANNED_WORDS.filter((word) => new RegExp(`\\b${word}(es|s)?\\b`, "i").test(plain));
}
