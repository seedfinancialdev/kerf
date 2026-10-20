// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec §2, "Home": the sidebar (New project, Find a project, Home, All projects, Open file…,
// Recent files, Learn, Your shop), the templates, the Recent files cards, All projects, opening a
// file, and a browser that cannot keep projects (ADR 016, D1 and D5).

import { parseProject } from "@kerf/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Edit, startProject } from "../../model/commands";
import { saveKerfBytes } from "../../model/files";
import { LIBRARY_BLOCKED, LIBRARY_NOT_KEPT } from "../../model/library";
import { STARTER_RECORD } from "../../model/shop-record";
import { createStorage } from "../../model/storage";
import { createKerfStore } from "../../model/store";
import { KerfProvider } from "../../state/useKerf";
import { bannedWordsIn } from "../../testing/banned-words";
import { memoryLibrary } from "../../testing/memory-library";
import { memoryStorage } from "../../testing/memory-storage";
import { Home } from "./Home";

/** Thursday 15 October 2026, 14:30 local time: "now" on Home. */
const NOW = new Date(2026, 9, 15, 14, 30);
const HOUR_MS = 3_600_000;

/** The bookcase template named `name`. */
const bookcase = (name: string): Edit => {
  const edit = startProject("Bookcase", "imperial");
  return { ...edit, project: { ...edit.project, name } };
};

/**
 * Home on a browser whose shop is set up, with `made` kept one hour apart, the last made an hour
 * before `NOW`, so the last is the newest change.
 */
async function home(made: Edit[] = [], library = memoryLibrary()) {
  const backing = memoryStorage();
  backing.setItem("kerf.shop", JSON.stringify({ ...STARTER_RECORD, setUp: true }));
  let time = NOW.getTime() - made.length * HOUR_MS;
  const store = createKerfStore({
    storage: createStorage(backing),
    library,
    clockDate: () => time,
  });
  for (const edit of made) {
    await store.getState().createProject(edit, "");
    time += HOUR_MS;
  }
  store.getState().setScreen("home");
  await store.getState().refreshProjects();
  render(
    <KerfProvider store={store}>
      <Home />
    </KerfProvider>,
  );
  return { store };
}

const sidebar = () => within(screen.getByRole("complementary", { name: "Your projects" }));
const main = () => within(screen.getByRole("main"));

/** The names on the project cards in the main area, in order. */
const cardNames = (): string[] =>
  main()
    .queryAllByRole("listitem")
    .map((card) => card.querySelector(".project-name")?.textContent ?? "");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("<Home> sidebar", () => {
  it("leads with New project as the main button, then Find a project, Home, All projects and Open file…", async () => {
    await home();
    const newProject = sidebar().getByRole("button", { name: "New project" });
    expect(newProject.classList.contains("primary")).toBe(true);
    expect(sidebar().getByRole("searchbox", { name: "Find a project" })).toBeTruthy();
    const nav = within(sidebar().getByRole("navigation", { name: "Projects" }));
    expect(nav.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Home",
      "All projects",
      "Open file…",
    ]);
    expect(nav.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });

  it("opens New project over Home, on the bookcase the first time, and hides Home behind it", async () => {
    await home();
    await userEvent.click(sidebar().getByRole("button", { name: "New project" }));
    const panel = within(screen.getByRole("dialog", { name: "New project" }));
    expect(panel.getByRole("button", { name: /^Bookcase/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const behind = document.querySelector(".home-screen");
    expect(behind?.getAttribute("aria-hidden")).toBe("true");
    expect(behind?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("complementary", { name: "Your projects" })).toBeNull();
  });

  it("gives Home and the keyboard back when New project is cancelled", async () => {
    await home();
    const opener = sidebar().getByRole("button", { name: "New project" });
    await userEvent.click(opener);
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "New project" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".home-screen")?.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("lists the five newest projects under Recent files, newest first", async () => {
    await home(["P1", "P2", "P3", "P4", "P5", "P6"].map(bookcase));
    const recent = within(sidebar().getByRole("region", { name: "Recent files" }));
    // Six kept, P6 made last: the five newest are P6 back to P2.
    expect(recent.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "P6",
      "P5",
      "P4",
      "P3",
      "P2",
    ]);
  });

  it("opens a project from Recent files in the Workshop", async () => {
    const { store } = await home([bookcase("Hall shelf"), bookcase("Den shelf")]);
    const recent = within(sidebar().getByRole("region", { name: "Recent files" }));
    fireEvent.click(recent.getByRole("button", { name: "Hall shelf" }));
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(store.getState().projectId).toBe(
      store.getState().projects.find((p) => p.name === "Hall shelf")?.id,
    );
  });

  it("brings the tour back with Learn, on the newest project, with a tip saying so", async () => {
    const { store } = await home([bookcase("Hall shelf"), bookcase("Garage shelf")]);
    act(() => store.getState().finishTour());
    const learn = sidebar().getByRole("button", { name: "Learn" });
    await userEvent.hover(learn);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "LearnTake the short tour of the workshop.",
    );
    fireEvent.click(learn);
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    // "Garage shelf" was made last, so it is the newest change and first in the list.
    expect(store.getState().projectId).toBe(
      store.getState().projects.find((p) => p.name === "Garage shelf")?.id,
    );
    expect(store.getState().toured).toBe(false);
  });

  it("says to make a project first when Learn is pressed with none", async () => {
    const { store } = await home();
    act(() => store.getState().finishTour());
    fireEvent.click(sidebar().getByRole("button", { name: "Learn" }));
    expect(store.getState().notice?.text).toBe(
      "Make a project first, then the tour will show you around.",
    );
    expect(store.getState().screen).toBe("home");
    expect(store.getState().toured).toBe(true);
  });

  it("sums up the shop and goes to Your shop with Edit", async () => {
    const { store } = await home();
    const shop = within(sidebar().getByRole("region", { name: "Your shop" }));
    // The starter shop (STARTER_RECORD): five tools hung, and its three woods.
    expect(shop.getByText(/^Table saw/).textContent).toBe(
      "Table saw, dado stack, router, chisels, dovetail saw · 3/4 plywood, 1/4 plywood and 4/4 walnut",
    );
    fireEvent.click(shop.getByRole("button", { name: "Edit" }));
    expect(store.getState().screen).toBe("shop");
  });
});

describe("<Home> templates", () => {
  it("offers Bookcase, Cabinet and Box, with Table and Dresser marked Later and not yet working", async () => {
    await home();
    const templates = within(main().getByRole("region", { name: "Templates" }));
    const tiles = templates.getAllByRole("button");
    expect(
      tiles.map((t) => [t.querySelector(".tile-name")?.textContent, t.hasAttribute("disabled")]),
    ).toEqual([
      ["Bookcase", false],
      ["Cabinet", false],
      ["Box", false],
      ["Table Later", true],
      ["Dresser Later", true],
    ]);
  });

  it.each([
    ["Table", "Tables are coming later."],
    ["Dresser", "Dressers are coming later."],
  ])("says when the %s is coming in its tip", async (name, tip) => {
    await home();
    const tile = main().getByRole("button", { name: new RegExp(`^${name}`) });
    await userEvent.hover(tile.parentElement as HTMLElement);
    expect((await screen.findByRole("tooltip")).textContent).toBe(`${name}${tip}`);
  });

  it("opens New project with the piece chosen when its tile is clicked", async () => {
    await home();
    fireEvent.click(main().getByRole("button", { name: /^Cabinet/ }));
    const panel = within(screen.getByRole("dialog", { name: "New project" }));
    expect(panel.getByRole("button", { name: /^Cabinet/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("<Home> projects", () => {
  it("says where projects will show before there are any", async () => {
    await home();
    expect(cardNames()).toEqual([]);
    expect(main().getByText("Projects you start will show here.")).toBeTruthy();
  });

  it("shows a card for each project, newest change first, and opens one when clicked", async () => {
    const { store } = await home([bookcase("Living room bookcase"), bookcase("Garage cabinet")]);
    expect(cardNames()).toEqual(["Garage cabinet", "Living room bookcase"]);
    fireEvent.click(main().getByRole("button", { name: /^Living room bookcase/ }));
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
  });

  it("shows every card when one project's kind cannot be read for a fault in Kerf", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const parse = (text: string) => {
      if (text.includes("Den shelf")) throw new TypeError("x is undefined");
      return parseProject(text);
    };
    await home([bookcase("Hall shelf"), bookcase("Den shelf")], memoryLibrary({ parse }));
    expect(cardNames()).toEqual(["Den shelf", "Hall shelf"]);
  });

  it("ignores spaces around what is typed in Find a project", async () => {
    await home(["Living room bookcase", "Keepsake box"].map(bookcase));
    await userEvent.type(sidebar().getByRole("searchbox", { name: "Find a project" }), "  box ");
    expect(cardNames()).toEqual(["Keepsake box"]);
  });

  it("leaves only the projects whose names hold what is typed in Find a project, in any case", async () => {
    await home(["Living room bookcase", "Keepsake box", "BOOK nook"].map(bookcase));
    await userEvent.type(sidebar().getByRole("searchbox", { name: "Find a project" }), "book");
    expect(cardNames()).toEqual(["BOOK nook", "Living room bookcase"]);
  });

  it("says when no project's name holds what is typed", async () => {
    await home([bookcase("Keepsake box")]);
    await userEvent.type(sidebar().getByRole("searchbox", { name: "Find a project" }), "table");
    expect(cardNames()).toEqual([]);
    expect(main().getByText('No project\'s name has "table" in it.')).toBeTruthy();
  });

  it("lists every project in All projects, newest change first", async () => {
    // Nine kept, more than Home's Recent files shows (eight): N9 made last.
    const names = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"];
    await home(names.map(bookcase));
    expect(cardNames()).toHaveLength(8);
    fireEvent.click(sidebar().getByRole("button", { name: "All projects" }));
    expect(main().getByRole("heading", { level: 1 }).textContent).toBe("All projects");
    expect(cardNames()).toEqual([...names].reverse());
  });

  it("goes to All projects from See all", async () => {
    await home([bookcase("Hall shelf")]);
    fireEvent.click(main().getByRole("button", { name: "See all" }));
    expect(
      sidebar().getByRole("button", { name: "All projects" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("<Home> Open file…", () => {
  /** Picks `bytes` as the file `name` in Open file…'s file chooser. */
  async function pick(bytes: Uint8Array, name: string) {
    const chooser = screen.getByLabelText<HTMLInputElement>("Kerf file to open");
    await userEvent.upload(chooser, new File([bytes as BlobPart], name));
  }

  it("adds a .kerf file as a new project and opens it", async () => {
    const { store } = await home([bookcase("Hall shelf")]);
    const file = saveKerfBytes(bookcase("From a friend").project, {
      created: NOW.toISOString(),
      modified: NOW.toISOString(),
    });
    await pick(file, "From a friend.kerf");
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(store.getState().projects.map((p) => p.name)).toEqual(["From a friend", "Hall shelf"]);
  });

  it("adds the same file again as a second project when it is picked twice", async () => {
    const { store } = await home();
    const file = saveKerfBytes(bookcase("From a friend").project, {
      created: NOW.toISOString(),
      modified: NOW.toISOString(),
    });
    await pick(file, "From a friend.kerf");
    await waitFor(() => expect(store.getState().projects).toHaveLength(1));
    await pick(file, "From a friend.kerf");
    await waitFor(() =>
      expect(store.getState().projects.map((p) => p.name)).toEqual([
        "From a friend",
        "From a friend",
      ]),
    );
  });

  it("says why a damaged file cannot be opened and stays on Home", async () => {
    const { store } = await home();
    await pick(new Uint8Array([1, 2, 3]), "Broken.kerf");
    await waitFor(() =>
      expect(store.getState().notice?.text).toBe(
        "This file could not be opened: it is not a Kerf file, or it is damaged.",
      ),
    );
    expect(store.getState().screen).toBe("home");
    expect(store.getState().projects).toEqual([]);
  });
});

describe("<Home> on a browser that cannot keep projects", () => {
  it("says so in a banner that stays", async () => {
    const { store } = await home([], memoryLibrary({ available: false }));
    expect(screen.getByRole("alert").textContent).toBe(LIBRARY_NOT_KEPT);
    act(() => store.getState().dismissNotice());
    fireEvent.click(sidebar().getByRole("button", { name: "All projects" }));
    expect(screen.getByRole("alert").textContent).toBe(LIBRARY_NOT_KEPT);
  });

  it("shows no banner where projects are kept", async () => {
    await home();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("gives the library's own reason in the banner, such as another tab blocking it", async () => {
    await home([], memoryLibrary({ available: false, notKept: LIBRARY_BLOCKED }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Kerf is open in another tab, so your projects can't be reached here. Close the other tab, " +
        "then reload this page.",
    );
  });

  it("shows the open project, which is not kept, as a card that opens it again", async () => {
    const { store } = await home([bookcase("Hall shelf")], memoryLibrary({ available: false }));
    const before = store.getState().history;
    expect(cardNames()).toEqual(["Hall shelf"]);
    const card = main().getByRole("button", { name: /Hall shelf/ });
    expect(card.textContent).toContain("Open now, not kept");
    fireEvent.click(card);
    expect(store.getState().screen).toBe("workshop");
    expect(store.getState().history).toBe(before);
  });

  it("lists the open project that is not kept first under the sidebar's Recent files", async () => {
    const { store } = await home([bookcase("Hall shelf")], memoryLibrary({ available: false }));
    const before = store.getState().history;
    fireEvent.click(sidebar().getByRole("button", { name: "Hall shelf" }));
    expect(store.getState().screen).toBe("workshop");
    expect(store.getState().history).toBe(before);
  });

  it("lists the open project that is not kept in All projects", async () => {
    await home([bookcase("Hall shelf")], memoryLibrary({ available: false }));
    fireEvent.click(sidebar().getByRole("button", { name: "All projects" }));
    expect(cardNames()).toEqual(["Hall shelf"]);
  });

  it("finds the open project that is not kept by its name, and only by its name", async () => {
    await home([bookcase("Hall shelf")], memoryLibrary({ available: false }));
    const find = sidebar().getByRole("searchbox", { name: "Find a project" });
    fireEvent.change(find, { target: { value: "hall" } });
    expect(cardNames()).toEqual(["Hall shelf"]);
    fireEvent.change(find, { target: { value: "Garage" } });
    expect(cardNames()).toEqual([]);
  });

  it("brings the tour back with Learn on the open project that is not kept", async () => {
    const { store } = await home([bookcase("Hall shelf")], memoryLibrary({ available: false }));
    const before = store.getState().history;
    act(() => store.getState().finishTour());
    fireEvent.click(sidebar().getByRole("button", { name: "Learn" }));
    await waitFor(() => expect(store.getState().screen).toBe("workshop"));
    expect(store.getState().history).toBe(before);
    expect(store.getState().toured).toBe(false);
  });
});

describe("<Home> with the open project kept", () => {
  it("shows its card once, as kept", async () => {
    await home([bookcase("Hall shelf")]);
    expect(cardNames()).toEqual(["Hall shelf"]);
    expect(main().queryByText("Open now, not kept")).toBeNull();
  });
});

describe("<Home> wording", () => {
  it("uses no banned word anywhere on the screen", async () => {
    await home([bookcase("Hall shelf")]);
    fireEvent.click(main().getByRole("button", { name: "More for Hall shelf" }));
    expect(bannedWordsIn(document.body.textContent ?? "")).toEqual([]);
  });
});
