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

const isStock = (v: unknown): boolean =>
  isObject(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  (v.kind === "sheet" || v.kind === "solid" || v.kind === "dimensional") &&
  isWhole(v.thickness, 1);

/** A tool that is absent (`null`) or an object that passes `check`. */
const isToolOrNull = (v: unknown, check: (tool: Record<string, unknown>) => boolean): boolean =>
  v === null || (isObject(v) && check(v));

/** True when `value` is a complete version-2 shop record: every field present and well formed. */
export function isShopRecord(value: unknown): value is ShopRecord {
  if (!isObject(value) || value.version !== 2) return false;
  const optionalLength = (v: unknown) => v === undefined || isWhole(v, 0);
  return (
    typeof value.setUp === "boolean" &&
    typeof value.drill === "boolean" &&
    typeof value.chisels === "boolean" &&
    typeof value.dovetailSaw === "boolean" &&
    isToolOrNull(value.tableSaw, (t) => isWhole(t.kerf, 0)) &&
    isToolOrNull(value.trackSaw, (t) => isWhole(t.kerf, 0)) &&
    isToolOrNull(value.dadoStack, (t) => isWhole(t.maxWidth, 1)) &&
    isToolOrNull(value.router, (t) => Array.isArray(t.bits) && t.bits.every(isBit)) &&
    Array.isArray(value.stock) &&
    value.stock.every(isStock) &&
    Array.isArray(value.told) &&
    value.told.every((t) => (TOOL_TOPICS as readonly unknown[]).includes(t)) &&
    optionalLength(value.sheetTrim) &&
    optionalLength(value.solidTrim) &&
    optionalLength(value.minOffcut)
  );
}
