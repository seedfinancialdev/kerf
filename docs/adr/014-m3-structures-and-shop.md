# ADR 014: M3 structures and shop

Status: accepted (maintainer rulings 2026-10-10, recorded below). Context: Build plan M3, Domain
model "Structures, openings & shop profile", Interaction spec sections 2-4.

## Decisions

| # | Decision |
| --- | --- |
| D1 | The form's field names (`carcaseStock`, `backStock`, `topBottom`, `back`, `dadoDepth`, `rabbetDepth`, `backRabbetDepth`, `shelfRoundover`, `wallStock`, `bottomStock`, `cornerJoint`, `bottom`, `grooveDepth`, `grooveOffset`, `grainWraps`) are official. Templates carry explicit depths; a blank form uses the spec's default rules (a third of the host for a dado, half for a rabbet). |
| D2 | Case backs: `none`, `inset-rabbet` and `applied`; top and bottom `between-sides` or `sides-between`. Any other value is an `invalid-option` error that lists the choices. The spec gives no sizing rule for the added ones; the rules are in "Proposed spec text" below. |
| D3 | A detached board keeps its joints, worked out from where it now sits. Only its size and position stop following the form. |
| D4 | Box corners: through dovetails, and (added after the first review) rabbeted corners. Any other `cornerJoint` is an `invalid-option` error that lists the choices. |
| D5 | Generated ids are derived from the structure's id and the part's role (`generatedId`), so regenerating gives the same ids and saved references to a detached board stay valid. |
| D6 | Every generated object carries its origin: `PartDef.source` (as the spec says) and, added here, `generatedBy` on instances, patterns, joints and match sets. This is how the saved file leaves them out. |
| D7 | `serializeProject` writes intent only: structures, hand-made parts, and detached parts with their placements and patterns. Generated parts, placements, patterns, joints and match sets are re-derived on load. |
| D8 | Generation runs inside every solve (`runPipeline`), so `solve()` accepts a project with structures directly. `generateStructures` is the same function, for callers that want the generated project. |
| D9 | A partition's `at` is measured from the opening's left face to the partition's left face, as a length or a fraction of the opening. Bays divide the opening's width equally after the partitions' thickness; each partition's position is worked out exactly and snapped once, half to even (Domain model, Units & precision), and a bay's width is the difference of the snapped faces, so shelves always meet partitions and bays differ by at most one grid step. Explicit shelf heights (`spacing` as a list) are the underside of each shelf measured from the case's bottom. |
| D10 | Joint types follow the structure; the shop decides the tool and what is missing through the machining setups (M2), and, for `shelfRoundover: "auto"`, which roundover bit is used. Templates: Bookcase, Keepsake box, Blank case, Blank box. |

## Consequences

- The bookcase and box structure forms reproduce the golden cut lists, sheets and setups with no
  3D tools; for any size, the form's cut list equals the hand-built project's (a property test).
- Known limits: a hand-made joint that names a generated board is not saved (the board is not in
  the file); applied back and sides-between-top/bottom are not built; per-copy detach of one shelf
  in a pattern belongs to the app (M4), detaching here is per part definition.

## After review

- Moving a form edit through detach freezes size, position and pattern as exact lengths; a board
  frozen shorter than a widened case no longer meets its side and is reported (`joint-no-contact`).
- Saving refuses a hand-made joint, match set, copy or pattern that names a generated board (typed
  error, says to detach the board); a hand-made copy of a generated board is kept while working.
- Rules added: `division-ignored`, `invalid-option`, `invalid-count`, `partition-outside-opening`,
  `bays-too-narrow`, `stock-name-unsupported`, `structure-stock-missing`, `generated-part-edited`,
  `detached-board-orphaned`, `detached-copy-stale`, `joint-dropped`, `unknown-option`,
  `roundover-no-bit`.
- Blank case and Blank box sizes are not given by the spec; their defaults are ours and untested.

## Proposed spec text (for the maintainer to adopt, change or reject)

These rules were chosen while building because the spec is silent. Each is written the way the
spec would say it, so adopting one is a copy and paste.

- **Partition position.** "A partition's position is measured from the opening's left face to the
  partition's left face, as a length or as a fraction of the opening's width. A fraction is snapped
  once, half to even."
- **Bays.** "N bays divide the opening's width equally after the thickness of N-1 partitions. Each
  partition's position is worked out exactly and snapped once; a bay's width is the difference of
  the snapped faces, so bays differ by at most one grid step and shelves always meet partitions."
- **Shelves at set heights.** "Each height is the underside of a shelf measured from the bottom of
  the case. The count is ignored when heights are listed."
- **Applied back.** "An applied back is as wide and as tall as the outside of the case, lies flat
  against the rear edges, and is not joined. Top, bottom and shelves are the full depth of the
  case. The case's depth is measured without the back."
- **Sides between top and bottom.** "Top and bottom are the full width of the case. Sides run
  between them, each end in a rabbet cut across the underside (or top) face of the top (or bottom),
  and are shorter by twice the rabbet depth's share of the overall height."
- **Rabbeted box corners.** "The front and back run between the sides, each end in a rabbet cut in
  the side's inner face; the sides run the full depth. Front and back are shorter than the box's
  length by twice the wall thickness."
- **Automatic roundover.** "`shelfRoundover: auto` takes the largest roundover bit the shop owns
  whose radius is at most half the board's thickness; with none, there is no roundover."
- **Detaching one copy.** "Detaching one copy of a repeated board makes it a board of its own where
  it is. The other copies stay where the full count puts them, and the board keeps its joints."
- **Saving a hand-made object that names a generated board.** "Saving refuses, and says which
  board to detach first, rather than writing a file that cannot be opened."

## Known limits

- A generated board edited by hand but not detached is replaced by the form's value without a
  warning: a warning cannot tell such an edit from a change to the form's own options. The app
  detaches before it edits (`detachPartIn`, `detachCopyIn`).
- Two structures in one project have no placement of their own and overlap at the origin until the
  app gives each an offset (M4).
- A detached copy keeps the shelf number it was taken from; if the row's count changes it is said
  to be stale (`detached-copy-stale`) and the row is made in full.
