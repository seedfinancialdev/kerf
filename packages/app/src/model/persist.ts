// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Reading the one project older Kerf kept in the browser, for its move into the library
// (library-migration.ts), and the sections' open state (ADR 015, rule 11 and D4), with the plain
// words used when browser storage cannot keep things. The store keeps the theme, units and tour
// itself (ADR 015, known limits); the shop has its own module (shop.ts), the projects theirs
// (library.ts).

import { ProjectFormatError, parseProject } from "@kerf/core";
import { DAMAGED_CONTENTS, isFromNewerKerf } from "./files";
import { type History, startHistory } from "./history";
import type { AppStorage, StorageKey } from "./storage";

/** Shown once when the choice of units for new projects could not be written (ADR 015, rule 11). */
export const UNITS_NOT_KEPT =
  "Your choice of units couldn't be kept in this browser; it applies until you close the page.";

/** The start-up warning when this browser keeps nothing at all, or undefined when it keeps work. */
export function storageNotice(storage: AppStorage): string | undefined {
  return storage.available
    ? undefined
    : "This browser won't keep your work between visits. Download a .kerf file from the project menu to keep a copy.";
}

/**
 * Said when Kerf itself fails opening the stored project: the fault is logged for a bug report and
 * never blamed on the project.
 */
const OPEN_STORED_FAULT = "Kerf hit a problem opening your last project; please report it.";

/**
 * Said when the browser would not let the stored project be read: it is left as it was, and the
 * storage does not write over it (`AppStorage.couldNotRead`).
 */
const PROJECT_UNREADABLE =
  "Your last project could not be read from this browser, so Kerf started without it. It is " +
  "left as it was; download a .kerf file from the project menu to keep new work.";

/**
 * The stored project as the first History entry, or why it could not be opened. A stored project
 * that cannot be opened is set aside (`setAsideStoredProject`), whether the engine rejects it or
 * Kerf itself fails on it, so a fault never stops the app starting; a fault is logged for a bug
 * report. A stored project the browser would not let be read is left as it was, and said. Never
 * throws.
 */
export function restoreProject(storage: AppStorage): { history: History | null; problem?: string } {
  const text = storage.read("kerf.project");
  if (text === undefined) {
    return storage.couldNotRead("kerf.project")
      ? { history: null, problem: PROJECT_UNREADABLE }
      : { history: null };
  }
  try {
    return {
      history: startHistory({ label: "Opened your last project", project: parseProject(text) }),
    };
  } catch (error) {
    return setAsideStoredProject(storage, whyNotOpened(error));
  }
}

/** Why the stored project could not be opened, in shop words; a fault in Kerf is logged. */
function whyNotOpened(error: unknown): string {
  if (isFromNewerKerf(error)) {
    return "Your last project was made by a newer version of Kerf; update Kerf to open it.";
  }
  if (error instanceof ProjectFormatError) {
    return `Your last project could not be opened: ${DAMAGED_CONTENTS}.`;
  }
  console.error(error);
  return OPEN_STORED_FAULT;
}

/**
 * Sets the stored project aside under the first free key of `kerf.project.setAside`,
 * `kerf.project.setAside.2`, … so an earlier copy is never overwritten, and says so after `told`.
 * The stored text may be the only copy, so it is removed only once the set-aside copy exists; if
 * that write fails it is left where it was. Never throws.
 */
function setAsideStoredProject(
  storage: AppStorage,
  told: string,
): { history: null; problem: string } {
  const text = storage.read("kerf.project");
  if (text === undefined || !storage.write(freeSetAsideKey(storage), text)) {
    return { history: null, problem: `${told} It was left where it was.` };
  }
  storage.remove("kerf.project");
  return { history: null, problem: `${told} It was set aside in this browser.` };
}

/** The first set-aside key that holds nothing yet. */
function freeSetAsideKey(storage: AppStorage): StorageKey {
  const key = (n: number): StorageKey =>
    n === 1 ? "kerf.project.setAside" : `kerf.project.setAside.${n}`;
  let n = 1;
  while (storage.read(key(n)) !== undefined) n += 1;
  return key(n);
}

/**
 * Which sections the user closed or opened (Interaction spec: "Sections remember their open
 * state"). A damaged value only loses which sections were open, so it reads as "none stored"
 * without a notice: nothing the user made is lost.
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
