// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Templates (Domain model v0, "Template"; Interaction spec, "Start"): a starting point that is a
// structure plus default options. The prototype set is Bookcase, Keepsake box, Blank case and
// Blank box. A template names no stock: the project it starts supplies those.

import type { Id, Param, Project, Stock, Structure, Template } from "../types";
import { BOX_SPEC } from "./box";
import { CASE_SPEC } from "./case";

const id = (n: number): Id =>
  `01K7M3Q8ZD00000000T1${n.toString(16).toUpperCase().padStart(6, "0")}`;
const lengthParam = (n: number, name: string, expr: string): Param => ({
  id: id(n),
  name,
  expr,
  kind: "length",
});

/** The form fields that take a stock; a project supplies these when it starts from a template. */
export type StockOption = keyof typeof CASE_SPEC.stockLabels | keyof typeof BOX_SPEC.stockLabels;

/** Every `StockOption`, read from the forms so there is one list of them. */
export const STOCK_OPTIONS = [
  ...Object.keys(CASE_SPEC.stockLabels),
  ...Object.keys(BOX_SPEC.stockLabels),
] as StockOption[];

/** The stock fields each structure type's form reads; a project writes no others onto it. */
export const STOCK_FIELDS: Record<Structure["type"], readonly StockOption[]> = {
  case: Object.keys(CASE_SPEC.stockLabels) as StockOption[],
  box: Object.keys(BOX_SPEC.stockLabels) as StockOption[],
};

export const TEMPLATES: readonly Template[] = [
  {
    id: id(1),
    name: "Bookcase",
    params: [
      lengthParam(0x11, "width", "36in"),
      lengthParam(0x12, "height", "72in"),
      lengthParam(0x13, "depth", "12in"),
      { id: id(0x14), name: "shelf_count", expr: "4", kind: "count" },
    ],
    structure: {
      type: "case",
      size: { w: "width", h: "height", d: "depth" },
      options: {
        topBottom: "between-sides",
        back: "inset-rabbet",
        dadoDepth: "1/4in",
        rabbetDepth: "1/4in",
        backRabbetDepth: "3/8in",
        shelfRoundover: "1/8in",
      },
      openings: [
        {
          id: id(0x15),
          division: { type: "shelves", count: "shelf_count", spacing: "even" },
          children: [],
        },
      ],
    },
  },
  {
    id: id(2),
    name: "Keepsake box",
    params: [
      lengthParam(0x21, "box_length", "10in"),
      lengthParam(0x22, "box_width", "6in"),
      lengthParam(0x23, "box_height", "4in"),
    ],
    structure: {
      type: "box",
      size: { w: "box_length", h: "box_height", d: "box_width" },
      options: {
        cornerJoint: "through-dovetail",
        bottom: "groove",
        grooveDepth: "1/4in",
        grooveOffset: "1/4in",
        grainWraps: true,
      },
      openings: [{ id: id(0x24), children: [] }],
    },
  },
  {
    id: id(3),
    name: "Blank case",
    params: [
      lengthParam(0x31, "width", "30in"),
      lengthParam(0x32, "height", "36in"),
      lengthParam(0x33, "depth", "12in"),
    ],
    structure: {
      type: "case",
      size: { w: "width", h: "height", d: "depth" },
      options: { topBottom: "between-sides", back: "inset-rabbet" },
      openings: [{ id: id(0x34), children: [] }],
    },
  },
  {
    id: id(4),
    name: "Blank box",
    params: [
      lengthParam(0x41, "box_length", "8in"),
      lengthParam(0x42, "box_width", "6in"),
      lengthParam(0x43, "box_height", "3in"),
    ],
    structure: {
      type: "box",
      size: { w: "box_length", h: "box_height", d: "box_width" },
      options: { cornerJoint: "through-dovetail", bottom: "groove", grainWraps: false },
      openings: [{ id: id(0x44), children: [] }],
    },
  },
];

/**
 * A new project from a template. `stockFor` says which stock each form field uses (for example
 * `{ carcaseStock: <id of 3/4 plywood> }`); the structure's id comes from the template's own id.
 */
export function projectFromTemplate(
  template: Template,
  options: {
    name?: string;
    stock: Stock[];
    stockFor: Partial<Record<StockOption, Id>>;
    /** A second structure from the same template needs its own id. */
    structureId?: Id;
  },
): Project {
  const structure: Structure = {
    id: options.structureId ?? template.id,
    ...template.structure,
    options: { ...template.structure.options },
  };
  for (const key of STOCK_FIELDS[structure.type]) {
    const chosen = options.stockFor[key];
    if (chosen !== undefined) structure.options[key] = chosen;
  }
  return {
    schemaVersion: 1,
    name: options.name ?? template.name,
    units: "imperial",
    params: template.params.map((p) => ({ ...p })),
    stock: options.stock,
    parts: [],
    instances: [],
    patterns: [],
    joints: [],
    matchSets: [],
    structures: [structure],
  };
}
