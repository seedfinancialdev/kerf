// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// 3. Divide (Interaction spec): for the picked opening, add shelves (count, evenly spaced or at set
// heights), a partition (a length or a fraction from the left), or N bays.

import type { Id, Opening, Project } from "@kerf/core";
import { useState } from "react";
import {
  addPartition,
  clearDivision,
  type EditResult,
  savedCount,
  setShelves,
  splitBays,
} from "../model/commands";
import { readCount, readLength } from "../model/size";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { Choice } from "./Choice";
import { NumberField } from "./NumberField";
import { Section } from "./Section";

type Mode = "shelves" | "partition" | "bays" | null;
type Spacing = "even" | "heights";

const NO_COUNT = "The shelf count can't be worked out; type a count first.";

function findOpening(list: Opening[], id: Id): Opening | undefined {
  for (const o of list) {
    if (o.id === id) return o;
    const inner = findOpening(o.children, id);
    if (inner) return inner;
  }
  return undefined;
}

/** The Divide step's panel: what divides the opening picked in the project tree. */
export function DivideStep() {
  const selection = useKerf((s) => s.selection);
  const project = useKerf((s) => shownProject(s));
  if (selection.kind !== "opening" || !project)
    return <p className="empty">Click an opening in the project tree.</p>;
  const structure = project.structures.find((s) => s.id === selection.structure);
  const opening = structure && findOpening(structure.openings, selection.opening);
  if (!structure || !opening) return <p className="empty">Click an opening in the project tree.</p>;
  return (
    <OpeningForm key={opening.id} project={project} structure={structure.id} opening={opening} />
  );
}

interface FormProps {
  project: Project;
  structure: Id;
  opening: Opening;
}

function OpeningForm({ project, structure, opening }: FormProps) {
  const store = useKerfStore();
  const [mode, setMode] = useState<Mode>(opening.division?.type ?? null);
  const run = (result: EditResult): string | null => {
    if (!result.ok) return result.message;
    store.getState().apply(result.edit);
    return null;
  };
  const shelves = opening.division?.type === "shelves" ? opening.division : undefined;
  const count = shelves ? readCount(shelves.count, project) : undefined;
  // The value to space evenly by, and what the Count box shows: a count the engine refuses is
  // shown as saved, so it can be corrected (second-pass review M2).
  const countText = count?.ok ? String(count.value) : "";
  const shownCount = shelves ? savedCount(project, shelves.count) : "";
  const heights = Array.isArray(shelves?.spacing) ? shelves.spacing : [];
  // "At set heights" with no heights typed yet is only shown, never recorded: an empty list of
  // heights is not a division the user asked for (final branch review, Task 18).
  const [wantsHeights, setWantsHeights] = useState(false);
  const spacing: Spacing =
    (shelves && shelves.spacing !== "even") || wantsHeights ? "heights" : "even";
  /** Evenly spaced keeps the count; a choice has no box, so a refusal goes to the notice line. */
  const spaceEvenly = (): void => {
    const refusal = countText
      ? run(setShelves(project, structure, opening.id, countText, "even"))
      : NO_COUNT;
    if (refusal !== null) store.getState().say(refusal);
    else setWantsHeights(false);
  };

  return (
    <div className="step-panel">
      <Section title="Opening">
        <div className="button-row">
          <button
            type="button"
            aria-pressed={mode === "shelves"}
            onClick={() => setMode("shelves")}
          >
            Add shelves
          </button>
          <button
            type="button"
            aria-pressed={mode === "partition"}
            onClick={() => setMode("partition")}
          >
            Add partition
          </button>
          <button type="button" aria-pressed={mode === "bays"} onClick={() => setMode("bays")}>
            Split into bays
          </button>
          {opening.division && (
            <button
              type="button"
              onClick={() => store.getState().apply(clearDivision(project, structure, opening.id))}
            >
              Empty the opening
            </button>
          )}
        </div>
        {mode === "shelves" && (
          <>
            <NumberField
              label="Count"
              display={shownCount}
              onSubmit={(t) =>
                run(setShelves(project, structure, opening.id, t, shelves?.spacing ?? "even"))
              }
            />
            <Choice
              label="Spacing"
              value={spacing}
              options={[
                { value: "even", label: "Evenly spaced" },
                { value: "heights", label: "At set heights" },
              ]}
              onChange={(v) => (v === "even" ? spaceEvenly() : setWantsHeights(true))}
            />
            {spacing === "heights" && (
              <NumberField
                label="Heights from the bottom"
                display={heights.join(", ")}
                onSubmit={(t) => {
                  const typed = t
                    .split(",")
                    .map((h) => h.trim())
                    .filter((h) => h !== "");
                  for (const h of typed) {
                    const r = readLength(h, project);
                    if (!r.ok) return r.message;
                  }
                  return run(
                    setShelves(project, structure, opening.id, String(typed.length), typed),
                  );
                }}
              />
            )}
          </>
        )}
        {mode === "partition" && (
          <NumberField
            label="From the left"
            display={opening.division?.type === "partition" ? opening.division.at : ""}
            onSubmit={(t) => run(addPartition(project, structure, opening.id, t))}
          />
        )}
        {mode === "bays" && (
          <NumberField
            label="Number of bays"
            display={opening.division?.type === "bays" ? opening.division.count : ""}
            onSubmit={(t) => run(splitBays(project, structure, opening.id, t))}
          />
        )}
      </Section>
    </div>
  );
}
