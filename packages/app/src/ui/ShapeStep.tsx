// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// 2. Shape (Interaction spec): the structure form. Advanced settings sit behind More
// ("Fewer panels, progressive disclosure"). Each change is one named History entry.

import type { Id, Project, Structure } from "@kerf/core";
import { setOption } from "../model/commands";
import { CHOICES, DEFAULT_CORNER_JOINT, optionLabel } from "../model/labels";
import { readLength } from "../model/size";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { Choice } from "./Choice";
import { NumberField } from "./NumberField";
import { Section } from "./Section";
import { SizeFields } from "./SizeFields";

export function ShapeStep() {
  const project = useKerf((s) => shownProject(s));
  const structure = project?.structures[0];
  if (!project || !structure)
    return <p className="empty">Start a project first: go to Start and click New.</p>;
  return (
    <div className="step-panel">
      <Section title="Size">
        <SizeFields structure={structure.id} />
      </Section>
      {structure.type === "case" ? (
        <CaseForm project={project} structure={structure} />
      ) : (
        <BoxForm project={project} structure={structure} />
      )}
      <Section title="More" defaultOpen={false}>
        <Depths project={project} structure={structure} />
      </Section>
    </div>
  );
}

interface FormProps {
  project: Project;
  structure: Structure;
}

/** Sets one form option as a named change. */
function useOption(structure: Id) {
  const store = useKerfStore();
  return (key: string, value: string | boolean): void => {
    const p = shownProject(store.getState());
    if (p) store.getState().apply(setOption(p, structure, key, value));
  };
}

const text = (s: Structure, key: string, fallback: string): string => {
  const v = s.options[key];
  return typeof v === "string" ? v : fallback;
};

function StockChoice({ project, structure, field }: FormProps & { field: string }) {
  const set = useOption(structure.id);
  return (
    <Choice
      label={optionLabel(field)}
      value={text(structure, field, "")}
      options={project.stock.map((s) => ({ value: s.id, label: s.name }))}
      onChange={(v) => set(field, v)}
    />
  );
}

function CaseForm({ project, structure }: FormProps) {
  const set = useOption(structure.id);
  const back = text(structure, "back", "none");
  return (
    <>
      <Section title="Construction">
        <StockChoice project={project} structure={structure} field="carcaseStock" />
        <Choice
          label="Top and bottom"
          value={text(structure, "topBottom", "between-sides")}
          options={CHOICES.topBottom}
          onChange={(v) => set("topBottom", v)}
        />
      </Section>
      <Section title="Back">
        <Choice label="Back" value={back} options={CHOICES.back} onChange={(v) => set("back", v)} />
        {back !== "none" && (
          <StockChoice project={project} structure={structure} field="backStock" />
        )}
      </Section>
    </>
  );
}

function BoxForm({ project, structure }: FormProps) {
  const set = useOption(structure.id);
  return (
    <>
      <Section title="Walls">
        <StockChoice project={project} structure={structure} field="wallStock" />
        <Choice
          label="Corners"
          value={text(structure, "cornerJoint", DEFAULT_CORNER_JOINT)}
          options={CHOICES.cornerJoint}
          onChange={(v) => set("cornerJoint", v)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={structure.options.grainWraps === true}
            onChange={(e) => set("grainWraps", e.target.checked)}
          />
          Grain wraps the corners
        </label>
      </Section>
      <Section title="Bottom panel">
        <Choice
          label="Bottom"
          value={text(structure, "bottom", "groove")}
          options={CHOICES.bottom}
          onChange={(v) => set("bottom", v)}
        />
        {text(structure, "bottom", "groove") !== "none" && (
          <StockChoice project={project} structure={structure} field="bottomStock" />
        )}
      </Section>
    </>
  );
}

const CASE_DEPTHS = ["dadoDepth", "rabbetDepth", "backRabbetDepth"] as const;
const BOX_DEPTHS = ["rabbetDepth", "grooveDepth", "grooveOffset"] as const;

/** Joint depths; blank means the spec's default rule (ADR 014, D1), which the engine reads as absent. */
function Depths({ project, structure }: FormProps) {
  const set = useOption(structure.id);
  const keys = structure.type === "case" ? CASE_DEPTHS : BOX_DEPTHS;
  return (
    <>
      {keys.map((key) => {
        const value = text(structure, key, "");
        return (
          <NumberField
            key={key}
            label={optionLabel(key)}
            display={value === "" ? "Default" : value}
            onSubmit={(typed) => {
              const t = typed.trim();
              if (t === "" || t === "Default") {
                set(key, "");
                return null;
              }
              const read = readLength(t, project);
              if (!read.ok) return read.message;
              set(key, read.expr);
              return null;
            }}
          />
        );
      })}
    </>
  );
}
