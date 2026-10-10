# Woodworking CAD — Product Spec v0.1

Oct 9, 2026 · @Jon

## Thesis & positioning

Working name: **Kerf** (placeholder). One free, open-source, cross-platform app that does what woodworkers currently assemble from SketchUp Pro plus the OpenCutList extension, but built around boards instead of faces.

**Why now.** SketchUp is subscription-only at $399/yr for Pro, the free web version can't run extensions, and SketchUp Make is retired. Fusion's free personal tier has a history of cuts. OpenCutList proves the demand: about 40k active users and 340k downloads, crowdfunded by its users.

**What we are**

- A woodworking-native design tool: every object is a part made from real stock, and joinery is an operation, not hand-modeled geometry.
- Familiar to SketchUp users: push-pull editing, components, tape measure, orbit.
- Shop-first output: the cut list, sheet layouts, shop drawings and labels are always correct because they come from the part data.

**What we are not**

- Not general CAD. No surfacing, no mechanical assemblies, no architecture or BIM.
- Not a SketchUp UI clone. We copy the interaction habits worth keeping, not the menus.
- Not cabinet-shop production software (Mozaik, Cabinet Vision). Small pro shops are served; industrial CNC pipelines are not.

**Known pattern, flagged:** designing in boards already exists (SketchList 3D, $200 Hobby / $850 Pro). The open niche is doing it free, open source, cross-platform and well, with parametric plans as the growth engine.

## Users & jobs to be done

The primary user is the serious hobbyist who outgrew paper sketches but won't pay $399/yr or learn parametric CAD. Plan creators are the growth lever.

| Persona | Today's stack | Job to be done | What wins them |
| --- | --- | --- | --- |
| Weekend hobbyist | Paper, phone cut-list app, or SketchUp Free | Plan one project, buy the right lumber, waste less | Builds a bookcase in 10 minutes, cut list appears without effort |
| Serious amateur | SketchUp Pro + OpenCutList, or Fusion personal | Design furniture with real joinery, reuse designs | Joinery as one-click operations, parametric resize, no subscription |
| Small pro shop (1-5 people) | SketchUp Pro, SketchList, CutList Plus, VCarve | Quote, build and document client work fast | Accurate costing, shop drawings, client renders, CNC export |
| Plan creator / YouTuber | SketchUp + PDF plans sold online | Sell plans that buyers can actually build | Plans that resize to the buyer's space and regenerate the cut list |
| CNC hobbyist | Fusion or VCarve + separate design tool | Get from design to toolpath without re-drawing | Clean DXF/SVG per part, later integrated CAM |

**Core loop:** sketch the idea → shape it into parts → add joinery → resize to fit → generate cut list and sheet layout → print shop drawings and labels → buy lumber → build.

## Domain model

A project is a graph of parts. Joints and operations change parts, and every output reads that graph, never the 3D mesh. This one decision keeps cut lists exact and avoids building a general solid-modeling kernel.

&#91;embedded content: domain model · part graph and derived outputs\]

The Part is the center: it knows its stock, grain and finished size, and replays its operations in order whenever anything upstream changes.

| Entity | Key fields |
| --- | --- |
| Project | Name, units (imperial fractions or metric), parameters, root assembly, stock library, version |
| Parameter | Name, expression (`width = 36in`, `shelf_count = 4`), unit |
| Stock | Species, kind (solid, sheet, dimensional), nominal and actual thickness, standard widths and lengths, price per board foot or sheet |
| Assembly | Name, transform, children (parts or assemblies), instance count |
| Part | Name, stock, finished length × width × thickness (expressions allowed), grain axis, optional 2D profile, ordered operations, edge banding per edge, mirrored flag, finish, notes |
| Operation | Type (cut, profile, edge profile, taper, hole, joint host, joint guest), parameters, source joint |
| Joint | Type, host part, guest part, parameters, hardware, fit rules |
| Hardware | Type, size, quantity, supplier link |

**Rules:** rough size = finished size + stock allowances; instances share one definition, so the cut list counts them; editing a parameter re-solves dependent sizes, then replays operations.

## Joinery operations catalog

Every joint is one operation between a host part and a guest part. It edits both parts' geometry, can change the guest's cut length, and adds hardware or machining notes to the outputs. Defaults follow common shop rules of thumb and are always editable.

| Joint | Key parameters | Effect on parts | Cut-list impact | Release |
| --- | --- | --- | --- | --- |
| Butt + screws/nails | Fastener type, count, spacing | None to geometry | Hardware list | v1 |
| Dado | Width (= guest thickness), depth, stopped or through | Groove in host | Guest length + 2 × depth | v1 |
| Rabbet | Width, depth, edge | Step on host edge | Guest length + rabbet depth | v1 |
| Groove (panel) | Width, depth, offset from face | Groove along host | Panel size + 2 × depth, minus expansion gap | v1 |
| Pocket hole | Screw length, count, face | Pocket marks on guest | Hardware list, drill note | v1 |
| Dowel | Diameter, length, count, spacing | Holes in both | Dowel count | v1 |
| Loose tenon (Domino-style) | Size, count, depth | Mortises in both | Tenon stock or count | v1 |
| Mortise & tenon | Tenon thickness (default ⅓ stock), length, shoulders, haunch | Mortise in host, tenon on guest | Guest length + tenon length | v1 |
| Half lap | Width, depth (default ½ thickness) | Notch in both | None | v1 |
| Through dovetail | Tail count, angle (1:6 or 1:8), pin width | Tails and pins | None | v1 |
| Half-blind dovetail | Same + lap thickness | Tails and sockets | None | v2 |
| Box/finger joint | Finger width, count | Fingers on both | None | v2 |
| Bridle | Width, depth | Slot and tenon | Guest length + slot depth | v2 |
| Biscuit | Size (#0/#10/#20), count | Slots in both | Biscuit count | v2 |
| Tongue & groove / edge glue-up | Tongue size, board count | Builds panel from boards | Rough widths per board | v2 |
| Breadboard end | Tenon length, peg positions, elongated holes | Tenon on panel, mortise in end | Panel length + tenon | v2 |

**Rules attached to joints:**

- **Fit check:** warn when a tenon is thicker than half the host, or a dado is deeper than half the host thickness.
- **Wood movement (v2):** warn when solid wood is glued cross-grain wider than a set threshold, and suggest breadboard, buttons or figure-8 fasteners.
- **Joint as data:** delete a joint and both parts return to their prior shape. Change a part's thickness and its dados update.

**Part operations (not joints), from user demand:**

- **Edge profile:** roundover and chamfer in v1, cove, ogee and custom router-bit profiles in v2; applied per edge, non-destructive, removable.
- **Taper:** one- or two-face taper along a part's length (legs) in v1; turning/revolve in v2.
- **Edge banding:** set per edge (none, banding material, solid lipping); adjusts the panel's cut size and adds linear feet to the cut list.
- **Machining callouts:** every dado, groove, rabbet and hole shows on that part's drawing and label, not only in 3D.

## Outputs

Outputs are the product. All of them are derived from the part graph, never from the mesh, and they update live as the design changes.

**Cut list**

- Grouped by material and thickness; identical parts merged with a quantity.
- Finished size and rough size (finished + configurable allowance for length, width, thickness).
- Board feet for solid stock, sheet count for sheet goods, linear feet for edge banding.
- Grain direction and grain-matched groups (e.g. drawer fronts cut from one board in order).
- Export: CSV, PDF, and the formats OpenCutList and CutList Optimizer import.

**Optimization**

- Sheet goods: 2D guillotine nesting with blade kerf, grain constraints, edge trim, and offcut reuse.
- Solid stock: 1D length packing and width ripping against lumber you own or plan to buy.
- Inputs: stock inventory (boards on hand) and a buy list (standard lengths at your yard).

**Shop drawings**

- Per-part sheets with dimensions, joinery callouts, and grain arrows.
- Assembly views: front, side, top, isometric, and an exploded view with part numbers.
- PDF at true scale for full-size templates (curved parts printed tiled).

**Labels:** one per part with part number, project, size, and grain arrow; printable on standard label sheets or a label printer.

**Costing & shopping list:** price per board foot or sheet by species, hardware and finish line items, waste factor, total project cost, and a lumber-yard shopping list.

**Exports**

| Format | Use | Release |
| --- | --- | --- |
| PDF | Shop drawings, cut list, labels | v1 |
| CSV | Cut list into spreadsheets or other optimizers | v1 |
| DXF / SVG per part | CNC, laser, printed templates | v1 |
| STL / OBJ / glTF | 3D print jigs, rendering, sharing | v1 |
| .skp import | Migration from SketchUp | v1 via OpenSKP (MIT); imports parts and assemblies, not joinery |
| STEP | Exchange with Fusion and other CAD | v2 |
| G-code | Direct CNC toolpaths | v2+ |

## Scope & feature parity

v1 is ordered by user demand: every top-20 request is either in v1 or has a dated reason it isn't. Demand rank refers to the Top 20 user requests section below. Parity is against the four tools woodworkers combine today.

| Capability | Demand rank | SketchUp + OpenCutList | SketchList 3D | CutList Plus | Kerf |
| --- | --- | --- | --- | --- | --- |
| Auto cut list | #1 | Plugin, desktop Pro only | Yes | Manual entry | v1 |
| Free, offline desktop app | #2 | $399/yr; free web tier can't run extensions | $200-$850 one-time | $39-$499 one-time | v1: free, open source, offline-first |
| Resize with joinery and thickness kept true | #3 | Dynamic Components scale thickness | Limited | No | v1 |
| Joinery as operations | #4 | Modeled by hand | Yes | No | v1 core set + through dovetail; half-blind and others v2 |
| Edge profiles (roundover, chamfer; cove, ogee) | #5 | Follow Me by hand | Unverified | No | v1 roundover + chamfer; cove, ogee, custom v2 |
| Exploded views | #6 | Plugin | Yes | No | v1; step-by-step assembly views v2 |
| Shop drawings PDF | #7 | LayOut (Pro) | Yes | No | v1 |
| Per-part DXF + CSV export | #8 | Plugin, partial | DXF | No | v1, layered DXF |
| Grain direction and matching | #9 | Per-face textures + plugin | Yes | Partial | v1 |
| Parts are solid boards by default | #10 | Mesh; group and check by hand | Yes | No 3D | v1 (data model) |
| Machining shown on part drawings and labels | #11 | No | Unverified | No | v1 |
| Identical parts always merge (fixed precision) | #12 | Float precision splits parts | Unverified | Manual entry | v1 |
| Solid-stock length packing from stock on hand | #13 | Plugin | Yes | Yes | v1 |
| Costing incl. cut length | #14 | Plugin | Yes | Yes | v1 |
| Edge banding per edge | #15 | Plugin, partial | Unverified | Unverified | v1 |
| Hardware list + separate finish | #16 | Plugin, partial | Partial | No | v1 |
| Connectors and drilling patterns | #17 | In development (OCL 8.0) | Unverified | No | v2 |
| Readable vector PDF, print all at once | #18 | Plugin, per diagram | Yes | Yes | v1 |
| Tapered and turned parts | #19 | By hand or plugins | Unverified | No | v1 taper; turning v2 |
| Runs on Mac, Windows, Linux, web | #20 | Mac and Windows | Windows | Windows | v1 |
| Components and mirrored instances | Also seen | Yes | Yes | No | v1 |
| Sheet nesting + kerf | Table stakes | Plugin | Yes | Yes | v1 |
| Labels | Table stakes | Plugin | Partial | Partial | v1 |
| Plans marketplace / model library | Growth | 3D Warehouse | Small | No | v2 |
| Hardware library (hinges, slides) | Growth | Warehouse models | Partial | No | v2 |
| Wood movement warnings | Differentiator | No | No | No | v2 |
| Rendering | Nice to have | V-Ray (Studio) | Yes | No | v2 |
| CAM / toolpaths | Nice to have | Plugins | DXF only | No | v2+ |
| iPad shop mode | Nice to have | Separate app | No | Viewer app | v2 |

**Out of scope (explicit):** architecture/BIM, timber framing, metalwork, upholstery, industrial nesting for CNC panel saws, ERP and job management.

## Architecture

Decision: a pure TypeScript core with WASM modules for the heavy math, shipped as a web app and a Tauri desktop app from one codebase. Furniture models are hundreds of parts, not millions of faces, so TypeScript is fast enough, and one language keeps agent-driven development simple.

&#91;embedded content: architecture · 4 layers, local file, optional cloud\]

The core has no UI or rendering dependencies, so it runs in tests, on a server (plan previews), and could be ported to Rust later without touching the UI.

**Stack options considered**

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| A. TypeScript core + Manifold (WASM) + three.js; web + Tauri | One language, fastest to prototype, runs in browser with zero install | Very large models slower than native | **Recommended** |
| B. Rust core compiled to WASM + native (ArtCraft's approach) | Fast, strict compiler is a good agent guardrail | Slower iteration, two languages at the UI boundary | Revisit if A hits performance limits |
| C. Build on FreeCAD / OpenCascade | Mature B-rep kernel, STEP support | Heavy, LGPL C++, inherits FreeCAD complexity | Rejected |

**Key components**

- **Parameter solver:** expression evaluation with dependency ordering; cycles rejected with a clear error. Dimensions are stored as fixed-precision integers (1/64" or 0.01 mm) so identical parts always merge.
- **Geometry:** parts are blanks plus operations; [Manifold](https://github.com/elalish/manifold) handles booleans for the display mesh only.
- **Optimizer:** guillotine sheet nesting and 1D length packing in a WASM module; existing open-source Rust packers are a starting point.
- **PDF and DXF/SVG writers:** generated from the part graph at true scale.
- **File format:** `.kerf` = zipped, schema-versioned JSON plus thumbnails. Human-readable, diffable in git, migrations on load. A plan is a `.kerf` with exposed parameters and license metadata.

**Quality bar**

- Golden-file tests per joint type (geometry + cut-list output).
- Property tests: any parameter change keeps the cut list consistent with part data.
- A benchmark project of 300+ parts must edit and re-solve in under 100 ms.

## Go-to-market & monetization

The app is free; the parametric plans marketplace is both the distribution engine and the main revenue line. Without it, this is a well-loved open-source project, not a business.

**Flywheel:** creators publish parametric plans → buyers download the free app to use them → some buyers become designers and creators → more plans. Known pattern: Prusa's Printables library and open-source PrusaSlicer reinforce each other the same way in 3D printing.

**Revenue lines, in order of expected size**

1. **Plans marketplace take rate.** Creators sell `.kerf` plans that resize to the buyer's space and regenerate the cut list; the platform keeps a percentage. Free plans allowed and encouraged.
2. **Cloud tier (flat monthly).** Sync across devices, version history, sharing links for clients, iPad shop mode, cloud rendering.
3. **Affiliate.** Lumber, sheet goods, hardware and tooling links from the shopping list.
4. **Pro add-ons (later).** CAM toolpaths, client quoting, branded shop drawings for small pro shops.

**Distribution**

- **Launch with creators, not ads.** Recruit 5-10 woodworking YouTubers who already sell plans; give them early access and a better revenue split for launch plans.
- **Migration hooks.** .skp import and an OpenCutList-compatible cut-list view so switching costs one afternoon.
- **Community channels.** r/woodworking, r/BeginnerWoodWorking, SketchUp forum woodworking threads, Sawmill Creek, the OpenCutList user base.
- **The ArtCraft moment.** A launch post framed as "free, open-source SketchUp for woodworkers, built in N weeks" is the attention play; it only works if the first-run experience delivers a cut list in minutes.

**License:** core app GPL-3.0 (or AGPL-3.0 for any server components) so the cloud tier and marketplace can't be cloned as a closed hosted product; plan files in an open format so users always own their designs.

## Risks, open questions & validation

The biggest risk is not technical: it's whether creators will publish plans here. Validate that before building past the prototype.

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Creators don't adopt the plan format | Kills the flywheel and the main revenue line | Recruit creators during prototype; launch with their plans, better split for early plans |
| Joinery geometry bugs | Wrong geometry = wrong cut list = wasted wood, trust gone | Cut list from part data, not mesh; property tests on every joint; golden-file tests per joint type |
| SketchUp habits don't transfer | Users bounce in the first 10 minutes | Match push-pull, tape measure, orbit/pan keys; first-run tutorial ends with a cut list |
| .skp import blocked by license | Migration gets much harder | Official SDK ruled out: native Windows/Mac only, no Linux, web or server use, public redistribution unresolved. Use OpenSKP (MIT, TypeScript, reverse-engineered, reads SketchUp 2013+); fallback is OBJ/DAE export. Remaining risk: parser breaks on a new SketchUp release |
| Hobbyists won't pay | Revenue only from marketplace | Keep costs near zero: local-first app, cloud tier optional |
| Scope creep toward general CAD | Never ships | Out-of-scope list in this doc; every feature must serve the core loop |
| Dev time vs. BBF priorities | Competes with Workstation and core work | Treat as exploration until validation gates pass |

**Open questions**

- Would OpenCutList's maintainers (GPL-3.0) collaborate or merge efforts?
- Decided: imperial fractions by default, metric as a setting.
- Web-first (zero install, WASM) or desktop-first (Tauri) for launch?
- Plan marketplace split: creator 80/20 or 85/15?

**Validation plan**

- [x] Mine OpenCutList GitHub issues and SketchUp forum woodworking threads; rank the top 20 requests.
- [ ] Short survey in r/woodworking: current tool, what they pay, what made them quit a tool.
- [ ] Two-week prototype: parametric bookcase with dados, one roundover and one dovetail → resize → cut list → sheet layout PDF.
- [ ] Show the prototype to 5 plan-selling creators; gate: at least 3 say they would publish plans in it.
- [x] Read SketchUp SDK license terms for .skp import. Result: use OpenSKP, not the official SDK.
- [ ] Spike: import 10 real woodworking .skp files from 3D Warehouse with OpenSKP; check components, transforms and materials map to parts.
- [ ] Decide go / no-go on the full v1 build.

## Top 20 user requests

Woodworkers' top asks are a built-in cut list, a free offline desktop app, and resizing that keeps joinery true. Most of the top 20 trace back to SketchUp's mesh model, not missing plugins, which supports the board-based design.

**Method:** 207 OpenCutList GitHub issues plus SketchUp forum woodworking threads, cross-checked on Sawmill Creek, then deduplicated across sources. GitHub reactions are near zero (top issue: 3), so issues are weighted by comment count and forum threads by views and likes. Ranks within a tier are judgment, not math. The forum's keyword search was blocked, so threads were found by tag and web search; reddit and LumberJocks did not surface.

| # | Request | Evidence | Root cause | Kerf |
| --- | --- | --- | --- | --- |
| 1 | Cut list built in, on every edition | [OpenCutList 2.0 thread](https://forums.sketchup.com/t/158644) 74.6k views; 42 topics tagged cutlist; Go/iPad users can't get one | Missing feature + Pro paywall | v1 core |
| 2 | Free or affordable offline desktop app | ["End of buying SketchUp"](https://forums.sketchup.com/t/127406) 98 likes, 5.2k views; [keep Make desktop](https://forums.sketchup.com/t/72782) 40 likes; [what happened](https://forums.sketchup.com/t/207310) 53 likes | Pricing | Free, offline-first |
| 3 | Resize without breaking joinery or panel thickness | [Cabinet parametrization](https://forums.sketchup.com/t/137601) 5.5k views; [rabbets in DCs](https://forums.sketchup.com/t/226968) reopened Feb 2026 | SketchUp limit (DCs scale) | v1 parameters + joints as ops |
| 4 | One-step joinery, esp. dovetails | [Dovetails tool](https://forums.sketchup.com/t/174905) 19 likes, 2.5k views; plugins abandoned | Missing feature | v1 core set; dovetails v2 → **now v1** |
| 5 | Edge profiles: roundover, chamfer, cove, moulding | 7 threads, \~5.6k views combined, incl. [non-destructive roundovers](https://forums.sketchup.com/t/349724) Sept 2026 | SketchUp limit (Follow Me) | **Added: v1 roundover + chamfer** |
| 6 | Exploded and IKEA-style assembly views | [Exploded views](https://forums.sketchup.com/t/222670) 27 likes, 3.8k views; [IKEA manuals](https://forums.sketchup.com/t/289268) 872 views | Missing feature | v1 exploded; assembly steps **add v2** |
| 7 | Shop drawings without LayOut setup | [SketchUp for Woodworking ep. 6](https://forums.sketchup.com/t/134643) 71 likes, 3.1k views | SketchUp limit + Pro-only | v1 |
| 8 | Per-part DXF + CSV for nesting, CNC, panel saws | [#965](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/issues/965) 21 comments, open; #978, #976; DXF axis thread 8 comments | Out of OCL scope | v1, layered DXF spec |
| 9 | Grain set once per part; grain-matched sequences | [#371](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/issues/371) top-reacted, open; [grain direction](https://forums.sketchup.com/t/198904) 2.7k views | SketchUp limit (per-face textures) | v1 |
| 10 | Parts are solid boards by default | Forum threads 3.7k / 1.9k / 1.5k views; #380 11 comments, #925 9 comments | SketchUp limit (mesh, no solids) | Solved by data model |
| 11 | Machining (dados, grooves) shown on diagrams and parts | [Groove marks](https://forums.sketchup.com/t/153297) 9 likes; [cut list resizing parts](https://forums.sketchup.com/t/114442) 3.6k views | SketchUp limit (bounding boxes) | v1: ops on part drawings + labels |
| 12 | Identical parts merged; no phantom sheet splits | #165 23 comments, #193 14 comments: 0.750" vs 0.749" precision | SketchUp float precision | **v1: fixed-precision dimensions** |
| 13 | Solid lumber + board-foot optimizing from stock on hand | #87 8 comments; [construction lumber](https://forums.sketchup.com/t/273906) 728 views | Missing feature | v1 |
| 14 | Project costing incl. cutting cost | [#379](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/issues/379) 22 comments | Missing feature | v1; add cost per cut length |
| 15 | Edge banding and veneer as data | [Edge banding](https://forums.sketchup.com/t/152025) 2.7k views + 1.2k; #203 9 comments, #1007 | OCL declined | **Added: per-edge banding, v1** |
| 16 | Hardware lists; material separate from finish | [Material vs finish](https://forums.sketchup.com/t/304247); [OCL hardware](https://forums.sketchup.com/t/342499) | Missing feature | v1 hardware list + finish field |
| 17 | Connectors and drilling (Clamex, Cabineo, shelf pins) | #972 11 comments, in dev for OCL 8.0; #937 | Missing feature | v2 hardware library with drill patterns |
| 18 | Readable diagrams; print everything at once | #90 21 comments, #194 10, #659 8, #313 9 | OCL rendering limits | v1: vector PDF, print-all |
| 19 | Tapered and turned parts (legs, spindles) | [Tapered leg](https://forums.sketchup.com/t/109703) 18 likes, 5.2k views | SketchUp limit | **Added: taper v1, turning v2** |
| 20 | Fewer plugins, stability, Linux | [2026 compatibility issues](https://forums.sketchup.com/t/340952) 18 likes; [Linux support](https://forums.sketchup.com/t/223371) 84 likes, 27.1k views | Ecosystem | v1 built-ins; Linux via Tauri |

**Also seen, lower signal:** mirrored-part handling (#558 16 comments, #956 13), scripting/data API and CLI (#661 + discussions), collision detection when resizing ([SketchUp vs Fusion](https://forums.sketchup.com/t/185939) 75 likes, 12.8k views), and evenly arraying shelves (2.5k views). The SketchUp vs Fusion thread also shows the gap: users want SketchUp's direct modeling with Fusion's editable history.

**Changes applied to the spec**

- **Added to v1:** edge profile operations (roundover, chamfer; cove and ogee v2), per-edge banding on parts, taper operation, hardware list with a finish field, print-all PDF.
- **Promoted to v1:** through dovetail; it's the most-requested single joint.
- **Architecture:** store dimensions in fixed precision (e.g. 1/64" or 0.01 mm) so identical parts always merge.
- **Data model:** mirrored instances as a first-class flag; an editable operation history, which the part graph already provides.
- **Note:** OpenCutList is GPL-3.0, compatible with the planned GPL core, so porting its nesting logic is legally clean with attribution.

## Sources

- [OpenCutList on GitHub](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/)
- [OpenCutList 8.0 crowdfunding thread (active users, downloads)](https://forums.sketchup.com/t/opencutlist-a-crowdfunded-extension-8-0-campaign/301089)
- [SketchUp web versions don't support extensions](https://forums.sketchup.com/t/open-cut-list/196464)
- [SketchUp 2026 pricing and alternatives](https://www.snaptrude.com/alternatives/sketchup)
- [SketchList 3D pricing (Capterra)](https://www.capterra.com/p/204375/SketchList-3D/)
- [CutList Plus editions](https://www.woodworkingnetwork.com/archived/custom/project-plan-viewer-app-sends-cut-lists-lumber-yard)
- [Vectric VCarve pricing](https://sienci.com/2020/11/19/vectric-vcarve-desktop-vs-carveco-maker-which-should-you-choose/)
- [Fusion personal-use restrictions (Hackaday)](https://hackaday.com/blog/page/2964/?oldid=1726)
- [Woodworkers on Fusion personal license (Maslow forum)](https://forums.maslowcnc.com/t/new-limitations-on-fusion-360-for-personal-use/14685)
- [FreeCAD Woodworking workbench](https://github.com/dprojects/Woodworking)
- [Manifold geometry library](https://github.com/elalish/manifold)
