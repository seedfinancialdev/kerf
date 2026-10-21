// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// A collapsible inspector section (Interaction spec, "Accordion panels"). A closed section draws
// nothing inside it, so hidden fields can never be found or typed into by mistake.

import type { ReactNode } from "react";
import { useKerf } from "../state/useKerf";

/** An inspector section that remembers whether it was open; the tour may show it for now. */
export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const open = useKerf(
    (s) => s.sectionsShown.includes(title) || (s.sections[title] ?? defaultOpen),
  );
  const toggle = useKerf((s) => s.toggleSection);
  return (
    <section className="section">
      <h2 className="section-title">
        <button type="button" aria-expanded={open} onClick={() => toggle(title, defaultOpen)}>
          {title}
        </button>
      </h2>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
