# ADR 015: M4 app and 3D view

Status: Proposed. Every rule below marked "maintainer to confirm" was chosen while designing M4
because the spec is silent; the maintainer approved the design on 2026-10-12 and confirms each
rule at the M4 review.

## Context

The Build plan's M4 builds the app: modules, panels, scrubby fields, history, the viewport and the
escape-hatch tools (Interaction spec). The engine (M1-M3) is complete; the app must call it only
through `@kerf/core`. Design: `docs/superpowers/specs/2026-10-12-m4-app-3d-view-design.md`.

## Decisions (approved in design, 2026-10-12)

| # | Decision |
| --- | --- |
| D1 | The assembly order is written by the engine (`assemblyOrder`) from the form, so the M5 PDF uses the same list. |
| D2 | Joints are in use from the moment the form exists. "Accept all" sets the form's `joineryReviewed` flag: saved, undoable, kept on resize. It changes no board. |
| D3 | Edge profile on boards a form made changes the form's `shelfRoundover`; on a hand-made or detached board it adds a roundover operation to that board. |
| D4 | The shop is per person and kept in browser storage, never in the project. A first-launch checklist sits in Start beside the templates with the starter shop ticked; it never blocks. |
| D5 | Save/open `.kerf`, the light theme and metric are in M4. |
| D6 | All seven tools, including Board bound to a gap and Tape guide lines. |
| D7 | The look: a segmented step switcher and a hint line on top, docked project tree and history on the left, inspector on the right, tool row under the model, build-plan drawer at the bottom. |
| D8 | `bookcase.spec.ts` uses `getByLabel("Back", { exact: true })`: Playwright matches labels by substring and counts hidden elements, so "Back" also matched "Back stock". |

## Rules (maintainer to confirm)

1. **History** is a list of whole projects, one per named change, kept for the session only and capped at the last 200 changes (the oldest is dropped). Clicking an entry steps back to it; a new change from there drops the later entries. Saving writes the project, not the history.
2. **Dragging a field** previews every step and records one history entry on release. One step per 4 pixels: 1/16" (1 mm); with Shift 1" (10 mm); with Alt the grid, 1/64" (0.01 mm).
3. **A field's text** is kept as the user typed it (an expression), after checking it evaluates to the right kind. A field whose form value names a parameter (`width`) edits that parameter.
4. **Units follow the stock** (ruling R23; maintainer to confirm). A project's `units` field sets its snap grid, and a stock thickness that is not a whole number of grid steps (3/4 plywood, 23/32" = 146050 units, is 50 units off the 0.01 mm grid) leaves joints that do not seat. So a metric project starts on a metric starter stock, where "18 mm plywood" (144000 units) replaces the 3/4 plywood and the 1/4 plywood and walnut, which sit on both grids, are kept. Settings sets the units new projects use (`kerf.units`), kept in store state and written through to storage; opening or restoring a project does not change it. An open project switches, as a named, undoable change, only when every stock its boards and forms use sits on the new grid; otherwise it stays as it is and the user is told, in the project's own units, which stock is in the way. A project is never rounded to fit.
5. **Assembly order wording.** Case: (1) "Dry-fit the case without glue and check that every joint closes." (2) "Glue {list} into the sides." where {list} names the case's other glued boards in order of first appearance, "N × Name" when there are several, joined "A, B and C". (3) "Square the case: the two diagonals must match. Adjust before the glue sets." (4) when it has a back: "Fit the {Back} last." Box: (1) "Dry-fit the box without glue and check that every corner closes." (2) with a bottom "Glue the corners with the {Bottom} in its groove, not glued, so it can move.", without "Glue the corners." (3) "Square the box: the two diagonals must match. Adjust before the glue sets." With several structures each step starts "Case 2: " (or "Box 2: ") from the second on.
6. **Join proposals.** Two touching boards: the one touched on its broad face is the host. The guest's thickness lying against an end or edge of the host proposes a rabbet; lying in the middle of the face it proposes a dado (ADR 013, D4). The user may ask for another type, and it is offered only if it seats. Boards meeting face to face or end to end have no joint, and the reason is said. Boards overlapping at both their ends propose a through dovetail with the first board picked as the pin board. Parameters are left to the spec's defaults. The proposal is tried on a copy of the project; any error that joint causes, tagged to it or not, is returned as the reason instead. A joint id already in the project is refused.
7. **Gap binding** writes the gap as an ordinary expression built from the two boards' position and size expressions (stock thickness where a part takes its thickness from its stock), along the one axis on which they face each other. A member of a row (a pattern) cannot be bound; the user is told to detach it first.
8. **Placements** are reported even when an assembly error withholds the shapes, so the viewport can draw every board as a plain blank and colour the broken one.
9. **Joint summaries** use an empty shop when the shop is invalid (every cut then shows its tool as missing); the `invalid-shop` error is reported beside them.
10. **A shape that cannot be made into a display mesh** is drawn as its blank with a warning badge; the reason is shown in the inspector.
11. **Browser storage** holds the shop, the units chosen for new projects (never taken from an open or restored project), the theme, section open state and the current project. If storage is unavailable the app says so once and works without it. A stored project the engine rejects is set aside with a notice; the app starts empty. The shop card shows inches; a metric shop display is a later setting.
12. **New tokens** extend `tokens.css` (both themes); nothing in M0's tokens changes.

## Consequences

- New public API: `assemblyOrder`, `proposeJoint`, `gapBetween`, `orientationFor` (the orientation index for a board's length and width axes, used by the Board tool); `SolveResult` gains `placements` and `joints`; case and box forms accept `joineryReviewed`.
- Known limits: openings are picked in the project tree, not in the 3D view, because the engine does not report where an opening is; two structures in one project still share the origin (ADR 014); history is not kept across a reload; the PDF and `.skp` import are M5.
