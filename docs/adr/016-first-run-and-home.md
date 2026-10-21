# ADR 016: First run and Home (M4.5)

Status: accepted (maintainer, 2026-10-14). Design: `docs/superpowers/specs/2026-10-14-first-run-and-home-design.md`.

Outcomes: Final review (code, silent failure, tests, whole branch): Critical 0, Important 14 (code 1, silent
failure 5, tests 5, branch 3, several the same M4-upgrade finding), Minor 28 (code 4, silent failure 6, tests 6,
branch 12); fixed in 696d50e, 83fb282, c632e3a, 97ffb05 and afe4b26; the rest are known limits 19 to 25, and
limits 26 to 30 list the edges of those fixes. The re-review of the fixes (Minor 9) was fixed in the commits that
follow afe4b26. The review of the pull request is pending.

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
- Known limits are listed below.

## Known limits

What M4.5 does not do, or does only in part. Items marked "maintainer to confirm" are choices made while
building because the spec is silent.

1. The three shop trims (sheet trim, solid trim, smallest offcut) have no editor yet. They survive migration
   from an older saved shop, so nothing the user set is lost.
2. The "Edited ..." lines on Home do not tick over while Home stays open; they are worked out again only when
   Home redraws.
3. The New project preview solves the model on each valid keystroke, with no debounce and no demand rendering,
   and it fills the mesh cache.
4. The New project tabs lack arrow-key movement and `aria-controls`.
5. Plain case reuses the cabinet drawing, because a drawing of its own needs art.
6. Router bits of chamfer, cove and ogee are remembered but only roundovers reach Edge profile, because the
   engine draws roundovers only. The cove, ogee and rabbeting sizes on the pegboard are Kerf's choice
   (maintainer to confirm).
7. A router straight bit as an alternative to the dado stack for dados is later.
8. When a shop has both saws, the cut list uses the table saw's blade (R33). A skipped pegboard assumes a table
   saw at 1/8".
9. "Applies the shape" in Edge profile means the bit becomes the chosen Radius; the user still presses Both
   front edges or Round the ticked edges.
10. The wording of the router and hand-tool questions, and of their confirmations, was written by the
    implementer (maintainer to confirm).
11. The saw question appears once for a skipped pegboard, and a click on a saw answer while tips 1 to 3 of the
    tour show ends the tour.
12. The tour's Size section stays open for the session and is never saved.
13. The six-column pegboard never reflows below about 900 px.
14. Picture addresses use a 32-bit content hash, so there is a 2^-32 chance of showing a stale picture.
15. Undo and Redo use the span-wrapped disabled-tip pattern, while newer controls use `aria-disabled`.
16. The project library has no folders, tags, sync or sharing. Inspiration, photo upload and describing a piece
    in words are later.
17. A damaged row in the library at the migrated project's fixed id is overwritten by the migration.
18. The tour's click-outside rule ends it on any press outside the current tip's part.
19. The "Something else" idea is kept with the project (and carried by Duplicate), but no screen shows it yet,
    and a downloaded .kerf file leaves it out.
20. M4 wrote `kerf.shop` only when the shop card was edited, so most M4 users have a project but no saved shop.
    After upgrading they see the first-launch pegboard (and later the tour) before Home lists the moved project;
    skipping it asks the saw and dado questions about a project M4 had already planned (maintainer to confirm).
21. Every recorded change re-reads the whole library, pictures included, to refresh Home's list, and encodes a
    picture of the model; no benchmark covers this path.
22. A wood of your own has no upper limit on its thickness and no check for a name already on the wall.
23. The 3D lights are set up twice (`Preview.tsx`, `Viewport.tsx`), and `.three` is a global class.
24. Tour: tip 1's arrow is short and points at the hint line's lower edge; only a selection of boards is cleared
    before tip 2; any mouse button on the model, not only the one that orbits, keeps the tour during tip 3.
25. A new metric project's gap starts at 3 mm, the round size nearest 1/8"; D6 gives only the imperial default
    (maintainer to confirm).
26. While storage will not let the old project go, each start that finds the moved project edited, and no
    project with exactly the stored text, keeps the stored copy again as "<name> (older tab)" (so a copy that
    was renamed or edited is made again), and says the change came from an older Kerf tab though none may have
    been open: storage cannot tell an older tab's change from the original it still holds.
27. New project, Open file or opening another project replaces an open project the library does not keep without
    asking; Home's "Open now, not kept" card and banner are the warning (final review ruling on branch I3).
28. Home's empty line "Projects you start will show here." also shows under the banner of a browser that keeps
    no projects.
29. The start-up fault's words (`main.tsx`) have no automated test: the entry point cannot be loaded in a test.
30. A database closed while Kerf is open (another tab upgraded it, or the site's data was cleared) is noticed at
    the library's next call, not at once.
