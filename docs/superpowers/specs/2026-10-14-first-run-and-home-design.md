# M4.5: First run and Home: design

Status: approved in conversation with the maintainer on 2026-10-14; this document records that design. The
spec change it requires (Interaction spec, "Workflow modules" and "Start") and the one-line acceptance-test
change are approved; the first task of the build records them in ADR 016.

## Why

M4 shipped a workshop that passes every test but had never been used by a person. The maintainer's first use
found a problem at every step, starting with the first screen: an empty workshop, **New** hidden in a corner,
and shop settings in engineering words ("Blade kerf", "Straight bits") before any project exists. This
milestone redesigns how Kerf greets a woodworker and how a project begins. Later polish milestones take the
remaining workshop steps one at a time.

## Who and what success looks like

- **Who:** a hobby woodworker, often a SketchUp user, who opens Kerf with a concept in mind: "I want to build a
  round dining table, mid-century, at most 48", 30" tall." The concept usually comes first; sometimes a space
  to fill, materials on hand, or a picture to copy.
- **Familiar first:** the frame must feel like the tools they already use. SketchUp's Welcome window (templates,
  Recent Files tiles, Open File) and Shapr3D's Dashboard (sidebar with search and recents, project grid) are the
  reference. Kerf's refinements sit inside that frame.
- **Success:** a first-time user sets up their shop (or skips it), starts a bookcase sized to their space, and
  lands in the workshop understanding what to do next, without help. A returning user is back in their project
  in one click.

## Decisions made with the maintainer

| Topic | Decision |
| --- | --- |
| What we design for | Any piece ("What are you building?"); only what the engine builds today is offered, everything else is labelled *Later* honestly. |
| Shop setup | Asked once on first launch; skippable. If skipped, Kerf asks in context when a project needs a tool it has never asked about. |
| Every launch after the first | A Home screen. |
| Starting a project | A few plain choices, with a blank start always available; the area is built to grow into Inspiration (styles, photos, plans, photo upload). |
| Visual direction | Direction B "Workshop wall", in Kerf's existing look (tokens, buttons, tabs, fields from `packages/app/src/styles.css`); the pegboard stays exactly as approved. |
| Keeping projects | Every project kept in the browser automatically; Save/Open become Download and Open file. |
| First landing | A short guided tour, shown once, reopenable from Learn. |
| Router bits and edge shapes | One list seen from two places: the bits on the router card are the shapes Edge profile offers. |
| Tooltips | Everywhere a control lacks an obvious label, SketchUp-style. |
| Spec and test | Interaction spec updated to match; the bookcase acceptance test gains one line (click Create). |

Approved mockup screens: `2026-10-14-first-run-and-home/1-your-shop.png`, `2-home.png`, `3-new-project.png`.

## The flow

- **First launch:** Your shop (pegboard) → Home → New project → Workshop, with the tour.
- **Every launch after:** Home.
- **The workshop's steps** become Shape → Divide → Joinery → Build plan. The Start step leaves the top bar; its
  jobs move to New project (piece, size, wood), Home and the project menu (open, download), and Your shop.
- **Kerf** in the top-left corner returns to Home. The browser's Back button moves between Home, Your shop and
  the Workshop.

## 1. Your shop (the pegboard)

A dot-grid board with three rows of hanging cards, each a line drawing of the tool or wood, a name and one line
on what it is for. Tapping hangs it: the card and its peg turn amber. A tool's settings appear on its card only
once hung.

| Row | Cards | What Kerf does with it now |
| --- | --- | --- |
| Power tools | Table saw (blade: standard 1/8", thin 3/32", other) | Sets the cut width (`ShopProfile.kerf`). |
| | Dado stack (widest: 1/2", 3/4", 13/16", other) | Dado proposals and widths (`dadoStack.maxWidth`). |
| | Router (bits, by the shape they cut: roundover, chamfer, cove, ogee, straight, rabbeting; sizes tapped on) | Roundover sizes go to Edge profile; straight bits to the engine's router tool. |
| | Track saw (blade width) | Sets the cut width when there is no table saw. |
| | Drill / driver | Remembered for later joinery (screws, shelf-pin holes). |
| Hand tools | Chisels, Dovetail saw | Both hung means "cuts dovetails by hand" (`handTools.dovetails`). |
| What you build with | 3/4" plywood, 1/4" plywood, Hardwood (species, thickness), + Add your own | The wood new projects start with. |

- A count shows how many things are hung. **Skip for now** and **That's my shop** sit at the bottom.
- **Skipping** uses today's starter shop (`STARTER_SHOP`): table saw at 1/8", 3/4" dado stack, router with a 1/8"
  roundover bit, dovetails cut by hand, and today's starter stock (3/4" and 1/4" plywood, walnut).
- **No saw hung:** the cut list still needs a cut width, so Kerf asks "What do you cut with?" when it first needs
  one, and uses 1/8" until answered.
- **Reached later** from Home ("Your shop", Edit) and from Settings; the same screen.
- **Remembered in full:** the shop record keeps every tool and bit hung, including ones the engine does not use
  yet. Kerf passes the engine only what it understands today (blade width, dado stack, router bits, hand-cut
  dovetails); `ShopProfile` in `@kerf/core` does not change.

### Router bits and edge shapes

- Edge profile lists **shapes you own** first.
- **Shapes you do not own** are greyed with a plain reason: "Needs a 3/8" roundover bit. Add it to my shop?"
  Accepting adds the bit to the router card and applies the shape.
- **Shapes the engine cannot cut yet** (chamfer, cove, ogee: the engine draws roundovers only) are remembered on
  the wall and shown as *Later* in Edge profile.
- **Later, not in this milestone:** a router with a straight bit as an alternative to the dado stack for dados,
  with its own setup sheet ("router, 1/2" straight bit, two passes"). It needs engine work.

### Ask when it matters

One shared way for any screen to ask about a tool the shop record has never been told about, in context and
once. For example, in Joinery: "This joint needs a dado stack. Do you have one? Yes / No, show me another way."
The answer is written to the shop record. Used first by Joinery and Edge profile.

## 2. Home

- **Top bar:** Kerf, Settings.
- **Sidebar:**
  - **New project** (the primary button), a search box ("Find a project"), Home, All projects, Open file…
  - **Recent files:** the last few projects.
  - **Learn:** reopens the tour; room for guides later.
  - **Your shop** at the foot: small drawings of the hung tools, a one-line summary and Edit.
- **Main area:**
  - "What's on the bench?"
  - **Templates:** tiles for Bookcase, Cabinet and Box, plus Table and Dresser marked *Later*. Clicking a
    working tile opens New project with that piece chosen.
  - **Inspiration**, marked *Later*: styles, real pieces and plans, or a photo of a piece, turned into a
    starting point.
  - **Recent files:** cards with a picture of the actual model, the name and when it was last changed.
- **Project card menu (⋯):** Rename, Duplicate, Download .kerf file, Delete. Delete asks first, then offers
  Undo for a few seconds.
- **All projects:** every project, searchable by name, newest change first.
- **Open file…:** adds a `.kerf` file as a new project and opens it; it never replaces an existing one.
- **In the workshop:** the project name in the top bar becomes a menu: Rename, Duplicate, Download .kerf file,
  Back to Home.

### Keeping projects

- Every project is written to the browser's database (IndexedDB) as it changes, with its picture. There is no
  Save button to remember.
- The project kept today (`kerf.project`) becomes the first card automatically the first time this version opens.
- If the browser cannot keep projects (private browsing, full or blocked storage), Home says so and stays saying
  so: "This browser isn't keeping your projects. Download a .kerf file to keep your work." Nothing is lost
  without a word.
- **Not in scope:** folders, tags, syncing between computers, sharing links (they need accounts or a server).

## 3. New project

A large panel over Home: tabs on the left, the chosen piece's settings on the right.

### Tabs

- **Templates:**
  - **Bookcase:** a case with shelves, a back and joinery.
  - **Cabinet:** a case for storage, back optional. Its card says "Doors and drawers coming later".
  - **Box:** the keepsake box.
  - **Table** and **Dresser:** greyed, *Later*. Clicking says plainly: "Kerf can't build a table yet; it's
    coming. Start from a blank project or a plain case in the meantime."
  - **Something else:** asks "What are you thinking of building?" The words are kept as a note on the project,
    and it starts as an empty project.
- **Blank:** Empty project (no form; draw boards yourself), Plain case, Plain box.
- **Open file:** choose a `.kerf` file; it is added as a new project and opens.
- **Inspiration:** *Later*.

### The settings panel

- **A live 3D preview** of the real model, drawn by the engine, updating as sizes change.
- **Units:** Inches or Millimetres for this project, like SketchUp's templates. It defaults to the units last
  used.
- **Outside size / Space to fill:**
  - *Outside size:* the numbers are the piece's overall size.
  - *Space to fill:* the numbers are the opening, plus a gap to leave (default 1/8"). Kerf sets the piece's width
    to the space minus a gap at each side, its height to the space minus one gap at the top, and its depth to the
    depth typed, and shows both sets of numbers. Whole-number arithmetic on lengths, as everywhere in Kerf.
- **The one or two choices that matter for the piece:** shelves (2 to 6) for a bookcase, back or no back for a
  cabinet.
- **Wood:** from the shop's stock. "Other…" adds a wood to the shop.
- **Sizes:** typed in any unit (36", 3', 900 mm).
- **Refusals:** in plain words before Create ("Width must be more than zero.", "The gap is bigger than the
  space."). Create stays off until the piece can be built.
- **Remembers the last piece, wood and units.** Create or Enter starts at once, so an experienced user can go
  from Home to the workshop in two clicks.
- **Create** opens the workshop on the Shape step. The project is named after the piece ("Bookcase"); rename it
  from its card or the top bar.

## 4. The tour

- Shown the first time the workshop opens; reopened from Learn.
- **Four tips**, each pointing at the real screen, one at a time, with Next and Skip tour:
  1. **The steps:** "These four steps take your piece from shape to cut list."
  2. **Sizes:** "Type a size, or drag its label to adjust it. Any unit works."
  3. **The model:** "Orbit with the middle mouse button or two fingers. The tools work like SketchUp's: P to push
     or pull, M to move, T to measure."
  4. **The drawer:** "Your shopping list, cut list, sheets and assembly steps live here, always up to date."
- Escape or a click elsewhere ends it. It never blocks the screen.

## 5. Tooltips

- **What a tip shows:** every control without an obvious label (tool buttons, icons, steps, drawer tabs, size
  labels) shows a tip after about half a second. The tip gives the name, the key, and one line on what it does.
  Example: "Push/Pull · P · Stretch or shrink a board by dragging one of its ends."
- **Moving between controls:** moving straight to a neighbour shows its tip at once.
- **Keyboard and touch:** keyboard focus shows the tip too; on touch, press and hold.
- **Greyed or *Later* controls** say why: "Needs a 3/8" roundover bit. Add it to your shop?"; "Tables are coming
  later."; "Accept the joinery first to see the cut list."
- **Pegboard cards** say what the tool unlocks: "Dado stack: lets Kerf use dados for shelves."
- **One component and one style;** all wording passes the shop-language and banned-word check.

## 6. The look

- **Kerf's existing style throughout:** the tokens, type, buttons, tabs, segmented controls, size fields and
  amber primary button of the workshop. The light theme comes from the existing light tokens.
- **The pegboard** as approved.
- **One reusable set of line drawings** for tools, wood and pieces: thin strokes in the current colour, amber
  when chosen. New tools and pieces get matching drawings.
- **Real model pictures** wherever there is a model: project cards and the New project preview. Drawings are only
  for what is not a model yet.
- **Accessibility:**
  - every card and tile is a keyboard-reachable control that announces whether it is chosen;
  - the tour is readable by screen readers;
  - nothing relies on colour alone.

## How it is built

- **Screens:** Home, Your shop and Workshop, with history so Back works. No new runtime dependency is needed for
  routing; a small history-backed state is enough.
- **Project library:** a module with one job (list, create, rename, duplicate, delete with undo, migrate the
  single stored project, report storage failures), over IndexedDB. Pictures come from the existing thumbnail
  source.
- **Shop record:**
  - an app-side record of every tool, bit and wood hung, with a pure function from it to the engine's
    `ShopProfile`;
  - the existing `kerf.shop` value migrates into it;
  - the "asked about" flags live here.
- **New project:** built on the engine's `TEMPLATES` and `projectFromTemplate`. The preview reuses the viewport.
  "Space to fill" is a pure, tested function on integer lengths.
- **Components:** "ask when it matters", the tour and the tooltip are each one reusable component.
- **Engine:** `@kerf/core` does not change in this milestone; the app still uses only its public API.

## Testing

- **Unit tests,** with expected values from hand calculations:
  - the library: every action, storage failures, and migration of the old project;
  - shop record to `ShopProfile`, including no saw, track saw only, and bits the engine does not use;
  - space-to-fill arithmetic: imperial and metric, gap larger than the space, zero.
- **Screen tests** for every card, tab, tooltip and refusal.
- **Browser tests:**
  - first run (pegboard → Home → New project → workshop → tour);
  - returning to Home;
  - skipping the shop, then being asked in Joinery;
  - opening a file as a new project;
  - storage blocked.
- **The bookcase acceptance test** gains one line (click Create after Bookcase); nothing else in it changes.
- **The banned-word scan** covers every new screen and tooltip. Keyboard-only checks cover each new screen.
- **Process change from M4:** screenshots of every screen are shown to the maintainer during the build, not only
  at the end.

## Out of scope (listed, not hidden)

- **Later features:** Inspiration, photo upload, describing a piece in words.
- **Pieces the engine cannot build yet:** tables, dressers, doors, drawers.
- **Projects:** folders, tags, sync, sharing.
- **Router dados** as an alternative to the dado stack.
- **The rest of the workshop's usability:** the next polish milestones, one step at a time.
