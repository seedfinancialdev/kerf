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
  /** True when the library already refused a write at start-up (the old project's move). */
  refusedAtStart: boolean;
}

/** The names of the actions here. */
type LibraryAction =
  | "createProject"
  | "openProject"
  | "addFile"
  | "renameProject"
  | "duplicateProject"
  | "deleteProject"
  | "readKeptProject"
  | "refreshProjects";

/**
 * Said when a project Home listed cannot be had from the library. `Library.read` gives nothing
 * both for a project that is gone (another tab deleted it) and for one that could not be read, so
 * the words fit either.
 */
const NOT_FOUND = "This project could not be found in this browser.";

/** Home's banner when the library could not list the projects (silent-failure review, I3). */
export const PROJECTS_UNREADABLE =
  "Your projects couldn't be read just now. Reload the page; they are still in this browser.";

/** Said when a kept project's text no longer reads as a project. */
const damaged = (done: "opened" | "renamed" | "copied" | "downloaded"): string =>
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
 * moves and as the Workshop is left, and `notKept`, Home's banner as things stand. `keep` writes a
 * changed project to its entry with the view's picture; a project only opened is not written, so
 * Home never says it was edited when it was only looked at. With `pictureNow`, the view's picture
 * is started at once, before the view goes, and written even for an unchanged project (Ruling
 * R17). A picture is never replaced with none. A refused write in the background is said once (the
 * banner's words); one the user asked for (rename, copy) is said every time.
 */
export function libraryActions(ctx: LibraryContext): Pick<KerfActions, LibraryAction> & {
  keep(pictureNow?: boolean): void;
  notKept(): string | null;
} {
  const { library, get, set, now } = ctx;
  // What the last write and the last list found, for Home's banner.
  let writeRefused = ctx.refusedAtStart;
  let listFailed = false;
  const notKept = (): string | null => {
    if (!library.available) return library.notKept;
    if (writeRefused) return LIBRARY_NOT_KEPT;
    return listFailed ? PROJECTS_UNREADABLE : null;
  };
  // The library call last asked for; each new one waits for it, whether it worked or not.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  };
  /** Lists the projects again; a list that fails keeps the last one and says so on Home. */
  const list = async (): Promise<void> => {
    const listed = await library.list();
    listFailed = listed === undefined;
    set(listed ? { projects: listed, projectsNotKept: notKept() } : { projectsNotKept: notKept() });
  };
  /** Writes `entry`; true when it was kept. Home's banner follows the answer. */
  const write = async (entry: LibraryEntry): Promise<boolean> => {
    const kept = await library.write(entry);
    writeRefused = !kept;
    set({ projectsNotKept: notKept() });
    return kept;
  };
  /** Writes `entry` in the background: a refusal is said once, in the banner's words. */
  const writeQuietly = async (entry: LibraryEntry): Promise<void> => {
    if (!(await write(entry))) get().warnOnce(notKept() ?? LIBRARY_NOT_KEPT);
  };
  // The open project's idea, and each project's picture, as last read or written: a change written
  // while its entry cannot be read back still carries them. Pictures are by project, so a write
  // still waiting when another project opens carries its own.
  let openNote = "";
  const pictures = new Map<Id, Uint8Array | null>();
  /** The entry `id`, or undefined having said it cannot be found and listed what is left. */
  const entryFor = async (id: Id): Promise<LibraryEntry | undefined> => {
    const entry = await library.read(id);
    if (entry) return entry;
    get().say(NOT_FOUND);
    await list();
    return undefined;
  };

  const keep = (pictureNow = false): void => {
    // Taken now, so the project written is the one this change made, whenever the write happens.
    const { projectId, history, created, thumbnail } = get();
    if (!projectId || !history) return;
    const project = currentProject(history);
    const text = serializeProject(project);
    const changed = now();
    const note = openNote;
    const started = pictureNow ? pictureInTime(thumbnail) : undefined;
    void inTurn(async () => {
      const before = await library.read(projectId);
      const unchanged = before?.project === text;
      if (unchanged && !started) return;
      const picture = await (started ?? pictureInTime(thumbnail));
      if (unchanged && picture === null) return;
      const kept = picture ?? before?.thumbnail ?? pictures.get(projectId) ?? null;
      pictures.set(projectId, kept);
      await writeQuietly({
        id: projectId,
        name: project.name,
        project: text,
        thumbnail: kept,
        created: before?.created ?? created ?? changed,
        modified: unchanged ? before.modified : changed,
        note: before?.note ?? note,
      });
      await list();
    });
  };

  const putBack = (entry: LibraryEntry): Promise<void> =>
    inTurn(async () => {
      if (!(await write(entry))) {
        get().say(`"${entry.name}" could not be put back in this browser.`);
      }
      await list();
    });

  return {
    keep,
    notKept,
    refreshProjects: () => inTurn(list),

    createProject: async (edit, note) => {
      const projectId = ctx.newProjectId();
      const created = now();
      const { project } = edit;
      // Written before it is shown, so the change `keep` writes next finds the note to carry on.
      void inTurn(() =>
        writeQuietly({
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
      openNote = note;
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
      openNote = entry.note;
      pictures.set(id, entry.thumbnail);
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
      if ((id === null || id === get().projectId) && history) {
        // The open project is renamed as a change, so Undo takes the name back.
        const project = currentProject(history);
        get().apply({
          label: `Name "${project.name}" → "${wanted}"`,
          project: { ...project, name: wanted },
        });
        await inTurn(list);
        return;
      }
      if (id === null) return;
      await inTurn(async () => {
        const entry = await entryFor(id);
        const project = entry && projectIn(entry);
        if (!entry || !project) {
          if (entry) get().say(damaged("renamed"));
          return;
        }
        const text = renamedText(project, wanted);
        if (!(await write({ ...entry, name: wanted, project: text, modified: now() }))) {
          get().say(`"${entry.name}" could not be renamed in this browser.`);
        }
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
        const copied = await write({
          ...entry,
          id: ctx.newProjectId(),
          name,
          project: renamedText(project, name),
          created: time,
          modified: time,
        });
        if (!copied) get().say(`"${entry.name}" could not be copied in this browser.`);
        await list();
      }),

    readKeptProject: (id) =>
      inTurn(async () => {
        const entry = await entryFor(id);
        const project = entry && projectIn(entry);
        if (!entry || !project) {
          if (entry) get().say(damaged("downloaded"));
          return undefined;
        }
        const { created, modified, thumbnail } = entry;
        return { project, created, modified, thumbnail };
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
