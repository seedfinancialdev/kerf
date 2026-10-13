// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// How screens reach the app's store (design spec, "How it is built", layer 3).

import { createContext, type ReactNode, useContext } from "react";
import { useStore } from "zustand";
import type { KerfActions, KerfState, KerfStore } from "../model/store";

const StoreContext = createContext<KerfStore | null>(null);

/** Makes `store` available to every screen drawn inside it. */
export function KerfProvider({ store, children }: { store: KerfStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The store itself, for event handlers that read the latest state. Throws outside <KerfProvider>. */
export function useKerfStore(): KerfStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("A Kerf screen was drawn outside <KerfProvider>.");
  return store;
}

/**
 * Reads from the store and redraws when the value changes. The selector must return something the
 * store already holds (or a primitive), never a new object, or the screen would redraw forever.
 */
export function useKerf<T>(selector: (s: KerfState & KerfActions) => T): T {
  return useStore(useKerfStore(), selector);
}
