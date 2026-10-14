// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The words the interface must never show (CLAUDE.md, "Hard rules"; Interaction spec, "Shop
// language"). Used by the screen tests and by the end-to-end wording check. Each word is matched
// with its plural, and "vertex" and "extrude" with their other forms too ("vertices", "extruded",
// "extrusion").

/** A banned word and the pattern that finds it, as whole words in any case. */
const BANNED: ReadonlyArray<{ word: string; pattern: RegExp }> = [
  { word: "mesh", pattern: /\bmesh(es)?\b/i },
  { word: "vertex", pattern: /\bvert(ex(es)?|ices)\b/i },
  { word: "face", pattern: /\bfaces?\b/i },
  { word: "component", pattern: /\bcomponents?\b/i },
  { word: "instance", pattern: /\binstances?\b/i },
  { word: "material", pattern: /\bmaterials?\b/i },
  { word: "extrude", pattern: /\bextru(de[sd]?|ding|sions?)\b/i },
  { word: "boolean", pattern: /\bbooleans?\b/i },
];

/**
 * Shop phrases that use "face" the way a woodworker does (Interaction spec, "Shop language"). A
 * face frame is a cabinet part, not geometry, so it is allowed; any other bare "face" is reported.
 */
const SHOP_FACE = /\b(show|inside|outside) faces?\b|\bface (to face|frames?)\b/gi;

/**
 * The banned words found in `text` (whole words, any case, with their plurals and other forms), in
 * list order.
 */
export function bannedWordsIn(text: string): string[] {
  const plain = text.replace(SHOP_FACE, " ");
  return BANNED.filter(({ pattern }) => pattern.test(plain)).map(({ word }) => word);
}
