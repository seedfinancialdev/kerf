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

## Consequences

- The bookcase and box golden JSON match exactly; 1,000-run property tests hold, including that
  every display mesh is manifold and every part is placed exactly once.
- The "solve in under 100 ms" benchmark is gated from M2, not M4, so a regression is caught early.
- Not covered: offcut inventory, bookmatch, nested assemblies (`Instance.parent` warns).
