# ADR 013: M2 joinery and outputs

Status: Accepted (maintainer approved decisions D1-D9 on the M2 plan, 2026-10-10)

## Context

M2 turns the part graph into joints, a cut list, sheet and board layouts, and machining setups
(Operation specs; Cut list & nesting). The specs fix the numbers for the two reference projects
and leave the mechanics open. This record fixes the mechanics, and the places where the
implementation reads the spec more narrowly or more broadly than its text.

## Decisions

| # | Decision |
| --- | --- |
| D1 | Reference fixtures place parts at the shoulder (Decision 3). A `FIXTURE:` change corrected position expressions only. |
| D2 | A mirrored instance is reflected across its local Y-Z plane (which flips its length). The left side therefore uses orientation 23 so its inside face is `face0`. |
| D3 | Removal primitives: `box { min, max }`; `trapezoidPrism { plane, points, range }`; `quarterRoundSweep { edge, radius }`. All integers, in the part's definition space, sorted by a fixed key. *Clarification of the proposal:* the prism carries its plane (`xy`, `xz` or `yz`) because the pin board's sockets lie in the thickness-width plane while the tail board's spaces lie in the length-width plane. |
| D4 | The contact patch decides the joint: a patch reaching a host end or edge, sized by the guest's thickness, is a rabbet; otherwise a dado (a groove when it runs along the grain); two boards overlapping at a right-angle corner are a through dovetail. |
| D5 | Overlap of parts that are not joined is an error (`overlap`). |
| D6 | Cut-list lines are ordered by first appearance in the project's part list; match-set blocks are separate. |
| D7 | Instances of one definition that would get different cuts are tracked as separate derived definitions, with an `info` diagnostic. The saved project is unchanged. |
| D8 | Hand-cut dovetails appear as one `handTools` setup, counted per joint. No golden asserts it. |
| D9 | The display mesh is built in M2 with `manifold-3d`; `isManifold` checks the triangles themselves. |

## How the specs were read

- **Dado/groove:** depth defaults to host thickness / 3 snapped down; width = guest thickness +
  `fit`; the channel spans the host's full run unless `stop` is given. `stop` is measured from the
  far end (`edge1` for a run across the width, `end1` along the length), which is the front.
  A dado deeper than half the board is a warning; at or beyond the full thickness an error.
  The guest end must fill the patch exactly; otherwise `dado-outside-face`.
- **Rabbet:** default depth is half the thickness snapped down; width defaults to the guest's
  thickness; an end rabbet may not be wider than half the length, an edge rabbet half the width.
- **Roundover:** radius at most the thickness and the dimension along the edge; radii on one face,
  or on both faces of one edge, must together fit the thickness. The "both edges of one face"
  wording in the spec is applied literally, and the same limit is applied to both faces of one edge.
- **Dovetail layout:** wide tail snapped down to the grid; leftover grid steps go to the two
  edge half-pins, an odd step to `edge0`; slope offset = mating thickness / slope, snapped to the
  grid. The default slope is 1:8 because the spec's "hardwood / softwood" cannot be decided from
  stock data. Tail count defaults to round(width / 1-1/2") with ties to even, at least 1.
  `proud` is added to both boards.
- **Groove half-pin warning:** the groove must lie within the half-pin nearest its edge, measured at
  the shallowest depth the groove reaches on the pin board and at the tip on the tail board.
  The rule id is `groove-outside-bottom-half-pin`.
- **Cut sizes:** visible (shoulder-to-shoulder) size plus what joints add at each seated end or
  edge. Corner joints add nothing but `proud`.
- **Sheet nesting:** guillotine strip packing. Candidate layouts come from three orientation modes
  and three orderings; the best is chosen by fewest sheets, then largest usable offcut, then fewest
  cuts; ties go to the earliest candidate. Crosscut steps are listed once per distinct pattern. An
  offcut counts when both sides are at least 6". `count` is the number of offcuts of the largest
  size.
- **Solid stock:** rough size = cut size + allowance; 1/2" trim at each end; first-fit
  decreasing tried with the shortest-fit and longest-then-shrink strategies, fewest boards first.
- **Match sets:** continuous grain on solid stock gets its own board: composite length = members
  (with allowance) + kerfs + trim at each end; `minBoardLength` is that length rounded up to a whole
  inch (the spec's "at least 34"" for 33-3/8"). On sheet goods the composite is one strip.
  Same-board sets must fit one sheet or board. **Bookmatch is not solved**: its planing allowance
  is not defined in the spec, so it warns (`not-solved-yet`) and nests as ordinary parts.
- **Machining setups:** keyed by tool, cut width, cut depth (and bit). A dado stack is used when
  its maximum width allows the cut, otherwise a router with a straight bit no wider than the cut,
  otherwise the setup is kept and marked `missing`.

## Rulings made while fixing review findings (maintainer to confirm)

Independent review found defects in the first M2 implementation; the fixes made these calls.

- **Error blocks the solve.** `solve` returns `blocked: true` whenever any error exists, and the
  cut list, layouts and setups are withheld when the error is in the assembly (steps 1-5). A
  layout or shop error (a part larger than the sheet, an invalid shop profile) is reported without
  withholding the cut list. Warnings and info never block. `buildCutList`, `nest` and
  `machiningSetups` follow the same rule and never throw; `solve` is how to learn why one is empty.
- **The shop profile is validated** (`invalid-shop`): kerf a whole number of units from 0, and every
  tool well-formed.
- **Diagnostics are bounded.** The same problem on the same field is reported once with a `count`;
  no rule lists more than 25 entries; joint-level reports show the first 5 then "and N more".
- **Joints between patterns find touching pairs with a sweep**, not every host against every
  guest, so a 10,000 x 10,000 pattern joint stays tractable. A guest nothing joined and nothing
  explained gets one aggregated `joint-no-contact`.
- **Match sets nest as one unit and the rest pack around them:** other solid-stock parts may share a
  match set's board (`alsoOnBoard`), and other sheet parts share a same-board set's sheet. A
  continuous-grain set with `axis: "width"` is laid side by side. On sheet goods each member is
  placed and labelled "n of m".
- **A match-set member may not be the source of a pattern, and an instance may be in one set only**
  (rejected when a file is read), because the copies of a repeated member cannot be listed.
- **Rabbet `at` and `face`** may name where the rabbet goes; they must agree with where the guest
  sits. A rabbet is seated when the guest's footprint lies inside the step and its face is against
  the shoulder: the step may be wider than the guest (for example a 1/4" back in a 3/8" rabbet)
  but never narrower, and a gap at the shoulder means the guest is not seated.
- **Roundover radius rule:** two opposite edges of one face, or both faces of one edge, may not
  together exceed the thickness. Four rounded edges on a face are not a violation.
- **Dovetail pin-board sockets are mapped into the pin board's own width direction**, which can be
  the reverse of the tail board's; the groove warning uses the matching half-pin.
- **Solving reads the validated copy of the project**, not the object passed in.
- **Setups list the parts they cut and how many cuts each takes.** A cut-list line says
  `visibleVaries` when merged parts have different visible sizes.

Spec wording to fix rather than code: the spec says a rabbet adds to "cut length (end rabbet) or
cut width (edge rabbet)"; the implementation adds to whichever dimension of the guest is seated,
which agrees with the spec on both reference projects and is physically right when a guest's end
sits in an edge rabbet.

## Further rulings from the second review pass (maintainer to confirm)

- **Work is bounded.** A joint between patterns that would pair more than 100,000 touching
  host/guest parts is one error (`joint-too-many-pairs`) instead of an enormous run; the overlap
  check stops after a million touching pairs. Both say the parts are probably overlapping.
- **Pattern joints say what is wrong, once.** A failing guest is counted once whether its message
  was shown or folded into "and N more"; a guest that passes through another part is reported as
  an `overlap`, not as "does not touch".
- **Same-board sets are checked for fit member by member**, turning an unlocked member that fits
  only the other way; a member that fits neither way is `match-set-too-large`.
- **Two match sets may share one solid board** when they fit with a kerf between them. Each set
  keeps its own layout; when a board carries several sets each layout names `boardIndex`.
- **A composite blank is cut out, then divided.** The cut sequence lists the blank's crosscut (or
  rip) first and then the crosscuts (or rips) that divide it into members; counts of cuts include
  them. The spec describes the blank but not the division, so this is the physical reading.
- **Stock sizes are bounded** like every other length (100,000 in) when a file is read.
- **The shop profile is read once into a plain copy** and that copy is validated and used, so a
  profile that changes between reads, or throws, is reported as `invalid-shop`.
- **`nest` and `machiningSetups` are `solve(...)` projections**; they cannot disagree with it.
- **The display mesh refuses unknown cuts** (an unknown kind or plane, non-whole coordinates) with
  a `MeshError`, because the input arrives by type only.

## Not in M2

- Per-stock totals (sheets, board feet, linear feet), the shopping and milling lists, setup
  checklists, offcut inventory (needs fields the schema does not have; build plan data, M5).
- Adjustable edge trim and minimum offcut: they are constants (sheet 0, solid 1/2" per end,
  6") because the project and shop schema have no field for them. The spec says both adjustable.
- Bookmatch (planing allowance undefined, issue #42), nested assemblies (`Instance.parent` warns).

## Consequences

- The bookcase and box golden JSON match exactly; 1,000-run property tests hold, including that
  every display mesh is manifold and every part is placed exactly once.
- The "solve in under 100 ms" benchmark is gated from M2, not M4, so a regression is caught early.
- Not covered: offcut inventory, bookmatch, nested assemblies (`Instance.parent` warns).
