# M4 design: the app and the 3D view

Build plan, M4: "Dark UI, modules, panels, scrubby fields, history, viewport, escape-hatch tools".
Acceptance (must pass in CI): the 6-step bookcase end-to-end test passes in a real browser; the
resize to 30" passes; solve stays under 100 ms. This document is the design the maintainer
approved in conversation on 2026-10-12; the implementation plan is written from it. Where it
chooses a rule the spec leaves open, ADR 015 records the rule as "maintainer to confirm".

## Decisions made with the maintainer

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Where does the assembly order come from? | The engine writes it from the form (new core function), so the PDF in M5 uses the same list. |
| Q2 | What does "Accept all" do? | Joints are in use from the moment the form exists, so the cut list is always right. The Joinery step lists each joint and whether the shop can cut it; Accept all marks the form's joinery as reviewed. It is saved, undoable, and kept on resize. |
| Q3 | Edge profile on shelves the form made? | It changes the form's `shelfRoundover`; the shelves keep following the form. On a hand-made or detached board it adds a roundover to that board. |
| Q4 | Shop setup in M4? | Starter stock and starter shop, a Shop panel, and the first-launch checklist. The checklist never blocks: it sits in Start beside the templates with the defaults ticked. |
| Q5 | Extras in M4? | Save/open `.kerf` (with recovery after a reload), the light theme, and metric. |
| Q6 | How far do the seven tools go? | All seven, including Board binding to a gap and Tape guide lines (table in "Tools"). |
| Q7 | The look? | Look C's top bar (one segmented step switcher, hint line under it) with Look A's docked panels and bottom drawer; tools in a labelled row under the model. Mock-ups: the "Kerf M4 look options" canvas, board "Chosen". |

## Layout

Fixed and docked; nothing floats (Interaction spec, "Deviate where they lose woodworkers").

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Kerf  Bookcase        [ Start | Shape | Divide | Joinery | Build plan ]  ⚙ Undo Redo │ top bar
│ Shape — choose how the case is built. Every board follows the form until …    │ hint line
├────────────┬──────────────────────────────────────────────┬──────────────────┤
│ Project    │                                              │ Inspector        │
│ ▾ Bookcase │               3D model                       │ ▾ Size           │
│   Opening  │                                              │   Width  36"     │
│   Side   2 │                                              │ ▾ Construction   │
│   …        ├──────────────────────────────────────────────┤ ▾ Back           │
│ History    │ Select·Space Board·B … Tape·T   Measurements │ ▸ Joinery        │
│ …          ├──────────────────────────────────────────────┤                  │
│            │ Shopping | Cut list | Sheets | Setups | Assembly  (drawer)      │
└────────────┴──────────────────────────────────────────────┴──────────────────┘
```

- **Top bar:** brand, project name, the five steps as one segmented control (the current step
  filled with the accent), a settings menu, Undo, Redo.
- **Hint line:** one sentence saying what the current step is for.
- **Left panel:** the project tree (structures, openings, boards with counts, error badges) and,
  under it, History.
- **Centre:** the model; under it the tool row (each tool shows its name and key) and the
  Measurements box.
- **Bottom drawer:** Shopping, Cut list, Sheets, Setups, Assembly; live on every edit. Tall in the
  Build plan step, short elsewhere, and resizable.
- **Right panel:** the inspector, a stack of collapsible sections that remember their open state.

### Design tokens

The M0 tokens (`packages/app/src/tokens.css`) are extended, never replaced. New tokens, each with
a light value: viewport background, selection and hover outlines, the filled step, error and
warning fills for boards, wood tones per stock kind (display only), panel widths (left 232 px,
right 300 px), drawer heights, hint-line height, and a second radius. Every text/background pair is
checked for 4.5:1 contrast in both themes by a test.

## The five steps

The layout never moves; each step changes what the inspector offers and what the model highlights.

| Step | Inspector | Model highlights |
| --- | --- | --- |
| Start | **New** with the four template cards; overall size (**Width**, **Height**, **Depth**; a box uses Length, Width, Height); the **Your shop** card (first-launch checklist, defaults ticked); **Open…** and **Save** | The whole piece |
| Shape | The form: Size; Construction (**Carcase stock**, **Top and bottom**); Back (**Back**, **Back stock**); a box's walls, corner joint, bottom, grain wraps. Advanced fields (rabbet depth, fit) behind **More** | The case outline |
| Divide | For the opening picked in the project tree: **Add shelves** (**Count**, **Spacing**: Evenly spaced or At set heights), **Add partition** (a length or a fraction such as 1/3), **Split into bays** | — (openings are picked in the tree; see "Not in M4") |
| Joinery | Every joint in shop words with what the shop can do ("Shelves in dados, 23/32" wide, 1/4" deep · your dado stack cuts this", or "you'd need a router with a 1/4" straight bit"); a type choice where the engine offers one (box corners); **Accept all** | Joint cuts, coloured |
| Build plan | Drawer tall; a banner when any error exists ("Not ready to build: …") | — |

- Selecting a board anywhere shows its properties: "Length 34-9/16" · cut 35-1/16"" (Domain
  model, decision 3), its stock, its operations, and where it came from.
- An error shows three ways at once: the board is red, the tree has a badge, the inspector explains
  it in the engine's words, with a one-click fix where one exists (Interaction spec, "Feedback").
- Detaching shows a notice with Undo: "Shelf 3 is now custom; the form won't change it".
- Only one field labelled "Width" (or any other label) is on screen at a time, so labels stay
  unambiguous for people and for the end-to-end test.

### The end-to-end contract

`packages/app/e2e/bookcase.spec.ts` changes by one line, approved by the maintainer on 2026-10-12:
`getByLabel("Back")` becomes `getByLabel("Back", { exact: true })`, because Playwright matches
labels by substring and "Back" also matches "Back stock" (checked in a real browser: it fails even
when "Back stock" is hidden). Otherwise the names it uses are binding: buttons New,
Bookcase, Shape, Divide, Joinery, Accept all, Add shelves, Edge profile, Both front edges, Build
plan; labels Width, Height, Depth, Carcase stock, Top and bottom, Back, Back stock, Count, Spacing,
Radius; options "3/4 plywood", "Between the sides", "Inset in rabbets", "1/4 plywood", "Evenly
spaced", `1/8"`; tabs Cut list, Sheets, Setups, Assembly; test ids `opening` (tree rows, and the
model's opening hotspots), `part-group-shelves` (the tree row of a board group), `cutlist-line`,
`sheet`, `setup`, `assembly-step`. A cut-list line shows both the cut and the visible size.

## Editing

### Number fields
- Drag the label: 1/16" (1 mm) per 4 pixels, 1" (10 mm) with Shift, the 1/64" grid (0.01 mm) with
  Alt; the model and drawer update while dragging; one history entry on release.
- Click to type anything the engine parses (`30"`, `29-1/2"`, `762mm`, `width - 1"`), via
  `parseLength` and the expression rules. A field that names a parameter keeps the expression.
- Shown snapped, as fractions (`formatLength`), tabular numerals.
- A typo shows the engine's message under the field and keeps the old value. Nothing is dropped
  silently (CODE_QUALITY rule 9).

### History
- Every change is one named command ("Width 36" → 30"", "Added 4 shelves", "Accepted the
  joinery"). Click an entry to step back; a new change from there drops the later entries.
- Ctrl/⌘+Z and Ctrl/⌘+Shift+Z. History lasts for the session and is not saved in the file.

### Units and theme
- Theme (dark/light) is a browser preference.
- Units are the project's own `units` field (Domain model: "display + snap grid"), so switching
  them is a named, undoable change saved with the project. New projects take the last units used.

### Saving
- **Save** writes a `.kerf` (`writeKerf`) with a thumbnail of the model; **Open…** reads one
  (`readKerf`); a read error is shown in shop words and the current project is kept.
- The current project is also kept in browser storage after every change, so a reload restores it;
  if storage is unavailable the app says so once and carries on.

## 3D view

- react-three-fiber (Build plan stack). Each distinct shape from `solve(...).shapes` becomes a
  display mesh through `@kerf/geometry`, cached by its content, and is drawn once per copy at the
  placement the engine gives.
- Soft studio lighting; flat wood tones per stock with grain direction drawn on hover. No textures
  are needed for M4.
- Navigation as SketchUp: middle-drag orbit, Shift + middle-drag pan, wheel zoom, O (orbit),
  H (pan), Shift+Z (zoom to fit).
- A shape that cannot be built into a mesh is drawn as its plain blank with a warning badge, and
  the reason is in the inspector.

## Tools

| Tool | Key | M4 behaviour |
| --- | --- | --- |
| Select | Space | Click a board or an opening; Shift-click adds; Escape clears |
| Board | B (also R) | Choose a stock; drag on the floor or a board's face; type the size in Measurements. Drawn between two boards, its length is bound to the gap between them |
| Push/Pull | P | Drag a board's end or edge, or type a distance; thickness stays the stock's. A form-made board is detached first (with the notice) |
| Move / copy | M | Drag with arrow-key axis locks or a typed distance; Ctrl copies; Shift makes a mirrored copy |
| Join | J | Click two touching boards; the engine proposes the joint from the contact and the shop; accept or pick another |
| Edge profile | F | Click edges or use **Both front edges**; **Radius** lists the shop's roundover bits. Form shelves change the form's `shelfRoundover` |
| Tape | T | Click two points to read the distance; optionally leave a guide line (session only, not saved) |

Escape cancels a tool; E is deliberately unassigned (SketchUp's eraser). Every tool's result is one
named history entry.

## How it is built

Three layers, depending in one direction:

1. **`@kerf/core`** (and `@kerf/io`, `@kerf/geometry`): all woodworking maths. The app calls only
   the public API; `@kerf/core/internal` is forbidden to the app by a dependency-cruiser rule.
2. **The app's model** (`packages/app/src/model/`): no React, no DOM. Holds the project (intent),
   the history, the step, the selection and the shop; applies named commands; calls `solve` after
   each. Zustand holds it for React (Build plan stack).
3. **The screens** (`packages/app/src/ui/`, `viewport/`, `tools/`): show the model and send it
   commands. No woodworking rules here. Inside this layer the folders also depend one way, as
   dependency-cruiser checks: `state/` hands the store to React; `scene/` converts between project
   and scene coordinates; `tools/` holds what each tool does to the model, with no React or
   three.js; `viewport/` is the 3D canvas and sends pointer events to the tools; `ui/` holds the
   panels, including each tool's panel, and may show what `viewport/` builds.

Solving runs on the main thread straight after each change (the reference bookcase solves well
under 100 ms). Meshes are built asynchronously and cached. A web worker is not used; it stays an
option if a benchmark shows the need.

## Engine additions (test first)

1. **Assembly order:** `assemblyOrder(project)` returns ordered steps, each a sentence and the
   boards it names. Case: dry-fit the case; glue the sides to the top, bottom and shelves; square
   it; fit the back last (Interaction spec, "The build plan", item 6). Box: dry-fit; glue the
   corners with the bottom in its groove, not glued; square it. A project with no structure gets
   none. ADR 015 (written in the first task) records the exact wording.
2. **Joinery reviewed:** a `joineryReviewed` option on case and box forms (boolean, default false),
   saved like any form option; the joint-type choice reuses existing options (`cornerJoint`).
3. **Joint proposal:** `proposeJoint(project, shop, a, b)` for two instances: the joint type and
   parameters that fit their contact, and whether the shop can cut it (the tool, or the tool it
   would need), or the reason no joint fits. A board is never cut into when it is thinner than the
   board that would sit in it (resolved thickness, including a part's own override): the reason
   says to glue or nail it.
4. **Gap binding:** `gapBetween(project, a, b)` writes the clear distance between two boards as an
   ordinary expression built from their own position and size expressions, so a board drawn
   between them follows them with no change to the expression language. ADR 015 records the rules.
5. **Where each board sits:** `solve(...).placements`, one per placed copy: its shape, its box in
   the case, and how its length, width and thickness point, so the 3D view never needs the
   engine's internals.
6. **The joints in shop words:** `solve(...).joints`, one per joint: the two boards, how many
   pairs, and each cut with the tool that makes it (or the tool the shop lacks).
7. **Which way a new board faces:** `orientationFor(length, width)`, so the Board tool never needs
   the engine's orientation table.

Existing API used as is: `solve`, `TEMPLATES`, `projectFromTemplate`, `STOCK_OPTIONS`,
`detachPartIn`, `detachCopyIn`, `attachPartIn`, `attachCopyIn`, `parseLength`, `formatLength`,
`serializeProject`, `parseProject`, `writeKerf`, `readKerf`.

## Shop and stock

- **Starter stock** (copied into each new project, so a saved file carries its own stock):
  "3/4 plywood" (23/32" actual, 4' × 8' sheet), "1/4 plywood" (1/4", 4' × 8') and "4/4 walnut"
  (solid, milled to 1/2", boards 8' long and up to 8" wide, 1/4" width allowance). These are the
  reference fixtures' stock exactly (`packages/fixtures/*/structure.json`).
- **Starter shop** = `packages/fixtures/shop-profile.json`: 1/8" kerf, dado stack up to 3/4" wide,
  router with a 1/8" roundover bit and no straight bits, hand tools for dovetails.
- The shop is per person (Domain model, `ShopProfile`): kept in browser storage, never in the
  project. The Your shop card and the Shop panel edit it; an invalid shop is shown with the
  engine's `invalid-shop` message.

## Testing

Following `docs/testing/`: each test seen failing first; expected values from the spec or a hand
calculation.

- **Unit (new Vitest project `app`):** the model and every command; e.g. "Width 36" → 30" is one
  entry", "Undo after Accept all clears it", "a drag records one entry", "a typo keeps the old
  value", the shelves at 30" are 29-1/16" cut (30 − 2 × 23/32 + 2 × 1/4).
- **Component (jsdom, Testing Library):** number field (drag, type, typo), inspector sections,
  drawer tabs, the shop card; queried by role and shop-language label.
- **End-to-end (Playwright):** the bookcase flow (acceptance, unchanged); one flow per tool;
  save → open; undo/redo; first launch; light theme; metric. Gated with `test.fail(!isMilestoneActive("M4"))`.
- **Benchmark:** the existing solve budgets, plus a browser timing from a Width edit to the cut list
  redrawing, under 100 ms.
- **Guard rails:** a scan of every rendered string for the banned words; the dependency rule
  forbidding `@kerf/core/internal` in the app; a contrast check of the token pairs in both themes.
- **Engine additions:** unit and golden tests in `packages/fixtures/tests/`, property tests for
  gap binding (a bound board always spans its gap exactly after random resizes).
- **Mutation:** new mutants for the commands and the history.

## Finishing

1. Set `M4: true` in `milestones.json` in the acceptance commit.
2. Audit with every milestone active; the only failures allowed are M5's (PDF, `.skp`).
3. Independent reviews: code quality, silent failures, tests plus `pnpm mutate`; findings become
   failing tests, then fixes; a second pass.
4. PR from `m4-app-3d-view`, describing plainly what is not done. The maintainer merges.

## Not in M4

- Picking an opening in the 3D model: the engine does not report where an opening is, and working
  it out in the app would put woodworking maths outside the engine. Openings are picked in the
  project tree (as the end-to-end test does). Adding opening boxes to the engine is a follow-up.
- A board drawn between two boards one above the other (Board binds to side-by-side gaps only).
- A board drawn between two boards a form made (every template's sides): the engine binds only
  boards saved in the project, so the Board tool refuses them in shop words and points to Divide or
  taking a side over first (ADR 015, rule 7; the maintainer's decision, 2026-10-13).
- The shop card shows inches only.

- The build plan PDF and `.skp` import (M5).
- Two structures placed apart in one project: they still share the origin (ADR 014, known limits).
- Fit-a-space sizing, drawers, doors, icon-only toolbar mode (v1).
- Keeping history across a reload.
