// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Ask when it matters (design spec; ADR 016, D4): one shared way for any screen to ask about a tool the
// shop record was never told about, in context and once. The answer is written to the shop record.

import { type ToolTopic, toldAbout } from "../model/shop-record";
import { TOOL_QUESTIONS } from "../model/tool-questions";
import { useKerf, useKerfStore } from "../state/useKerf";
import { InlineQuestion } from "./InlineQuestion";

/** Asks about `topic` until the shop is told about it (on the pegboard or here); then shows nothing. */
export function AskAboutTool({ topic }: { topic: ToolTopic }) {
  const store = useKerfStore();
  const told = useKerf((s) => toldAbout(s.shopRecord, topic));
  if (told) return null;
  const question = TOOL_QUESTIONS[topic];
  return (
    <InlineQuestion
      text={question.text}
      answers={question.answers.map((a) => ({
        label: a.label,
        onPick: () => {
          const s = store.getState();
          s.setShopRecord(a.record(s.shopRecord));
        },
      }))}
    />
  );
}
