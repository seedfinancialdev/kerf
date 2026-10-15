// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D4: a step that needs a tool the record was never told about asks once, in place, and the
// answer is kept in the record. The dado stack and saw questions are tested on screen
// (ui/AskAboutTool.test.tsx); these are the other two topics.

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { STARTER_RECORD } from "./shop-record";
import { TOOL_QUESTIONS } from "./tool-questions";

const answer = (topic: keyof typeof TOOL_QUESTIONS, label: string) => {
  const found = TOOL_QUESTIONS[topic].answers.find((a) => a.label === label);
  if (!found) throw new Error(`no answer "${label}" to the ${topic} question`);
  return found.record;
};

describe("TOOL_QUESTIONS", () => {
  it("asks about hand tools for dovetails; Yes hangs chisels and a dovetail saw", () => {
    expect(TOOL_QUESTIONS.handTools.text).toBe(
      "These corners are cut by hand. Do you have chisels and a dovetail saw?",
    );
    const none = { ...STARTER_RECORD, chisels: false, dovetailSaw: false };
    const record = answer("handTools", "Yes, I have them")(none);
    expect([record.chisels, record.dovetailSaw, record.told]).toEqual([true, true, ["handTools"]]);
  });

  it("takes the chisels and dovetail saw down when the answer is No", () => {
    const record = answer("handTools", "No, show me another way")(STARTER_RECORD);
    expect([record.chisels, record.dovetailSaw, record.told]).toEqual([
      false,
      false,
      ["handTools"],
    ]);
  });

  it("asks about a router; Yes keeps the router's bits, No takes the router down", () => {
    expect(TOOL_QUESTIONS.router.text).toBe("This joint needs a router. Do you have one?");
    const yes = answer("router", "Yes, I have one")(STARTER_RECORD);
    expect(yes.router).toEqual({ bits: [{ shape: "roundover", size: INCH / 8 }] });
    expect(yes.told).toEqual(["router"]);
    const no = answer("router", "No, show me another way")(STARTER_RECORD);
    expect([no.router, no.told]).toEqual([null, ["router"]]);
  });

  it("hangs an empty router when the shop had none and the answer is Yes", () => {
    const record = answer("router", "Yes, I have one")({ ...STARTER_RECORD, router: null });
    expect(record.router).toEqual({ bits: [] });
  });

  it("keeps the dado stack's own widest cut when the answer is Yes", () => {
    const narrow = { ...STARTER_RECORD, dadoStack: { maxWidth: INCH / 2 } };
    expect(answer("dadoStack", "Yes, I have one")(narrow).dadoStack).toEqual({
      maxWidth: 101_600, // 1/2" = 203200 / 2
    });
  });

  it("keeps a table saw's own blade when the answer is Table saw", () => {
    const thin = { ...STARTER_RECORD, tableSaw: { kerf: (3 * INCH) / 32 } };
    expect(answer("saw", "Table saw")(thin).tableSaw).toEqual({ kerf: 19_050 }); // 3 × 203200 / 32
  });
});
