// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A saved shop record comes from browser storage, so every field is checked before it is used
// (CODE_QUALITY rule 9): a damaged record is never half-trusted.

import { BIT_SHAPES, type ShopRecord, TOOL_TOPICS } from "./shop-record";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isWhole = (v: unknown, min: number): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min;

const isBit = (v: unknown): boolean =>
  isObject(v) && (BIT_SHAPES as readonly unknown[]).includes(v.shape) && isWhole(v.size, 1);

const isSheet = (v: unknown): boolean =>
  isObject(v) &&
  isWhole(v.length, 1) &&
  isWhole(v.width, 1) &&
  (v.grain === "along-length" || v.grain === "none");

const isSolid = (v: unknown): boolean =>
  isObject(v) &&
  isWhole(v.maxWidth, 1) &&
  Array.isArray(v.standardLengths) &&
  v.standardLengths.length > 0 &&
  v.standardLengths.every((n) => isWhole(n, 1));

const isAllowance = (v: unknown): boolean =>
  isObject(v) && isWhole(v.length, 0) && isWhole(v.width, 0);

/** Core's `Stock`: nesting reads the sheet or solid size and the allowance without checking them. */
const isStock = (v: unknown): boolean =>
  isObject(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  isWhole(v.thickness, 1) &&
  isAllowance(v.allowance) &&
  ((v.kind === "sheet" && isSheet(v.sheet)) ||
    (v.kind === "solid" && isSolid(v.solid)) ||
    v.kind === "dimensional");

/** A tool that is absent (`null`) or an object that passes `check`. */
const isToolOrNull = (v: unknown, check: (tool: Record<string, unknown>) => boolean): boolean =>
  v === null || (isObject(v) && check(v));

const optionalLength = (v: unknown): boolean => v === undefined || isWhole(v, 0);

/** Each part of a version-2 record, in the shop's words, with its check. */
const PARTS: readonly (readonly [string, (r: Record<string, unknown>) => boolean])[] = [
  ["whether the shop was set up", (r) => typeof r.setUp === "boolean"],
  ["the drill", (r) => typeof r.drill === "boolean"],
  ["the chisels", (r) => typeof r.chisels === "boolean"],
  ["the dovetail saw", (r) => typeof r.dovetailSaw === "boolean"],
  ["the table saw", (r) => isToolOrNull(r.tableSaw, (t) => isWhole(t.kerf, 0))],
  ["the track saw", (r) => isToolOrNull(r.trackSaw, (t) => isWhole(t.kerf, 0))],
  ["the dado stack", (r) => isToolOrNull(r.dadoStack, (t) => isWhole(t.maxWidth, 1))],
  [
    "the router",
    (r) => isToolOrNull(r.router, (t) => Array.isArray(t.bits) && t.bits.every(isBit)),
  ],
  ["the wood", (r) => Array.isArray(r.stock) && r.stock.every(isStock)],
  [
    "the tools Kerf was told about",
    (r) =>
      Array.isArray(r.told) && r.told.every((t) => (TOOL_TOPICS as readonly unknown[]).includes(t)),
  ],
  [
    "the trims",
    (r) =>
      optionalLength(r.sheetTrim) && optionalLength(r.solidTrim) && optionalLength(r.minOffcut),
  ],
];

/**
 * Why `value` is not a version-2 shop record, in shop words for the sentence "Your saved shop
 * could not be used (…)": the first part that is missing or malformed, or that a newer Kerf made
 * it. Undefined when it is a complete record.
 */
export function shopRecordProblem(value: unknown): string | undefined {
  if (!isObject(value)) return "it was damaged";
  if (typeof value.version === "number" && value.version > 2) {
    return "it was made by a newer version of Kerf; update Kerf to use it";
  }
  if (value.version !== 2) return "it was damaged";
  const bad = PARTS.find(([, check]) => !check(value));
  return bad && `${bad[0]} was damaged`;
}

/** True when `value` is a complete version-2 shop record: every field present and well formed. */
export function isShopRecord(value: unknown): value is ShopRecord {
  return shopRecordProblem(value) === undefined;
}
