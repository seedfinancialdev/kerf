// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A structure's overall size (Interaction spec, "Overall size first"), shown in Start and in Shape.
// Typing records one change; dragging previews every step and records one change on release.

import { formatLength, type Id, type Len, type Project } from "@kerf/core";
import { useRef } from "react";
import { type Edit, setSize } from "../model/commands";
import type { History } from "../model/history";
import { type SizeKey, sizeLabel, sizeOrder } from "../model/labels";
import { lengthOf, literalFor } from "../model/size";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { NumberField } from "./NumberField";

/** The overall-size fields of one structure, in the order a woodworker reads them. */
export function SizeFields({ structure }: { structure: Id }) {
  const project = useKerf((s) => shownProject(s));
  const s = project?.structures.find((x) => x.id === structure);
  if (!project || !s) return null;
  return (
    <div className="fields">
      {sizeOrder(s.type).map((key) => (
        <SizeField key={key} structure={structure} sizeKey={key} />
      ))}
    </div>
  );
}

function SizeField({ structure, sizeKey }: { structure: Id; sizeKey: SizeKey }) {
  const store = useKerfStore();
  const project = useKerf((s) => (s.history ? shownProject(s) : null));
  // The History a drag began on and its last step; null between drags.
  const drag = useRef<{ from: History | null; last: Edit | null } | null>(null);
  const s = project?.structures.find((x) => x.id === structure);
  if (!project || !s) return null;
  const expr = s.size[sizeKey];
  const value = lengthOf(expr, project);
  // Every drag step is worked out from the recorded project, so the label reads "36" → 32-7/8"".
  const recorded = () => {
    const h = store.getState().history;
    return h?.entries[h.at]?.project ?? project;
  };
  const sizeIn = (p: Project): Len | undefined => {
    const expression = p.structures.find((x) => x.id === structure)?.size[sizeKey];
    return expression === undefined ? undefined : lengthOf(expression, p);
  };
  return (
    <NumberField
      label={sizeLabel(s.type, sizeKey)}
      display={value === undefined ? expr : formatLength(value, project.units)}
      onSubmit={(text) => {
        const r = setSize(recorded(), structure, sizeKey, text);
        if (!r.ok) return r.message;
        // A size equal to the current one is not a change (ADR 015, rule 2 / R16).
        if (sizeIn(r.edit.project) === sizeIn(recorded())) return null;
        store.getState().apply(r.edit);
        return null;
      }}
      scrub={
        value === undefined
          ? undefined
          : {
              value,
              units: project.units,
              onScrub: (next: Len) => {
                const { history } = store.getState();
                drag.current ??= { from: history, last: null };
                // Undo or a jump in History mid-drag ends the drag: its later steps would be
                // measured from another entry and replace the redo (final branch review M7).
                if (drag.current.from !== history) {
                  drag.current.last = null;
                  return null;
                }
                const r = setSize(recorded(), structure, sizeKey, literalFor(next, project.units));
                // The preview stays at the last size that was accepted; the field says why.
                if (!r.ok) return r.message;
                drag.current.last = r.edit;
                store.getState().preview(r.edit.project);
                return null;
              },
              onScrubEnd: () => {
                const last = drag.current?.last;
                drag.current = null;
                if (last && sizeIn(last.project) !== sizeIn(recorded())) {
                  store.getState().commit(last.label);
                } else {
                  store.getState().cancelPreview();
                }
              },
              onScrubCancel: () => {
                drag.current = null;
                store.getState().cancelPreview();
              },
            }
      }
    />
  );
}
