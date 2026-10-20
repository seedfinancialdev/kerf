// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3: the preview updates as sizes change, and (Task 10 brief) keeps the last piece
// that could be built while a size is being typed and cannot be read yet. The real preview
// draws to a canvas jsdom cannot read, so it is stood in for by one that says the width of the
// case it was given.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { STARTER_RECORD } from "../../model/shop-record";
import { createStorage } from "../../model/storage";
import { createKerfStore } from "../../model/store";
import { KerfProvider } from "../../state/useKerf";
import { memoryLibrary } from "../../testing/memory-library";
import { memoryStorage } from "../../testing/memory-storage";
import { NewProject } from "./NewProject";

vi.mock("../../viewport/Preview", () => ({
  Preview: ({ result }: { result: import("@kerf/core").SolveResult }) => {
    // The top's length across the case is its width less the two sides (23/32" each).
    const top = result.placements.find((p) => p.partName === "Top");
    return <p data-testid="preview">{top?.size.length}</p>;
  },
}));

function panel() {
  const backing = memoryStorage();
  backing.setItem("kerf.shop", JSON.stringify({ ...STARTER_RECORD, setUp: true }));
  const store = createKerfStore({ storage: createStorage(backing), library: memoryLibrary() });
  render(
    <KerfProvider store={store}>
      <NewProject piece="cabinet" onClose={() => undefined} />
    </KerfProvider>,
  );
}

const width = () =>
  within(screen.getByRole("dialog")).getByRole("textbox", { name: "Width" }) as HTMLInputElement;
const drawnTop = () => Number(screen.getByTestId("preview").textContent);

describe("<NewProject> preview", () => {
  it("draws each size that can be built, and keeps the last one while a size cannot be read", async () => {
    panel();
    // 36" − 2 × 23/32" = 34-9/16" = 7_023_100 units
    expect(drawnTop()).toBe(7_023_100);
    await userEvent.clear(width());
    await userEvent.type(width(), '30"');
    // 30" − 2 × 23/32" = 28-9/16" = 5_803_900 units
    expect(drawnTop()).toBe(5_803_900);
    await userEvent.type(width(), "-");
    expect(width().getAttribute("aria-invalid")).toBe("true");
    expect(drawnTop()).toBe(5_803_900);
  });
});
