// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Ask when it matters (design spec; ADR 016, D4): one shared way for any screen to ask about a tool
// the shop record was never told about, in context and once. The answer is written to the shop
// record, and what Kerf will now plan for is said in its place (Rulings R24, R25).

import type { Len } from "@kerf/core";
import { useState } from "react";
import type { ToolTopic } from "../model/shop-record";
import { shownProject } from "../model/store";
import { asksAbout, startingWidest, TOOL_QUESTIONS } from "../model/tool-questions";
import { useKerf, useKerfStore } from "../state/useKerf";
import { InlineQuestion } from "./InlineQuestion";
import { DADO_WIDTHS } from "./shop/Pegboard";
import { SizeChoice } from "./shop/SizeChoice";

/**
 * Asks about `topic` while `asksAbout` says to; once answered, says what Kerf will plan for. Shows
 * nothing when there is nothing to ask and nothing was just answered.
 */
export function AskAboutTool({ topic }: { topic: ToolTopic }) {
  const store = useKerfStore();
  const record = useKerf((s) => s.shopRecord);
  const units = useKerf((s) => shownProject(s)?.units ?? "imperial");
  const [widest, setWidest] = useState<Len | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (said !== null) {
    return (
      <p className="ask-said" role="status">
        {said}
      </p>
    );
  }
  if (!asksAbout(record, topic)) return null;
  const question = TOOL_QUESTIONS[topic];
  const width = widest ?? startingWidest(record);
  return (
    <InlineQuestion
      text={question.text(record, units)}
      peers={question.peers ?? false}
      answers={question.answers.map((a) => ({
        label: a.label(units),
        onPick: () => {
          const s = store.getState();
          const next = a.record(s.shopRecord, width);
          s.setShopRecord(next);
          setSaid(a.says(next, units));
        },
      }))}
    >
      {question.asksWidest && (
        <SizeChoice
          label="Widest cut"
          usual={DADO_WIDTHS}
          value={width}
          units={units}
          otherLabel="Widest cut, typed"
          notPositive="The widest cut must be more than zero."
          onChange={setWidest}
        />
      )}
    </InlineQuestion>
  );
}
