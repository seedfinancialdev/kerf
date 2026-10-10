# ADR 014: M3 structures and shop

Status: accepted (maintainer rulings 2026-10-10, recorded below). Context: Build plan M3, Domain
model "Structures, openings & shop profile", Interaction spec sections 2-4.

## Decisions

| # | Decision |
| --- | --- |
| D1 | The form's field names (`carcaseStock`, `backStock`, `topBottom`, `back`, `dadoDepth`, `rabbetDepth`, `backRabbetDepth`, `shelfRoundover`, `wallStock`, `bottomStock`, `cornerJoint`, `bottom`, `grooveDepth`, `grooveOffset`, `grainWraps`) are official. Templates carry explicit depths; a blank form uses the spec's default rules (a third of the host for a dado, half for a rabbet). |
| D2 | Case backs built: `none` and `inset-rabbet`. `applied` and `sides-between` top/bottom warn `not-built-yet` and fall back; the spec gives no sizing rule for them. |
| D3 | A detached board keeps its joints, worked out from where it now sits. Only its size and position stop following the form. |
| D4 | Box corners: through dovetails only. Another `cornerJoint` warns `not-built-yet`. |
| D5 | Generated ids are derived from the structure's id and the part's role (`generatedId`), so regenerating gives the same ids and saved references to a detached board stay valid. |
| D6 | Every generated object carries its origin: `PartDef.source` (as the spec says) and, added here, `generatedBy` on instances, patterns, joints and match sets. This is how the saved file leaves them out. |
| D7 | `serializeProject` writes intent only: structures, hand-made parts, and detached parts with their placements and patterns. Generated parts, placements, patterns, joints and match sets are re-derived on load. |
| D8 | Generation runs inside every solve (`runPipeline`), so `solve()` accepts a project with structures directly. `generateStructures` is the same function, for callers that want the generated project. |
| D9 | A partition's `at` is measured from the opening's left face to the partition's left face, as a length or a fraction of the opening. Bays divide the opening's width equally after the partitions' thickness; each partition's position is worked out exactly and snapped once, half to even (Domain model, Units & precision), and a bay's width is the difference of the snapped faces, so shelves always meet partitions and bays differ by at most one grid step. Explicit shelf heights (`spacing` as a list) are the underside of each shelf measured from the case's bottom. |
| D10 | The shop does not change what is generated: joint types follow the structure, and the shop profile decides the tool and what is missing through the machining setups (M2). Templates: Bookcase, Keepsake box, Blank case, Blank box. |

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
  `detached-board-orphaned`, `joint-dropped`, `not-built-yet`.
- Blank case and Blank box sizes are not given by the spec; their defaults are ours and untested.
