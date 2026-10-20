// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What the app's store holds and what can be done to it (design spec, "How it is built", layer 2).
// The store itself is in store.ts; these types are apart so the modules that build the store and
// the screens that read it share them without depending on each other.

import type { AssemblyStep, Id, Project, ShopProfile, SolveResult, Vec3 } from "@kerf/core";
import type { StoreApi } from "zustand/vanilla";
import type { Edit } from "./commands";
import type { History } from "./history";
import type { LastChoice } from "./last-choice";
import type { ProjectSummary } from "./library";
import type { NewProjectChoice } from "./new-project";
import type { Notice } from "./notices";
import type { Pending, Proposal } from "./pending";
import type { Selection } from "./selection";
import type { ShopRecord } from "./shop-record";
import type { Step } from "./steps";

/** The full solve of the shown project, with the assembly order. */
export interface Solved {
  result: SolveResult;
  assembly: AssemblyStep[];
  /** How long the solve took, for the speed budget (Charter question 3). */
  ms: number;
}

/** A tool of the tool row. */
export type ToolId = "select" | "board" | "pushPull" | "move" | "join" | "edge" | "tape";

/** A kept project as a .kerf file holds it: the project, its times (ISO strings) and its picture. */
export interface KeptProject {
  project: Project;
  created: string;
  modified: string;
  thumbnail: Uint8Array | null;
}

/** A tab of the build-plan drawer. */
export type DrawerTab = "Shopping" | "Cut list" | "Sheets" | "Setups" | "Assembly";

/** The app's screens (design spec, "The flow"): Your shop, Home and the Workshop. */
export type Screen = "shop" | "home" | "workshop";

/**
 * Everything the screens read: the screen, the projects kept, History, the shown solve, the pick,
 * the tool and what it has started, and the view.
 */
export interface KerfState {
  /** Your shop at first launch, Home on every launch after (design spec, "The flow"). */
  screen: Screen;
  /** The library entry the open project is kept in; null when none is open or it is not kept. */
  projectId: Id | null;
  /** Every kept project, newest change first, as Home lists them; see `refreshProjects`. */
  projects: ProjectSummary[];
  /** False when this browser has no library to keep projects in (design spec §2). */
  projectsKept: boolean;
  history: History | null;
  previewed: Project | null;
  solved: Solved | null;
  step: Step;
  selection: Selection;
  /** Everything hung on the pegboard (ADR 016, D3). */
  shopRecord: ShopRecord;
  /** The engine's shop, always `shopProfileFor(shopRecord)`. */
  shop: ShopProfile;
  /** True once the tour has been seen or skipped (design spec §4). */
  toured: boolean;
  /** The notice line (notices.ts). */
  notice: Notice | null;
  /** Warnings waiting behind the notice on screen, oldest first (notices.ts). */
  waiting: readonly string[];
  /** The Undo offer an answer covers, shown again when the answer goes (notices.ts). */
  held: Notice | null;
  /**
   * Boards the 3D view failed to draw since History last moved, by instance: they are drawn plain
   * with a badge, and the inspector says so (ADR 015, rule 10).
   */
  notDrawn: readonly Id[];
  tool: ToolId;
  /**
   * What the active tool has started and not finished; cleared when the tool changes or History is
   * stepped through. Only the active tool's own action can be set.
   */
  pending: Pending | null;
  /**
   * The Join tool's suggestion for the two boards clicked; cleared when the tool changes or
   * History moves (an apply, commit, undo, redo or jump).
   */
  proposal: Proposal | null;
  /** The last two points the Tape measured; session only, cleared when a project begins. */
  tape: { from: Vec3; to: Vec3 } | null;
  /** Guide lines kept from the Tape; session only, never saved (ADR 015, D6). */
  guides: ReadonlyArray<readonly [Vec3, Vec3]>;
  drawerTab: DrawerTab;
  /** The stock the Board tool draws in; null means the project's first sheet stock. */
  boardStock: Id | null;
  theme: "dark" | "light";
  /**
   * Units a new project starts in: the user's choice in Settings, never the open project's (ADR
   * 015, rule 4).
   */
  unitsForNew: Project["units"];
  /** The piece and wood New project last created, which it starts from next time (design spec §3). */
  lastChoice: Partial<LastChoice>;
  /** Open state by section title; a title not listed has its own default. */
  sections: Record<string, boolean>;
  /** Sections opened for now, over `sections`, and never saved (the tour's, Ruling R31). */
  sectionsShown: readonly string[];
  /** When the shown project was first started (meta.json "created"), as an ISO string. */
  created: string | null;
  /**
   * Draws the model as a PNG for the file's thumbnail, rejecting when it cannot; set by the
   * viewport, absent without one.
   */
  thumbnail: (() => Promise<Uint8Array>) | null;
  /**
   * The board under the pointer, for the grain line (Interaction spec: "visible grain direction on
   * hover").
   */
  hovered: Id | null;
  /** Left-drag navigation after O (orbit) or H (pan), as SketchUp; null means picking. */
  navigation: "orbit" | "pan" | null;
  /** Bumped by Shift+Z; the view fits the model whenever it changes. */
  fitRequest: number;
}

/** Every way the screens and tools change the state; each is one undoable step or a view change. */
export interface KerfActions {
  /**
   * Records `edit` as one named change and solves it; an edit that leaves the project as it was is
   * ignored. A `notice` is shown with Undo; without one an Undo notice is cleared and any other
   * notice stays.
   */
  apply(edit: Edit, notice?: string): void;
  /**
   * Moves to `screen`. The Workshop with no project open goes Home instead. Leaving the Workshop
   * keeps the open project (it is in the library) and drops the pick, a drag's preview and
   * whatever the active tool had started.
   */
  setScreen(screen: Screen): void;
  /**
   * Starts `edit`'s project as a new kept project with the idea `note`, and opens it in the
   * Workshop on Shape with its form picked. Resolves once the library has answered; a library
   * that refuses it is said once (`LIBRARY_NOT_KEPT`), and the project still opens.
   */
  createProject(edit: Edit, note: string): Promise<void>;
  /**
   * Opens the kept project `id` in the Workshop on Shape, with a History of its own. Resolves
   * false, having said why on the notice line, when it is gone or damaged.
   */
  openProject(id: Id): Promise<boolean>;
  /**
   * Adds the .kerf file `bytes` (named `fileName`) as a new project and opens it; it never
   * replaces one. A file that cannot be opened is said in plain words and nothing is added.
   */
  addFile(bytes: Uint8Array, fileName: string): Promise<void>;
  /**
   * Renames the kept project `id`, in its entry and inside the project. A blank name is refused
   * on the notice line; so is a project that is gone or damaged.
   */
  renameProject(id: Id, name: string): Promise<void>;
  /** Keeps a copy of project `id` named "<name> copy", changed now so it lists first. */
  duplicateProject(id: Id): Promise<void>;
  /**
   * Deletes the kept project `id`, closing it if it is open, and offers Undo on the notice line
   * to put it back. A library that will not delete it is said, and the project stays.
   */
  deleteProject(id: Id): Promise<void>;
  /**
   * The kept project `id` as the library has it, for a download. Resolves undefined, having said
   * why on the notice line, when it is gone or damaged.
   */
  readKeptProject(id: Id): Promise<KeptProject | undefined>;
  /** Reads the kept projects again for Home. */
  refreshProjects(): Promise<void>;
  /** Sets how the model is drawn for a file's thumbnail; null when no view can draw it. */
  setThumbnailSource(source: (() => Promise<Uint8Array>) | null): void;
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
  /**
   * Steps back one change, dropping any preview and the active tool's action. At the first entry
   * History stays put and nothing changes.
   */
  undo(): void;
  /**
   * Steps forward one change, dropping any preview and the active tool's action. At the last entry
   * History stays put and nothing changes.
   */
  redo(): void;
  /**
   * Shows History entry `index`, dropping any preview and the active tool's action. Throws
   * RangeError for an index outside the list.
   */
  jumpTo(index: number): void;
  /** Moves to a workflow step. */
  setStep(step: Step): void;
  /** Sets what is picked. */
  select(selection: Selection): void;
  /**
   * Uses and saves the pegboard, and solves again with the shop it gives; says once when the
   * browser cannot keep it.
   */
  setShopRecord(record: ShopRecord): void;
  /** Notes that the tour was seen or skipped, for this visit and later ones. */
  finishTour(): void;
  /**
   * Shows the tour again from its first tip (Learn, design spec §4). Nothing is written: a browser
   * closed mid-tour still counts it seen, and finishing it notes so again.
   */
  startTour(): void;
  /** Picks the active tool, dropping the last one's action and any preview it drew. */
  setTool(tool: ToolId): void;
  /** Sets or clears the active tool's half-finished action; another tool's action is dropped. */
  setPending(pending: Pending | null): void;
  /**
   * Drops whatever the active tool had started, its Join proposal and any preview, after a fault
   * in Kerf stopped the action half way, so nothing half done stays on screen.
   */
  abandonAction(): void;
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
  /**
   * Opens or closes the section `title` (open when never stored unless `defaultOpen` is false, or
   * shown for now) and remembers it.
   */
  toggleSection(title: string, defaultOpen?: boolean): void;
  /**
   * Opens the section `title` for now without remembering it: a tour must not change a choice the
   * woodworker saved (Task 13 review).
   */
  showSection(title: string): void;
  /**
   * Shows an answer to the user's last action at once, over any warning (which shows again after).
   * `undo` says whether it offers Undo; without it the notice stays until dismissed.
   */
  say(text: string, undo?: boolean): void;
  /** Adds a warning the user must not miss: shown in turn, never replaced, kept until dismissed. */
  warn(text: string): void;
  /** As `warn`, but only the first time this session: a fault that recurs is not said again. */
  warnOnce(text: string): void;
  /** Notes that the 3D view failed to draw board `instance`; forgotten when History moves. */
  boardNotDrawn(instance: Id): void;
  /** Clears the notice and shows the next waiting warning. */
  dismissNotice(): void;
  /**
   * Remembers the units new projects start in; an open project is not touched. When the browser
   * cannot keep the choice, says so once.
   */
  setUnitsForNew(units: Project["units"]): void;
  /**
   * Remembers `choice` as New project's last (its piece and wood, for this visit and later ones),
   * and its units as the units for new projects, as `setUnitsForNew` does.
   */
  rememberChoice(choice: Pick<NewProjectChoice, "piece" | "units" | "wood">): void;
}

/** The app's store: its state with its actions. */
export type KerfStore = StoreApi<KerfState & KerfActions>;
