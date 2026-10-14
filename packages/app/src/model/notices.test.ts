// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: a warning is said once and never lost, and one notice line must not drop a warning;
// ADR 015, ruling A: an Undo offer goes when History moves.

import { describe, expect, it } from "vitest";
import { afterHistoryMoved, dismiss, tell, warn, warningsFirst } from "./notices";

const empty = warningsFirst([]);

describe("the notice line", () => {
  it("shows the first start-up warning and keeps the others waiting in order", () => {
    expect(warningsFirst(["shop", "project"])).toEqual({
      notice: { text: "shop", kind: "warning" },
      waiting: ["project"],
      held: null,
    });
  });

  it("queues a warning behind one already shown, and shows it when that one is dismissed", () => {
    const line = warn(warn(empty, "first"), "second");
    expect(line.notice?.text).toBe("first");
    expect(dismiss(line).notice).toEqual({ text: "second", kind: "warning" });
  });

  it("shows waiting warnings oldest first when several arrive behind one shown", () => {
    const line = warn(warn(warn(empty, "first"), "second"), "third");
    expect(line.waiting).toEqual(["second", "third"]);
    expect(dismiss(line).notice?.text).toBe("second");
    expect(dismiss(dismiss(line)).notice?.text).toBe("third");
  });

  it("does not queue a warning that is already shown or waiting", () => {
    const line = warn(warn(warn(empty, "first"), "second"), "first");
    expect(warn(line, "second")).toEqual(line);
    expect(line.waiting).toEqual(["second"]);
  });

  it("queues a warning behind an Undo offer, which may be the only words naming a new problem", () => {
    const offer = { text: "Shelf 2 now overlaps Back; Undo puts it back.", kind: "undo" } as const;
    const line = warn(tell(empty, offer), "not kept");
    expect(line.notice).toEqual(offer);
    expect(line.waiting).toEqual(["not kept"]);
  });

  it("queues a warning behind an answer the user has not dismissed", () => {
    const line = warn(tell(empty, { text: "refused", kind: "said" }), "not kept");
    expect(line.notice?.text).toBe("refused");
    expect(line.waiting).toEqual(["not kept"]);
  });

  it("puts a covered warning back at the front, so it shows again after the answer", () => {
    const line = tell(warningsFirst(["set aside", "3D view"]), { text: "refused", kind: "said" });
    expect(line.waiting).toEqual(["set aside", "3D view"]);
    expect(dismiss(line).notice?.text).toBe("set aside");
  });

  it("drops an Undo offer when History moves and shows the next waiting warning", () => {
    const line = tell(warningsFirst(["not kept"]), { text: "Top is now custom", kind: "undo" });
    expect(afterHistoryMoved(line).notice).toEqual({ text: "not kept", kind: "warning" });
  });

  it("keeps an answer or a warning when History moves", () => {
    const said = tell(empty, { text: "refused", kind: "said" });
    expect(afterHistoryMoved(said)).toEqual(said);
    const warned = warningsFirst(["not kept"]);
    expect(afterHistoryMoved(warned)).toEqual(warned);
  });

  describe("an Undo offer covered by an answer", () => {
    // The offer may be the only words naming a problem the change brought: Push/Pull, Move and
    // Edge record such a change and name the problem with Undo (tools/edit-outcome.ts).
    const offer = { text: "Shelf 2 now overlaps Back; Undo puts it back.", kind: "undo" } as const;
    const answer = { text: "Thickness is set by the stock.", kind: "said" } as const;

    it("shows the answer at once and the offer again when the answer is dismissed", () => {
      const line = tell(tell(empty, offer), answer);
      expect(line.notice).toEqual(answer);
      expect(dismiss(line).notice).toEqual(offer);
    });

    it("shows the offer again before the warnings waiting behind it", () => {
      const line = tell(warn(tell(empty, offer), "not kept"), answer);
      expect(dismiss(line).notice).toEqual(offer);
      expect(dismiss(dismiss(line)).notice).toEqual({ text: "not kept", kind: "warning" });
    });

    it("keeps the offer through a second answer", () => {
      const line = tell(tell(tell(empty, offer), answer), { text: "Pick a board.", kind: "said" });
      expect(dismiss(line).notice).toEqual(offer);
    });

    it("drops the offer once History moves, as it describes a change no longer the latest", () => {
      const line = afterHistoryMoved(tell(tell(empty, offer), answer));
      expect(line.notice).toEqual(answer);
      expect(dismiss(line).notice).toBeNull();
    });
  });
});
