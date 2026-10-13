// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Reading and writing the open project and the sections' open state in the browser (ADR 015,
// rule 11 and D4), and the plain words used when it cannot. The store decides when each write
// happens and when a notice shows, and keeps the theme, units and start date itself (ADR 015,
// known limits); the shop has its own module (shop.ts).

import { type Project, ProjectFormatError, parseProject, serializeProject } from "@kerf/core";
import { DAMAGED_CONTENTS } from "./files";
import { type History, startHistory } from "./history";
import type { AppStorage, StorageKey } from "./storage";

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
 * the engine rejects is set aside under the first free key of `kerf.project.setAside`,
 * `kerf.project.setAside.2`, … so an earlier copy is never overwritten, and it is never deleted;
 * if even that write fails it is left where it was. Throws anything but the engine's
 * ProjectFormatError, which would be a fault in Kerf rather than in the stored project.
 */
export function restoreProject(storage: AppStorage): { history: History | null; problem?: string } {
  const text = storage.read("kerf.project");
  if (text === undefined) return { history: null };
  try {
    return {
      history: startHistory({ label: "Opened your last project", project: parseProject(text) }),
    };
  } catch (error) {
    if (!(error instanceof ProjectFormatError)) throw error;
    const told = `Your last project could not be opened: ${DAMAGED_CONTENTS}.`;
    // The stored text may be the only copy, so it is removed only once the set-aside copy exists.
    if (!storage.write(freeSetAsideKey(storage), text)) {
      return { history: null, problem: `${told} It was left where it was.` };
    }
    storage.remove("kerf.project");
    return { history: null, problem: `${told} It was set aside in this browser.` };
  }
}

/** The first set-aside key that holds nothing yet. */
function freeSetAsideKey(storage: AppStorage): StorageKey {
  const key = (n: number): StorageKey =>
    n === 1 ? "kerf.project.setAside" : `kerf.project.setAside.${n}`;
  let n = 1;
  while (storage.read(key(n)) !== undefined) n += 1;
  return key(n);
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
