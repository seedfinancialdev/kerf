# Kerf brand

Kerf is a free, open-source woodworking design app. You describe a piece the way you'd tell another woodworker — "a 36-inch bookcase, four shelves, a 1/4-inch back in rabbets" — and Kerf turns it into exact boards, joinery, a cut list and sheet layouts. It is for hobby woodworkers and small shops. It is exact, and it speaks shop language.

The brand should feel like a good hand tool or a quality shop rule: calm, exact, crafted, trustworthy. Not a tech startup, not a rustic sign.

## The idea

A kerf is the narrow slot a saw blade leaves. The whole identity is built on one thin, exact gap.

- **The symbol** is a block K on a 32-unit square. One rip cut — a 2-unit kerf — separates the stem from the arms. The arms meet the cap line and the baseline at exactly 45°, the counter's apex sits at the square's centre (16, 16), and the stem is 10 units wide, the same visual weight as the arms. Nothing in it is rounded.
- **The wordmark** is the same cut at text weight: a monoline geometric K (stem, kerf, arms) followed by a circular e, an r and an f drawn on a 100-unit cap height with a 14-unit stroke and a 72-unit x-height. The kerf in the K is the only break in the word.
- **The palette** is a dark shop: warm charcoal, bone, one brand wood, two model woods, one chalk line.

## Logo

The files are in this folder. The wordmark is the logo; the symbol is the icon. They never sit side by side at the same size, because a K before a word that starts with K reads "K Kerf".

- **Primary logo** = the wordmark alone (`kerf-wordmark-bone.svg` on dark, `kerf-wordmark-charcoal.svg` on light). The kerf in its K is the mark. Always `ink`; never `wood` or `signal`. Use it for the README banner, the website header, the splash screen, print and the title block's name line.
- **Symbol** (`kerf-mark-bone.svg`, `kerf-mark-charcoal.svg`, `kerf-mark-oak.svg`): square, no container, no padding in the file. It lives in exactly four places: the app icon, the favicon, the avatar (GitHub, social), and the title block's corner. The one exception is app chrome: at 14–16 px it may sit beside a document name in the title bar ("▮< Bookcase 36 — Kerf"), where it reads as an icon, not an initial.
- **Favicon**: the same symbol file, no small-size variant. The 32-unit grid lands on whole pixels at 16, 32, 64 and 128 px: at 16 px the stem is 5 px and the kerf exactly 1 px. The app serves it as `packages/app/public/favicon.svg`, in `ink` for the browser's theme.
- **App icon** (`kerf-app-icon.svg`): a 512 rounded square (`radius-icon`, 22%) in charcoal `#2a2926`, the K in `wood` at 62% of the square. The kerf shows the charcoal through the oak: a wooden block with one cut. Do not put the icon's container around the symbol anywhere else.
- **Avatar**: the symbol in `wood` on a `#2a2926` circle or square, same 62% inset as the icon.

Rules:

- Clear space around the wordmark is one `space-6` (24 px) at the 100-unit cap size, scaling with it; nothing enters it.
- Minimum sizes: wordmark 12 px cap height; symbol 16 px.
- Never rotate, outline, add a shadow, gradient, bevel or texture, or recolour outside `ink` (wordmark), `wood` and the charcoal of the icon (symbol). Never set the word in another typeface. Never put teeth on the K.
- Never place the symbol before, after or above the wordmark as a lockup. If a layout seems to need both, it needs the wordmark.
- The kerf is a gap, not a line. Nothing is ever drawn inside it.

## Colour

Dark is the default theme; the workspace is a calm charcoal and the wood-toned model is the hero. Every text colour holds at least 4.5:1 on every surface it is allowed on, in both themes; the exact ratios are in each token's usage note.

- Set the workspace on `surface`; panels, sidebars and tables on `surface-raised`; inputs and the sheet canvas on `surface-sunken`; a hovered row or button on `surface-hover`.
- All text is `ink` or `ink-muted`. Never tint text with `wood` or `signal` except for a link, a selected value or a dimension readout.
- Three woods, three jobs. `wood` is the brand colour — the symbol in the app icon and avatar — and nothing in the interface: never a model fill, a button, a tag, a decoration or a state. The model uses `wood-sheet` for sheet stock (plywood, MDF, particleboard) and `wood-solid` for solid boards, legs and face frames; the two differ in lightness, not just hue, so sheet and solid read apart at a glance. The renderer's lighting shades the edge faces; there is no end-grain token. Labels on a board use `on-wood-sheet` or `on-wood-solid`.
- `signal` is the chalk line, and it is the only colour that means UI state: every dimension, extension line and measurement chip; the selected part, row or value (`signal` outline over a `signal-faint` wash); links; and the focus ring (`stroke-focus`, solid `signal`, offset 2 px, on every surface). Hover is not a colour: it is one surface step, `surface-hover`. `wood` is never a state.
- `warning` is straw yellow for things that are not errors — a board drawn without its joint cuts, a part not yet placed on a sheet, an estimate. Draw it as a dashed outline (`stroke-part`, 6/4) with a word ("No joinery yet"), never a solid fill, never colour alone. It is lighter than `danger` in dark and darker in light, so the two never rely on hue.
- `danger` is orange, deliberately not red, so it never relies on red-versus-green against `signal` blue. Draw it as a solid outline with a word ("Won't fit"), never colour alone.
- Borders: `line` for structure, `line-strong` for borders that mean something (3:1 or better on every surface). No shadows anywhere; depth comes from the surfaces and a hairline.

## Type

- Headings and the brand voice in Archivo (`display`), weights 500–600, tight tracking as the styles define. Archivo is a plain grotesque with a straight-legged K; it is the closest hosted face to the wordmark's construction. Never use Archivo for the wordmark itself — the wordmark is drawn.
- Everything else in IBM Plex Sans (`ui`). Every measurement is set in `dimension` or `dimension-lg` with `font-variant-numeric: tabular-nums`, so a column of lengths lines up like a rule.
- Write fractions the way the shop does — `3/4`, `11 1/4` — never decimals in the interface, never a stacked fraction glyph. Units are `in.` and `mm`, lowercase, in `ink-muted` after the number.
- Plain text exports and the CLI use IBM Plex Mono (`code`).
- Both families are bundled with the app from the `@fontsource` packages (`@fontsource/ibm-plex-sans` 400, 500, 600; `@fontsource/archivo` 600), so Kerf never calls a font host and works offline. Fallback stacks are in `type.families`.

## Voice

Kerf speaks shop language, not CAD jargon.

- Say "rip", "crosscut", "dado", "rabbet", "face frame", "sheet", "stock", "offcut". Banned in the interface: "mesh", "vertex", "face" (a face frame is fine; a model's face is not), "component", "instance", "material", "extrude", "boolean". Plywood, MDF and lumber are all "stock" — sheet stock or solid stock — never "material".
- Lead with the thing, then the number: "Shelf, 34 1/2 × 11 1/4 × 3/4". Sentence case everywhere; `label` is the one uppercase style.
- Short, declarative, no exclamation marks. Do: "Four shelves, dadoed 3/8 deep." Don't: "Awesome! Your shelves are ready!"
- Errors name the part and the fix: "Side B won't fit a 48 × 96 sheet. Turn the grain or split the panel."

## Drawings and layout

- Sheet layouts: parts as `wood-sheet` rectangles (or `wood-solid` for board stock) on `surface-sunken`, separated by a `space-1` gap that stands for the kerf, outlined with `stroke-part` in `line-strong`, labelled in `on-wood-sheet` or `on-wood-solid`. The selected part takes a `signal` outline.
- Dimension lines in `signal` at `stroke-dimension`, extension lines the same, terminated by a perpendicular tick rather than an arrowhead.
- Every cut sheet carries the title block in its bottom-right corner: the symbol, project name in `heading-3`, stock and sheet size in `dimension`, sheet number and kerf width in `label` captions, framed in `line-strong`.
- Corners are square (`radius-0`) on everything that represents wood or paper; `radius-md` is for controls only.

## Iconography

Interface icons are 16 px, 1.5 px stroke, square-capped, drawn on a 2 px grid in `ink` or `ink-muted` — the same discipline as the mark. No filled icons, no rounded-blob icons, no emoji. A good outline icon set with square terminals (Lucide at `stroke-linecap: square`) is acceptable until the house set exists.

## Never

Saw blades with teeth, cartoon animals, trees and leaves, wood-burn or distressed textures, hand-drawn script, gradients, drop shadows, 3D chrome, and any wood colour beyond the three tokens: `wood` for the brand, `wood-sheet` and `wood-solid` for the model.

## In the app

The app's tokens (`packages/app/src/tokens.css`) keep their own names and take these values; ADR 017 has
the table that maps one to the other.
