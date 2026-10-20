// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §3, "New project": the gallery (Templates, Blank, Open file, Inspiration later),
// the piece's settings (units, outside size or space to fill, the gap, shelves or back, the
// wood), refusals in plain words before Create, Create or Enter to start at once, and the last
// piece, units and wood remembered. The panel is a modal dialog: the keyboard stays inside it and
// Escape closes it.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startProject } from "../../model/commands";
import { saveKerfBytes } from "../../model/files";
import type { Library } from "../../model/library";
import type { PieceId } from "../../model/new-project";
import { STARTER_RECORD } from "../../model/shop-record";
import { createStorage } from "../../model/storage";
import { createKerfStore, shownProject } from "../../model/store";
import { KerfProvider } from "../../state/useKerf";
import { bannedWordsIn } from "../../testing/banned-words";
import { memoryLibrary } from "../../testing/memory-library";
import { memoryStorage } from "../../testing/memory-storage";
import { NewProject } from "./NewProject";

/**
 * The panel over a browser whose shop is the starter shop, set up (`backing` keeps what an earlier
 * panel remembered), opened on `piece` when given.
 */
function panel(piece?: PieceId, backing: Storage = memoryStorage()) {
  if (backing.getItem("kerf.shop") === null) {
    backing.setItem("kerf.shop", JSON.stringify({ ...STARTER_RECORD, setUp: true }));
  }
  const library: Library = memoryLibrary();
  const store = createKerfStore({ storage: createStorage(backing), library });
  store.getState().setScreen("home");
  const onClose = vi.fn();
  const view = render(
    <KerfProvider store={store}>
      {/* Stands for the screen behind, which the keyboard must not reach while the panel is open. */}
      <button type="button">Behind the panel</button>
      <NewProject piece={piece} onClose={onClose} />
    </KerfProvider>,
  );
  return { store, library, onClose, backing, unmount: view.unmount };
}

const dialog = () => screen.getByRole("dialog", { name: "New project" });
const tile = (name: string) =>
  within(dialog()).getByRole("button", { name: new RegExp(`^${name}`) });
const field = (name: string) => within(dialog()).getByRole("textbox", { name }) as HTMLInputElement;
const group = (name: string) => within(dialog()).getByRole("group", { name });
const choice = (groupName: string, name: string) =>
  within(group(groupName)).getByRole("button", { name });
const create = () => within(dialog()).getByRole("button", { name: "Create" }) as HTMLButtonElement;

/** What is said under `input` (its aria-describedby), or null when nothing is. */
const saidUnder = (input: HTMLInputElement): string | null => {
  const id = input.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

/** Replaces what `input` holds with `text`. */
async function typeIn(input: HTMLInputElement, text: string): Promise<void> {
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

describe("<NewProject>", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens on the bookcase at 36 × 72 × 12 with 4 shelves in 3/4 plywood (design spec §3)", () => {
    panel("bookcase");
    expect(tile("Bookcase").getAttribute("aria-pressed")).toBe("true");
    expect(field("Width").value).toBe('36"');
    expect(field("Height").value).toBe('72"');
    expect(field("Depth").value).toBe('12"');
    expect(choice("Shelves", "4").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Wood, from your shop", "3/4 plywood").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Units", "Inches").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Size", "Outside size").getAttribute("aria-pressed")).toBe("true");
  });

  it("creates the piece and opens the workshop on Shape", async () => {
    const { store, library } = panel("bookcase");
    const made = vi.spyOn(store.getState(), "createProject");
    await userEvent.click(create());
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(made).toHaveBeenCalledTimes(1);
    expect(store.getState().step).toBe("Shape");
    expect(shownProject(store.getState())?.name).toBe("Bookcase");
    expect(await library.list()).toHaveLength(1);
  });

  it("builds the shelves pressed: 6 makes a bookcase with six shelves", async () => {
    const { store } = panel("bookcase");
    await userEvent.click(choice("Shelves", "6"));
    await userEvent.click(create());
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    const shelves = store
      .getState()
      .solved?.result.placements.filter((p) => p.partName === "Shelf");
    expect(shelves).toHaveLength(6);
  });

  it("turns Create off and says why under Width when the width is zero", async () => {
    panel("bookcase");
    await typeIn(field("Width"), '0"');
    expect(create().disabled).toBe(true);
    expect(field("Width").getAttribute("aria-invalid")).toBe("true");
    expect(saidUnder(field("Width"))).toBe("Width must be more than zero.");
  });

  it("names the field and what to type when a size is not a length", async () => {
    panel("bookcase");
    await typeIn(field("Height"), "tall");
    expect(saidUnder(field("Height"))).toBe(
      'Height: "tall" isn\'t a length; type one like 30" or 762 mm.',
    );
    expect(create().disabled).toBe(true);
  });

  it("sizes the piece to a space: the gap, and the outside size it gives", async () => {
    panel("bookcase");
    await userEvent.click(choice("Size", "Space to fill"));
    expect(field("Gap").value).toBe('1/8"');
    await typeIn(field("Width"), '30-1/2"');
    await typeIn(field("Height"), '80"');
    // space.test.ts: 30-1/2" − 2 × 1/8" = 30-1/4"; 80" − 1/8" = 79-7/8"; the depth as typed.
    expect(within(dialog()).getByText('The piece will be 30-1/4" × 79-7/8" × 12"')).toBeTruthy();
    expect(create().disabled).toBe(false);
  });

  it("refuses a gap bigger than the space and turns Create off", async () => {
    panel("bookcase");
    await userEvent.click(choice("Size", "Space to fill"));
    await typeIn(field("Width"), '30"');
    await typeIn(field("Gap"), '16"');
    // 30" − 2 × 16" = −2": no width is left.
    expect(saidUnder(field("Gap"))).toBe("The gap is bigger than the space.");
    expect(create().disabled).toBe(true);
  });

  it("says plainly that a table comes later, and keeps the piece chosen before", async () => {
    const { store } = panel("bookcase");
    await userEvent.click(tile("Table"));
    expect(
      within(dialog()).getByText(
        "Kerf can't build a table yet; it's coming. Start from a blank project or a plain case in the meantime.",
      ),
    ).toBeTruthy();
    expect(tile("Bookcase").getAttribute("aria-pressed")).toBe("true");
    expect(create().disabled).toBe(false);
    await userEvent.click(create());
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(shownProject(store.getState())?.structures[0]?.type).toBe("case");
  });

  it("asks what Something else is, and keeps the answer as the empty project's note", async () => {
    const { store, library } = panel("bookcase");
    await userEvent.click(tile("Something else"));
    await userEvent.type(field("What are you thinking of building?"), "A round dining table");
    await userEvent.click(create());
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(shownProject(store.getState())?.structures).toEqual([]);
    const [summary] = (await library.list()) ?? [];
    expect((await library.read(summary?.id ?? ""))?.note).toBe("A round dining table");
  });

  it("offers an empty project, a plain case and a plain box under Blank", async () => {
    panel("bookcase");
    await userEvent.click(within(dialog()).getByRole("tab", { name: "Blank" }));
    const blanks = within(within(dialog()).getByRole("tabpanel")).getAllByRole("button");
    expect(blanks.map((b) => b.querySelector(".tile-name")?.textContent)).toEqual([
      "Empty project",
      "Plain case",
      "Plain box",
    ]);
  });

  it("adds a .kerf file chosen under Open file as a new project, and opens it", async () => {
    const { store } = panel("bookcase");
    await userEvent.click(within(dialog()).getByRole("tab", { name: "Open file" }));
    const bytes = saveKerfBytes(
      { ...startProject("Blank box", "imperial").project, name: "Jewellery box" },
      { created: "2026-10-01T00:00:00.000Z", modified: "2026-10-01T00:00:00.000Z" },
    );
    await userEvent.upload(
      within(dialog()).getByLabelText<HTMLInputElement>("Kerf file to open"),
      new File([bytes as BlobPart], "jewellery.kerf"),
    );
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(shownProject(store.getState())?.name).toBe("Jewellery box");
  });

  it("creates at once on Enter in a size field", async () => {
    const { store } = panel("bookcase");
    await userEvent.type(field("Depth"), "{Enter}");
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
  });

  it("closes on Escape without creating anything", async () => {
    const { onClose, library } = panel("bookcase");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await library.list()).toEqual([]);
  });

  it("starts again from the last piece, units and wood created", async () => {
    const first = panel("cabinet");
    await userEvent.click(choice("Units", "Millimetres"));
    await userEvent.click(choice("Wood, from your shop", "4/4 walnut"));
    await userEvent.click(create());
    await waitFor(() => expect(first.store.getState().screen).toBe("workshop"));
    first.unmount();

    panel(undefined, first.backing);
    expect(tile("Cabinet").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Units", "Millimetres").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Wood, from your shop", "4/4 walnut").getAttribute("aria-pressed")).toBe("true");
    expect(field("Width").value).toBe("900 mm");
  });

  it("is a modal dialog that starts the keyboard on the chosen piece and keeps it inside", async () => {
    panel("box");
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(tile("Box"));
    await userEvent.tab({ shift: true });
    expect(dialog().contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 40; i += 1) {
      await userEvent.tab();
      expect(dialog().contains(document.activeElement)).toBe(true);
    }
  });

  it("uses shop words only", async () => {
    panel("bookcase");
    expect(bannedWordsIn(dialog().textContent ?? "")).toEqual([]);
    await userEvent.click(choice("Size", "Space to fill"));
    await userEvent.click(within(dialog()).getByRole("tab", { name: "Blank" }));
    expect(bannedWordsIn(dialog().textContent ?? "")).toEqual([]);
  });

  it("names the field once, and says what to type, for a size typed half way", async () => {
    panel("bookcase");
    await typeIn(field("Width"), "30-");
    const told = 'Width: "30-" isn\'t a length; type one like 30" or 762 mm.';
    expect(saidUnder(field("Width"))).toBe(told);
    expect(within(dialog()).getAllByText(told)).toHaveLength(1);
  });

  it('keeps the sizes typed when the units change: 30" is 762 mm, and back', async () => {
    panel("bookcase");
    await typeIn(field("Width"), '30"');
    await userEvent.click(choice("Units", "Millimetres"));
    // 30" × 25.4 = 762 mm; 72" = 1828.8 mm; 12" = 304.8 mm, spaced as the usual "900 mm" is.
    expect(field("Width").value).toBe("762 mm");
    expect(field("Height").value).toBe("1828.8 mm");
    expect(field("Depth").value).toBe("304.8 mm");
    await userEvent.click(choice("Units", "Inches"));
    expect(field("Width").value).toBe('30"');
    expect(field("Height").value).toBe('72"');
  });

  it("converts the gap with the sizes, and starts a size it cannot read afresh", async () => {
    panel("bookcase");
    await userEvent.click(choice("Size", "Space to fill"));
    await typeIn(field("Height"), "tall");
    await userEvent.click(choice("Units", "Millimetres"));
    // 1/8" = 3.175 mm; "tall" is no length, so the usual metric height (1800 mm) takes its place.
    expect(field("Gap").value).toBe("3.175 mm");
    expect(field("Height").value).toBe("1800 mm");
  });

  it("shows a notice raised while it is open inside the panel, where it can be read", async () => {
    const { store } = panel("bookcase");
    act(() => store.getState().say("Your shop couldn't be kept in this browser."));
    expect(within(dialog()).getByRole("status").textContent).toContain(
      "Your shop couldn't be kept in this browser.",
    );
  });

  it("explains a file that cannot be opened and stays open", async () => {
    const { store } = panel("bookcase");
    await userEvent.click(within(dialog()).getByRole("tab", { name: "Open file" }));
    await userEvent.upload(
      within(dialog()).getByLabelText<HTMLInputElement>("Kerf file to open"),
      new File([new Uint8Array([1, 2, 3])], "broken.kerf"),
    );
    await waitFor(() => expect(within(dialog()).getByRole("status").textContent).not.toBe(""));
    expect(store.getState().screen).toBe("home");
    expect(dialog()).toBeTruthy();
  });

  it("still creates the piece when the preview cannot be drawn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Without ResizeObserver the preview's canvas throws while it is drawn.
    vi.stubGlobal("ResizeObserver", undefined);
    const { store } = panel("bookcase");
    expect(
      within(dialog()).getByText(
        "The preview couldn't be drawn, but you can still create the piece.",
      ),
    ).toBeTruthy();
    await userEvent.click(create());
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(store.getState().notice).toBeNull();
  });

  it("closes the wood form on Escape and leaves the panel open", async () => {
    const { onClose } = panel("bookcase");
    await userEvent.click(choice("Wood, from your shop", "Other…"));
    await userEvent.click(field("Name"));
    await userEvent.keyboard("{Escape}");
    expect(within(dialog()).queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape when the keyboard has left the panel", async () => {
    const { onClose } = panel("bookcase");
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the place where it says a piece comes later, empty, until there is something to say", async () => {
    panel("bookcase");
    const place = dialog().querySelector("[aria-live]");
    expect(place?.textContent).toBe("");
    await userEvent.click(tile("Dresser"));
    expect(dialog().querySelector("[aria-live]")).toBe(place);
    expect(place?.textContent).toContain("Kerf can't build a dresser yet");
  });
});
