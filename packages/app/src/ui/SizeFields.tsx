// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A structure's overall size (Interaction spec, "Overall size first"), shown in Start and in Shape.
// Typing records one change; dragging previews every step and records one change on release.

import { formatLength, type Id, type Len } from "@kerf/core";
import { useRef } from "react";
import { type Edit, setSize } from "../model/commands";
import { type SizeKey, sizeLabel, sizeOrder } from "../model/labels";
import { lengthOf, literalFor } from "../model/size";
import { shownProject } from "../model/store";
import { NumberField } from "./NumberField";
import { useKerf, useKerfStore } from "./useKerf";

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
  const project = useKerf((s) => s.history && shownProject(s));
  const lastDrag = useRef<Edit | null>(null);
  const s = project?.structures.find((x) => x.id === structure);
  if (!project || !s) return null;
  const expr = s.size[sizeKey];
  const value = lengthOf(expr, project);
  // Every drag step is worked out from the recorded project, so the label reads "36" → 32-7/8"".
  const recorded = () => {
    const h = store.getState().history;
    return h?.entries[h.at]?.project ?? project;
  };
  return (
    <NumberField
      label={sizeLabel(s.type, sizeKey)}
      expr={expr}
      display={value === undefined ? expr : formatLength(value, project.units)}
      onSubmit={(text) => {
        const r = setSize(recorded(), structure, sizeKey, text);
        if (!r.ok) return r.message;
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
                const r = setSize(recorded(), structure, sizeKey, literalFor(next, project.units));
                if (!r.ok) return;
                lastDrag.current = r.edit;
                store.getState().preview(r.edit.project);
              },
              onScrubEnd: () => {
                if (lastDrag.current) store.getState().commit(lastDrag.current.label);
                lastDrag.current = null;
              },
            }
      }
    />
  );
}
