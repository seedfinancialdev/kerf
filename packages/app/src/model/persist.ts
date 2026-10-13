// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the app keeps in the browser for the open project and the screens (ADR 015, rule 11 and
// D4), and the plain words used when it cannot. The shop has its own module (shop.ts).

import { type Project, parseProject, serializeProject } from "@kerf/core";
import { type History, startHistory } from "./history";
import type { AppStorage } from "./storage";

/** Shown once when a change could not be written to browser storage (ADR 015, rule 11). */
export const NOT_KEPT =
  "Your latest changes couldn't be kept in this browser. Use Save to keep a copy.";

/** Shown once when the choice of units for new projects could not be written (ADR 015, rule 11). */
export const UNITS_NOT_KEPT =
  "Your choice of units couldn't be kept in this browser; it applies until you close the page.";

/** The start-up warning when this browser keeps nothing at all, or undefined when it keeps work. */
export function storageNotice(storage: AppStorage): string | undefined {
  return storage.available
    ? undefined
    : "This browser won't keep your work between visits. Use Save to keep a copy.";
}

/**
 * The stored project as the first History entry, or why it could not be opened. A stored project
 * the engine rejects is set aside under `kerf.project.setAside`, never deleted; if even that write
 * fails it is left where it was.
 */
export function restoreProject(storage: AppStorage): { history: History | null; problem?: string } {
  const text = storage.read("kerf.project");
  if (text === undefined) return { history: null };
  try {
    return {
      history: startHistory({ label: "Opened your last project", project: parseProject(text) }),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "it was damaged";
    // The stored text may be the only copy, so it is removed only once the set-aside copy exists.
    if (!storage.write("kerf.project.setAside", text)) {
      return {
        history: null,
        problem: `Your last project could not be opened (${reason}). It was left as it was.`,
      };
    }
    storage.remove("kerf.project");
    return {
      history: null,
      problem: `Your last project could not be opened (${reason}). It was set aside.`,
    };
  }
}

/** Keeps `project` as the one to reopen; false when the browser would not take it. */
export function writeProject(storage: AppStorage, project: Project): boolean {
  return storage.write("kerf.project", serializeProject(project));
}

/**
 * Which sections the user closed or opened (Interaction spec: "Sections remember their open state").
 * A damaged value only loses which sections were open, so it reads as "none stored" without a
 * notice: nothing the user made is lost.
 */
export function readSections(storage: AppStorage): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(storage.read("kerf.sections") ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === "boolean"),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}
