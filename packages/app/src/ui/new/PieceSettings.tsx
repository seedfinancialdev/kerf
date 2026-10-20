// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// New project's right side (design spec §3, "The settings panel"): the live preview, the piece's
// name, Inches or Millimetres, Outside size or Space to fill with the gap, the sizes, shelves or a
// back, the wood from the shop, and Cancel / Create. Every refusal is said in plain words where it
// belongs, and Create stays off until the piece can be built.

import { formatLength, type Project, type SolveResult, type Stock } from "@kerf/core";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { sizeLabel, sizeOrder } from "../../model/labels";
import {
  formOf,
  type NewProjectChoice,
  type NewProjectResult,
  pieceFor,
} from "../../model/new-project";
import { Preview } from "../../viewport/Preview";
import { Drawing } from "../art/drawings";
import { WoodForm } from "../shop/AddWood";

/** The fewest and most shelves New project offers a bookcase (design spec §3). */
const SHELF_COUNTS = [2, 3, 4, 5, 6] as const;

/**
 * A choice of one among a few, as Kerf's segmented control; `label` names it (shown, or read out).
 */
function Choices<T extends string | number | boolean>({
  label,
  labelShown = true,
  options,
  value,
  onChange,
  after,
}: {
  label: string;
  labelShown?: boolean;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  after?: ReactNode;
}) {
  return (
    <fieldset className="settings-choice">
      <legend className={labelShown ? "settings-label" : "visually-hidden"}>{label}</legend>
      <div className="seg">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
        {after}
      </div>
    </fieldset>
  );
}

/** A size typed as text; `problem` is the id of what is said about it, when something is. */
function SizeInput({
  label,
  value,
  problem,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  problem: string | undefined;
  onChange: (text: string) => void;
  onEnter: () => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={problem !== undefined || undefined}
        aria-describedby={problem}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={enterTo(onEnter)}
      />
    </div>
  );
}

/** A key handler that runs `create` on Enter: the panel's "Create or Enter starts at once". */
const enterTo =
  (create: () => void) =>
  (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    create();
  };

/** A refusal said under the fields it is about, read out with them. */
function Problem({ id, text }: { id: string; text: string | null }) {
  return text === null ? null : (
    <p id={id} className="field-problem">
      {text}
    </p>
  );
}

/** What a refusal is about, if it is about one of the settings shown. */
type Refusal = Extract<NewProjectResult, { ok: false }>;

/** `30-1/4" × 79-7/8" × 12"`: the outside size worked out from a space, in field order. */
function outsideSizes(choice: NewProjectChoice, made: NewProjectResult): string | null {
  const type = formOf(choice.piece);
  if (!made.ok || !made.outside || !type) return null;
  const { outside } = made;
  return sizeOrder(type)
    .map((k) => formatLength(outside[k], choice.units))
    .join(" × ");
}

/** The sizes, as an outside size or a space to fill with its gap, and what is wrong with them. */
function Sizes({
  choice,
  update,
  refusal,
  onCreate,
  outside,
}: {
  choice: NewProjectChoice;
  update: (patch: Partial<NewProjectChoice>) => void;
  refusal: Refusal | null;
  onCreate: () => void;
  outside: string | null;
}) {
  const sizesProblem = useId();
  const gapProblem = useId();
  const type = formOf(choice.piece) ?? "case";
  const about = refusal?.field;
  const sizeRefused = about === "w" || about === "h" || about === "d";
  return (
    <>
      <Choices
        label="Size"
        labelShown={false}
        options={[
          { value: "outside", label: "Outside size" },
          { value: "space", label: "Space to fill" },
        ]}
        value={choice.sizeMode}
        onChange={(sizeMode) => update({ sizeMode })}
      />
      <div className="settings-sizes">
        <div className="three">
          {sizeOrder(type).map((key) => (
            <SizeInput
              key={key}
              label={sizeLabel(type, key)}
              value={choice[key]}
              problem={about === key ? sizesProblem : undefined}
              onChange={(text) => update({ [key]: text })}
              onEnter={onCreate}
            />
          ))}
        </div>
        <Problem id={sizesProblem} text={sizeRefused ? (refusal?.message ?? null) : null} />
      </div>
      {choice.sizeMode === "space" && (
        <div className="settings-gap">
          <SizeInput
            label="Gap"
            value={choice.gap}
            problem={about === "gap" ? gapProblem : undefined}
            onChange={(gap) => update({ gap })}
            onEnter={onCreate}
          />
          <Problem id={gapProblem} text={about === "gap" ? (refusal?.message ?? null) : null} />
          {outside !== null && <p className="settings-outside">The piece will be {outside}</p>}
        </div>
      )}
    </>
  );
}

/** The wood from the shop, as a choice, with Other… to add one to the shop. */
function WoodChoice({
  choice,
  offered,
  update,
  onAddWood,
  problem,
}: {
  choice: NewProjectChoice;
  offered: readonly Stock[];
  update: (patch: Partial<NewProjectChoice>) => void;
  onAddWood: (stock: Stock) => void;
  problem: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const problemId = useId();
  return (
    <div className="settings-wood">
      <Choices
        label="Wood, from your shop"
        options={offered.map((s) => ({ value: s.id, label: s.name }))}
        value={choice.wood}
        onChange={(wood) => update({ wood })}
        after={
          <button type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            Other…
          </button>
        }
      />
      {adding && (
        <WoodForm units={choice.units} onAdd={onAddWood} onClose={() => setAdding(false)} />
      )}
      <Problem id={problemId} text={problem} />
    </div>
  );
}

/**
 * The one or two choices that matter for the piece: shelves for a bookcase, a back for a cabinet.
 */
function PieceOptions({
  choice,
  update,
}: {
  choice: NewProjectChoice;
  update: (patch: Partial<NewProjectChoice>) => void;
}) {
  if (choice.piece === "bookcase") {
    return (
      <Choices
        label="Shelves"
        options={SHELF_COUNTS.map((n) => ({ value: n, label: String(n) }))}
        value={choice.shelves}
        onChange={(shelves) => update({ shelves })}
      />
    );
  }
  if (choice.piece === "cabinet") {
    return (
      <Choices
        label="Back"
        options={[
          { value: true, label: "With a back" },
          { value: false, label: "No back" },
        ]}
        value={choice.back}
        onChange={(back) => update({ back })}
      />
    );
  }
  return null;
}

/**
 * The settings for `choice`, as `made` (newProject's answer) finds them. `shown` is the last piece
 * that could be built, drawn while a size is being typed; `offered` the wood the shop has in these
 * units. `update` and `setUnits` change the choice; `onAddWood` adds a wood to the shop and picks
 * it.
 */
export function PieceSettings({
  choice,
  made,
  shown,
  offered,
  update,
  setUnits,
  onAddWood,
  onCreate,
  onCancel,
}: {
  choice: NewProjectChoice;
  made: NewProjectResult;
  shown: { project: Project; result: SolveResult } | null;
  offered: readonly Stock[];
  update: (patch: Partial<NewProjectChoice>) => void;
  setUnits: (units: Project["units"]) => void;
  onAddWood: (stock: Stock) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const piece = pieceFor(choice.piece);
  const hasForm = formOf(choice.piece) !== null;
  const refusal = made.ok ? null : made;
  const elsewhere = refusal && refusal.field === undefined ? refusal.message : null;
  return (
    <div className="piece-settings">
      <div className="piece-settings-body">
        {hasForm && shown ? (
          <Preview project={shown.project} result={shown.result} />
        ) : (
          <div className="preview preview-art">
            <Drawing name={choice.piece === "idea" ? "idea" : "blank"} />
          </div>
        )}
        <div className="piece-heading">
          <div>
            <h3>{piece.name}</h3>
            <p>{piece.blurb}</p>
          </div>
          <Choices
            label="Units"
            labelShown={false}
            options={[
              { value: "imperial", label: "Inches" },
              { value: "metric", label: "Millimetres" },
            ]}
            value={choice.units}
            onChange={setUnits}
          />
        </div>
        {choice.piece === "idea" && (
          <IdeaField choice={choice} update={update} onCreate={onCreate} />
        )}
        {hasForm && (
          <>
            <Sizes
              choice={choice}
              update={update}
              refusal={refusal}
              onCreate={onCreate}
              outside={outsideSizes(choice, made)}
            />
            <PieceOptions choice={choice} update={update} />
            <WoodChoice
              choice={choice}
              offered={offered}
              update={update}
              onAddWood={onAddWood}
              problem={refusal?.field === "wood" ? refusal.message : null}
            />
          </>
        )}
      </div>
      <div className="piece-settings-actions">
        {elsewhere !== null && <p className="field-problem">{elsewhere}</p>}
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!made.ok} onClick={onCreate}>
          Create
        </button>
      </div>
    </div>
  );
}

/** "Something else": what the woodworker has in mind, kept as the project's note. */
function IdeaField({
  choice,
  update,
  onCreate,
}: {
  choice: NewProjectChoice;
  update: (patch: Partial<NewProjectChoice>) => void;
  onCreate: () => void;
}) {
  const id = useId();
  return (
    <div className="field settings-idea">
      <label htmlFor={id}>What are you thinking of building?</label>
      <input
        id={id}
        value={choice.note}
        placeholder="A round dining table, a bench for the hall…"
        onChange={(e) => update({ note: e.target.value })}
        onKeyDown={enterTo(onCreate)}
      />
    </div>
  );
}
