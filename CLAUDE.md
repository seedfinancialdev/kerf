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

## Commands
- pnpm test | pnpm test:golden | pnpm test:prop | pnpm e2e | pnpm bench
