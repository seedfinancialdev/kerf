// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The app's state (design spec, "How it is built", layer 2): the screen, the open project as
// History, a preview while something is dragged, the solve of whatever is shown, and the step,
// selection, shop and tool. Every change goes through `apply` (or `preview` then `commit`), and the
// engine solves the shown project straight after, so the screens, the cut list and the kept project
// can never disagree.

import { assemblyOrder, type Project, type ShopProfile, serializeProject, solve } from "@kerf/core";
import { createStore } from "zustand/vanilla";
import type { Edit } from "./commands";
import {
  canRedo,
  canUndo,
  currentProject,
  type History,
  jumpTo,
  record,
  redo,
  startHistory,
  undo,
} from "./history";
import { newId } from "./ids";
import { readLastChoice, writeLastChoice } from "./last-choice";
import { LIBRARY_NOT_KEPT, type Library } from "./library";
import { libraryActions } from "./library-actions";
import { LAST_PROJECT_NOT_KEPT, type MigrationResult } from "./library-migration";
import {
  afterHistoryMoved,
  dismiss,
  type Notice,
  type NoticeLine,
  tell,
  warn,
  warningsFirst,
} from "./notices";
import { readSections, storageNotice, UNITS_NOT_KEPT } from "./persist";
import { NOTHING, type Selection } from "./selection";
import { loadShop, SHOP_NOT_KEPT, saveShop } from "./shop";
import { type ShopRecord, shopProfileFor } from "./shop-record";
import type { AppStorage } from "./storage";
import type { KerfActions, KerfState, KerfStore, Screen, Solved } from "./store-types";
import { viewActions } from "./view-actions";

/** The project on screen: the preview while dragging, otherwise History's current entry. */
export function shownProject(state: KerfState): Project | null {
  return state.previewed ?? (state.history ? currentProject(state.history) : null);
}

/**
 * The open project when the library does not keep it (it is not among the projects listed): the
 * old project the library refused, or one made in a browser that keeps no projects. Home shows it
 * so it can be reached again (final review, I3). Null when none is open or it is kept.
 */
export function openProjectNotKept(state: KerfState): Project | null {
  const { history, projects, projectId } = state;
  if (!history || projects.some((p) => p.id === projectId)) return null;
  return currentProject(history);
}

/**
 * Solves `project` for `shop`, timing it with `clock` (milliseconds); null when nothing is shown.
 * An error withholds the whole plan, the assembly order too (ADR 013, "Error blocks the solve").
 */
function solveShown(
  project: Project | null,
  shop: ShopProfile,
  clock: () => number,
): Solved | null {
  if (!project) return null;
  const started = clock();
  const result = solve(project, shop);
  const assembly = result.blocked ? [] : assemblyOrder(project, shop);
  return { result, assembly, ms: clock() - started };
}

/** Boards the solve does not have are no longer selected; none left means nothing is selected. */
function stillThere(selection: Selection, solved: Solved | null): Selection {
  if (selection.kind !== "boards") return selection;
  const present = new Set(solved?.result.placements.map((p) => p.instance));
  const instances = selection.instances.filter((id) => present.has(id));
  return instances.length > 0 ? { kind: "boards", instances } : NOTHING;
}

/**
 * The state a session starts in: on `start.screen`, with the shop from `start.shopRecord`, the
 * stored preferences, Home's banner `projectsNotKept`, and the start-up `warnings` shown in turn.
 * No project is open but `start.history`, the old project the library would not take, which is
 * open for the visit and kept nowhere. Other projects are opened from Home.
 */
function startingState(
  storage: AppStorage,
  start: {
    screen: Screen;
    shopRecord: ShopRecord;
    projectsNotKept: string | null;
    history: History | null;
    warnings: string[];
  },
): KerfState {
  const { screen, shopRecord, projectsNotKept, history, warnings } = start;
  return {
    screen,
    shopReturn: "home",
    projectId: null,
    projects: [],
    projectsNotKept,
    history,
    previewed: null,
    solved: null,
    step: "Shape",
    selection: NOTHING,
    shopRecord,
    shop: shopProfileFor(shopRecord),
    toured: storage.read("kerf.toured") === "yes",
    ...warningsFirst(warnings),
    tool: "select",
    pending: null,
    proposal: null,
    tape: null,
    guides: [],
    drawerTab: "Cut list",
    boardStock: null,
    theme: storage.read("kerf.theme") === "light" ? "light" : "dark",
    unitsForNew: storage.read("kerf.units") === "metric" ? "metric" : "imperial",
    lastChoice: readLastChoice(storage),
    sections: readSections(storage),
    sectionsShown: [],
    created: null,
    thumbnail: null,
    notDrawn: [],
    hovered: null,
    navigation: null,
    fitRequest: 0,
  };
}

/**
 * The start-up warnings, in turn: a shop problem, what became of the project older Kerf kept
 * (`migration`), and that this browser keeps no shop or settings. That projects are not kept is
 * Home's banner, so it is not said again here.
 */
function startupWarnings(
  storage: AppStorage,
  shopProblem: string | undefined,
  migration: MigrationResult | undefined,
): string[] {
  const aboutOldProject =
    migration?.outcome === "refused" ? LAST_PROJECT_NOT_KEPT : migration?.problem;
  return [shopProblem, aboutOldProject, storageNotice(storage)].filter(
    (w): w is string => w !== undefined,
  );
}

/**
 * Makes the store. `storage` keeps the shop, the tour, theme and screen choices (persist.ts and
 * shop.ts); `library` keeps the projects; `migration` is what became of the project older Kerf
 * kept (library-migration.ts), said at start; `clock` returns milliseconds and times the solve
 * (default `performance.now`); `clockDate` returns epoch milliseconds for when a project began or
 * changed (default `Date.now`). Starts on Your shop at first launch, else on Home, with no project
 * open but the old project the library refused (open for the visit, never written). Every recorded
 * change to a kept project is written to the library; if that fails, the user is told once.
 */
export function createKerfStore(deps: {
  storage: AppStorage;
  library: Library;
  migration?: MigrationResult;
  clock?: () => number;
  clockDate?: () => number;
}): KerfStore {
  const clock = deps.clock ?? (() => performance.now());
  const epochMs = (): number => deps.clockDate?.() ?? Date.now();
  const now = (): string => new Date(epochMs()).toISOString();
  const loaded = loadShop(deps.storage);
  const warnings = startupWarnings(deps.storage, loaded.problem, deps.migration);
  const refused = deps.migration?.outcome === "refused" ? deps.migration : undefined;

  const solveFor = (project: Project | null, shop: ShopProfile): Solved | null =>
    solveShown(project, shop, clock);

  // True once the user has been told that a kind of work is not being kept (each is said once).
  // Without storage at all the start-up warning has already said so for the shop.
  let toldShopNotKept = !deps.storage.available;
  let toldUnitsNotKept = false;
  // A warning said at start-up is not said again by `warnOnce`; nor is the library refusing
  // writes, once start-up has said it refused the old project.
  const warnedOnce = new Set<string>(refused ? [...warnings, LIBRARY_NOT_KEPT] : warnings);

  return createStore<KerfState & KerfActions>()((set, get) => {
    /**
     * Sets new state and re-solves what is shown. Selected boards that are gone are dropped only
     * when History moved: a drag's preview may lack a board for a moment, and the board must
     * still be picked when the drag is cancelled (ADR 015, ruling B).
     */
    const show = (patch: Partial<KerfState>): void => {
      const next = { ...get(), ...patch };
      const solved = solveFor(shownProject(next), next.shop);
      const selection =
        patch.history !== undefined ? stillThere(next.selection, solved) : next.selection;
      // A joint proposed for the project as it was is stale once History moves (ADR 015, ruling C).
      const moved = patch.history !== undefined;
      const pending = moved && next.pending?.tool === "join" ? null : next.pending;
      // An edit's own Undo offer comes in `patch`; otherwise the last change's offer goes (ADR 015, ruling A).
      const notices = moved && patch.notice === undefined ? afterHistoryMoved(line()) : {};
      set({
        ...patch,
        solved,
        selection,
        pending,
        ...notices,
        // The view tries every board again once History moves (Viewport.tsx).
        ...(moved ? { proposal: null, notDrawn: [] } : {}),
      });
      if (moved) projects.keep();
    };

    /**
     * Moves History to `history` when the user steps through it or starts afresh. Whatever a tool
     * had started was measured on the project that is no longer shown, so it is dropped with the
     * preview; a tool that records its own change keeps its action.
     */
    const moveHistory = (history: History, patch: Partial<KerfState> = {}): void =>
      show({ history, previewed: null, pending: null, ...patch });

    const line = (): NoticeLine => ({
      notice: get().notice,
      waiting: get().waiting,
      held: get().held,
    });

    /**
     * Shows `edit`'s project in the Workshop on Shape with a History of its own, so Undo never
     * reaches into another project. A measurement belongs to the project it was taken on (ADR 015,
     * rule 11).
     */
    const openAfresh = (edit: Edit, patch: Partial<KerfState>): void =>
      moveHistory(startHistory(edit), {
        tape: null,
        guides: [],
        screen: "workshop",
        step: "Shape",
        ...patch,
      });

    /**
     * Drops whatever was started or picked in the Workshop: it belongs to the project shown. The
     * view's picture is started first, while the view still shows the project (Ruling R17).
     */
    const leaveWorkshop = (screen: Screen): void => {
      projects.keep(true);
      const dropped = { screen, pending: null, proposal: null, selection: NOTHING };
      if (get().previewed) show({ ...dropped, previewed: null });
      else set(dropped);
    };

    /** Shows `text` with an Undo that runs `undo`, then goes if it is still on screen. */
    const offerUndo = (text: string, undo: () => Promise<void>): void => {
      const offer: Notice = {
        text,
        kind: "undo",
        undo: async () => {
          await undo();
          if (get().notice === offer) set(dismiss(line()));
        },
      };
      set(tell(line(), offer));
    };

    const projects = libraryActions({
      library: deps.library,
      get,
      set,
      now,
      newProjectId: () => newId(epochMs()),
      openAfresh,
      closeProject: () =>
        show({
          history: null,
          previewed: null,
          pending: null,
          projectId: null,
          created: null,
          selection: NOTHING,
          tape: null,
          guides: [],
          screen: get().screen === "workshop" ? "home" : get().screen,
        }),
      offerUndo,
      refusedAtStart: refused !== undefined,
    });

    const starting = startingState(deps.storage, {
      screen: loaded.firstLaunch ? "shop" : "home",
      shopRecord: loaded.record,
      projectsNotKept: projects.notKept(),
      history: refused?.history ?? null,
      warnings,
    });
    return {
      ...starting,
      solved: solveFor(shownProject(starting), starting.shop),

      ...viewActions(set, get),

      createProject: projects.createProject,
      openProject: projects.openProject,
      addFile: projects.addFile,
      renameProject: projects.renameProject,
      duplicateProject: projects.duplicateProject,
      deleteProject: projects.deleteProject,
      readKeptProject: projects.readKeptProject,
      refreshProjects: projects.refreshProjects,

      setScreen: (screen) => {
        const from = get().screen;
        if (screen === "shop" && from !== "shop") set({ shopReturn: from });
        if (screen === "workshop" && !get().history) set({ screen: "home" });
        else if (screen !== "workshop" && from === "workshop") leaveWorkshop(screen);
        else set({ screen });
      },
      leaveShop: () => get().setScreen(get().shopReturn),

      apply: (edit, notice) => {
        const h = get().history;
        // A change that changes nothing (a field left as it was) is not a History entry, and it
        // leaves the notice alone: nothing happened, so there is nothing to clear.
        if (h && serializeProject(currentProject(h)) === serializeProject(edit.project)) return;
        show({
          history: h ? record(h, edit) : startHistory(edit),
          previewed: null,
          // The Undo offer replaces the one History's move just cleared (ADR 015, ruling A).
          ...(notice ? tell(afterHistoryMoved(line()), { text: notice, kind: "undo" }) : {}),
        });
      },
      preview: (project) => show({ previewed: project }),
      commit: (label) => {
        const { previewed, history } = get();
        if (!previewed) return;
        const edit = { label, project: previewed };
        show({ history: history ? record(history, edit) : startHistory(edit), previewed: null });
      },
      cancelPreview: () => show({ previewed: null }),
      // Only a preview needs the recorded project solved again; a fault may come from solving.
      abandonAction: () => {
        const dropped = { pending: null, proposal: null };
        if (get().previewed) show({ ...dropped, previewed: null });
        else set(dropped);
      },
      // With nothing to step to, History has not moved, so nothing it clears is cleared.
      undo: () => {
        const h = get().history;
        if (h && canUndo(h)) moveHistory(undo(h));
      },
      redo: () => {
        const h = get().history;
        if (h && canRedo(h)) moveHistory(redo(h));
      },
      jumpTo: (index) => {
        const h = get().history;
        if (h) moveHistory(jumpTo(h, index));
      },
      setShopRecord: (shopRecord) => {
        const kept = saveShop(deps.storage, shopRecord);
        show({ shopRecord, shop: shopProfileFor(shopRecord) });
        if (kept || toldShopNotKept) return;
        toldShopNotKept = true;
        set(warn(line(), SHOP_NOT_KEPT));
      },
      // A browser that cannot keep it shows the tour again next visit: a small cost, not lost work.
      finishTour: () => {
        deps.storage.write("kerf.toured", "yes");
        set({ toured: true });
      },
      startTour: () => set({ toured: false }),
      setTool: (tool) => {
        const dropped = { tool, pending: null, proposal: null };
        // A preview belongs to the tool that drew it; leaving it would show, and put in a downloaded file, a change
        // that is not in History.
        if (get().previewed) show({ ...dropped, previewed: null });
        else set(dropped);
      },
      setTheme: (theme) => {
        deps.storage.write("kerf.theme", theme);
        set({ theme });
      },
      toggleSection: (title, defaultOpen = true) => {
        const { sections, sectionsShown } = get();
        const open = sectionsShown.includes(title) || (sections[title] ?? defaultOpen);
        const next = { ...sections, [title]: !open };
        deps.storage.write("kerf.sections", JSON.stringify(next));
        set({ sections: next, sectionsShown: sectionsShown.filter((t) => t !== title) });
      },
      showSection: (title) => {
        const { sectionsShown } = get();
        if (!sectionsShown.includes(title)) set({ sectionsShown: [...sectionsShown, title] });
      },
      say: (text, undoable = false) =>
        set(tell(line(), { text, kind: undoable ? "undo" : "said" })),
      warn: (text) => set(warn(line(), text)),
      boardNotDrawn: (instance) => {
        if (!get().notDrawn.includes(instance)) set({ notDrawn: [...get().notDrawn, instance] });
      },
      warnOnce: (text) => {
        if (warnedOnce.has(text)) return;
        warnedOnce.add(text);
        set(warn(line(), text));
      },
      dismissNotice: () => set(dismiss(line())),
      setUnitsForNew: (unitsForNew) => {
        set({ unitsForNew });
        if (deps.storage.write("kerf.units", unitsForNew) || toldUnitsNotKept) return;
        toldUnitsNotKept = true;
        set(warn(line(), UNITS_NOT_KEPT));
      },
      // Forgetting the last piece costs one click next visit, so a browser that will not keep it
      // is not told about it; the units say so through setUnitsForNew.
      rememberChoice: ({ piece, units, wood }) => {
        writeLastChoice(deps.storage, { piece, wood });
        set({ lastChoice: { piece, wood } });
        get().setUnitsForNew(units);
      },
    };
  });
}
