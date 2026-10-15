# ADR 017: The brand kit

Status: Accepted (maintainer, 2026-10-15).

## Context

ADR 010 set up design tokens "so the light theme and later branding are a token swap, not a redesign".
The maintainer commissioned a brand kit (made in Claude Design, reviewed against the codebase on
2026-10-14/15) and approved it. The kit lives in `docs/brand/`: the guide (`README.md`), the tokens
(`tokens.json`) and the logo files. The kit's type differs from the Interaction spec, which said "the system
UI font at 12-13 px in panels"; the maintainer approved the change on 2026-10-15.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | `docs/brand/` is the source of truth for colour, type and the logo. | One place to change the brand. |
| D2 | The app keeps its token names and takes the kit's values (table below). | Code written against today's names, including the M4.5 branch, keeps working; the kit's names describe the brand, the app's describe where a colour is used. |
| D3 | `--color-hover` is renamed `--color-selection`. | It was only ever used for the selected tree row; the kit says selection is a `signal-faint` wash and hover is a surface step. |
| D4 | `signal` blue replaces the oak accent for every state: the active step, the primary button, the selected tab, a pressed button, the focus ring. | The kit: "`signal` is the only colour that means UI state"; `wood` is never a state. |
| D5 | Inputs and buttons take the new `--color-border-strong` (3:1 on every surface); panel dividers keep `--color-border`. | WCAG 1.4.11: a control's boundary needs 3:1. The kit's `line` is decorative. |
| D6 | Type: IBM Plex Sans (400, 500, 600) for the interface at 14 px, 12 px for small text; Archivo 600 for headings. Replaces the Interaction spec's "system UI font at 12-13 px". | The kit's type. Plex has tabular numerals, which every dimension column needs; Archivo is the hosted face closest to the drawn wordmark. |
| D7 | Fonts are bundled from `@fontsource` (OFL-1.1), never loaded from Google Fonts. | Kerf works offline and calls no third party. |
| D8 | The logo is the drawn wordmark; the symbol is the icon (favicon, app icon, avatar), never set beside the wordmark. | The kit: a K before a word starting with K reads "K Kerf". |
| D9 | The favicon is one SVG that draws the symbol in `ink` for the browser's light or dark theme. | One file, crisp at 16 px (the kerf is exactly 1 px). |

## Token mapping

| App token | Kit token | Dark | Light |
| --- | --- | --- | --- |
| `--color-bg` (page, inputs, wells) | `surface-sunken` | #161513 | #eae6dd |
| `--color-viewport` (the model's ground) | `surface` | #1d1c1a | #f4f1ea |
| `--color-surface` (panels, top bar) | `surface-raised` | #262522 | #fbf9f5 |
| `--color-surface-raised` (buttons, toolbars, popovers) | `surface-hover` | #2f2d29 | #ebe7de |
| `--color-selection` (selected row) | `signal-faint` | #1a2f48 | #dbe8fa |
| `--color-border` | `line` | #34322e | #d9d4c9 |
| `--color-border-strong` | `line-strong` | #7a756e | #85807a |
| `--color-text` | `ink` | #ece7dd | #1d1c1a |
| `--color-text-muted` | `ink-muted` | #9a9589 | #66615a |
| `--color-accent`, `--color-focus` | `signal` | #4d9df0 | #1a64c4 |
| `--color-step-active-text` | `on-signal` (= `on-danger`) | #1d1c1a | #ffffff |
| `--color-error` | `danger` | #f0865c | #b4421b |
| `--color-warning` | `warning` | #e3bf47 | #7a5c00 |
| `--color-wood-sheet` | `wood-sheet` | #dcc8a0 | #c4a878 |
| `--color-on-wood-sheet` | `on-wood-sheet` | #1d1c1a | #1d1c1a |
| `--color-wood-solid` | `wood-solid` | #b8803f | #7e5327 |

The tightest pairs, worked by hand from the WCAG formula (and tested in `tokens.test.ts`): light `danger`
on `--color-bg`, 4.51:1; dark `--color-border-strong` on `--color-surface-raised`, 3.01:1.

## Consequences

- The Interaction spec's "Type" bullet now cites this ADR.
- Panel text is 1 px larger; the reviewer checks the fixed-width panels in both themes.

## Known gaps

- The logo files are GPL-3.0 like the rest of the repository. There is no trademark policy yet saying how
  others may use the name and logo.
- No PNG favicon: a browser without SVG favicon support shows its default icon.
- Not yet adopted from the kit: `wood-solid` labels (`on-wood-solid`), the dashed `warning` outline, the
  title block, the 16 px outline icon set, and IBM Plex Mono for exports. Each lands with the feature that
  draws it.
