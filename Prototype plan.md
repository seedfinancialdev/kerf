# Prototype plan

The prototype answers six questions in a three-to-four-week build (revised up from two weeks after the woodworker-first workflow was added). Its code is disposable; the domain model, file format, operation specs and test fixtures are not, and carry straight into v1.

## What it must prove

| # | Question | Pass | If it fails |
| --- | --- | --- | --- |
| 1 | Can a woodworker who doesn't use CAD design furniture with it? | A woodworker who doesn't use CAD gets from New to an exported build plan for the reference bookcase unassisted in 15 min or less; a SketchUp user in 10 min or less | Rework the interaction model before v1 |
| 2 | Is joinery-as-operations geometry reliable? | All four operations pass their golden tests; 100 random parameter changes give zero invalid meshes and a cut list that matches part data every time | Narrow the joint set or revisit the geometry approach |
| 3 | Does resizing keep joinery true? | Changing width, height or shelf count re-solves parts, dados and cut list in under 100 ms; dado depth and panel thickness never change | Revisit the parameter solver |
| 4 | Is the output shop-usable? | Cut list and sheet layout PDF match a hand-calculated cut list for the reference bookcase exactly | Fix outputs before any demo |
| 5 | Would creators publish here? | At least 3 of 5 plan-selling creators say they would publish a plan in it | No-go, or rethink monetization |
| 6 | Is .skp import viable? (spike) | 8 of 10 woodworking files from 3D Warehouse import with correct part dimensions | Ship OBJ/DAE fallback only |

## Reference projects

Every test, demo and acceptance check uses these two models, so results are comparable across builds.

- **Bookcase:** 36" W × 72" H × 12" D. Sides, top and bottom from 3/4" plywood (23/32" actual). Four fixed shelves in 1/4"-deep dados. 1/4" back panel in rabbets. 1/8" roundover on shelf front edges.
- **Keepsake box:** 10" × 6" × 4" from 1/2" solid walnut, four through-dovetail corners, 1/4" plywood bottom in a groove.

Exact dimensions and the hand-calculated cut lists live in the operation specs and cut list tabs as golden files.

## Scope

**In the prototype:** templates (Bookcase, Keepsake box, blank case, blank box) with structure forms; openings divided into shelves, partitions and bays; shop profile driving joint proposals and sizes; dado, rabbet, roundover, through dovetail; live cut list, sheet nesting with kerf, machining grouped by setup, assembly order; build plan PDF; 3D escape-hatch tools (board, push-pull, move, join, edge, tape); save/load `.kerf`, undo/redo, .skp import spike.

**Out of the prototype (still in v1 scope):** drawers, doors, face frames, table bases, fit-a-space sizing, shop drawings, exploded views, labels, costing, edge banding, tapers, DXF export, hardware lists, desktop app, accounts, cloud, marketplace, rendering. Typing a project description in plain words is v2+.

**Platform:** web only, desktop Chrome and Safari.

## Decisions locked

| Decision | Choice | Why |
| --- | --- | --- |
| Core language | TypeScript, pure core with no UI dependencies | One language, fastest iteration; port to Rust only if benchmarks fail |
| Units | Imperial fractions by default, metric as a setting | US hobbyist and plan-creator market |
| Precision | Integer storage at 1/64" (imperial) or 0.01 mm (metric) | Identical parts always merge (top-20 request #12) |
| Display geometry | Manifold (WASM) booleans, display only | Outputs read the part graph, never the mesh |
| .skp import | OpenSKP (MIT) | Official SDK has no web, Linux or server build |
| License | GPL-3.0 core | Blocks closed hosted clones; compatible with OpenCutList |
| Working name | Kerf (placeholder) | Rename before public launch |

## Planning order

Each tab is reviewed before the next starts. Build starts only when tabs 1-3 are approved, because those are the expensive ones to change.

1. Domain model v0 1. Domain model v0: types, JSON schema, units, axes, parameter rules.
2. Operation specs 2. Operation specs: the four operations, each with golden test cases.
3. Cut list & nesting 3. Cut list & nesting: algorithm, kerf, grain, output format.
4. Interaction spec 4. Interaction spec: tools, core flow, wireframes.
5. Build plan 5. Build plan: repo, harness, agent instructions, milestones.

Creator outreach (question 5) runs in parallel and doesn't wait for this plan.
