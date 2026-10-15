// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Recent files" and "Project card menu (⋯)": a card shows the picture of the model,
// the name and when it was last changed; its menu renames, duplicates, downloads and deletes, and
// Delete asks first, then offers Undo.

import { serializeProject } from "@kerf/core";
import { readKerf } from "@kerf/io";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Edit, startProject } from "../../model/commands";
import type { LibraryEntry } from "../../model/library";
import { createStorage } from "../../model/storage";
import { createKerfStore } from "../../model/store";
import type { KerfStore } from "../../model/store-types";
import { KerfProvider, useKerf } from "../../state/useKerf";
import { memoryLibrary } from "../../testing/memory-library";
import { memoryStorage } from "../../testing/memory-storage";
import { Drawing } from "../art/drawings";
import { Notice } from "../Notice";
import { ProjectCard } from "./ProjectCard";

/** Thursday 15 October 2026, 14:30 local time. */
const NOW = new Date(2026, 9, 15, 14, 30);
/** Wednesday 14 October 2026, 9:00 local time: yesterday, seen from `NOW`. */
const YESTERDAY = new Date(2026, 9, 14, 9, 0);

/** The first bytes of every PNG, enough for a picture the card does not read. */
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** Every card the store lists, as Home shows them, with the notice line. */
function Cards() {
  const projects = useKerf((s) => s.projects);
  return (
    <>
      <Notice />
      <ul>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} now={NOW} />
        ))}
      </ul>
    </>
  );
}

/** A library holding `edit`'s project, changed yesterday, with `thumbnail` as its picture. */
async function kept(edit: Edit, thumbnail: Uint8Array | null): Promise<KerfStore> {
  const library = memoryLibrary();
  const entry: LibraryEntry = {
    id: "P1",
    name: edit.project.name,
    project: serializeProject(edit.project),
    thumbnail,
    created: YESTERDAY.toISOString(),
    modified: YESTERDAY.toISOString(),
    note: "",
  };
  await library.write(entry);
  const store = createKerfStore({ storage: createStorage(memoryStorage()), library });
  await store.getState().refreshProjects();
  return store;
}

/** A card for the kept bookcase, with no picture unless one is given. */
async function bookcaseCard(thumbnail: Uint8Array | null = null) {
  const store = await kept(startProject("Bookcase", "imperial"), thumbnail);
  const view = render(
    <KerfProvider store={store}>
      <Cards />
    </KerfProvider>,
  );
  return { store, view };
}

const card = () => within(screen.getByRole("listitem"));
const more = () => card().getByRole("button", { name: "More for Bookcase" });
const menuItem = (name: string) => screen.getByRole("menuitem", { name });
const names = (store: KerfStore) => store.getState().projects.map((p) => p.name);

/** The object URLs made and revoked while a test runs. */
const urls = { made: [] as Blob[], revoked: [] as string[] };

beforeEach(() => {
  urls.made = [];
  urls.revoked = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    urls.made.push(blob as Blob);
    return `blob:picture-${urls.made.length}`;
  };
  URL.revokeObjectURL = (url: string) => {
    urls.revoked.push(url);
  };
});

afterEach(() => vi.restoreAllMocks());

describe("<ProjectCard>", () => {
  it("shows the project's name and when it was last changed", async () => {
    await bookcaseCard();
    expect(card().getByRole("button", { name: "Bookcase Edited yesterday" })).toBeTruthy();
  });

  it("shows the picture of the model, as a picture the card's name already describes", async () => {
    await bookcaseCard(PNG);
    const picture = screen.getByRole("listitem").querySelector("img");
    expect(picture?.getAttribute("src")).toBe("blob:picture-1");
    expect(picture?.getAttribute("alt")).toBe("");
    expect(new Uint8Array(await (urls.made[0] as Blob).arrayBuffer())).toEqual(PNG);
  });

  it("lets go of the picture when the card goes", async () => {
    const { view } = await bookcaseCard(PNG);
    view.unmount();
    expect(urls.revoked).toEqual(["blob:picture-1"]);
  });

  it("draws the kind of piece when there is no picture yet", async () => {
    await bookcaseCard();
    const { container } = render(<Drawing name="bookcase" />);
    expect(screen.getByRole("listitem").querySelector("svg")?.innerHTML).toBe(
      container.querySelector("svg")?.innerHTML,
    );
    expect(urls.made).toEqual([]);
  });

  it("opens the project in the Workshop when clicked", async () => {
    const { store } = await bookcaseCard();
    fireEvent.click(card().getByRole("button", { name: /^Bookcase Edited/ }));
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(store.getState().projectId).toBe("P1");
  });
});

describe("<ProjectCard> menu", () => {
  it("offers Rename, Duplicate, Download .kerf file and Delete, and closes on Escape", async () => {
    await bookcaseCard();
    await userEvent.click(more());
    expect(more().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Download .kerf file",
      "Delete",
    ]);
    expect(document.activeElement).toBe(menuItem("Rename"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it("moves between its items with the arrow keys", async () => {
    await bookcaseCard();
    await userEvent.click(more());
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(menuItem("Duplicate"));
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(menuItem("Delete"));
  });

  it("closes when the pointer goes down outside it", async () => {
    await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renames the project in place, kept with Enter", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Rename"));
    const field = card().getByRole("textbox", { name: "Name" });
    expect(document.activeElement).toBe(field);
    await userEvent.clear(field);
    await userEvent.type(field, "Hall bookcase{Enter}");
    await waitFor(() => expect(names(store)).toEqual(["Hall bookcase"]));
    expect(card().queryByRole("textbox")).toBeNull();
  });

  it("leaves the name as it was when renaming is cancelled with Escape", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Rename"));
    await userEvent.type(card().getByRole("textbox", { name: "Name" }), " two{Escape}");
    expect(card().queryByRole("textbox")).toBeNull();
    expect(names(store)).toEqual(["Bookcase"]);
  });

  it("refuses an empty name, says why and keeps the field open", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Rename"));
    const field = card().getByRole("textbox", { name: "Name" });
    await userEvent.clear(field);
    await userEvent.type(field, "{Enter}");
    expect(store.getState().notice?.text).toBe("Give the project a name.");
    expect(card().getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(names(store)).toEqual(["Bookcase"]);
  });

  it("keeps a copy with Duplicate", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Duplicate"));
    await waitFor(() => expect(names(store)).toEqual(["Bookcase copy", "Bookcase"]));
  });

  it("downloads the project as a .kerf file", async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Download .kerf file"));
    await waitFor(() => expect(downloads).toEqual(["Bookcase.kerf"]));
    const file = new Uint8Array(await (urls.made[0] as Blob).arrayBuffer());
    expect(readKerf(file).project.name).toBe("Bookcase");
  });

  it("asks before deleting, and Cancel keeps the project", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Delete"));
    const ask = screen.getByRole("alertdialog", {
      name: 'Delete "Bookcase"? You can undo this for a few seconds.',
    });
    await userEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(names(store)).toEqual(["Bookcase"]);
  });

  it("deletes once asked, and offers Undo that brings it back", async () => {
    const { store } = await bookcaseCard();
    await userEvent.click(more());
    await userEvent.click(menuItem("Delete"));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(names(store)).toEqual([]));
    expect(screen.getByRole("status").textContent).toContain('Deleted "Bookcase".');
    await act(() => store.getState().notice?.undo?.());
    expect(names(store)).toEqual(["Bookcase"]);
  });
});
