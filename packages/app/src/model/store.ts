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
  type Project,
  parseProject,
  type ShopProfile,
  type SolveResult,
  serializeProject,
  solve,
} from "@kerf/core";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Edit } from "./commands";
import { currentProject, type History, jumpTo, record, redo, startHistory, undo } from "./history";
import { NOTHING, type Selection } from "./selection";
import { loadShop, saveShop } from "./shop";
import type { Step } from "./steps";
import type { AppStorage } from "./storage";

export interface Solved {
  result: SolveResult;
  assembly: AssemblyStep[];
  /** How long the solve took, for the speed budget (Charter question 3). */
  ms: number;
}

export interface Notice {
  text: string;
  /** True when the notice offers Undo for the change it describes. */
  undo: boolean;
}

export type ToolId = "select" | "board" | "pushPull" | "move" | "join" | "edge" | "tape";

export interface KerfState {
  history: History | null;
  previewed: Project | null;
  solved: Solved | null;
  step: Step;
  selection: Selection;
  shop: ShopProfile;
  notice: Notice | null;
  tool: ToolId;
  theme: "dark" | "light";
}

export interface KerfActions {
  /** Records `edit` as one named change and solves it. A `notice` is shown with Undo; any other Undo notice is cleared, a plain one stays. */
  apply(edit: Edit, notice?: string): void;
  /** Shows `project` and solves it without recording it (while dragging). */
  preview(project: Project): void;
  /** Records the previewed project under `label`. Does nothing when nothing is previewed. */
  commit(label: string): void;
  /** Drops the preview and shows the recorded project again. */
  cancelPreview(): void;
  /** Steps back one change; drops any preview. Does nothing at the first entry. */
  undo(): void;
  /** Steps forward one change; drops any preview. Does nothing at the last entry. */
  redo(): void;
  /** Shows History entry `index`. Throws RangeError for an index outside the list. */
  jumpTo(index: number): void;
  /** Moves to a workflow step. */
  setStep(step: Step): void;
  /** Sets what is picked. */
  select(selection: Selection): void;
  /** Uses and saves the shop, then solves again with it. */
  setShop(shop: ShopProfile): void;
  /** Picks the active tool. */
  setTool(tool: ToolId): void;
  /** Uses and saves the colour theme. */
  setTheme(theme: "dark" | "light"): void;
  /** Shows a notice; `undo` says whether it offers Undo (default no, so it stays until dismissed). */
  say(text: string, undo?: boolean): void;
  /** Clears the notice. */
  dismissNotice(): void;
  /** Units for a new project: the last ones the user chose (ADR 015, rule 4). */
  unitsForNew(): Project["units"];
}

export type KerfStore = StoreApi<KerfState & KerfActions>;

/** The project on screen: the preview while dragging, otherwise History's current entry. */
export function shownProject(state: KerfState): Project | null {
  return state.previewed ?? (state.history ? currentProject(state.history) : null);
}

/**
 * Makes the store. `storage` keeps the shop and theme; `clock` returns milliseconds and times the
 * solve (default `performance.now`). Starts on the Start step, with the stored project if there is
 * one and the engine accepts it; otherwise with none. A stored project the engine rejects is set
 * aside under `kerf.project.setAside`, never deleted. Every recorded change is written back to
 * storage. Only one start-up notice is shown: a shop problem first, then a project problem, then
 * the warning that this browser keeps nothing.
 */
export function createKerfStore(deps: { storage: AppStorage; clock?: () => number }): KerfStore {
  const clock = deps.clock ?? (() => performance.now());
  const loaded = loadShop(deps.storage);

  const solveFor = (project: Project | null, shop: ShopProfile): Solved | null => {
    if (!project) return null;
    const started = clock();
    const result = solve(project, shop);
    const assembly = assemblyOrder(project, shop);
    return { result, assembly, ms: clock() - started };
  };

  /** The stored project, or why it could not be opened (it is then set aside, never lost). */
  const restore = (): { history: History | null; problem?: string } => {
    const text = deps.storage.read("kerf.project");
    if (text === undefined) return { history: null };
    try {
      return {
        history: startHistory({ label: "Opened your last project", project: parseProject(text) }),
      };
    } catch (error) {
      deps.storage.write("kerf.project.setAside", text);
      deps.storage.remove("kerf.project");
      const reason = error instanceof Error ? error.message : "it was damaged";
      return {
        history: null,
        problem: `Your last project could not be opened (${reason}). It was set aside.`,
      };
    }
  };
  const restored = restore();
  const firstNotice =
    loaded.problem ??
    restored.problem ??
    (deps.storage.available
      ? undefined
      : "This browser won't keep your work between visits. Use Save to keep a copy.");

  /** Keeps the shown History entry in storage and remembers its units. */
  const keep = (history: History | null): void => {
    if (!history) return;
    const project = currentProject(history);
    deps.storage.write("kerf.project", serializeProject(project));
    deps.storage.write("kerf.units", project.units);
  };

  return createStore<KerfState & KerfActions>()((set, get) => {
    /** Sets new state and re-solves what is shown. */
    const show = (patch: Partial<KerfState>): void => {
      const next = { ...get(), ...patch };
      set({ ...patch, solved: solveFor(shownProject(next), next.shop) });
      if (patch.history !== undefined) keep(get().history);
    };

    /** A notice that offers Undo describes one change, so it goes when History moves (ruling R13). */
    const keepPlainNotice = (): Notice | null => {
      const { notice } = get();
      return notice && !notice.undo ? notice : null;
    };

    return {
      history: restored.history,
      previewed: null,
      solved: solveFor(restored.history ? currentProject(restored.history) : null, loaded.shop),
      step: "Start",
      selection: NOTHING,
      shop: loaded.shop,
      notice: firstNotice ? { text: firstNotice, undo: false } : null,
      tool: "select",
      theme: deps.storage.read("kerf.theme") === "light" ? "light" : "dark",

      apply: (edit, notice) => {
        const h = get().history;
        show({
          history: h ? record(h, edit) : startHistory(edit),
          previewed: null,
          notice: notice ? { text: notice, undo: true } : keepPlainNotice(),
        });
      },
      preview: (project) => show({ previewed: project }),
      commit: (label) => {
        const { previewed, history } = get();
        if (!previewed) return;
        const edit = { label, project: previewed };
        show({
          history: history ? record(history, edit) : startHistory(edit),
          previewed: null,
          notice: keepPlainNotice(),
        });
      },
      cancelPreview: () => show({ previewed: null }),
      undo: () => {
        const h = get().history;
        if (h) show({ history: undo(h), previewed: null, notice: keepPlainNotice() });
      },
      redo: () => {
        const h = get().history;
        if (h) show({ history: redo(h), previewed: null, notice: keepPlainNotice() });
      },
      jumpTo: (index) => {
        const h = get().history;
        if (h) show({ history: jumpTo(h, index), previewed: null, notice: keepPlainNotice() });
      },
      setStep: (step) => set({ step }),
      select: (selection) => set({ selection }),
      setShop: (shop) => {
        saveShop(deps.storage, shop);
        show({ shop });
      },
      setTool: (tool) => set({ tool }),
      setTheme: (theme) => {
        deps.storage.write("kerf.theme", theme);
        set({ theme });
      },
      say: (text, undoable = false) => set({ notice: { text, undo: undoable } }),
      dismissNotice: () => set({ notice: null }),
      unitsForNew: () => (deps.storage.read("kerf.units") === "metric" ? "metric" : "imperial"),
    };
  });
}
