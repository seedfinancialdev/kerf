# Cut list & nesting

Default rule: group identical parts and nest everything to minimize material. Design intent (continuous grain, bookmatch, same board) is the only thing that overrides it, and only when the user marks parts as a match set.

## Decision: write our own optimizer, use OpenCutList as the benchmark

We implement a standard guillotine bin-packing heuristic in TypeScript rather than porting OpenCutList. OpenCutList's engine is Ruby, tied to SketchUp's data model, and currently being rewritten in C++; our version needs integer units, grain locks and match sets built in from the start. **Known pattern, flagged:** guillotine packing with multi-start heuristics is textbook; the value is in the woodworking constraints around it, not the algorithm. OpenCutList's results on the reference projects are the bar to match or beat.

## Inputs

- **Parts:** from the solved part graph. Sheet goods use finished cut size; solid stock uses rough size (cut size + stock allowance).
- **Stock to cut from:** standard sheets (default 96" × 48"), standard board lengths for solid stock, plus optional inventory (sheets, boards and offcuts on hand), which is always used first.
- **Kerf:** default 1/8", set per project.
- **Edge trim:** default 0 for sheet goods, 1/2" per end for rough solid stock; both adjustable in the shop settings (`sheetTrim`, `solidTrim`).
- **Grain:** a part with `grainLocked` keeps its length along the sheet's grain; unlocked parts may rotate 90°. Plywood face-grain parts default to locked; MDF and melamine default to unlocked.
- **Match sets:** see below.

## Optimization order

1. **Fewest sheets or boards.** Material cost is the user's real cost.
2. **Largest usable offcut.** Waste concentrated in one big piece is reusable; the same waste in slivers isn't. Minimum useful offcut defaults to 6" × 6" and is adjustable in the shop settings (`minOffcut`).
3. **Fewest cuts.** Less saw time, fewer errors.

- **Guillotine only:** every cut runs edge to edge, so layouts work on a table saw, track saw or panel saw. Free-form CNC nesting is v2.
- **Deterministic:** a fixed seed, so the same project always produces the same layout.
- **Budget:** runs off the main thread, debounced after edits; under 1 second for 100 parts.

## Match sets: when design beats waste

| Type | Example | How it nests |
| --- | --- | --- |
| Continuous grain | Drawer fronts across a dresser; a box whose grain wraps all four corners | Members become one composite blank: lengths (or widths) in order, plus kerfs between, cut from one board or one strip of a sheet |
| Bookmatch | Two door panels mirrored from one resawn board | Composite thickness = 2 × part thickness + kerf + 4 × planing allowance (the allowance is per face; a pair has 4 faces; project setting, default 1/16"); one board, members flagged as a mirrored pair |
| Same board | Every part of a small tabletop from one board for color match | Members must come from one board or sheet; order is free |

- A match set nests as one unit, then the rest of the parts pack around it to minimize waste as usual.
- If a match set can't fit any available stock, the solve shows an error naming the set and the stock size it needs.
- The cut list shows match sets as a block with sequence numbers (1 of 4, 2 of 4…) and the label carries the same number, so parts stay in order through milling.

## Outputs

- **Cut list:** one line per group (stock, cut L × W × T, quantity, part names), match sets as numbered blocks. Totals per stock: sheets, board feet (rough L × W × nominal thickness ÷ 144), linear feet.
- **Sheet layouts:** one diagram per sheet or board, to scale, with every part labeled, the cut sequence numbered (rips first, then crosscuts), offcuts outlined with sizes, and efficiency %.
- **Shopping list:** what to buy, net of inventory.
- **Formats:** JSON (the canonical output, used by the tests), vector PDF (print-all in one file), CSV.

## Machining by setup

Every derived cut is grouped by identical tool setup, so each setup is made once and every cut on it happens together, the way a shop works.

- **Setup key:** tool (from the shop profile) + cut width + cut depth (+ bit for profiles). A dado and an end rabbet with the same width and depth share a setup.
- **Order:** setups follow the cut list order (sheet goods first), then edge profiles last, since roundovers come after joinery.
- **Each setup lists:** the tool and its exact setting, the parts and how many cuts, and a checklist the user can tick in the shop.
- **Missing tool:** a joint the shop profile can't make still gets a setup, labeled with the tool it needs.

**Golden: bookcase, shop profile with a dado stack and a router**

| Setup | Tool & setting | Cuts |
| --- | --- | --- |
| 1 | Dado stack 23/32" wide, 1/4" deep | 12: 8 shelf dados + 4 end rabbets for top and bottom, on the 2 sides |
| 2 | Dado stack 1/4" wide, 3/8" deep | 2: back rabbets on the 2 sides |
| 3 | Router, 1/8" roundover bit | 8 edges: 2 front edges on each of 4 shelves |

## Golden test: bookcase

3/4" plywood (96" × 48" sheets), 1/8" kerf, grain locked, no trim.

| Sheet | Contents | Cut sequence | Largest offcut |
| --- | --- | --- | --- |
| 3/4" #1 | 2 sides (72 × 12), 4 shelves (35-1/16 × 11-3/4) | Rip 12, 12, 11-3/4, 11-3/4 strips (47-7/8" incl. kerfs); crosscut sides at 72; crosscut two shelves per narrow strip | 25-5/8" × 11-3/4" (two, from the shelf strips) |
| 3/4" #2 | 2 shelves | Rip one 11-3/4 strip; crosscut two shelves | 36-1/8" × 96" |
| 1/4" #1 | Back (72 × 35-5/16) | Rip 35-5/16; crosscut 72 | 12-9/16" × 96" |

**Expected:** 2 sheets of 3/4" and 1 sheet of 1/4". No grain-locked layout fits the 3/4" parts on one sheet: six shelves need three strips of 11-3/4" plus two 12" side strips, 59-1/4" of width on a 48" sheet. Efficiency on the 3/4" is about 46%, with most of the waste in one 36" × 96" reusable offcut, which is exactly what rule 2 is for.

## Golden test: keepsake box (match set)

The front, side, back and side are a continuous-grain match set in that order, so the grain wraps around the box.

- **Composite blank:** 10 + 6 + 10 + 6 = 32", plus three 1/8" kerfs, plus 1/2" trim each end = 33-3/8" × 4" (+1/4" width allowance).
- **Expected:** all four parts consecutive, in order, on one 4/4 walnut board at least 34" long; labels numbered 1-4 of 4.
- **Contrast test:** remove the match set and the optimizer may reorder or split the parts across boards to save material. Both results must be valid; only the match-set version guarantees the wrap.

## Out of the prototype

Offcut inventory tracking across projects, defect zones on boards, free-form CNC nesting, glue-up panel planning (boards edge-joined to width), and cost optimization by price rather than sheet count.
