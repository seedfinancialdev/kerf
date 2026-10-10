# M3 plan: structures and shop

Build plan, M3: "Case and box generators, openings, templates, shop-profile proposals, detach".
Acceptance: "Bookcase template -> form -> golden outputs with no 3D tools used." Core only; the
form screens are M4.

## What gets built

1. **`generateStructures(project, shop)`**: reads `project.structures` and returns a project whose
   parts, instances, patterns, joints and match sets include everything the structures generate.
   Pure and deterministic; the same project and shop always give the same ids and order.
2. **Case generator**: two sides (the left one mirrored), top and bottom, a back, and the openings
   inside. Top and bottom go between the sides (or the sides between them). Shelves, partitions and
   bays are divisions of an opening and nest (a partition makes two child openings).
3. **Box generator**: four walls with through dovetails at the corners, a plywood bottom in a
   groove, and "grain wraps the corners" creating the continuous-grain set.
4. **Joint proposals from the shop**: each joint is the best one the shop's tools can make
   (dado stack, else a straight bit, else the joint is still proposed and the tool you would need
   is listed). Roundover radii come from the router bits you own.
5. **Detach**: editing one generated board by hand marks only that board `detached`; the
   generator leaves it alone and keeps saying so. Re-attaching is the inverse (undo is the app's).
6. **Templates**: Bookcase, Keepsake box, Blank case, Blank box as data.
7. **Saved file**: structures, openings and overrides are saved; generated parts are not, except
   detached ones, which become ordinary saved parts. Load -> save stays byte-identical.
8. **Resize**: changing a structure's size or a division count regenerates with joinery and
   thickness kept true (the 30" and 5-shelf goldens in `bookcase/expected/resize.json`).

## Order of work (test first, as before)

1. Form field names and the generated-id scheme (ADR 014).
2. Case generator without divisions -> sides, top, bottom, back and their joints.
3. Shelves: even spacing becomes a distribute pattern; goldens (cut list, sheets, setups) match.
4. Partitions and bays.
5. Box generator, grain wrap, groove.
6. Shop proposals and "tool you would need".
7. Detach and re-attach; saved-file rules.
8. Templates; resize goldens; property tests (generation is deterministic, never throws, every
   generated project is valid, resize keeps every dado to its host's thickness rule).
9. Audit with all milestones active, independent reviews, PR.

## Decisions (maintainer, in plain language)

- D1: the form's field names become official; depths: templates carry explicit depths, blank
  forms use the spec's default rules.
- D2: back styles built now.
- D3: what a detached board's joints do.
- D4: box corner joints built now.
