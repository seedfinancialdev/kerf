// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The app's state (design spec, "How it is built", layer 2): the project as History, a preview
// while something is dragged, the solve of whatever is shown, and the step, selection, shop and
// tool. Every change goes through `apply` (or `preview` then `commit`), and the engine solves the
// shown project straight after, so the screens, the cut list and the file can never disagree.

import { assemblyOrder, type Project, type ShopProfile, serializeProject, solve } from "@kerf/core";
import { createStore } from "zustand/vanilla";
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
import { afterHistoryMoved, dismiss, type NoticeLine, tell, warn, warningsFirst } from "./notices";
import {
  NOT_KEPT,
  OPEN_STORED_FAULT,
  readSections,
  restoreProject,
  setAsideStoredProject,
  storageNotice,
  UNITS_NOT_KEPT,
  writeProject,
} from "./persist";
import { NOTHING, type Selection } from "./selection";
import { loadShop, SHOP_NOT_KEPT, saveShop } from "./shop";
import type { AppStorage } from "./storage";
import type { KerfActions, KerfState, KerfStore, Solved } from "./store-types";
import { viewActions } from "./view-actions";

/** The project on screen: the preview while dragging, otherwise History's current entry. */
export function shownProject(state: KerfState): Project | null {
  return state.previewed ?? (state.history ? currentProject(state.history) : null);
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
 * The stored project, solved, or why it could not be opened. A fault in Kerf while solving it is
 * logged and the project set aside, like one that cannot be read, so the app always starts
 * (ADR 015, rule 11).
 */
function openStoredProject(
  storage: AppStorage,
  solveFor: (project: Project) => Solved | null,
): { history: History | null; problem?: string; solved: Solved | null } {
  const restored = restoreProject(storage);
  if (!restored.history) return { ...restored, solved: null };
  try {
    return { ...restored, solved: solveFor(currentProject(restored.history)) };
  } catch (error) {
    console.error(error);
    return { ...setAsideStoredProject(storage, OPEN_STORED_FAULT), solved: null };
  }
}

/**
 * The state a session starts in: the Start step, the stored project (`history`) and its solve, the
 * shop, the stored preferences, and the start-up notices (`startup`). Without a stored project,
 * nothing is open.
 */
function startingState(
  storage: AppStorage,
  history: History | null,
  shop: ShopProfile,
  solved: Solved | null,
  startup: NoticeLine,
): KerfState {
  return {
    history,
    previewed: null,
    solved,
    step: "Start",
    selection: NOTHING,
    shop,
    ...startup,
    tool: "select",
    pending: null,
    proposal: null,
    tape: null,
    guides: [],
    drawerTab: "Cut list",
    boardStock: null,
    theme: storage.read("kerf.theme") === "light" ? "light" : "dark",
    unitsForNew: storage.read("kerf.units") === "metric" ? "metric" : "imperial",
    sections: readSections(storage),
    created: storage.read("kerf.created") ?? null,
    thumbnail: null,
    hovered: null,
    navigation: null,
    fitRequest: 0,
  };
}

/**
 * Makes the store. `storage` keeps the project, shop, theme and screen choices (persist.ts and
 * shop.ts); `clock` returns milliseconds and times the solve (default `performance.now`);
 * `clockDate` returns epoch milliseconds for when a project began (default `Date.now`). Starts on
 * the Start step, with the stored project if the engine accepts it (one it rejects is set aside,
 * never deleted); otherwise with none. Every recorded change is written back to storage; if that
 * fails, the user is told once. Start-up warnings are shown in turn: a shop problem first, then a
 * project problem, then the warning that this browser keeps nothing.
 */
export function createKerfStore(deps: {
  storage: AppStorage;
  clock?: () => number;
  clockDate?: () => number;
}): KerfStore {
  const clock = deps.clock ?? (() => performance.now());
  const loaded = loadShop(deps.storage);

  const solveFor = (project: Project | null, shop: ShopProfile): Solved | null =>
    solveShown(project, shop, clock);

  const restored = openStoredProject(deps.storage, (project) => solveFor(project, loaded.shop));
  const startup = warningsFirst(
    [loaded.problem, restored.problem, storageNotice(deps.storage)].filter(
      (w): w is string => w !== undefined,
    ),
  );

  // True once the user has been told that a kind of work is not being kept (each is said once).
  // Without storage at all the start-up warning has already said so for the project and the shop.
  let toldNotKept = !deps.storage.available;
  let toldShopNotKept = !deps.storage.available;
  let toldUnitsNotKept = false;
  const warnedOnce = new Set<string>();

  return createStore<KerfState & KerfActions>()((set, get) => {
    /**
     * Sets new state and re-solves what is shown. Selected boards that are gone are dropped only
     * when History moved: a drag's preview may lack a board for a moment, and the board must
     * still be picked when the drag is cancelled (ruling R19).
     */
    const show = (patch: Partial<KerfState>): void => {
      const next = { ...get(), ...patch };
      const solved = solveFor(shownProject(next), next.shop);
      const selection =
        patch.history !== undefined ? stillThere(next.selection, solved) : next.selection;
      // A joint proposed for the project as it was is stale once History moves (ruling R37).
      const moved = patch.history !== undefined;
      const pending = moved && next.pending?.tool === "join" ? null : next.pending;
      // An edit's own Undo offer comes in `patch`; otherwise the last change's offer goes (R13).
      const notices = moved && patch.notice === undefined ? afterHistoryMoved(line()) : {};
      set({
        ...patch,
        solved,
        selection,
        pending,
        ...notices,
        ...(moved ? { proposal: null } : {}),
      });
      if (moved) keep(get().history);
    };

    /**
     * Moves History to `history` when the user steps through it or starts afresh. Whatever a tool
     * had started was measured on the project that is no longer shown, so it is dropped with the
     * preview (final branch review I1, M1); a tool that records its own change keeps its action.
     */
    const moveHistory = (history: History, patch: Partial<KerfState> = {}): void =>
      show({ history, previewed: null, pending: null, ...patch });

    const line = (): NoticeLine => ({ notice: get().notice, waiting: get().waiting });

    /**
     * Keeps the shown History entry in storage. When the project cannot be written, warns once; the
     * warning waits behind any notice the user has not dismissed yet.
     */
    const keep = (history: History | null): void => {
      if (!history) return;
      if (writeProject(deps.storage, currentProject(history)) || toldNotKept) return;
      toldNotKept = true;
      set(warn(line(), NOT_KEPT));
    };

    return {
      ...startingState(deps.storage, restored.history, loaded.shop, restored.solved, startup),

      ...viewActions(set, get),

      begin: (edit) => {
        const created = new Date(deps.clockDate?.() ?? Date.now()).toISOString();
        deps.storage.write("kerf.created", created);
        set({ created });
        // Unlike `apply`, a project equal to the shown one is still recorded: the user opened a
        // file.
        const h = get().history;
        // A measurement belongs to the project it was taken on (ruling R42).
        moveHistory(h ? record(h, edit) : startHistory(edit), { tape: null, guides: [] });
      },

      apply: (edit, notice) => {
        const h = get().history;
        // A change that changes nothing (a field left as it was) is not a History entry, and it
        // leaves the notice alone: nothing happened, so there is nothing to clear.
        if (h && serializeProject(currentProject(h)) === serializeProject(edit.project)) return;
        show({
          history: h ? record(h, edit) : startHistory(edit),
          previewed: null,
          // The Undo offer replaces the one History's move just cleared (ruling R13).
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
      abandonAction: () => show({ previewed: null, pending: null, proposal: null }),
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
      setShop: (shop) => {
        const kept = saveShop(deps.storage, shop);
        show({ shop });
        if (kept || toldShopNotKept) return;
        toldShopNotKept = true;
        set(warn(line(), SHOP_NOT_KEPT));
      },
      setTool: (tool) => {
        const dropped = { tool, pending: null, proposal: null };
        // A preview belongs to the tool that drew it; leaving it would show (and Save) a change
        // that is not in History (final branch review I1).
        if (get().previewed) show({ ...dropped, previewed: null });
        else set(dropped);
      },
      setTheme: (theme) => {
        deps.storage.write("kerf.theme", theme);
        set({ theme });
      },
      toggleSection: (title, defaultOpen = true) => {
        const sections = { ...get().sections, [title]: !(get().sections[title] ?? defaultOpen) };
        deps.storage.write("kerf.sections", JSON.stringify(sections));
        set({ sections });
      },
      say: (text, undoable = false) =>
        set(tell(line(), { text, kind: undoable ? "undo" : "said" })),
      warn: (text) => set(warn(line(), text)),
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
    };
  });
}
