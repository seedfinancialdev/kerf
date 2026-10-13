// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The app's state (design spec, "How it is built", layer 2): the project as History, a preview
// while something is dragged, the solve of whatever is shown, and the step, selection, shop and
// tool. Every change goes through `apply` (or `preview` then `commit`), and the engine solves the
// shown project straight after, so the screens, the cut list and the file can never disagree.

import {
  type AssemblyStep,
  assemblyOrder,
  type Id,
  type Project,
  type ShopProfile,
  type SolveResult,
  serializeProject,
  solve,
  type Vec3,
} from "@kerf/core";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Edit } from "./commands";
import { currentProject, type History, jumpTo, record, redo, startHistory, undo } from "./history";
import {
  afterHistoryMoved,
  dismiss,
  type Notice,
  type NoticeLine,
  tell,
  warn,
  warningsFirst,
} from "./notices";
import type { Pending, Proposal } from "./pending";
import {
  NOT_KEPT,
  readSections,
  restoreProject,
  storageNotice,
  UNITS_NOT_KEPT,
  writeProject,
} from "./persist";
import { NOTHING, type Selection } from "./selection";
import { loadShop, SHOP_NOT_KEPT, saveShop } from "./shop";
import type { Step } from "./steps";
import type { AppStorage } from "./storage";

export interface Solved {
  result: SolveResult;
  assembly: AssemblyStep[];
  /** How long the solve took, for the speed budget (Charter question 3). */
  ms: number;
}

export type ToolId = "select" | "board" | "pushPull" | "move" | "join" | "edge" | "tape";

export type DrawerTab = "Shopping" | "Cut list" | "Sheets" | "Setups" | "Assembly";

export interface KerfState {
  history: History | null;
  previewed: Project | null;
  solved: Solved | null;
  step: Step;
  selection: Selection;
  shop: ShopProfile;
  /** The notice line (notices.ts). */
  notice: Notice | null;
  /** Warnings waiting behind the notice on screen, oldest first (notices.ts). */
  waiting: readonly string[];
  tool: ToolId;
  /** What the active tool has started and not finished; cleared when the tool changes or History is stepped through. */
  pending: Pending | null;
  /** The Join tool's suggestion for the two boards clicked; cleared when the tool changes. */
  proposal: Proposal | null;
  /** The last two points the Tape measured; session only, cleared when a project begins. */
  tape: { from: Vec3; to: Vec3 } | null;
  /** Guide lines kept from the Tape; session only, never saved (ADR 015, D6). */
  guides: ReadonlyArray<readonly [Vec3, Vec3]>;
  drawerTab: DrawerTab;
  /** The stock the Board tool draws in; null means the project's first sheet stock. */
  boardStock: Id | null;
  theme: "dark" | "light";
  /** Units a new project starts in: the user's choice in Settings, never the open project's (ADR 015, rule 4). */
  unitsForNew: Project["units"];
  /** Open state by section title; a title not listed has its own default. */
  sections: Record<string, boolean>;
  /** When the shown project was first started or opened (meta.json "created"). */
  created: string | null;
  /** Draws the model as a PNG for the file's thumbnail; set by the viewport, absent without one. */
  thumbnail: (() => Promise<Uint8Array | undefined>) | null;
  /** The board under the pointer, for the grain line (Interaction spec: "visible grain direction on hover"). */
  hovered: Id | null;
  /** Left-drag navigation after O (orbit) or H (pan), as SketchUp; null means picking. */
  navigation: "orbit" | "pan" | null;
  /** Bumped by Shift+Z; the view fits the model whenever it changes. */
  fitRequest: number;
}

export interface KerfActions {
  /**
   * Records `edit` as one named change and solves it; an edit that leaves the project as it was is
   * ignored. A `notice` is shown with Undo; without one an Undo notice is cleared and any other
   * notice stays.
   */
  apply(edit: Edit, notice?: string): void;
  /** Records a project that starts afresh (New, Open) as one History entry, even if equal to the shown one, noting when it began; drops the active tool's action. */
  begin(edit: Edit): void;
  /** Sets how the model is drawn for a file's thumbnail; null when no view can draw it. */
  setThumbnailSource(source: (() => Promise<Uint8Array | undefined>) | null): void;
  /** Marks the board under the pointer, or none. */
  hover(instance: Id | null): void;
  /** Makes left-drag orbit or pan; null makes it pick again. */
  setNavigation(mode: "orbit" | "pan" | null): void;
  /** Asks the view to zoom to fit the whole model. */
  requestFit(): void;
  /** Shows `project` and solves it without recording it (while dragging). */
  preview(project: Project): void;
  /** Records the previewed project under `label`. Does nothing when nothing is previewed. */
  commit(label: string): void;
  /** Drops the preview and shows the recorded project again. */
  cancelPreview(): void;
  /** Steps back one change; drops any preview and the active tool's action. Does nothing at the first entry. */
  undo(): void;
  /** Steps forward one change; drops any preview and the active tool's action. Does nothing at the last entry. */
  redo(): void;
  /** Shows History entry `index`, dropping any preview and the active tool's action. Throws RangeError for an index outside the list. */
  jumpTo(index: number): void;
  /** Moves to a workflow step. */
  setStep(step: Step): void;
  /** Sets what is picked. */
  select(selection: Selection): void;
  /** Uses and saves the shop, then solves again; says once when the browser cannot keep it. */
  setShop(shop: ShopProfile): void;
  /** Picks the active tool, dropping the last one's action and any preview it drew. */
  setTool(tool: ToolId): void;
  /** Sets or clears the active tool's half-finished action. */
  setPending(pending: Pending | null): void;
  /** Sets or clears the Join tool's suggestion. */
  setProposal(proposal: Proposal | null): void;
  /** Shows what the Tape measured, or clears the reading. */
  setTape(tape: { from: Vec3; to: Vec3 } | null): void;
  /** Keeps a line between two points as a guide. */
  addGuide(from: Vec3, to: Vec3): void;
  /** Removes every guide line. */
  clearGuides(): void;
  /** Chooses the stock the Board tool draws in. */
  setBoardStock(stock: Id | null): void;
  /** Shows a tab of the build-plan drawer. */
  setDrawerTab(tab: DrawerTab): void;
  /** Uses and saves the colour theme. */
  setTheme(theme: "dark" | "light"): void;
  /** Opens or closes the section `title` (open when never stored unless `defaultOpen` is false) and remembers it. */
  toggleSection(title: string, defaultOpen?: boolean): void;
  /**
   * Shows an answer to the user's last action at once, over any warning (which shows again after).
   * `undo` says whether it offers Undo; without it the notice stays until dismissed.
   */
  say(text: string, undo?: boolean): void;
  /** Adds a warning the user must not miss: shown in turn, never replaced, kept until dismissed. */
  warn(text: string): void;
  /** Clears the notice and shows the next waiting warning. */
  dismissNotice(): void;
  /** Remembers the units new projects start in; an open project is not touched. When the browser cannot keep the choice, says so once. */
  setUnitsForNew(units: Project["units"]): void;
}

export type KerfStore = StoreApi<KerfState & KerfActions>;

/** The project on screen: the preview while dragging, otherwise History's current entry. */
export function shownProject(state: KerfState): Project | null {
  return state.previewed ?? (state.history ? currentProject(state.history) : null);
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

  const solveFor = (project: Project | null, shop: ShopProfile): Solved | null => {
    if (!project) return null;
    const started = clock();
    const result = solve(project, shop);
    // An error withholds the whole plan, the assembly order too (ADR 013, "Error blocks the solve").
    const assembly = result.blocked ? [] : assemblyOrder(project, shop);
    return { result, assembly, ms: clock() - started };
  };

  const restored = restoreProject(deps.storage);
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

  return createStore<KerfState & KerfActions>()((set, get) => {
    /** Boards the solve does not have are no longer selected; none left means nothing is selected. */
    const stillThere = (selection: Selection, solved: Solved | null): Selection => {
      if (selection.kind !== "boards") return selection;
      const present = new Set(solved?.result.placements.map((p) => p.instance));
      const instances = selection.instances.filter((id) => present.has(id));
      return instances.length > 0 ? { kind: "boards", instances } : NOTHING;
    };

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
      history: restored.history,
      previewed: null,
      solved: solveFor(restored.history ? currentProject(restored.history) : null, loaded.shop),
      step: "Start",
      selection: NOTHING,
      shop: loaded.shop,
      ...startup,
      tool: "select",
      pending: null,
      proposal: null,
      tape: null,
      guides: [],
      drawerTab: "Cut list",
      boardStock: null,
      theme: deps.storage.read("kerf.theme") === "light" ? "light" : "dark",
      unitsForNew: deps.storage.read("kerf.units") === "metric" ? "metric" : "imperial",
      sections: readSections(deps.storage),
      created: deps.storage.read("kerf.created") ?? null,
      thumbnail: null,
      hovered: null,
      navigation: null,
      fitRequest: 0,

      begin: (edit) => {
        const created = new Date(deps.clockDate?.() ?? Date.now()).toISOString();
        deps.storage.write("kerf.created", created);
        set({ created });
        // Unlike `apply`, a project equal to the shown one is still recorded: the user opened a file.
        const h = get().history;
        // A measurement belongs to the project it was taken on (ruling R42).
        moveHistory(h ? record(h, edit) : startHistory(edit), { tape: null, guides: [] });
      },
      setThumbnailSource: (thumbnail) => set({ thumbnail }),
      hover: (hovered) => set({ hovered }),
      setNavigation: (navigation) => set({ navigation }),
      requestFit: () => set({ fitRequest: get().fitRequest + 1 }),

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
      undo: () => {
        const h = get().history;
        if (h) moveHistory(undo(h));
      },
      redo: () => {
        const h = get().history;
        if (h) moveHistory(redo(h));
      },
      jumpTo: (index) => {
        const h = get().history;
        if (h) moveHistory(jumpTo(h, index));
      },
      setStep: (step) => {
        // Each step shows its own panel, so a board picked on one step does not cover the next.
        const { selection } = get();
        set({ step, selection: selection.kind === "boards" ? NOTHING : selection });
      },
      select: (selection) => set({ selection }),
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
      setProposal: (proposal) => set({ proposal }),
      setTape: (tape) => set({ tape }),
      addGuide: (from, to) => set({ guides: [...get().guides, [from, to]] }),
      clearGuides: () => set({ guides: [] }),
      setPending: (pending) => set({ pending }),
      setBoardStock: (boardStock) => set({ boardStock }),
      setDrawerTab: (drawerTab) => set({ drawerTab }),
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
