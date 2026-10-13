// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The words the screens use for the forms' fields and choices (Interaction spec, "Shape" table and
// "Shop language"). The engine's option keys never reach the screen.

import type { Structure } from "@kerf/core";

export type SizeKey = "w" | "h" | "d";

/** A case is Width × Height × Depth; a box is Length × Width × Height (Interaction spec, "Start"). */
export function sizeLabel(type: Structure["type"], key: SizeKey): string {
  if (type === "case") return { w: "Width", h: "Height", d: "Depth" }[key];
  return { w: "Length", h: "Height", d: "Width" }[key];
}

/** The order the size fields are shown in. */
export function sizeOrder(type: Structure["type"]): SizeKey[] {
  return type === "case" ? ["w", "h", "d"] : ["w", "d", "h"];
}

export const CHOICES = {
  topBottom: [
    { value: "between-sides", label: "Between the sides" },
    { value: "sides-between", label: "Sides between the top and bottom" },
  ],
  back: [
    { value: "none", label: "None" },
    { value: "inset-rabbet", label: "Inset in rabbets" },
    { value: "applied", label: "Applied to the back edges" },
  ],
  cornerJoint: [
    { value: "through-dovetail", label: "Through dovetails" },
    { value: "rabbet", label: "Rabbeted corners" },
  ],
  bottom: [
    { value: "groove", label: "In a groove" },
    { value: "none", label: "None" },
  ],
} as const satisfies Record<string, ReadonlyArray<{ value: string; label: string }>>;

const OPTION_LABELS: Record<string, string> = {
  carcaseStock: "Carcase stock",
  backStock: "Back stock",
  wallStock: "Wall stock",
  bottomStock: "Bottom stock",
  topBottom: "Top and bottom",
  back: "Back",
  cornerJoint: "Corners",
  bottom: "Bottom",
  grainWraps: "Grain wraps the corners",
  dadoDepth: "Dado depth",
  rabbetDepth: "Rabbet depth",
  backRabbetDepth: "Back rabbet depth",
  grooveDepth: "Groove depth",
  grooveOffset: "Groove height",
  shelfRoundover: "Shelf roundover",
};

/** The shop name of a form field. */
export function optionLabel(key: string): string {
  return OPTION_LABELS[key] ?? key;
}

/** The shop words for a choice's value ("inset-rabbet" → "inset in rabbets"), lower case. */
export function choiceLabel(key: string, value: string): string {
  const list: ReadonlyArray<{ value: string; label: string }> | undefined = (
    CHOICES as Record<string, ReadonlyArray<{ value: string; label: string }>>
  )[key];
  return (list?.find((c) => c.value === value)?.label ?? value).toLowerCase();
}
