// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What "ask when it matters" asks about each tool, what each answer writes to the shop record, and
// what Kerf then says it will plan for (design spec, "Ask when it matters"; ADR 016, D4). Every
// answer marks its topic told, so it is asked once; nothing is assumed without saying so (Rulings
// R24, R25).

import { formatLength, type Len, type Project } from "@kerf/core";
import {
  answered,
  DEFAULT_KERF,
  type ShopRecord,
  shopProfileFor,
  type ToolTopic,
  toldAbout,
} from "./shop-record";
import { STARTER_DADO_WIDTH } from "./starter";

type Units = Project["units"];

/** One answer to a tool question. */
export interface ToolAnswer {
  /** The button's words, in the project's units. */
  label: (units: Units) => string;
  /**
   * The record after this answer, marked told. `widest` is the dado stack's widest cut chosen with
   * the question (project units); other answers ignore it.
   */
  record: (record: ShopRecord, widest: Len) => ShopRecord;
  /** What Kerf will plan for now, said once the answer is given, from the record it left. */
  says: (record: ShopRecord, units: Units) => string;
}

/** A question about one tool. */
export interface ToolQuestion {
  /** The sentence asked, from the record as it is. */
  text: (record: ShopRecord, units: Units) => string;
  /** The answers, the first being the usual one unless `peers`. */
  answers: readonly ToolAnswer[];
  /** True when no answer is the usual one, so none is drawn as recommended. */
  peers?: boolean;
  /** True when the dado stack's widest cut is chosen with the question, so Yes assumes nothing. */
  asksWidest?: boolean;
}

/**
 * True when a screen should ask about `topic`. A saw is asked about once, even on a skipped
 * pegboard that assumes a table saw, because every cut is planned with its blade; and on a pegboard
 * saved without one (Ruling R24). Any other tool is asked about until the shop is set up or told
 * (ADR 016, D4).
 */
export function asksAbout(record: ShopRecord, topic: ToolTopic): boolean {
  if (topic !== "saw") return !toldAbout(record, topic);
  if (record.told.includes("saw")) return false;
  return !record.setUp || (!record.tableSaw && !record.trackSaw);
}

/**
 * The widest cut the dado question starts at: the record's own dado stack, else 3/4" (Ruling R25).
 */
export function startingWidest(record: ShopRecord): Len {
  return record.dadoStack?.maxWidth ?? STARTER_DADO_WIDTH;
}

/** An answer that changes the record with `change`, then marks `topic` told. */
const answer = (
  topic: ToolTopic,
  label: string | ToolAnswer["label"],
  change: (record: ShopRecord, widest: Len) => Partial<ShopRecord>,
  says: ToolAnswer["says"],
): ToolAnswer => ({
  label: typeof label === "string" ? () => label : label,
  record: (record, widest) => answered({ ...record, ...change(record, widest) }, topic),
  says,
});

const NO_OTHER_WAY = "No, show me another way";

/** The blade Kerf plans every cut with (the table saw's, when the shop has both saws). */
const blade = (record: ShopRecord, units: Units) =>
  formatLength(shopProfileFor(record).kerf, units);

/**
 * The blade of the saw just named, which is not always the one planned with when the shop has both.
 */
const bladeOf = (saw: ShopRecord["tableSaw"], units: Units) =>
  formatLength(saw?.kerf ?? DEFAULT_KERF, units);

/** What Kerf says once a saw answer names no saw of its own: only the blade it plans with. */
const plansBlade: ToolAnswer["says"] = (r, units) =>
  `Kerf will plan for a ${blade(r, units)} blade.`;

/**
 * "Not sure" hangs no saw the woodworker did not claim: it only marks the saw told, and a shop with
 * no saw plans with the common blade (`DEFAULT_KERF`, through `shopProfileFor`).
 */
const notSure: ToolAnswer = answer(
  "saw",
  (units) => `Not sure, use ${formatLength(DEFAULT_KERF, units)}`,
  () => ({}),
  plansBlade,
);

/**
 * The question for every topic. A tool kept on Yes keeps its own settings when the record has it.
 */
export const TOOL_QUESTIONS: Readonly<Record<ToolTopic, ToolQuestion>> = {
  saw: {
    text: (r, units) => `Your cut list assumes a ${blade(r, units)} blade. What do you cut with?`,
    peers: true,
    answers: [
      answer(
        "saw",
        "Table saw",
        (r) => ({ tableSaw: r.tableSaw ?? { kerf: DEFAULT_KERF } }),
        (r, units) => `Kerf will plan for your table saw's ${bladeOf(r.tableSaw, units)} blade.`,
      ),
      answer(
        "saw",
        "Track saw",
        (r) => ({ trackSaw: r.trackSaw ?? { kerf: DEFAULT_KERF } }),
        (r, units) => `Kerf will plan for your track saw's ${bladeOf(r.trackSaw, units)} blade.`,
      ),
      // A handheld saw run along a guide cuts like a track saw, so it is kept on that card.
      answer(
        "saw",
        "Circular saw",
        (r) => ({ trackSaw: r.trackSaw ?? { kerf: DEFAULT_KERF } }),
        plansBlade,
      ),
      notSure,
    ],
  },
  dadoStack: {
    text: () => "Dados, grooves and rabbets need a dado stack. Do you have one?",
    asksWidest: true,
    answers: [
      answer(
        "dadoStack",
        "Yes, I have one",
        (_, widest) => ({ dadoStack: { maxWidth: widest } }),
        (r, units) =>
          `Kerf will plan dados, grooves and rabbets up to ${formatLength(startingWidest(r), units)} wide with your dado stack.`,
      ),
      answer(
        "dadoStack",
        NO_OTHER_WAY,
        () => ({ dadoStack: null }),
        () => "No dado stack: each joint says what else would cut it.",
      ),
    ],
  },
  router: {
    text: () => "These joints need a router. Do you have one?",
    answers: [
      answer(
        "router",
        "Yes, I have one",
        (r) => ({ router: r.router ?? { bits: [] } }),
        () => "Kerf has your router. Add your bits in Your shop.",
      ),
      answer(
        "router",
        NO_OTHER_WAY,
        () => ({ router: null }),
        () => "No router: each joint says what else would cut it.",
      ),
    ],
  },
  handTools: {
    text: () => "These corners are cut by hand. Do you have chisels and a dovetail saw?",
    answers: [
      answer(
        "handTools",
        "Yes, I have them",
        () => ({ chisels: true, dovetailSaw: true }),
        () => "Kerf will plan hand-cut dovetails.",
      ),
      answer(
        "handTools",
        NO_OTHER_WAY,
        () => ({ chisels: false, dovetailSaw: false }),
        () => "No dovetail tools: choose another corner joint below.",
      ),
    ],
  },
};
