# Design system

Dark-only developer tool. shadcn/ui components themed by the tokens in `src/index.css`. Neutral accent: white is the only highlight colour in the chrome; colour is reserved for data (projects, symbol kinds, relation kinds).

## Tokens

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `canvas` < `background` < `surface-1` < `card` < `popover` < `surface-3` | Map canvas, app background, sidebar and panels, cards, menus, hover and selection |
| Borders | `border-subtle`, `border`, `border-strong` | Separators, cards and inputs, hover and focus. Always 1px. |
| Text | `foreground`, `muted-foreground`, `subtle-foreground`, `faint-foreground` | Primary, secondary, labels and metadata, decoration only. The first three meet 4.5:1 on `card`. |
| Accent | `primary` (white), `ring` | Primary button, selection ring, focus ring. Selected rows: `surface-3` plus a 2px white bar. |
| Semantic | `success`, `warning`, `destructive`, `info` | Status badges and alerts: text in the colour, background at 10%, border at 30%. |

## Type and space

- Type scale: 11 / 12 / 13 (UI body) / 14 / 16 / 20 / 24 (`text-2xs` to `text-2xl`). Numbers tabular. Mono only for ids, paths and code.
- Section labels: 11px, uppercase, `tracking-[0.08em]`, `subtle-foreground`.
- 4px grid. Panels pad 16, sections gap 24, list rows 32 (dense 28).
- Radius: 6 inputs and small buttons, 8 buttons and rows, 12 cards and panels. Shadows only on popovers and dialogs.

## Data colours

One OKLCH family in `src/theme/palette.ts`: projects (`projectColor`), symbol kinds (`symbolColor`), relation kinds (`relationColor`). Same lightness and chroma, so no data colour shouts louder than another. Never hard-code a hex for data.

## Building blocks

`src/components/blocks.tsx`: `PageHeader`, `Section`, `StatCard`, `EmptyState`, `KeyValue`, `PathText`, `CopyButton`, `CodeBlock`, `middleTruncate`. `KindGlyph` for symbol kinds. Pages compose these and shadcn components; no one-off styles.
