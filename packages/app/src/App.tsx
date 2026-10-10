// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

/** The workflow modules, in the order work happens (Interaction spec, "Design direction"). */
export const MODULES = ["Start", "Shape", "Divide", "Joinery", "Build plan"] as const;

export function App() {
  return (
    <div className="window">
      <header className="topbar">
        <span className="brand">Kerf</span>
        <nav aria-label="Workflow">
          <ol className="modules">
            {MODULES.map((name) => (
              <li key={name} className="module">
                {name}
              </li>
            ))}
          </ol>
        </nav>
      </header>
      <main className="workspace" />
    </div>
  );
}
