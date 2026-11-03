# context-viewer

A consumer for the generations produced by [dotnet-intelligence](../devos-dotnet-intelligence): it reads the artifact contract (manifest, `graph/*.ndjson`, snippets, `context/`, `wiki/`) and lets you explore it visually. It never writes to a generation.

## Views

| View | What it is for |
|---|---|
| **Map** (default) | Zoomable map of the whole repository. Projects are large circles; zooming in opens them to namespaces, then types, then members. Relations aggregate between whatever is visible at the current zoom. Scroll to zoom, drag to pan, double-click a circle to fly into it, click for details. |
| **Neighbourhood** | Force graph around a focused symbol: neighbourhood, callers, callees, type hierarchy, shortest path. Reached from Focus / Callers / Callees on any symbol. |
| **Tables** | Every record (entities, relations, declarations, observations, links, diagnostics, projects, contexts, files), filterable and sortable. |
| **Summary** | Manifest, coverage per project, counts, run stages, diagnostics, contract warnings (unknown capabilities or kinds, dangling ids). |
| **Context & wiki** | The generation's Markdown context packs and wiki, with Mermaid diagrams. |

### Project shapes

On the map, the shape of a project says what it is; its colour only tells projects apart. The role is read from the generation (the contract has no role field yet), in this order:

| Shape | Role | Read from |
|---|---|---|
| dashed circle | Tests | test path (`*Tests`, `test/`) or a direct xunit, MSTest, NUnit or `Microsoft.NET.Test.Sdk` reference |
| diamond | Front end | Angular `projectType: application`, a `MauiProgram` class, or an entry point plus Blazor components or Razor Pages |
| octagon | Orchestration | an entry point plus a direct `Aspire.Hosting.AppHost` reference |
| circle | Service | any other entry point (`Main`, top-level statements) |
| rounded square | Library | no entry point, and Angular libraries |
| hexagon | External package | NuGet or npm packages under *External packages* |

Shapes are drawn inside each packed circle, so the layout and zooming are unchanged; a project opens into a circle as before. The legend lists the roles on the current map.

### Map navigation

| Input | Action |
|---|---|
| Scroll / pinch | Zoom towards the cursor |
| Drag | Pan, with momentum |
| Click a circle | Fly into it and select it |
| Click empty space inside the circle you are in | Go up to the nearest larger ancestor |
| `←` `→` `↑` `↓` | Move to the nearest sibling in that direction |
| `Enter` / `Backspace` | Go into the selection / go up |
| `F` | Show all projects |
| `I` | Toggle the details panel |
| `L` | Layers and filters |
| `?` | All keyboard shortcuts |
| `⌘K` or `/` | Command palette: jump to any symbol, project or action |
| Browser Back / Forward | Replay map navigation (every position is a deep link) |

Edges are bundled along the containment hierarchy (Holten), drawn faintly above the map and highlighted, with flowing direction particles, for the hovered or selected circle. The breadcrumb at the top shows where you are; each segment has a menu of its siblings.

The inspector shows every field of the selected symbol (unknown fields and `ext.*` included), its declarations with source, and its incoming and outgoing relations with evidence and snippets.

## Run

```bash
npm install
npm run dev
```

Generations are listed from `viewer.config.json` (not committed) or `CV_GENERATIONS`:

```json
{
  "generations": [{ "path": "/path/to/out", "label": "eShop", "source": "/path/to/eShop" }],
  "roots": [{ "path": "/path/to/many/generations", "source": "/path/to/repo" }]
}
```

`source` is the repository checkout, used to show source context for evidence in committed files. Without it, the viewer shows the redacted snippet only. A folder can also be opened from the browser with **+ folder**.

Production build: `npm run build && npm start -- --port 4600`.

## Published site

[albertomitroi.github.io/devos-context-viewer](https://albertomitroi.github.io/devos-context-viewer/) shows the five public lab generations (`devos-lab-core`, `-pricing`, `-intake`, `-leasing`, `-web`), rebuilt by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`, on demand, and on a `repository_dispatch` of type `context-published`:

- `scripts/pull-lab-generations.sh <dir>` pulls `ghcr.io/albertomitroi/context-devos-lab-*:main-<engine>` with ORAS in Docker, checks `manifest.json` against the layer annotation `dev.devos.intelligence.manifest-sha256` and drops `index.sqlite` (the viewer does not read it).
- `node scripts/static-index.mjs <dir>` writes `index.json` and one `<id>.files.json` per generation.
- Without the local API, the viewer reads `generations/index.json` relative to the site (`VIEWER_BASE` sets the Vite base) and fetches repository sources from `raw.githubusercontent.com` at the generation's commit; when that fails, evidence shows the redacted snippet.

To try the static build locally:

```bash
VIEWER_BASE=/devos-context-viewer/ npm run build
scripts/pull-lab-generations.sh dist/generations
node scripts/static-index.mjs dist/generations
npx vite preview --base /devos-context-viewer/
```

## Stack

- React + TypeScript + Vite.
- Map: deck.gl (WebGL) with a d3-hierarchy circle-packing layout computed once per filter set; level of detail is decided per frame from the on-screen radius of each circle, with fade-in between levels. Own camera (smooth zoom to cursor, momentum, van Wijk fly-to via d3-interpolate) and shaded circle layers (custom fragment shader injection).
- UI: shadcn/ui (new-york, zinc, dark) on Tailwind CSS 3, built on the shadcn sidebar + inset application layout: sidebar with generation switcher, views and projects; header with the map breadcrumb, ⌘K command menu, layers sheet and details toggle; resizable details panel. Components live in `src/components/ui` (generated with `npx shadcn@2.3.0 add`). Inter and JetBrains Mono, lucide icons. The map palette is OKLCH (`src/theme/palette.ts`).
- Neighbourhood graph: Cytoscape.js with fCoSE and ELK layouts.
- Parsing runs in a Web Worker; evidence and snippets stay there and are fetched on demand.

## Contract rules applied

- Unknown fields and `ext.*` are preserved and shown, never interpreted.
- Unknown relation kinds are shown and reported, and excluded from traversal (focus, paths).
- Unknown required capabilities are reported on the Summary page.

## Test

```bash
npm test
CV_SAMPLE=/path/to/generation npm test   # adds a smoke test on a real generation
```

## License

MIT, see [LICENSE](LICENSE).
