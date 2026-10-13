// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The words the interface must never show (CLAUDE.md, "Hard rules"; Interaction spec, "Shop
// language"). Used by the screen tests and by the end-to-end wording check. It matches a word and its -s/-es plural only; other forms such as
// "extruded" are not flagged.

const BANNED_WORDS = [
  "mesh",
  "vertex",
  "face",
  "component",
  "instance",
  "material",
  "extrude",
  "boolean",
] as const;

const BANNED_PATTERNS = BANNED_WORDS.map((word) => ({
  word,
  pattern: new RegExp(`\\b${word}(es|s)?\\b`, "i"),
}));

/**
 * Shop phrases that use "face" the way a woodworker does (Interaction spec, "Shop language"). A face
 * frame is a cabinet part, not geometry, so it is allowed; any other bare "face" is reported.
 */
const SHOP_FACE = /\b(show|inside|outside) faces?\b|\bface (to face|frames?)\b/gi;

/** The banned words found in `text` (whole words, any case, singular or plural), in list order. */
export function bannedWordsIn(text: string): string[] {
  const plain = text.replace(SHOP_FACE, " ");
  return BANNED_PATTERNS.filter(({ pattern }) => pattern.test(plain)).map(({ word }) => word);
}
