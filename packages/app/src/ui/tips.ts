// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What every tool, step, tab and top-bar control says when you rest on it (design spec, "Tooltips").
// Tool keys are those of `TOOLS` in tools/tools.ts; a step's line is its hint line from model/steps.ts.

import type { Structure } from "@kerf/core";
import { hintFor, type Step } from "../model/steps";
import type { TipText } from "./Tip";

/** A step's tip: its hint line for this kind of project, without the "Name — " lead the tip's heading already says. */
export function stepTip(step: Step, type: Structure["type"] | undefined): TipText {
  const forWhat = hintFor(step, type).slice(`${step} — `.length);
  return { name: step, text: forWhat.charAt(0).toUpperCase() + forWhat.slice(1) };
}

/** Every tip, by the control it belongs to. */
export const TIPS = {
  select: {
    name: "Select",
    key: "Space",
    text: "Pick a board, an opening or a joint to look at or change.",
  },
  board: { name: "Board", key: "B", text: "Draw a new board by clicking two corners." },
  pushPull: {
    name: "Push/Pull",
    key: "P",
    text: "Stretch or shrink a board by dragging one of its ends.",
  },
  move: { name: "Move", key: "M", text: "Move or copy the boards you picked." },
  join: {
    name: "Join",
    key: "J",
    text: "Click two boards to join them with a joint your tools can cut.",
  },
  edge: { name: "Edge profile", key: "F", text: "Round over the edges of a board." },
  tape: { name: "Tape", key: "T", text: "Measure the distance between two points on the model." },

  Shopping: {
    name: "Shopping",
    text: "The lumber and sheets to buy, with the offcuts you will have left.",
  },
  "Cut list": {
    name: "Cut list",
    text: "Every board, cut to length and width, with its grain direction.",
  },
  Sheets: { name: "Sheets", text: "How the parts lay out on each sheet of plywood." },
  Setups: {
    name: "Setups",
    text: "Each machine setup, in the order that saves you the most changes.",
  },
  Assembly: { name: "Assembly", text: "The order to glue and clamp the piece together." },

  undo: { name: "Undo", key: "Ctrl+Z", text: "Take back your last change." },
  redo: { name: "Redo", key: "Ctrl+Shift+Z", text: "Put back the change you just took back." },
  settings: {
    name: "Settings",
    text: "Change your shop, choose dark or light, and inches or millimetres.",
  },
  projectMenu: { name: "Project menu", text: "Rename, copy or download this project." },
  copyNeedsStorage: { name: "Duplicate", text: "Copies need a browser that keeps projects." },
  home: { name: "Home", text: "Your projects, and somewhere to start a new one." },
  table: { name: "Table", text: "Tables are coming later." },
  dresser: { name: "Dresser", text: "Dressers are coming later." },
  learn: { name: "Learn", text: "Take the short tour of the workshop." },
  tableSaw: {
    name: "Table saw",
    text: "Lets Kerf plan every cut to your blade's width.",
  },
  dadoStack: { name: "Dado stack", text: "Lets Kerf use dados for shelves." },
  router: { name: "Router", text: "Lets Kerf round over edges with the bits you have." },
  trackSaw: {
    name: "Track saw",
    text: "Lets Kerf plan cuts to its blade's width when there is no table saw.",
  },
  drill: {
    name: "Drill / driver",
    text: "Kerf keeps it in mind for screws and shelf-pin holes, coming later.",
  },
  chisels: { name: "Chisels", text: "With a dovetail saw, lets Kerf offer hand-cut dovetails." },
  dovetailSaw: {
    name: "Dovetail saw",
    text: "With chisels, lets Kerf offer hand-cut dovetails.",
  },
  addWood: {
    name: "Add your own",
    text: "Lets new projects start with a sheet or board you keep.",
  },
  size: {
    name: "Size",
    text: "Type a size, or drag this label left and right to adjust it. Any unit works: 36\", 3', 900 mm.",
  },
} satisfies Record<string, TipText>;

/** A wood card's tip: what hanging it does. */
export function woodTip(name: string): TipText {
  return { name, text: "Lets new projects start with this wood." };
}

/** The name of one tip. */
export type TipId = keyof typeof TIPS;
