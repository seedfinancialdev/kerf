// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What every tool, step, tab and top-bar control says when you rest on it (design spec, "Tooltips").
// Keys match `TOOLS` in tools/tools.ts; the step lines match `hintFor` in model/steps.ts.

import type { TipText } from "./Tip";

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
  edge: { name: "Edge profile", key: "F", text: "Round over or chamfer the edge of a board." },
  tape: { name: "Tape", key: "T", text: "Measure the distance between two points on the model." },

  Start: { name: "Start", text: "Pick a template and set the overall size." },
  Shape: {
    name: "Shape",
    text: "Choose how the piece is built. Every board follows the form until you edit it by hand.",
  },
  Divide: { name: "Divide", text: "Click an opening, then add shelves, a partition or bays." },
  Joinery: { name: "Joinery", text: "Check the joints your tools can cut, then accept them." },
  "Build plan": { name: "Build plan", text: "What to buy, what to cut, and in what order." },

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
  settings: { name: "Settings", text: "Choose dark or light, and inches or millimetres." },
  home: { name: "Home", text: "Your projects, and somewhere to start a new one." },
  size: {
    name: "Size",
    text: "Type a size, or drag this label left and right to adjust it. Any unit works: 36\", 3', 900 mm.",
  },
} as const satisfies Record<string, TipText>;

/** The name of one tip. */
export type TipId = keyof typeof TIPS;
