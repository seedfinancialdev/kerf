// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The store's actions on the project library (design spec §2, "Keeping projects"; ADR 016, D5):
// the open project written back after every change, and Home's create, open, rename, duplicate
// and delete. Library calls run one at a time, in the order asked, so a later write never lands
// before an earlier one and a read sees every write asked for before it.

import {
  type Id,
  type Project,
  ProjectFormatError,
  parseProject,
  serializeProject,
} from "@kerf/core";
import type { Edit } from "./commands";
import { openKerfBytes } from "./files";
import { currentProject } from "./history";
import { LIBRARY_NOT_KEPT, type Library, type LibraryEntry } from "./library";
import { pictureInTime } from "./picture";
import { NOTHING } from "./selection";
import type { KerfActions, KerfState } from "./store-types";

/** What the library's actions need from the store (store.ts). */
export interface LibraryContext {
  library: Library;
  get: () => KerfState & KerfActions;
  set: (patch: Partial<KerfState>) => void;
  /** The time now, as an ISO string. */
  now: () => string;
  /** A new id for a kept project. */
  newProjectId: () => Id;
  /** Shows `edit`'s project afresh, with a History of its own, and `patch` with it. */
  openAfresh: (edit: Edit, patch: Partial<KerfState>) => void;
  /** Closes the open project: nothing is shown, and the Workshop gives way to Home. */
  closeProject: () => void;
  /** Shows `text` on the notice line with an Undo that runs `undo`. */
  offerUndo: (text: string, undo: () => Promise<void>) => void;
}

/** The names of the actions here. */
type LibraryAction =
  | "createProject"
  | "openProject"
  | "addFile"
  | "renameProject"
  | "duplicateProject"
  | "deleteProject"
  | "refreshProjects";

/** Said when a project Home listed is no longer in the library (another tab deleted it). */
const GONE = "This project is no longer in this browser.";

/** Said when a kept project's text no longer reads as a project. */
const damaged = (done: "opened" | "renamed" | "copied"): string =>
  `This project could not be ${done}: it is damaged.`;

/**
 * The project kept in `entry`, or undefined when its text is damaged. Anything but the engine's
 * refusal is a fault in Kerf, not in the project, so it is thrown.
 */
function projectIn(entry: LibraryEntry): Project | undefined {
  try {
    return parseProject(entry.project);
  } catch (error) {
    if (error instanceof ProjectFormatError) return undefined;
    throw error;
  }
}

/** `project` renamed `name`, as the library keeps it. */
const renamedText = (project: Project, name: string): string =>
  serializeProject({ ...project, name });

/**
 * Builds the library's actions over `ctx`, with `keep`, which the store calls whenever History
 * moves. `keep` writes the open project to its entry with the view's picture; an entry whose
 * project is unchanged (it was only opened) keeps its time, so Home never says a project was
 * edited when it was only looked at. A refused write is said once (`LIBRARY_NOT_KEPT`).
 */
export function libraryActions(
  ctx: LibraryContext,
): Pick<KerfActions, LibraryAction> & { keep(): void } {
  const { library, get, set, now } = ctx;
  // The library call last asked for; each new one waits for it, whether it worked or not.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  };
  const list = async (): Promise<void> => set({ projects: await library.list() });
  const write = async (entry: LibraryEntry): Promise<void> => {
    if (!(await library.write(entry))) get().warnOnce(LIBRARY_NOT_KEPT);
  };
  /** The entry `id`, or undefined having said that it is gone and listed what is left. */
  const entryFor = async (id: Id): Promise<LibraryEntry | undefined> => {
    const entry = await library.read(id);
    if (entry) return entry;
    get().say(GONE);
    await list();
    return undefined;
  };

  const keep = (): void => {
    // Taken now, so the project written is the one this change made, whenever the write happens.
    const { projectId, history, created, thumbnail } = get();
    if (!projectId || !history) return;
    const project = currentProject(history);
    const text = serializeProject(project);
    const changed = now();
    void inTurn(async () => {
      const before = await library.read(projectId);
      const unchanged = before?.project === text;
      if (unchanged && before.thumbnail) return;
      await write({
        id: projectId,
        name: project.name,
        project: text,
        thumbnail: await pictureInTime(thumbnail),
        created: before?.created ?? created ?? changed,
        modified: unchanged ? before.modified : changed,
        note: before?.note ?? "",
      });
      await list();
    });
  };

  const putBack = (entry: LibraryEntry): Promise<void> =>
    inTurn(async () => {
      if (!(await library.write(entry))) {
        get().say(`"${entry.name}" could not be put back in this browser.`);
      }
      await list();
    });

  return {
    keep,
    refreshProjects: () => inTurn(list),

    createProject: async (edit, note) => {
      const projectId = ctx.newProjectId();
      const created = now();
      const { project } = edit;
      // Written before it is shown, so the change `keep` writes next finds the note to carry on.
      void inTurn(() =>
        write({
          id: projectId,
          name: project.name,
          project: serializeProject(project),
          thumbnail: null,
          created,
          modified: created,
          note,
        }),
      );
      const form = project.structures[0];
      ctx.openAfresh(edit, {
        projectId,
        created,
        selection: form ? { kind: "structure", structure: form.id } : NOTHING,
      });
      await inTurn(list);
    },

    openProject: async (id) => {
      if (id === get().projectId && get().history) {
        get().setScreen("workshop");
        return true;
      }
      const entry = await inTurn(() => entryFor(id));
      const project = entry && projectIn(entry);
      if (!entry || !project) {
        if (entry) get().say(damaged("opened"));
        return false;
      }
      ctx.openAfresh(
        { label: `Opened ${entry.name}`, project },
        { projectId: id, created: entry.created, selection: NOTHING },
      );
      return true;
    },

    addFile: async (bytes, fileName) => {
      const opened = openKerfBytes(bytes);
      if (!opened.ok) {
        get().say(opened.message);
        return;
      }
      await get().createProject({ label: `Opened ${fileName}`, project: opened.project }, "");
    },

    renameProject: async (id, name) => {
      const wanted = name.trim();
      if (wanted === "") {
        get().say("Give the project a name.");
        return;
      }
      const { history } = get();
      if (id === get().projectId && history) {
        // The open project is renamed as a change, so Undo takes the name back.
        const project = currentProject(history);
        get().apply({
          label: `Name "${project.name}" → "${wanted}"`,
          project: { ...project, name: wanted },
        });
        await inTurn(list);
        return;
      }
      await inTurn(async () => {
        const entry = await entryFor(id);
        const project = entry && projectIn(entry);
        if (!entry || !project) {
          if (entry) get().say(damaged("renamed"));
          return;
        }
        const text = renamedText(project, wanted);
        await write({ ...entry, name: wanted, project: text, modified: now() });
        await list();
      });
    },

    duplicateProject: (id) =>
      inTurn(async () => {
        const entry = await entryFor(id);
        const project = entry && projectIn(entry);
        if (!entry || !project) {
          if (entry) get().say(damaged("copied"));
          return;
        }
        const name = `${entry.name} copy`;
        const time = now();
        await write({
          ...entry,
          id: ctx.newProjectId(),
          name,
          project: renamedText(project, name),
          created: time,
          modified: time,
        });
        await list();
      }),

    deleteProject: (id) =>
      inTurn(async () => {
        const entry = await entryFor(id);
        if (!entry) return;
        if (!(await library.remove(id))) {
          get().say(`"${entry.name}" could not be deleted from this browser.`);
          return;
        }
        if (id === get().projectId) ctx.closeProject();
        await list();
        ctx.offerUndo(`Deleted "${entry.name}".`, () => putBack(entry));
      }),
  };
}
