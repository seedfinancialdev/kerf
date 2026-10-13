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
  type ShopProfile,
  type SolveResult,
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
  /** Records a change; `notice` is shown with Undo (for example after a board is taken over). */
  apply(edit: Edit, notice?: string): void;
  /** Shows a project without recording it (while dragging). */
  preview(project: Project): void;
  /** Records the previewed project as one change. */
  commit(label: string): void;
  cancelPreview(): void;
  undo(): void;
  redo(): void;
  jumpTo(index: number): void;
  setStep(step: Step): void;
  select(selection: Selection): void;
  setShop(shop: ShopProfile): void;
  setTool(tool: ToolId): void;
  setTheme(theme: "dark" | "light"): void;
  say(text: string, undo?: boolean): void;
  dismissNotice(): void;
}

export type KerfStore = StoreApi<KerfState & KerfActions>;

/** The project on screen: the preview while dragging, otherwise History's current entry. */
export function shownProject(state: KerfState): Project | null {
  return state.previewed ?? (state.history ? currentProject(state.history) : null);
}

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

  return createStore<KerfState & KerfActions>()((set, get) => {
    /** Sets new state and re-solves what is shown. */
    const show = (patch: Partial<KerfState>): void => {
      const next = { ...get(), ...patch };
      set({ ...patch, solved: solveFor(shownProject(next), next.shop) });
    };

    return {
      history: null,
      previewed: null,
      solved: null,
      step: "Start",
      selection: NOTHING,
      shop: loaded.shop,
      notice: loaded.problem ? { text: loaded.problem, undo: false } : null,
      tool: "select",
      theme: deps.storage.read("kerf.theme") === "light" ? "light" : "dark",

      apply: (edit, notice) => {
        const h = get().history;
        show({
          history: h ? record(h, edit) : startHistory(edit),
          previewed: null,
          notice: notice ? { text: notice, undo: true } : get().notice,
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
        if (h) show({ history: undo(h), previewed: null, notice: null });
      },
      redo: () => {
        const h = get().history;
        if (h) show({ history: redo(h), previewed: null });
      },
      jumpTo: (index) => {
        const h = get().history;
        if (h) show({ history: jumpTo(h, index), previewed: null });
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
    };
  });
}
