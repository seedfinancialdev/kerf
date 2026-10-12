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

## Testing
- Read `docs/testing/UNIT_TEST_STANDARD.md` and `docs/testing/INTEGRATION_TEST_STANDARD.md` before writing a test.
- Expected values come from the spec or a hand calculation, never from running the code. Show the test failing first.
- Every milestone ends with the audit and an independent review before it is declared done.

## Code quality (open source, permanent)
Kerf is open source: strangers read this code directly, so its quality is part of the product. The
bar is that the code is as impressive as the app. Read `docs/CODE_QUALITY.md` before writing code.
- Zero lint warnings, zero type errors, no dead code, no stray or scratch files, no commented-out code.
- Names say what a thing is in the domain's words; a module has one job; a function fits on a screen.
- Comments explain why and cite the spec or ADR; they never restate the code or go stale.
- Every public function is documented (what, units, errors); errors are typed and say what to do.
- Pure and deterministic by default; no hidden state, clocks or randomness in `core`.
- Decisions are written down (ADR) with their reasons; known gaps are listed, never hidden.
- Never trade these away for speed. If a change cannot meet the bar yet, say so and stop.

## Commands
- pnpm test | pnpm test:golden | pnpm test:prop | pnpm e2e | pnpm bench
