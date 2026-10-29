# context-viewer

A consumer for the generations produced by [dotnet-intelligence](../dotnet-intelligence): it reads the artifact contract (manifest, `graph/*.ndjson`, snippets, `context/`, `wiki/`) and lets you explore it visually. It never writes to a generation.

## Views

| View | What it is for |
|---|---|
| **Map** (default) | Zoomable map of the whole repository. Projects are large circles; zooming in opens them to namespaces, then types, then members. Relations aggregate between whatever is visible at the current zoom. Scroll to zoom, drag to pan, double-click a circle to fly into it, click for details. |
| **Neighbourhood** | Force graph around a focused symbol: neighbourhood, callers, callees, type hierarchy, shortest path. Reached from Focus / Callers / Callees on any symbol. |
| **Tables** | Every record (entities, relations, declarations, observations, links, diagnostics, projects, contexts, files), filterable and sortable. |
| **Summary** | Manifest, coverage per project, counts, run stages, diagnostics, contract warnings (unknown capabilities or kinds, dangling ids). |
| **Context & wiki** | The generation's Markdown context packs and wiki, with Mermaid diagrams. |

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

## Stack

- React + TypeScript + Vite.
- Map: deck.gl (WebGL, map-style pan and zoom) with a d3-hierarchy circle-packing layout computed once per filter set; level of detail is decided per frame from the on-screen radius of each circle.
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
