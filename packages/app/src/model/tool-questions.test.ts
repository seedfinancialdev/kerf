// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 016, D4: a step that needs a tool the record was never told about asks once, in place, and the
// answer is kept in the record. Rulings R24 (when the saw is asked about) and R25 (nothing assumed on Yes).
// The questions on screen are tested in ui/AskAboutTool.test.tsx, ui/JoineryStep.test.tsx and
// ui/CutListTab.test.tsx.

import { INCH } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { recordOf, toggleTool, wallFrom } from "./pegboard";
import { type ShopRecord, STARTER_RECORD, type ToolTopic } from "./shop-record";
import { asksAbout, TOOL_QUESTIONS } from "./tool-questions";

const answer = (topic: ToolTopic, label: string) => {
  const found = TOOL_QUESTIONS[topic].answers.find((a) => a.label("imperial") === label);
  if (!found) throw new Error(`no answer "${label}" to the ${topic} question`);
  return found;
};

/** The pegboard saved with "That's my shop" after taking both saws down (the starter has a table saw). */
const SET_UP_WITHOUT_SAWS: ShopRecord = recordOf(
  toggleTool(wallFrom(STARTER_RECORD), "tableSaw"),
  true,
);

describe("asksAbout()", () => {
  it("asks a skipped pegboard about its saw once, though it assumes a table saw (R24)", () => {
    expect(asksAbout(STARTER_RECORD, "saw")).toBe(true);
    expect(asksAbout({ ...STARTER_RECORD, told: ["saw"] }, "saw")).toBe(false);
  });

  it("asks a set-up shop with no saw on its wall what it cuts with (R24)", () => {
    expect([
      SET_UP_WITHOUT_SAWS.setUp,
      SET_UP_WITHOUT_SAWS.tableSaw,
      SET_UP_WITHOUT_SAWS.trackSaw,
    ]).toEqual([true, null, null]);
    expect(asksAbout(SET_UP_WITHOUT_SAWS, "saw")).toBe(true);
    expect(asksAbout({ ...SET_UP_WITHOUT_SAWS, told: ["saw"] }, "saw")).toBe(false);
  });

  it("never asks a set-up shop with a saw", () => {
    expect(asksAbout(recordOf(wallFrom(STARTER_RECORD), true), "saw")).toBe(false);
  });

  it("asks about any other tool only until the shop is set up or told", () => {
    expect(asksAbout(STARTER_RECORD, "dadoStack")).toBe(true);
    expect(asksAbout({ ...STARTER_RECORD, told: ["dadoStack"] }, "dadoStack")).toBe(false);
    expect(asksAbout(SET_UP_WITHOUT_SAWS, "dadoStack")).toBe(false);
  });
});

describe("TOOL_QUESTIONS", () => {
  it("saves the widest cut chosen with Yes for the dado stack (R25)", () => {
    const record = answer("dadoStack", "Yes, I have one").record(STARTER_RECORD, INCH / 2);
    expect(record.dadoStack).toEqual({ maxWidth: 101_600 }); // 1/2" = 203200 / 2
    expect(record.told).toEqual(["dadoStack"]);
  });

  it("takes the chisels and dovetail saw down when the answer is No", () => {
    const record = answer("handTools", "No, show me another way").record(STARTER_RECORD, 0);
    expect([record.chisels, record.dovetailSaw, record.told]).toEqual([
      false,
      false,
      ["handTools"],
    ]);
  });

  it("hangs chisels and a dovetail saw on Yes", () => {
    const none = { ...STARTER_RECORD, chisels: false, dovetailSaw: false };
    const record = answer("handTools", "Yes, I have them").record(none, 0);
    expect([record.chisels, record.dovetailSaw, record.told]).toEqual([true, true, ["handTools"]]);
  });

  it("keeps the router's bits on Yes, hangs an empty router when there was none, and takes it down on No", () => {
    const yes = answer("router", "Yes, I have one");
    expect(yes.record(STARTER_RECORD, 0).router).toEqual({
      bits: [{ shape: "roundover", size: 25_400 }], // 1/8" = 203200 / 8
    });
    expect(yes.record({ ...STARTER_RECORD, router: null }, 0).router).toEqual({ bits: [] });
    const no = answer("router", "No, show me another way").record(STARTER_RECORD, 0);
    expect([no.router, no.told]).toEqual([null, ["router"]]);
  });

  it("keeps a table saw's own blade when the answer is Table saw", () => {
    const thin = { ...STARTER_RECORD, tableSaw: { kerf: (3 * INCH) / 32 } };
    expect(answer("saw", "Table saw").record(thin, 0).tableSaw).toEqual({ kerf: 19_050 }); // 3 × 203200 / 32
  });

  it("offers the four saw answers as equals, none of them the usual one (R24)", () => {
    expect(TOOL_QUESTIONS.saw.peers).toBe(true);
    expect(TOOL_QUESTIONS.dadoStack.peers).toBeFalsy();
  });
});
