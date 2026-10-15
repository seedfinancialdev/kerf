# ADR 016: First run and Home (M4.5)

Status: accepted (maintainer, 2026-10-14). Design: `docs/superpowers/specs/2026-10-14-first-run-and-home-design.md`.

## Context

M4's first use by the maintainer found a problem at every step, starting with the first screen. This milestone
redesigns how Kerf greets a woodworker and how a project begins, following the tools users already know
(SketchUp's Welcome window, Shapr3D's Dashboard).

## Decisions

- D1. **Screens.** Kerf has three: Your shop (first launch, and from Home or Settings), Home (every launch after),
  and the Workshop. The browser's Back button moves between them; a reload always lands on Home (or Your shop on
  a first launch).
- D2. **Start leaves the top bar.** The workshop's steps are Shape, Divide, Joinery, Build plan. Choosing a piece
  and its size moves to New project; opening and downloading files to Home and the project menu; the shop to
  Your shop. This changes Interaction spec §§ "The workflow", "1. Start", "Workflow modules", "Toolbar" and
  "Core flow" (updated with this ADR, approved by the maintainer).
- D3. **The shop record.** The app keeps everything hung on the pegboard, including tools and router bits the
  engine does not use yet, under `kerf.shop` (version 2). `shopProfileFor` gives the engine only what it
  understands: cut width, dado stack, router bits, hand-cut dovetails. A version 1 value (a `ShopProfile`) is
  read as a record told about every tool. `@kerf/core` does not change.
- D4. **Ask when it matters.** A shop that was skipped is the starter shop, not told about any tool. When a step
  needs a tool the record was never told about, it asks once, in place, and keeps the answer.
- D5. **Every project is kept.** Projects live in the browser's IndexedDB database `kerf` (store `projects`),
  written on every recorded change with a picture of the model when one is on screen. Save becomes "Download
  .kerf file"; Open adds a new project and never replaces one. The old `kerf.project` value moves into the
  library once, then is removed only after the library has it.
- D6. **Space to fill (simple).** Brought forward from v1: the piece's width is the space less a gap at each
  side, its height the space less one gap at the top; depth is as typed. Default gap 1/8".
- D7. **Router bits are edge shapes.** Edge profile offers the roundovers whose bits are on the router card;
  roundovers without a bit are offered greyed, with "Add it to my shop?"; chamfer, cove and ogee are kept on the
  wall and shown as *Later* (the engine draws roundovers only).
- D8. **Test changes.** `e2e/bookcase.spec.ts` gains one line: click **Create** after filling the size (the size
  is typed in New project, which then opens the workshop). `playwright.config.ts` seeds a set-up shop
  (`kerf.shop`) and a finished tour (`kerf.toured`) for the existing specs, which describe a returning user;
  first-run behaviour has its own spec with empty storage. Every other spec starts through
  `e2e/support/start.ts`.

## Consequences

- Removing the Start step changes `STEPS`, `hintFor`, the starting step (Shape), the inspector, and every test that
  named Start.
- The library is asynchronous; the store keeps a synchronous list of summaries refreshed after each write.
- Known limits: no folders, tags, sync or sharing; Inspiration, photos and describing a piece in words are later;
  router dados as an alternative to the dado stack are later.
