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
6. **Join proposals.** Two touching boards: the one touched on its broad face is the host. The guest's thickness lying against an end or edge of the host proposes a rabbet; lying in the middle of the face it proposes a dado (ADR 013, D4). The user may ask for another type, and it is offered only if it seats. A joint is never cut into a board thinner than the one that sits in it: such a pair is refused with the reason (glue or nail it), whichever type is asked for (confirmed by the maintainer 2026-10-13). Boards meeting face to face or end to end have no joint, and the reason is said. Boards overlapping at both their ends propose a through dovetail with the first board picked as the pin board. Parameters are left to the spec's defaults. The proposal is tried on a copy of the project; any error that joint causes, tagged to it or not, is returned as the reason instead. A joint id already in the project is refused.
7. **Gap binding** writes the gap as an ordinary expression built from the two boards' position and size expressions (stock thickness where a part takes its thickness from its stock), along the one axis on which they face each other. A member of a row (a pattern) cannot be bound; the user is told to detach it first. Boards a form makes cannot be bound yet either, because the engine binds only boards saved in the project: the Board tool refuses them with "Boards the form made can't be measured between yet; use Divide to add shelves, or take a side over first." (the maintainer's decision, 2026-10-13; listed as not done in M4). The board lies flat at the height of the first click and sits flush with the two boards' front edges, reaching back to the nearest board crossing the gap at that height (ruling R35).
8. **Placements** are reported even when an assembly error withholds the shapes, so the viewport can draw every board as a plain blank and colour the broken one.
9. **Joint summaries** use an empty shop when the shop is invalid (every cut then shows its tool as missing); the `invalid-shop` error is reported beside them.
10. **A shape that cannot be made into a display mesh** is drawn as its blank with a warning badge; the reason is shown in the inspector.
11. **Browser storage** holds the shop, the units chosen for new projects (never taken from an open or restored project), the theme, section open state and the current project. If storage is unavailable the app says so once and works without it. A stored project the engine rejects is set aside with a notice; the app starts empty. The shop card shows inches; a metric shop display is a later setting.
12. **New tokens** extend `tokens.css` (both themes); nothing in M0's tokens changes.

## Consequences

- New public API: `assemblyOrder`, `proposeJoint`, `gapBetween`, `orientationFor` (the orientation index for a board's length and width axes, used by the Board tool), `edgeName`, `JOINT_NAME` and `JOINT_WORD` (the shop words for edges and joints, used by the engine's own messages and the app's panels alike), `STOCK_FIELDS` (the stock fields each kind of form reads, so the app and the engine share one list) and `MAX_COUNT` (the most boards of one kind a form makes, so the app refuses a larger count of shelves or bays before building an opening for each); `SolveResult` gains `placements` and `joints`; case and box forms accept `joineryReviewed`.

## Known limits

What M4 does not do, or does only in part. Each is listed in the pull request's "not done" list; the
maintainer decides which become work.

1. Openings are picked in the project tree, not in the 3D view, because the engine does not report
   where an opening is.
2. Two structures in one project still share the origin (ADR 014).
3. History is not kept across a reload.
4. The PDF and `.skp` import are M5.
5. Board cannot be drawn between two boards a form made (rule 7), nor between two boards one above
   the other. It refuses both in shop words.
6. Three tools are only partly built. Board is a click then a typed size, not a drag on the floor or
   a board's face. Select picks boards, not joints or edges, in the 3D view. Escape also clears the
   selection, not only the tool.
7. The steps do not change what the model highlights (the case outline in Shape, the coloured joint
   cuts in Joinery). The build-plan drawer is tall or short, not freely resizable. The board
   inspector does not list a board's operations, and clicking a board does not show its joints.
8. Edge profile: the radius choice ignores the board's current roundover, and "None" on a mixed
   pick changes only the hand-made boards. A roundover that conflicts on a taken-over shelf has no
   message of its own in the Edge panel.
9. The app's store (`model/store.ts`) still has several jobs (final branch review M5). Moved out
   without changing behaviour: browser persistence to `model/persist.ts` (`restoreProject`,
   `writeProject`, `readSections`, `storageNotice`, `NOT_KEPT`, `UNITS_NOT_KEPT`), the types to
   `model/store-types.ts`, the actions that only set view state to `model/view-actions.ts`, and the
   solve and starting state to functions of their own. Still in `createKerfStore` (about 165
   lines): `keep()` (writing each recorded change back), the once-only flags that decide when a
   not-kept notice is shown for the project, the shop and the units, the reads and writes of the
   theme, the units for new projects, section open state and when the project began, the view
   state itself (`hovered`, `navigation`, `fitRequest`) and the viewport's thumbnail callback. They
   stay because each is tied to the store's own state changes and notices (a write happens inside
   the action that changes the value, and a failed write decides which notice shows), or, for the
   view state and the thumbnail, because moving them changes what every screen and its tests read.
10. A stored project the engine rejects is kept in browser storage (`kerf.project.setAside`, then
    `.2`, `.3`, … so none is overwritten), but nothing in the app offers it back yet; recovering it
    means reading browser storage by hand. A project that cannot be set aside is left where it was,
    and the notice comes back on each reload. A download of the set-aside copy is a later feature
    (silent-failure review M5).
11. Files: Open stamps the project's start time afresh, and `kerf.created` is kept apart from the
    project. The app version in `meta.json` is bumped by hand. The "newer file" message is picked by
    its wording until `@kerf/io` raises a typed error. `begin` and `apply` repeat one shape.
12. Units: a metric length can read "18.0 mm" with a trailing `.0` (`formatLength` in core; fix it
    there). The units and the work have separate "not kept" notices.
13. Size fields: the field refuses only a direct reference to itself. A parameter cycle through
    other parameters (depth = width / 3, then Width = depth) is accepted and then reported by the
    engine as a problem. A length position of zero or less is accepted and the solver reports it.
    A count is limited to 64 (`MAX_COUNT`), and an empty count has the engine's general wording.
14. `proposeJoint` keys the errors of its two solves by rule, board, joint and message and compares
    them as a set, so a new error that exactly repeats an old one is hidden.
15. Join: "Joinery accepted" stays after a corner joint is changed (the maintainer to confirm), and
    the sentence for a missing tool does not name the cut.
16. Problems: a diagnostic that names no board never shows when a board is picked.
17. In Chrome, middle-button autoscroll can start over the view.
18. A mirror copy is mirrored where it stands, as the Interaction spec words it.
19. The project tree takes ArrowUp and ArrowDown but has no roving tab stop and no Home or End key.
    History has no arrow, Home or End keys, and every entry is a tab stop. Long hints and names
    are clipped.
20. Two full solves run for each Board attempt (the figure is reported by the timing test), and the
    row-shelf height is read off the solve. Push/Pull, Move and Edge also solve the project before
    and after each recorded change to word its notice (`editNotice`, ruling R45), on top of the
    store's own solve: three solves per recorded change, none per preview frame. Past the 25
    problems listed for one rule, a further problem a change brings is not named in its notice
    (the summary line is left out of the comparison, since its words carry a changing count).
21. Tests not yet written: a light-theme App test (the end-to-end test covers it), Section
    collapse beyond its open state, the `setupText` branches, tab focus, an unmount in the middle
    of a drag of a viewport tool (a size-field drag is covered), and the two-board take-over notice
    beyond its unit test. The tape end-to-end test and the arrow-key tests were not seen failing
    first, and the number field's Enter-then-leave fix (a size taken with Enter is not recorded
    back on leaving the field) is guarded only by the companion end-to-end test: its unit test
    passes before and after the fix. One mutant of the half-to-even tie in the Tape is
    equivalent, and the empty-History branch cannot be reached.
22. The rules above quote UI strings; a later wording change cites this ADR.
23. Small tidying left: `tools/pointer.ts` re-exports `ModelHit`, `ModelPointer` and `ToolHandler`;
    `resetOption` in `commands.ts` repeats a rest-omit; unused design tokens are not checked.
24. The shop card shows inches only (rule 11); fit-a-space sizing, drawers, doors and an
    icon-only toolbar are v1.
