// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// 1. Start (Interaction spec): New shows the template cards; a template starts the project; the
// overall size comes first. The shop card sits beside it and never blocks (ADR 015, D4).

import { useState } from "react";
import { startProject, type TemplateName } from "../model/commands";
import { shownProject } from "../model/store";
import { useKerf, useKerfStore } from "../state/useKerf";
import { FileSection } from "./FileSection";
import { Section } from "./Section";
import { ShopCard } from "./ShopCard";
import { SizeFields } from "./SizeFields";

const TEMPLATE_NAMES: TemplateName[] = ["Bookcase", "Keepsake box", "Blank case", "Blank box"];

export function StartStep() {
  const store = useKerfStore();
  const [choosing, setChoosing] = useState(false);
  const structure = useKerf((s) => shownProject(s)?.structures[0]?.id);
  const start = (name: TemplateName): void => {
    const s = store.getState();
    const edit = startProject(name, s.unitsForNew);
    s.begin(edit);
    s.select({ kind: "structure", structure: edit.project.structures[0]?.id ?? "" });
    setChoosing(false);
  };
  return (
    <div className="step-panel">
      <div className="templates">
        <button
          type="button"
          className="primary"
          onClick={() => setChoosing(!choosing)}
          aria-expanded={choosing}
        >
          New
        </button>
        {choosing && (
          <ul className="template-cards">
            {TEMPLATE_NAMES.map((name) => (
              <li key={name}>
                <button type="button" className="template-card" onClick={() => start(name)}>
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {structure && (
        <Section title="Size">
          <SizeFields structure={structure} />
        </Section>
      )}
      <Section title="File">
        <FileSection />
      </Section>
      <Section title="Your shop">
        <ShopCard />
      </Section>
    </div>
  );
}
