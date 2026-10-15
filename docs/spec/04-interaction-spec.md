# Interaction spec

Woodworkers start from what they're building, not from geometry. The workflow follows the shop: pick a project, size it, shape it with a form, divide the openings, let your tools choose the joinery, then get a build plan. Free 3D editing is the escape hatch, not the main road.

## Who it's for

A hobbyist with a table saw and a router who has never used CAD. Everything is in shop language and nothing needs 3D skills to reach a correct cut list. SketchUp users still feel at home: navigation and the type-anywhere Measurements box work the same.

## The workflow

1. **New project:** from Home, a template or a blank project, sized by its overall dimensions or the space it must fill (ADR 016).
2. **Shape:** a form sets the construction (materials, how the top meets the sides, back style, corner joints). The form builds the 3D model.
3. **Divide:** click an empty opening and add shelves, partitions or bays.
4. **Joinery:** the app proposes joints you can actually make with the tools in your shop profile.
5. **Tweak:** edit any board directly in 3D when the form doesn't cover it.
6. **Build plan:** shopping list, cut list, sheet layouts, machining grouped by tool setup, assembly order.

## 1. New project: templates & overall size

- **New project** (from Home) shows template cards: Bookcase, Cabinet, Box, and Blank (an empty project, a plain case, a plain box); Table and Dresser are shown as later. A live 3D preview follows the sizes. Units are chosen per project.
- **Overall size first:** width, height, depth (or length, width, height for boxes). Every part is defined relative to these, so resizing works from the start.
- **Space to fill:** type the opening and a gap (default 1/8"); the piece is the space less a gap at each side and at the top (ADR 016, D6).
- **Known pattern, flagged:** template-plus-form is how cabinet software (Mozaik, Cabinet Vision) works. Bringing it to general furniture for hobbyists, with every board still editable, is the differentiator.

## 2. Shape: the structure form

A structure is a woodworking assembly with its own options; it generates real boards and joints, and the form stays the source of truth until a board is edited by hand.

| Structure | Form fields (prototype) | Later |
| --- | --- | --- |
| Case | Overall W × H × D; carcase stock; top/bottom between sides or sides between top/bottom; back: none, inset in rabbets, or applied; back stock | Face frame, toe kick, adjustable shelves (v1) |
| Box | Outside L × W × H; wall stock; corner joint; bottom: in a groove; grain wraps the corners (on/off) | Lids, dividers (v1) |
| Table base, frame, drawer, door | Not in the prototype | v1 |

"Grain wraps the corners" creates the continuous-grain match set automatically; the user never sees the term "match set."

## 3. Divide: openings

An opening is the empty space inside a structure. Click one and choose:

- **Add shelves:** count, evenly spaced or at set heights.
- **Add partition:** a vertical divider at a measurement or a fraction ("1/3 from the left"), creating two new openings.
- **Split into bays:** N equal vertical sections.

Each division generates its boards and joints through the shop profile. Drawers and doors in openings are v1.

## 4. Joinery from your shop

The shop profile is set once, on first launch, as a short checklist: table saw (blade kerf), dado stack (max width), router with straight bits (sizes), roundover bits (sizes), and hand tools for dovetails. Pocket-hole and dowel jigs come in v1 with those joints.

- **Proposals:** for each joint the app proposes the best one you can make. Shelves get dados if you own a dado stack or a straight bit; otherwise the app shows what you'd need.
- **Sizes fit your tools:** a dado for 23/32" plywood is set up as a 23/32" dado stack, or as an undersized bit plus a second pass. Roundover radii come from the bits you own.
- **Override any time:** you can still pick a joint your shop can't make; the build plan then lists the tool you'll need.
- **Uncommon in hobby tools:** tool-aware joinery is a real differentiator, not a known pattern.

## 5. Tweak in 3D (escape hatch)

Select, Board, Push/Pull, Move/copy, Join, Edge profile and Tape, one click away instead of the main path (reference table below). Editing a board that a form generated detaches only that board, with a notice ("Shelf 3 is now custom; the form won't change it") and full undo. Keys stay SketchUp-compatible; E is deliberately unassigned (SketchUp's eraser).

## 6. The build plan

The output is a plan for the shop, in the order work happens:

1. **Shopping list:** sheets, board feet and hardware to buy, net of what's on hand.
2. **Milling list (solid wood):** rough sizes to joint, plane and rip.
3. **Cut list & sheet layouts:** as specified in the cut list tab.
4. **Machining by setup:** every operation grouped by identical tool setup, so each setup happens once. Example: "Dado stack 23/32", 1/4" deep: 12 cuts."
5. **Edge profiles by bit.**
6. **Assembly order:** comes from the structure in the prototype (case: dry-fit, glue carcase, square it, fit back last). General assembly planning is v2.

## Shop language

| Never shown | Shown instead |
| --- | --- |
| Face, vertex, mesh | Show face, inside face, front edge, end |
| Component, instance | Part, copy |
| Material | Stock ("3/4" Baltic birch") |
| X / Y / Z | Length, width, thickness |
| Extrude, boolean, subtract | Nothing; these happen silently |
| Invalid geometry | "This part can't be built: the dado is deeper than half the side" |

## Design direction: a pro tool that doesn't scare people

Between consumer and utilitarian, modeled on Lightroom more than Photoshop: a calm, dark workspace where the project is the hero and the panels are dense but labeled.

**Borrow from Lightroom and Photoshop**

- **Workflow modules:** Lightroom's Library → Develop → Print maps onto Shape → Divide → Joinery → Build plan, shown as named modules in the top bar; Home plays Lightroom's Library (ADR 016, D2). Each module rearranges the panels for its job.
- **Non-destructive by design:** like Lightroom, edits are instructions, not baked changes. Our part graph already works this way; the UI should make that felt (change anything, any time, nothing breaks).
- **Neutral chrome, content first:** dark gray UI by default so the wood-toned model stands out; a light theme as a setting. Color only for selection, active state and errors.
- **Accordion panels:** the right panel stacks collapsible sections (Size, Construction, Back, Joinery), like Lightroom's Develop panel. Sections remember their open state.
- **Scrubby fields:** drag a field's label left or right to change a dimension, as in Photoshop; click to type an exact value. Values snap to the 1/64" grid with fractions shown.
- **Presets:** templates and shop profiles behave like Lightroom presets: pick one, see the result, adjust.
- **History panel:** a readable list of every change ("Added 4 shelves," "Width 36" → 30""), click any entry to step back, like Photoshop's History.

**Deviate where they lose woodworkers**

- **Icons always carry text labels.** Photoshop's icon-only toolbar is a wall for non-technical users; a compact icon-only mode is a later setting.
- **Fewer panels, progressive disclosure.** Advanced options (fit allowance, slope ratio, kerf) sit behind "More" in each section, never on first view.
- **No floating windows.** Panels dock in fixed places so nothing gets lost.

**Visual system**

- **Type:** the system UI font at 12-13 px in panels, tabular numerals for every dimension so columns line up.
- **Tokens from day one:** colors, spacing and type defined as design tokens, so the light theme and later branding are a token swap, not a redesign.
- **Viewport:** soft studio lighting, subtle wood-grain textures per species, visible grain direction on hover. No gradients, glow or skeuomorphic chrome.

## Screen layout

- **Toolbar:** workflow steps (Shape, Divide, Joinery, Build plan) on the left; the 3D tools grouped on the right.
- **Project tree (left):** structures, their openings, then parts with counts. Errors show as badges.
- **Viewport (center):** the model; click an opening to divide it, click a part to see its joints.
- **Inspector (right):** the selected structure's form, an opening's divide options, or a part's properties ("Length 34-9/16" · cut 35-1/16"").
- **Build plan drawer (bottom):** Shopping, Cut list, Sheets, Setups, Assembly, live on every edit.

&#91;embedded content: main window wireframe · bookcase with shelves selected\]

With the case selected, the inspector shows its form; the drawer's Setups tab already groups the machining.

## Core flow: the bookcase in 6 steps

This is the usability-test script for charter question 1 and the build's end-to-end acceptance test.

1. **New project →** Bookcase. Overall size 36" × 72" × 12" → Create.
2. **Shape:** carcase 3/4" plywood, top and bottom between the sides, back inset in rabbets, 1/4" plywood.
3. **Divide:** click the opening → Add shelves → 4, evenly spaced.
4. **Joinery:** the shop profile has a dado stack, so the app proposes dados for the shelves, end rabbets for top and bottom and edge rabbets for the back. Accept all.
5. **Edge:** select the shelves → 1/8" roundover on both front edges (a bit from the shop profile).
6. **Build plan:** 3 cut list lines, 3 sheets, 3 setups and the assembly order, matching the golden files. Export the PDF. Then change the width to 30" in the form: every part, joint and output updates.

**Pass:** a woodworker who doesn't use CAD finishes in 15 minutes or less; a SketchUp user in 10 or less.

## 3D tools (escape hatch)

| Tool | Key | What it does |
| --- | --- | --- |
| Select | Space | Pick parts, openings, joints, edges |
| Board | B (also R) | Draw a board from stock; drawn between two parts, its length binds to the gap |
| Push/Pull | P | Change a part's length or width; thickness is locked to the stock |
| Move / copy | M (Ctrl copy, Shift mirror-copy) | Move with axis locks and typed distances |
| Join | J | Click two touching parts; the joint is proposed from the contact and the shop profile |
| Edge profile | F | Add a roundover to edges, using bits from the shop profile |
| Tape | T | Measure, add guide lines |

Navigation matches SketchUp: middle-drag orbits, Shift + middle-drag pans, the wheel zooms, O / H / Shift+Z.

## Feedback & errors

- **In shop language:** "This part can't be built: the dado is deeper than half the side," with a one-click fix where one exists.
- **Everywhere at once:** the part turns red in 3D, the tree shows a badge, the inspector explains it.
- **The build plan never lies:** while any error exists, the drawer shows a banner and PDF export is blocked.
- **Undo** covers every action, including form changes and accepted joint proposals.

## Home, Your shop, tour and tooltips

- **Home** is the screen of every launch after the first: New project, a search box, recent projects as cards with a picture of the model, and templates. Every project is kept in the browser as it changes; Save becomes Download .kerf file, and Open adds a project without replacing one (ADR 016).
- **Your shop** is a pegboard of the power tools, hand tools and wood you have. Tapping a card hangs it; a tool's settings show only once it is hung. It is asked once on first launch and can be skipped (ADR 016).
- **Ask when it matters:** a skipped shop is the starter shop; when a step needs a tool Kerf was never told about, it asks once, in place, and keeps the answer (ADR 016).
- **The tour** shows four tips on the real screen the first time the workshop opens (the steps, sizes, the model, the drawer) and is reopened from Learn (ADR 016).
- **Tooltips** name every control without an obvious label, with its key and one line on what it does after about half a second; greyed and Later controls say why (ADR 016).

## Out of the prototype

Drawers, doors, face frames, toe kicks, table bases and frames (v1); fit-a-space beyond a simple gap (v1); typing a project description in plain words (v2+); user-made templates (v1, alongside the plans marketplace); shop drawings, exploded views and labels (v1).
