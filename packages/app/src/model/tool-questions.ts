// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What "ask when it matters" asks about each tool, and what each answer writes to the shop record
// (design spec, "Ask when it matters"; ADR 016, D4). Every answer marks its topic told, so it is asked
// once.

import { answered, DEFAULT_KERF, type ShopRecord, type ToolTopic } from "./shop-record";
import { STARTER_DADO_WIDTH } from "./starter";

/** One answer to a tool question: its button text and the record it leaves. */
export interface ToolAnswer {
  label: string;
  record: (record: ShopRecord) => ShopRecord;
}

/** A question about one tool: the sentence asked and its answers, the first being the usual one. */
export interface ToolQuestion {
  text: string;
  answers: readonly ToolAnswer[];
}

/** An answer that changes the record with `change`, then marks `topic` told. */
const answer = (
  topic: ToolTopic,
  label: string,
  change: (record: ShopRecord) => Partial<ShopRecord>,
): ToolAnswer => ({
  label,
  record: (record) => answered({ ...record, ...change(record) }, topic),
});

const NO_OTHER_WAY = "No, show me another way";

/**
 * A handheld saw run along a guide cuts like a track saw, so a circular saw is kept on the track saw's
 * card; "not sure" assumes the common 1/8" blade on the same card. Neither claims a table saw the woodworker
 * did not name.
 */
const guidedSaw = (record: ShopRecord) => ({ trackSaw: record.trackSaw ?? { kerf: DEFAULT_KERF } });

/** The question for every topic. A tool kept on Yes keeps its own settings when the record has it. */
export const TOOL_QUESTIONS: Readonly<Record<ToolTopic, ToolQuestion>> = {
  saw: {
    text: "What do you cut with?",
    answers: [
      answer("saw", "Table saw", (r) => ({ tableSaw: r.tableSaw ?? { kerf: DEFAULT_KERF } })),
      answer("saw", "Track saw", guidedSaw),
      answer("saw", "Circular saw", guidedSaw),
      answer("saw", 'Not sure, use 1/8"', guidedSaw),
    ],
  },
  dadoStack: {
    text: "This joint needs a dado stack. Do you have one?",
    answers: [
      answer("dadoStack", "Yes, I have one", (r) => ({
        dadoStack: r.dadoStack ?? { maxWidth: STARTER_DADO_WIDTH },
      })),
      answer("dadoStack", NO_OTHER_WAY, () => ({ dadoStack: null })),
    ],
  },
  router: {
    text: "This joint needs a router. Do you have one?",
    answers: [
      answer("router", "Yes, I have one", (r) => ({ router: r.router ?? { bits: [] } })),
      answer("router", NO_OTHER_WAY, () => ({ router: null })),
    ],
  },
  handTools: {
    text: "These corners are cut by hand. Do you have chisels and a dovetail saw?",
    answers: [
      answer("handTools", "Yes, I have them", () => ({ chisels: true, dovetailSaw: true })),
      answer("handTools", NO_OTHER_WAY, () => ({ chisels: false, dovetailSaw: false })),
    ],
  },
};
