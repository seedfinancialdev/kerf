// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// New project (design spec §3; the look is 2026-10-14-first-run-and-home/3-new-project.png): a large
// panel over Home with the gallery on the left (PieceGallery) and the chosen piece's settings on the
// right (PieceSettings). It holds the choice; newProject (model/new-project.ts) decides on every
// change whether Create is on and what the preview shows. It is a modal dialog: the keyboard starts
// on the chosen piece and stays inside, Escape closes it, and Create or Enter starts at once.

import { type Id, type Project, type SolveResult, type Stock, solve } from "@kerf/core";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defaultChoice,
  type NewProjectChoice,
  type NewProjectResult,
  newProject,
  type PieceId,
  woodOffered,
} from "../../model/new-project";
import { addWood, recordOf, wallFrom } from "../../model/pegboard";
import type { ShopRecord } from "../../model/shop-record";
import { retype } from "../../model/size";
import type { KerfState } from "../../model/store-types";
import { useKerf, useKerfStore } from "../../state/useKerf";
import { Notice } from "../Notice";
import { type GalleryTab, PieceGallery, tabOf } from "./PieceGallery";
import { PieceSettings } from "./PieceSettings";

/** What the keyboard can reach in the panel, in the order Tab visits it. */
const REACHABLE =
  'button:not(:disabled), input:not(:disabled):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

/** `choice` with `wood` chosen, when the shop offers it in the choice's units; else as it was. */
function withWood(
  choice: NewProjectChoice,
  wood: Id | undefined,
  record: ShopRecord,
): NewProjectChoice {
  const offered = woodOffered(choice.units, record).some((s) => s.id === wood);
  return wood !== undefined && offered ? { ...choice, wood } : choice;
}

/** `choice` moved to piece `next`, at its usual size; the units, the wood and how it is sized stay. */
function withPiece(choice: NewProjectChoice, next: PieceId, record: ShopRecord): NewProjectChoice {
  const { sizeMode, note } = choice;
  return withWood(
    { ...defaultChoice(next, choice.units, record), sizeMode, note },
    choice.wood,
    record,
  );
}

/**
 * `choice` in `units`: each size it can read typed again in them (30" becomes 762mm), the piece's
 * usual one for any it cannot; its options, and its wood if offered, stay.
 */
function inUnits(
  choice: NewProjectChoice,
  units: Project["units"],
  record: ShopRecord,
): NewProjectChoice {
  const usual = defaultChoice(choice.piece, units, record);
  const kept = (key: "w" | "h" | "d" | "gap"): string =>
    retype(choice[key], choice.units, units) ?? usual[key];
  const moved = {
    ...choice,
    units,
    w: kept("w"),
    h: kept("h"),
    d: kept("d"),
    gap: kept("gap"),
  };
  return withWood({ ...moved, wood: usual.wood }, choice.wood, record);
}

/**
 * Where the panel starts: `piece` when one was pressed, else the last piece created (a bookcase the
 * first time), in the units for new projects, with the last wood when the shop still has it.
 */
function startingChoice(piece: PieceId | undefined, state: KerfState): NewProjectChoice {
  const { lastChoice, unitsForNew, shopRecord } = state;
  const choice = defaultChoice(piece ?? lastChoice.piece ?? "bookcase", unitsForNew, shopRecord);
  return withWood(choice, lastChoice.wood, shopRecord);
}

/** Moves Tab from the last thing in `panel` to the first, and Shift+Tab from the first to the last. */
function keepTabInside(panel: HTMLElement, e: KeyboardEvent): void {
  const reachable = [...panel.querySelectorAll<HTMLElement>(REACHABLE)];
  const first = reachable[0];
  const last = reachable.at(-1);
  if (!first || !last) return;
  const at = document.activeElement;
  if (e.shiftKey && (at === first || !panel.contains(at))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The keyboard starts on the chosen piece's tile when the panel opens, and goes back to whatever
 * opened the panel when it closes (when that is still on screen).
 */
function useFocusWhileOpen(panel: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement;
    const chosen = panel.current?.querySelector<HTMLElement>('.piece-tile[aria-pressed="true"]');
    (chosen ?? panel.current)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [panel]);
}

/**
 * Escape closes the panel wherever the keyboard is while it is open, on the page as well as in the
 * panel. A form inside it that Escape shuts first (the wood form) stops the key there.
 */
function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    const listen = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, [onClose]);
}

/**
 * The last piece that could be built, solved for the preview: the panel keeps drawing it while a
 * size is being typed and cannot be read yet. Null for a piece with no form.
 */
function usePreviewed(made: NewProjectResult): { project: Project; result: SolveResult } | null {
  const shop = useKerf((s) => s.shop);
  const solved = useMemo(
    () =>
      made.ok && made.edit.project.structures.length > 0
        ? { project: made.edit.project, result: solve(made.edit.project, shop) }
        : null,
    [made, shop],
  );
  const [lastGood, setLastGood] = useState(solved);
  if (solved !== null && solved !== lastGood) setLastGood(solved);
  return solved ?? (made.ok ? null : lastGood);
}

/**
 * The New project panel, opened on `piece` (or where it was left last time). `onClose` is called
 * for Cancel, the close button and Escape; Create opens the new project in the Workshop.
 */
export function NewProject({ piece, onClose }: { piece?: PieceId; onClose: () => void }) {
  const store = useKerfStore();
  const record = useKerf((s) => s.shopRecord);
  const [choice, setChoice] = useState(() => startingChoice(piece, store.getState()));
  const [tab, setTab] = useState<GalleryTab>(() => tabOf(choice.piece));
  const [later, setLater] = useState<string | null>(null);
  const made = useMemo(() => newProject(choice, record), [choice, record]);
  const shown = usePreviewed(made);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useId();
  useFocusWhileOpen(panel);

  const update = (patch: Partial<NewProjectChoice>): void => setChoice((c) => ({ ...c, ...patch }));
  const pick = (next: PieceId): void => {
    setLater(null);
    setChoice((c) => withPiece(c, next, record));
  };
  const setUnits = (units: Project["units"]): void => setChoice((c) => inUnits(c, units, record));
  const sayLater = (laterPiece: PieceId): void => {
    const refused = newProject({ ...choice, piece: laterPiece }, record);
    setLater(refused.ok ? null : refused.message);
  };
  const addShopWood = (stock: Stock): void => {
    const next = recordOf(addWood(wallFrom(record), stock), record.setUp);
    store.getState().setShopRecord(next);
    setChoice((c) => withWood(c, stock.id, next));
  };
  const create = (): void => {
    if (!made.ok) return;
    store.getState().rememberChoice(choice);
    void store.getState().createProject(made.edit, made.note);
  };
  useEscapeToClose(onClose);
  const keys = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Tab" && panel.current) keepTabInside(panel.current, e);
  };

  return (
    <div className="new-project-scrim">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        tabIndex={-1}
        className="new-project"
        onKeyDown={keys}
      >
        <div className="new-project-gallery">
          <h2 id={heading}>New project</h2>
          <p className="new-project-lede">
            Pick a piece to start from. Everything can change once it's on screen.
          </p>
          {/* The notice line, here while Home's is behind the panel: a file refused, wood not kept. */}
          <Notice />
          <PieceGallery
            tab={tab}
            setTab={setTab}
            chosen={choice.piece}
            onPick={pick}
            onLater={sayLater}
            later={later}
          />
        </div>
        <PieceSettings
          choice={choice}
          made={made}
          shown={shown}
          offered={woodOffered(choice.units, record)}
          update={update}
          setUnits={setUnits}
          onAddWood={addShopWood}
          onCreate={create}
          onCancel={onClose}
        />
        <button
          type="button"
          className="quiet new-project-close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
