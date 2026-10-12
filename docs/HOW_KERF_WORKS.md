# How Kerf works

A guided tour for someone who has never seen the code: what Kerf does, how a few numbers become a
cut list, and where each step lives. It uses shop words first and names the code second. For the
exact rules, the specs in `docs/spec/` are the authority; for why a rule is the way it is, see the
decisions in `docs/adr/`.

## The idea in one paragraph

You describe a piece of furniture the way you would describe it to another woodworker: *a 36-inch
bookcase, 72 high, 12 deep, four shelves, a 1/4-inch back in rabbets*. Kerf turns that into exact
boards, works out the joinery between them, checks that it can be built, and gives you the cut list,
the sheet layouts and the machine setups. Nothing is approximated: every length is a whole number
of tiny units, so the answer on Tuesday is the answer on Wednesday.

## What is saved, and what is worked out

This is the most important rule in the project, and it explains most of the design.

| Saved in the file (your intent) | Worked out every time (derived) |
| --- | --- |
| The form: sizes, stock, options, how openings are divided | The boards a form makes |
| Boards you made or edited by hand ("detached") | Joint cuts, cut sizes, the cut list |
| Parameters (`width = 36in`) | Sheet layouts, machining setups, the 3D shapes |

Because only intent is saved, a file is small, never goes stale, and a better version of Kerf can
re-derive better answers from the same file. The code enforces it: `serializeProject` writes only
the left column.

## From a form to a cut list

Each edit runs the same pipeline, in order. It is the spec's numbered pipeline, with the form
generating its boards first.

0. **Generate** (`packages/core/src/structures`). A form (a *structure*: a case or a box) makes
   ordinary boards, placements, repeats, joints and grain-matched sets. A partition or a bay is a
   division of an *opening* and makes more boards. A project with no form skips this.
1. **Parameters** (`solve/model.ts`). Named values (`width = 36in`) are worked out in dependency
   order; a cycle is an error that names every member.
2. **Parts** and 3. **placements and repeats** (`solve/model.ts`). Every size is an expression
   (`width - 2*stock["3/4 plywood"].thickness`) worked out exactly with fractions, then snapped to
   the 1/64-inch grid *once*, at the end, rounding half to even.
4. **Joints** (`joints/`). For each joint the cuts on both boards are worked out in each board's
   own frame, and what a joint adds to a board's cut size (a shelf in a 1/4-inch dado is 1/2 inch
   longer than it looks) is added.
5. **Validation** (`outputs/validate.ts`). Overlaps between boards that are not joined, a groove
   that shows through a dovetail, a rounded edge a joint hides. An error here withholds the cut
   list, layouts and setups; warnings never do.
6. **Outputs** (`outputs/`, `nest/`). The cut list groups identical boards; nesting packs boards
   onto sheets and standard-length boards; machining groups every cut by identical tool setup. A
   problem found here (a board larger than its sheet, an invalid shop profile) is reported and
   blocks the project, but the cut list is still given.
7. **Display** (`packages/geometry`). Each board's blank minus its cuts, for the screen. Outputs
   never read this; it is only for looking at.

`solve()` (in `packages/core/src/api.ts`, running `runPipeline` and `solveProject` in
`pipeline.ts`) never throws: whatever goes wrong becomes a diagnostic, a plain-language message
with a rule name.

## Why lengths are whole numbers

A float cannot hold 1/3 of an inch exactly, and 0.1 + 0.2 is not 0.3. A cut list that is off by a
hair is a real board cut wrong. So 1 inch is 203,200 units, 1 mm is 8,000, and the grid is 1/64
inch (3,175 units) or 0.01 mm. Ratios such as "one third of the opening" are exact fractions until
the final snap. See `docs/adr/012-m1-model-and-solver-rules.md` for the rounding rules.

## Detaching: when you take over a board

A form owns the boards it makes, and regenerates them when you change the size. The moment you edit
one by hand, that board is *detached*: its size and place are written down as exact lengths, the
form leaves it alone, and it is saved like any board you made yourself. A detached board keeps its
joints. You can also detach one copy out of a row of shelves, and undo it.

## Trusting the answers

| What | Where | What it proves |
| --- | --- | --- |
| Golden tests | `packages/fixtures/tests/golden` | The reference bookcase and box produce exactly the numbers in the spec |
| Property tests | `packages/fixtures/tests/prop` | An invariant holds for 1,000 random valid edits |
| Unit tests | next to the code, and `packages/fixtures/tests/unit` | One rule at a time, each value worked out by hand |
| Stress tests | `packages/fixtures/tests/stress` | Huge or hostile input is bounded and reported |
| Mutation testing | `pnpm mutate` | The tests would notice a plausible mistake |

The standards behind them are in `docs/testing/` and `docs/CODE_QUALITY.md`.

## Where things live

| Package | What it is |
| --- | --- |
| `packages/core` | The engine: units, expressions, the model, joints, outputs, structures. No DOM, no network, no clock. |
| `packages/geometry` | Display shapes (the solid of a board minus its cuts). |
| `packages/io` | Reading and writing the `.kerf` file (a zip with the project, some metadata, a thumbnail). |
| `packages/fixtures` | The reference projects and every cross-package test. |
| `packages/app`, `packages/pdf` | The interface and the build plan; later milestones. |

## Shop words and code words

| In the shop | In the code |
| --- | --- |
| A board | A *part* (its shape) and an *instance* (a placed copy) |
| A row of shelves | A *pattern* |
| A joint's cuts | *Removal primitives*, worked out and never saved |
| Glue-up order, grain sequence | A *match set* |
| Your tools | The *shop profile* |
| "I changed this board by hand" | *Detached* |
