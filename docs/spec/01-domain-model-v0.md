# Domain model v0

The file stores intent, never geometry. A project is parameters, stock, part definitions, instances, patterns, joints and user operations; everything else (joint cuts, cut sizes, meshes, the cut list) is derived on every solve and never saved.

## Decisions (signed off Oct 9, 2026)

1. **One internal integer unit for both systems:** 1 inch = 203,200 units, 1 mm = 8,000 units. Both 1/64" (3,175) and 0.01 mm (80) are exact, so imperial and metric never round each other.
2. **Axis-aligned parts only in the prototype.** Every part sits in one of 24 right-angle orientations. Angled and splayed parts are v2. This keeps positions exact integers.
3. **Guest length is shoulder-to-shoulder.** A shelf's length is the visible span between the sides; joints add their penetration to get the cut length. This matches how woodworkers think ("34-1/2" between sides, cut at 35"). The UI always shows both when they differ: "Length 34-9/16" · cut 35-1/16"". Corner joints (dovetails, box joints) are the exception: those parts are defined by outside dimensions, and cut length equals that length.

## Units & precision

- **Storage:** every length, position and offset is an integer in internal units (above). No floats are ever saved.
- **Arithmetic:** parameter expressions evaluate in exact rationals (numerator/denominator), so `3/4" / 3` stays exact until the final step.
- **Snapping:** each result snaps to the project grid, 1/64" (imperial) or 0.01 mm (metric), rounding half to even. Snapping happens once, at the end of evaluation.
- **Merging:** two parts are "identical" when their integers are equal. No tolerance comparisons anywhere.
- **Display:** imperial shows reduced fractions (23/32"), whole inches with fractions (34-1/2"), or feet-inches above 96" if the user opts in. Metric shows mm to 0.1 by default.
- **Angles:** dovetail slopes are stored as ratios (1:6, 1:8), not degrees. Orientations are one of 24 right-angle rotations, stored as an index.

## Part axes & naming

Every part is a rectangular blank in its own local frame, so operations can name faces that survive any resize.

| Local axis | Meaning | Face names |
| --- | --- | --- |
| X | Length, always along the grain | `end0` (−X), `end1` (+X) |
| Y | Width | `edge0` (−Y), `edge1` (+Y) |
| Z | Thickness | `face0` (−Z, inside/back), `face1` (+Z, outside/show) |

Operations reference faces and edges by these names plus offsets measured from a named face. Because the blank is always a box, there is no topological naming problem: `edge1` is always the front edge, however the part is resized.

## Entities

```ts
type Id = string;            // ULID, stable, never reused
type Len = number;           // integer internal units (1in = 203200)
type Expr = string;          // "interior_w + 2*dado_d", "36in", "23/32\""

interface Project {
  schemaVersion: 1;
  name: string;
  units: "imperial" | "metric";         // display + snap grid
  planingAllowance?: Len;               // per face, for bookmatch composites; default 1/16"
  params: Param[];
  stock: Stock[];
  parts: PartDef[];
  instances: Instance[];
  patterns: Pattern[];
  joints: Joint[];
  matchSets: MatchSet[];
  structures: Structure[];              // woodworker-first layer, see below
}

interface Param { id: Id; name: string; expr: Expr; kind: "length" | "count" | "ratio"; }

interface Stock {
  id: Id; name: string;                 // "3/4 Baltic birch", "4/4 walnut"
  kind: "sheet" | "solid" | "dimensional";
  thickness: Len;                       // actual, e.g. 23/32"
  sheet?: { length: Len; width: Len; grain: "along-length" | "none" };
  solid?: { standardLengths: Len[]; maxWidth: Len };
  allowance: { length: Len; width: Len };  // rough size = finished + allowance
  price?: { per: "sheet" | "boardFoot" | "linearFoot"; cents: number };
}

interface PartDef {
  id: Id; name: string;
  stock: Id;
  length: Expr;                         // shoulder-to-shoulder (see decision 3)
  width: Expr;
  thickness?: Expr;                     // default: stock.thickness
  grainLocked: boolean;                 // nesting may not rotate this part
  ops: UserOp[];                        // roundovers etc.; joint cuts are derived, not stored
  notes?: string;
}

interface Instance {
  id: Id; def: Id; name?: string;
  position: { x: Expr; y: Expr; z: Expr };  // in parent assembly frame
  orientation: number;                  // 0-23, right-angle rotations
  mirrored: boolean;                    // left side = mirrored right side
  parent?: Id;                          // assembly instance, optional
}

interface Pattern {                     // "4 shelves evenly between top and bottom"
  id: Id; source: Id;                   // instance to repeat
  count: Expr;                          // kind "count"
  axis: "x" | "y" | "z";
  spacing: { mode: "fixed"; step: Expr } | { mode: "distribute"; from: Expr; to: Expr };
}

interface MatchSet {                    // design intent that overrides waste-minimizing nesting
  id: Id; name: string;
  type: "continuousGrain" | "bookmatch" | "sameBoard";
  members: Id[];                        // instance ids, in order (order matters for continuousGrain)
  axis?: "length" | "width";            // continuousGrain: end-to-end or side-by-side
}

interface Joint {
  id: Id; type: "dado" | "rabbet" | "throughDovetail";  // prototype set
  host: Id; guest: Id;                  // instance or pattern ids
  params: Record<string, Expr>;         // per-type, see Operation specs
}

type UserOp =
  | { id: Id; type: "roundover"; edges: EdgeRef[]; radius: Expr };

type EdgeRef = `${"end0"|"end1"|"edge0"|"edge1"}/${"face0"|"face1"}`;  // e.g. "edge1/face1"
```

A joint between patterns expands to one joint per pattern member at solve time, so "shelves in dados" is one joint, not eight.

## Structures, openings & shop profile (woodworker-first layer)

A thin layer on top of the part graph. Structures and divisions are generators: on every solve they emit ordinary parts, instances, patterns, joints and match sets, which then flow through the same pipeline. Nothing below this layer changes.

```ts
interface Structure {                   // a case, a box; table base, frame, drawer in v1
  id: Id; type: "case" | "box";
  size: { w: Expr; h: Expr; d: Expr };  // overall dimensions, the source of truth
  options: Record<string, Expr | string | boolean>;  // form fields, e.g. back: "inset-rabbet"
  openings: Opening[];                  // a case starts with one opening = its interior
}

interface Opening {
  id: Id;
  division?:                            // empty opening if absent
    | { type: "shelves"; count: Expr; spacing: "even" | Expr[] }
    | { type: "partition"; at: Expr }   // creates two child openings
    | { type: "bays"; count: Expr };
  children: Opening[];
}

interface ShopProfile {                 // per user, not per project; projects reference it
  kerf: Len;
  sheetTrim?: Len;                      // edge trim on sheet goods; default 0
  solidTrim?: Len;                      // trim at each end of rough solid stock; default 1/2"
  minOffcut?: Len;                      // smallest offcut worth keeping; default 6"
  tools: Array<
    | { type: "dadoStack"; maxWidth: Len }
    | { type: "router"; straightBits: Len[]; roundoverBits: Len[] }
    | { type: "handTools"; dovetails: boolean }
  >;
}

interface Template {                    // a starting point: a structure plus default options
  id: Id; name: string;                 // "Bookcase", "Keepsake box"
  structure: Omit<Structure, "id">;
  params: Param[];
}
```

- **Generated parts carry their source:** `PartDef.source = { structure: Id, role: "side" | "shelf" | … }`; the instances, patterns, joints and match sets a structure generates carry `generatedBy` with the same shape, so the saved file can leave them out.
- **Detaching:** editing a generated part by hand sets `detached: true` on it; the generator then leaves that part alone and says so in the inspector. Undo re-attaches.
- **Joint choice:** a generator asks the joinery rules for the best joint given the contact and the shop profile; the user's override is stored on the structure, so regeneration keeps it.
- **Saved:** structures, openings and overrides are saved (they are intent). The parts they generate are derived and not saved, except detached ones, which become ordinary saved parts.

## Parameter expressions

- **Literals:** `36in`, `36"`, `3/4"`, `23/32in`, `1-1/2"`, `18mm`, `4`; a bare number is a count or ratio, never a length.
- **Operators:** `+ - * /`, parentheses, unary minus.
- **References:** parameter names (`shelf_count`), part properties (`side.thickness`, `shelf.length`), stock properties (`stock["3/4 ply"].thickness`).
- **Functions:** `min`, `max`, `round`, `floor`, `ceil`.
- **Type rules:** length ± length = length; length × count = length; length ÷ length = ratio; anything else is an error shown on the field.

## Solve pipeline

Each edit runs steps 1-6 synchronously (budget under 100 ms on the reference bookcase); step 7 runs asynchronously and may lag a frame.

1. **Parameters:** build a dependency graph, topologically sort, evaluate in rationals. A cycle is an error that names every member of the cycle.
2. **Parts:** evaluate each definition's length, width and thickness, then snap.
3. **Instances & patterns:** evaluate positions, expand patterns into concrete instances.
4. **Joints:** expand pattern joints, compute each joint's derived cuts on host and guest in their local frames, and add guest penetration to cut length.
5. **Validation:** fit checks (dado deeper than half host thickness, tenon thicker than half host), overlaps between parts not joined, and zero or negative dimensions.
6. **Outputs:** cut list and nesting input, pure functions of steps 1-5.
7. **Display mesh:** Manifold booleans per part definition, cached by definition hash.

## Invariants (each one is a test)

- Every saved length is an integer; no floats anywhere in `project.json`.
- The saved file contains no derived data: no joint cuts, cut sizes, meshes or cut lists.
- Load → save is byte-identical (canonical JSON key order).
- The cut list is a pure function of `project.json`.
- Cut-list grouping key = stock + cut length + cut width + thickness, and nesting minimizes waste across all parts. Match-set members are the only exception: they stay together, in order, and nest as one unit. Labels and drawings still tell definitions apart.
- Mirroring never changes a part's cut list line, only its placement and which face its cuts land on.
- Two instances of one definition always have identical cuts. If a new joint would make them differ, the definition is split automatically and the user is told.

## `.kerf` file

A zip with `project.json` (the model above), `meta.json` (schema version, app version, created/modified, plan license if published) and `thumbnail.png`. Loading migrates older schema versions forward; the app never writes an older version.

## Out of the prototype

Angled parts, curved 2D profiles, assemblies beyond one level, edge banding, tapers, hardware and finish fields. Each is an additive schema change, so none forces a rewrite.
