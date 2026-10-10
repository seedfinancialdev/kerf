# M2 Joinery + outputs: implementation plan

Scope (Build plan, M2): dado, rabbet, roundover and through dovetail; cut list grouping, match
sets, nesting and machining setups. Solve pipeline steps 4-6 (joints, validation, outputs) plus
the display mesh that the property tests require.

Acceptance (Build plan): "Bookcase and box golden JSON match exactly; 1,000 property runs clean."
Concretely, these M2-gated tests become real passes when `M2` is `true` in `milestones.json`:
golden (bookcase cut list, sheet layouts, setups, resize checks; box cut list, boards, dovetail
layout, warning), the 5 joint unit groups, the 8 M2 property tests, and the nesting benchmark.

Process (maintainer rulings): tests first and seen failing; expected values from the spec; the
milestone audit; and an independent review (spec correctness, silent failure, test quality) before
declaring done, with a second pass after fixes. See `docs/testing/`.

## What the M1 solver gives M2, and what is wrong with the inputs

`solveModel` returns each instance's position and bounding box in the parent frame. Printing the
reference projects (bookcase, inches):

| Instance | Solved today | Physically correct (shoulder-to-shoulder, Decision 3) |
| --- | --- | --- |
| Shelf / Top / Bottom | x 0.469 to 35.031, y 0 to 11.75 | x 0.719 to 35.281, y 0.25 to 12 |
| Back | x 0.344 to 34.906, y 11.75 to 12 | x 0.719 to 35.281, y 0 to 0.25 |
| Left side (mirrored) | orientation 17 | orientation 23 (see D2) |
| Box bottom | x 0.25 to 9.25, y 0.25 to 5.25 | x 0.5 to 9.5, y 0.5 to 5.5 |

The fixture positions bake each joint's penetration into the position (`side.thickness -
dado_depth`), and put the back panel on the front. M1's envelope test could not see this because
the sides alone define the envelope. Joint derivation reads contact between boxes, so these must be
correct first (decision D1).

## Decisions to settle before code

| # | Decision | Proposal |
| --- | --- | --- |
| D1 | Fixture placement | A `FIXTURE:` change to position expressions only: guests sit at the shoulder (flush to the host face); the back at the back (y = 0, `edge0`); shelves, top and bottom start at the back rabbet width. Exact list on the issue. |
| D2 | Mirrored instances | Reflection is across the local Y-Z plane (spec). The left side therefore needs orientation 23 (not 17) so its inside face is its local `face0`; tests assert cuts land on `face0` of both sides. |
| D3 | Removal primitive shapes (spec names them, does not define fields) | `box { min, max }`; `trapezoidPrism { points: 4 × (x, y), z: (min, max) }` for dovetails, profile in the board face plane cut through thickness; `quarterRoundSweep { edge, radius }`. All integers, local frame, sorted by a fixed key. |
| D4 | Joint kind from contact | Guest end/edge meets the host's flat face; the contact patch decides: patch reaches a host end or edge -> rabbet; otherwise -> dado (groove when along the grain). Corner overlap of two boards at a right angle -> dovetail. `at`/`face`/`width` come from the patch. |
| D5 | Unjoined overlap | Two parts that overlap and have no joint between them are an **error** (`overlap`). |
| D6 | Cut-list line order | First appearance in the project's part list (gives Side, Top/Bottom/Shelf, Back). Match-set blocks listed separately. |
| D7 | Instances that would differ | Spec: "split automatically and the user is told." The cut list sees the split as a derived definition, with an info diagnostic. |
| D8 | Hand-cut dovetails in machining setups | Spec groups "every derived cut" but gives no golden for the box. Proposal: a `handTools` setup listing the dovetail count, no numbers asserted beyond the structure. |
| D9 | Display mesh in M2 | The Build plan property list needs "every mesh manifold". Implement `buildDisplayMesh` and `isManifold` in `geometry` with `manifold-3d` (adds a WASM dependency and an async start). |

## Task order (each: failing test -> implementation -> property check where one exists)

1. **F1 fixtures** (needs D1, D2): correct positions and the left-side orientation; update the M1 assertions that pinned the old positions.
2. **Assembly geometry:** local <-> parent transforms including mirroring; contact patches between boxes.
3. **Joint framework:** removal primitives, pattern-joint expansion, per-definition cuts, automatic split (D7), guest cut additions.
4. **Dado / groove:** default depth (thickness / 3, snapped down), width, `fit`, `stop`, errors, cut length.
5. **Rabbet:** end and edge rabbets, errors, cut length and cut width.
6. **Roundover:** quarter-round primitive, radius rules, warning for a hidden rounded edge.
7. **Through dovetail:** integer layout (wide tail, slope offset, narrow tail, leftover to `edge0`), primitives, errors.
8. **Validation (step 5):** fit checks, overlaps (D5), joint errors, the box groove half-pin warning.
9. **Cut list:** grouping key, visible and cut sizes, quantities, part names, match-set blocks (D6).
10. **Sheet nesting:** guillotine packer: kerf, grain lock, trim, fewest sheets then largest offcut then fewest cuts, deterministic, cut sequence, offcuts.
11. **Match sets and solid stock:** composite blanks, one-board placement, rough sizes, trim.
12. **Machining setups:** group by tool + width + depth (+ bit); order; missing tool (D8).
13. **`solve` + display mesh** (D9): compose the pipeline; geometry package.
14. **Acceptance:** activate M2, audit, ADR 013, three independent reviews and a second pass, PR.

## Quality rules for this milestone

- No floats; all geometry in integer units; results deterministic and sorted.
- `solve` never throws; every rule has a rule id, severity and field, each with a test.
- Property tests run the solver and assert no `internal-error`.
- Every spec number is copied, not recomputed; where the spec is silent nothing is asserted.
