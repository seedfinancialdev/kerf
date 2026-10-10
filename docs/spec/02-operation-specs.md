# Operation specs

Four operations cover both reference projects: dado (and its along-grain twin, the groove), rabbet, roundover and through dovetail. Each one is specified tightly enough that an agent can implement it and a test can prove it, with exact expected numbers from the reference projects.

## Shared rules

- **Removals, not meshes.** Every operation outputs a list of removal primitives in the part's local frame (axis-aligned box, trapezoid prism, quarter-round sweep), all with integer coordinates. The display mesh is the blank minus the union of removals; drawings and labels read the primitive list directly.
- **Deterministic.** The same inputs always produce byte-identical primitives, sorted by a fixed key.
- **Joints vs user operations.** Dado, rabbet and dovetail are joints between a host and a guest; their cuts are derived on every solve and never saved. Roundover is a user operation stored on the part.
- **Cut length.** Joints that seat a guest into a host add their depth to the guest's cut length (decision 3). Corner joints (dovetails) don't, because those parts are defined by outside dimensions.
- **Mirroring.** A mirrored instance gets the same primitives reflected across its local Y-Z plane; its cut list line is unchanged.
- **Validation levels.** *Error* blocks the solve and highlights the part; *warning* solves but shows a badge.

## Dado / groove

A rectangular channel in the host's face that a guest's end (dado) or edge (groove) seats into. A dado runs across the grain, a groove along it; the code is the same.

| Parameter | Default | Rule |
| --- | --- | --- |
| `depth` | host thickness ÷ 3, snapped down | Error if ≥ host thickness; warning if > host thickness ÷ 2 |
| `width` | guest thickness + `fit` | Tracks the guest's stock automatically |
| `fit` | 0 | Extra width for undersized plywood or a looser fit |
| `stop` | none (through) | Optional distance from `edge1` where a stopped dado ends |

- **Placement:** the channel sits where the guest's face planes cross the host face the guest touches. It spans the host's full width (through) or stops at `stop`.
- **Effect on guest:** cut length increases by `depth` at that end.
- **Errors:** guest not perpendicular to the host face; guest end outside the host face; two dados overlapping on the same host.
- **Allowed:** a dado crossing a rabbet on the same host (the removals simply union).

## Rabbet

An L-shaped step along a named end or edge of the host, on a named face.

| Parameter | Default | Rule |
| --- | --- | --- |
| `at` | from contact | `end0`, `end1`, `edge0` or `edge1`, plus `face0` or `face1` |
| `width` | guest thickness | Measured across the host face, from the named end or edge |
| `depth` | host thickness ÷ 2, snapped down | Error if ≥ host thickness |

- **Effect on guest:** cut length (end rabbet) or cut width (edge rabbet) increases by `depth`.
- **Errors:** width greater than half the host's width or length; guest not seated against the rabbet.

## Roundover (user operation)

A quarter-round profile removed along one or more edges, matching a roundover router bit.

| Parameter | Default | Rule |
| --- | --- | --- |
| `radius` | 1/8" | Error if > either adjacent dimension; if both edges of one face are rounded, their radii must sum to ≤ thickness |
| `edges` | none | List of `EdgeRef`, e.g. `edge1/face1` (front edge, show face) |

- **Effect on cut list:** none.
- **Display:** the arc is drawn with 8 segments in the mesh; drawings print "1/8" R" with a leader.
- **Warning:** a rounded edge that a joint fully hides.

## Through dovetail (corner joint)

Tails on the guest (tail board), pins on the host (pin board); both boards' ends are cut through their full thickness and finish flush.

| Parameter | Default | Rule |
| --- | --- | --- |
| `tails` | round(board width ÷ 1-1/2"), min 1 | Count of full tails |
| `slope` | 1:8 hardwood, 1:6 softwood | Allowed range 1:5 to 1:10 |
| `pin` | 1/4" | Narrow width of every pin, half-pins included; error below 1/8" |
| `proud` | 0 | Optional extra length so tails and pins stand proud for flush-trimming |

**Layout, in integers.** With board width W, tail count n, pin width p and mating thickness t:

1. Wide tail width = (W − (n + 1) × p) ÷ n.
2. Slope offset per side = t ÷ slope denominator (t ÷ 8 for 1:8).
3. Narrow tail width = wide tail width − 2 × slope offset.
4. If step 1 isn't on the 1/64" grid, snap it down and split the leftover equally between the two edge half-pins; an odd leftover unit goes to the `edge0` side.
5. Baseline on each board = the mating board's thickness, so unequal thicknesses work.

- **Effect on cut list:** none, apart from `proud` added to both boards.
- **Errors:** narrow tail width under 1/8"; boards not meeting at a right-angle corner; boards of different widths.

## Golden test: bookcase

Sides are 3/4" plywood (23/32" actual). Top and bottom sit in 1/4"-deep end rabbets; four shelves sit in 1/4" dados; the 1/4" back sits in 1/4"-wide × 3/8"-deep rabbets on the sides' back edges. Shelves get a 1/8" roundover on both front edges.

| Part | Qty | Visible | Cut (L × W × T) | Operations |
| --- | --- | --- | --- | --- |
| Side | 2 (one mirrored) | 72" × 12" | 72 × 12 × 23/32 | 2 end rabbets 23/32 × 1/4; 4 dados 23/32 × 1/4; back rabbet 1/4 × 3/8 |
| Top / bottom | 2 | 34-9/16" × 11-3/4" | 35-1/16 × 11-3/4 × 23/32 | Seated in end rabbets |
| Shelf | 4 | 34-9/16" × 11-3/4" | 35-1/16 × 11-3/4 × 23/32 | Seated in dados; roundover 1/8" on `edge1/face0` and `edge1/face1` |
| Back | 1 | 34-9/16" wide between sides | 72 × 35-5/16 × 1/4 | Seated in side rabbets |

**Expected cut list: 3 lines.** Top, bottom and shelves merge into one line of 6 (same stock and cut size; labels still tell them apart). Checks: 36 − 2 × 23/32 = 34-9/16; + 2 × 1/4 = 35-1/16; back 34-9/16 + 2 × 3/8 = 35-5/16.

**Resize checks:** at 30" wide, shelves become 28-9/16" visible and 29-1/16" cut, and dado depth stays 1/4". With shelf count set to 5, the merged line becomes 7.

## Golden test: keepsake box

Boards are 1/2" walnut, 4" wide (the box's height), with through dovetails at all four corners: tails on the sides, pins on the front and back. The bottom is 1/4" plywood in a 1/4" × 1/4" groove, 1/4" up from the bottom edge.

| Part | Qty | Cut (L × W × T) | Operations |
| --- | --- | --- | --- |
| Front / back | 2 | 10 × 4 × 1/2 | Pins both ends; groove |
| Side | 2 | 6 × 4 × 1/2 | Tails both ends; groove |
| Bottom | 1 | 9-1/2 × 5-1/2 × 1/4 | Seated in groove |

**Dovetail layout check (W = 4", n = 3, p = 1/4", t = 1/2", 1:8):** wide tail width = (4 − 4 × 1/4) ÷ 3 = 1"; slope offset = 1/2 ÷ 8 = 1/16"; narrow tail width = 7/8". All values sit exactly on the 1/64" grid.

**Bottom check:** interior 9" × 5" (10 − 2 × 1/2, 6 − 2 × 1/2), plus 2 × 1/4" groove depth = 9-1/2" × 5-1/2".

**Expected warning:** the groove exits through the board ends; on a through-dovetailed box it must land inside the bottom half-pin or it shows on the outside. The validator flags it if it doesn't.

## Test harness

- **Unit fixtures, per operation:** one part plus parameters → expected primitive list and cut dimensions as integers, stored as JSON.
- **Golden projects:** `bookcase.kerf` and `box.kerf` → expected cut list JSON (the tables above), compared exactly.
- **Property tests:** random valid parameters → the solve never throws, every mesh is manifold, and the cut list matches part data.
- **Rule:** a change that alters a golden file needs a deliberate fixture update in the same commit.
