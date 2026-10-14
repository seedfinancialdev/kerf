// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The store's actions that only set what the screens show or what a tool has started: the pick,
// the step, a tool's pending action, the Tape's reading, the drawer tab and the view. None of them
// touches History, the solve or storage, so none needs the store's other machinery.

import { NOTHING } from "./selection";
import type { KerfActions, KerfState } from "./store-types";

/** The names of the actions here. */
type ViewAction =
  | "setThumbnailSource"
  | "hover"
  | "setNavigation"
  | "requestFit"
  | "setStep"
  | "select"
  | "setProposal"
  | "setTape"
  | "addGuide"
  | "clearGuides"
  | "setPending"
  | "setBoardStock"
  | "setDrawerTab";

/** Builds the actions that set view state, over the store's own `set` and `get`. */
export function viewActions(
  set: (patch: Partial<KerfState>) => void,
  get: () => KerfState,
): Pick<KerfActions, ViewAction> {
  return {
    setThumbnailSource: (thumbnail) => set({ thumbnail }),
    hover: (hovered) => set({ hovered }),
    setNavigation: (navigation) => set({ navigation }),
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
    setStep: (step) => {
      // Each step shows its own panel, so a board picked on one step does not cover the next.
      const { selection } = get();
      set({ step, selection: selection.kind === "boards" ? NOTHING : selection });
    },
    select: (selection) => set({ selection }),
    setProposal: (proposal) => set({ proposal }),
    setTape: (tape) => set({ tape }),
    addGuide: (from, to) => set({ guides: [...get().guides, [from, to]] }),
    clearGuides: () => set({ guides: [] }),
    // A half-finished action belongs to the tool that began it: one set after the user has
    // moved on (from a callback that finished late) is dropped, not kept for a tool that is gone.
    setPending: (pending) => {
      if (pending === null || pending.tool === get().tool) set({ pending });
    },
    setBoardStock: (boardStock) => set({ boardStock }),
    setDrawerTab: (drawerTab) => set({ drawerTab }),
  };
}
