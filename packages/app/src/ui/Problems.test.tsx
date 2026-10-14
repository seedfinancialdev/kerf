// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Feedback & errors": the inspector explains each problem. A problem said
// several times shows how many; the summary of problems past the per-rule limit already says its
// number in words, so it is not counted again.

import type { Diagnostic } from "@kerf/core";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryStorage } from "../testing/memory-storage";
import { Problems } from "./Problems";

function shown(diagnostics: Diagnostic[]): string[] {
  const store = createKerfStore({ storage: createStorage(memoryStorage()) });
  store.getState().apply(startProject("Bookcase", "imperial"));
  const solved = store.getState().solved;
  if (!solved) throw new Error("not solved");
  act(() => store.setState({ solved: { ...solved, result: { ...solved.result, diagnostics } } }));
  render(
    <KerfProvider store={store}>
      <Problems />
    </KerfProvider>,
  );
  return screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
}

describe("<Problems>", () => {
  it("counts a problem said several times, and not the summary of those past the limit", () => {
    expect(
      shown([
        { severity: "error", rule: "overlap", message: "Top and Back overlap.", count: 2 },
        {
          severity: "error",
          rule: "overlap",
          message: "6 more problems like this one are not listed, such as: Top and Back overlap.",
          count: 6,
          summary: true,
        },
      ]),
    ).toEqual([
      "Error: Top and Back overlap. (2 times)",
      "Error: 6 more problems like this one are not listed, such as: Top and Back overlap.",
    ]);
  });
});
