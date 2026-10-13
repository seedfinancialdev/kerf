// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// ADR 015, rule 11: a warning is said once and never lost; ruling R13: an Undo offer goes when
// History moves. Silent-failure review I2 and I9: one notice line must not drop a warning.

import { describe, expect, it } from "vitest";
import { afterHistoryMoved, dismiss, tell, warn, warningsFirst } from "./notices";

const empty = warningsFirst([]);

describe("the notice line", () => {
  it("shows the first start-up warning and keeps the others waiting in order", () => {
    expect(warningsFirst(["shop", "project"])).toEqual({
      notice: { text: "shop", kind: "warning" },
      waiting: ["project"],
    });
  });

  it("queues a warning behind one already shown, and shows it when that one is dismissed", () => {
    const line = warn(warn(empty, "first"), "second");
    expect(line.notice?.text).toBe("first");
    expect(dismiss(line).notice).toEqual({ text: "second", kind: "warning" });
  });

  it("does not queue a warning that is already shown or waiting", () => {
    const line = warn(warn(warn(empty, "first"), "second"), "first");
    expect(warn(line, "second")).toEqual(line);
    expect(line.waiting).toEqual(["second"]);
  });

  it("shows a warning over an Undo offer, which History still covers", () => {
    const line = warn(tell(empty, { text: "Top is now custom", kind: "undo" }), "not kept");
    expect(line.notice).toEqual({ text: "not kept", kind: "warning" });
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
});
