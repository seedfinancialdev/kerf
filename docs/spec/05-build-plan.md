# Build plan

Six milestones, three to four weeks end to end, built by Claude Code agents against tests that exist before the code does. Golden fixtures from the planning tabs are written first and start red; a milestone is done when its tests turn green, not when it looks done.

## Repo & stack

One pnpm workspace. The core package is pure TypeScript and is the only source of truth; everything else depends on it, never the reverse.

| Package | Holds | Key libraries |
| --- | --- | --- |
| `core` | Units and rationals, expressions, part graph, solver, structures, joinery, cut list, nesting, machining setups, build plan data | None beyond the standard library |
| `geometry` | Removal primitives → display meshes | `manifold-3d` (WASM) |
| `io` | `.kerf` read/write, schema migrations, .skp import spike | `fflate` (zip), `openskp` |
| `pdf` | Build plan PDF | `pdf-lib` |
| `app` | Dark UI, modules, panels, viewport, tools | React, three.js via react-three-fiber, Zustand for UI state, Vite |
| `fixtures` | Golden `.kerf` files and expected JSON for both reference projects | — |

- **Tooling:** TypeScript strict, Vitest, fast-check (property tests), Playwright (end-to-end), Biome (lint + format), dependency-cruiser (enforces that `core` imports nothing from the other packages or the DOM).
- **CI:** tests, lint and benchmarks on Depot runners, as in your current setup.
- **License:** GPL-3.0 headers and `LICENSE` from the first commit.

## Test harness

| Level | What it proves | Source |
| --- | --- | --- |
| Unit | Each function: unit conversion, expression parsing, each joint's removals | Operation specs, domain model |
| Golden | Bookcase and box: exact cut list, sheet layouts, machining setups, as JSON | Operation specs, cut list tabs |
| Property | 1,000 random valid edits per run: no throw, every mesh manifold, cut list equals part data, load → save byte-identical | Domain model invariants |
| End-to-end | The 6-step bookcase script in a real browser, then resize to 30" | Interaction spec |
| Benchmark | Solve under 100 ms on the bookcase; nesting under 1 s for 100 parts | Charter, cut list tab |

A change to any golden file needs a commit message line starting `FIXTURE:` and your review; agents never update fixtures to make a test pass.

## Agent instructions

A `CLAUDE.md` at the repo root, kept short; the planning tabs are the long-form spec.

```markdown
# Kerf — agent rules

## Source of truth
- Spec: the Prototype plan tabs (charter, domain model, operation specs, cut list, interaction, build plan).
- If code and spec disagree, stop and ask. Never change a golden fixture to make a test pass.

## Hard rules
- Lengths are integers (1in = 203200 units). No floats for lengths, ever. Expressions use rationals.
- packages/core imports nothing from other packages, the DOM, or three.js.
- Save intent, derive geometry: never write derived data (joint cuts, meshes, cut lists) to .kerf.
- UI strings use shop language. Banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude, boolean.

## Workflow (Superpowers)
- One milestone per branch. Plan → subagent tasks → finish branch.
- Order for every feature: spec → failing test/fixture → implementation → property test.
- A PR is done when its milestone's acceptance tests pass in CI.

## Commands
- pnpm test | pnpm test:golden | pnpm test:prop | pnpm e2e | pnpm bench
```

## Decision records

Each locked decision gets a one-page record in `docs/adr/` before M1 starts, so agents can't relitigate them.

| # | Decision |
| --- | --- |
| 001 | TypeScript core, pure, no UI dependencies |
| 002 | One integer unit: 1" = 203,200; 1/64" and 0.01 mm grids |
| 003 | Right-angle orientations only in the prototype |
| 004 | Shoulder-to-shoulder guest length; corner joints by outside size |
| 005 | Save intent, derive geometry |
| 006 | Cut list groups to minimize waste; match sets are the only override |
| 007 | Own guillotine optimizer; OpenCutList as benchmark |
| 008 | Structures and openings generate ordinary parts; hand edits detach |
| 009 | OpenSKP for .skp import, not the Trimble SDK |
| 010 | Dark-first UI on design tokens; Lightroom-style modules |
| 011 | GPL-3.0 core |

## Milestones

&#91;embedded content: prototype roadmap · 6 milestones, 2 lanes, 1 gate\]

The critical path is M0 → M1 → M2 → M3 → M5, 15-20 working days; the app (M4) runs alongside M2 and M3 once the model exists.

| Milestone | Builds | Acceptance (must pass in CI) |
| --- | --- | --- |
| M0 Foundations | Repo, CI, tokens, ADRs, all golden fixtures and E2E script written | CI runs; every golden and E2E test exists and fails |
| M1 Model + solver | Units, rationals, expressions, part graph, patterns, solve pipeline, `.kerf` I/O | Domain invariants pass; load → save byte-identical; parameter cycles reported |
| M2 Joinery + outputs | Dado, rabbet, roundover, dovetail; cut list grouping, match sets, nesting, machining setups | Bookcase and box golden JSON match exactly; 1,000 property runs clean |
| M3 Structures + shop | Case and box generators, openings, templates, shop-profile proposals, detach | Bookcase template → form → golden outputs with no 3D tools used |
| M4 App + 3D view | Dark UI, modules, panels, scrubby fields, history, viewport, escape-hatch tools | 6-step E2E bookcase passes; resize to 30" passes; solve under 100 ms |
| M5 PDF + spikes | Build plan PDF, .skp import spike on 10 files | PDF matches golden; 8 of 10 files import with correct part sizes |

## After M5

Run charter questions 1 and 5: usability sessions with 3 woodworkers who don't use CAD and 2 SketchUp users, and demos to 5 plan-selling creators. Their results, plus the test results, decide go or no-go on the full v1 build.

## What agents should not do

- Add features outside the charter's scope list, however small.
- Introduce floats, a new geometry kernel, or a state library inside `core`.
- Change UI copy away from shop language, or add icon-only controls.
- Merge a milestone with a failing benchmark.
