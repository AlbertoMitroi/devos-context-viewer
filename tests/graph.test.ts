import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEvidenceIndex, buildGenerationData, GRAPH_FILES, SIDE_FILES } from '../src/model/parse';
import { buildGraphModel, searchNodes } from '../src/model/graphModel';
import { computeView, expandedForLevel, shortestPath, type ViewState } from '../src/model/graphView';
import { STRUCTURAL_KINDS } from '../src/model/kinds';

const dir = path.join(__dirname, '..', 'fixtures', 'mini');
const read = (f: string) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : null);
const texts: Record<string, string | null> = {};
for (const f of ['manifest.json', 'run.json', ...GRAPH_FILES, ...SIDE_FILES]) texts[f] = read(f);
const data = buildGenerationData(texts, []);
const model = buildGraphModel(data);

const P = 'dotnet:src/App/App.csproj';
const C = 'dotnet:src/Core/Core.csproj';
const K = 'dotnet:pkg:Lib.Pkg@1.0.0:Lib';
const RUN = `${P}:M:Acme.App.Service.Run`;
const REPO = `${C}:T:Acme.Core.Repo`;
const REPO_GET = `${C}:M:Acme.Core.Repo.Get`;

function state(over: Partial<ViewState> = {}): ViewState {
  return {
    expanded: new Set(),
    hidden: new Set(),
    edgeKinds: new Set([...model.edgeKinds.keys()].filter((k) => !STRUCTURAL_KINDS.has(k))),
    entityKinds: new Set(model.entityKinds.keys()),
    origins: new Set(['source', 'generated', 'metadata']),
    resolutions: new Set(model.resolutions.keys()),
    usages: new Set(model.usages.keys()),
    disabledRoots: new Set(),
    hideTests: false,
    hideIsolated: false,
    minWeight: 1,
    mergeKinds: false,
    focus: null,
    searchFilter: null,
    maxFocusNodes: 400,
    ...over,
  };
}

const edgeKey = (v: ReturnType<typeof computeView>) => v.edges.map((e) => `${e.source} -> ${e.target} [${e.kind}] x${e.count}`).sort();

describe('hierarchy', () => {
  it('nests project > namespace > type > member and packages under a group', () => {
    expect(model.roots).toEqual(['prj:app', 'prj:core', 'prj:tests', 'group:packages']);
    expect(model.nodes.get(RUN)!.parent).toBe(`${P}:T:Acme.App.Service`);
    expect(model.nodes.get(`${K}:T:Lib.Helper`)!.parent).toBe('pkgns:Lib.Pkg@1.0.0:Lib');
    expect(model.nodes.get('pkg:Lib.Pkg@1.0.0')!.parent).toBe('group:packages');
    expect(model.nodes.get(`${P}:T:Acme.App.Service`)!.root).toBe('prj:app');
  });

  it('compacts single-child namespace chains and keeps the old id as alias', () => {
    const merged = model.nodes.get(`${P}:N:Acme.App`)!;
    expect(merged.label).toBe('Acme.App');
    expect(merged.parent).toBe('prj:app');
    expect(model.nodes.has(`${P}:N:Acme`)).toBe(false);
    expect(model.alias.get(`${P}:N:Acme`)).toBe(merged.id);
  });

  it('marks test projects and reports dangling and unknown kinds', () => {
    expect(model.nodes.get('prj:tests')!.isTest).toBe(true);
    expect(model.nodes.get(`dotnet:tests/Core.Tests/Core.Tests.csproj:T:RepoTests`)!.isTest).toBe(true);
    expect(model.dangling.count).toBe(1);
    expect(model.unknownKinds).toEqual(['future.kind']);
  });

  it('derives project and package reference edges', () => {
    const synth = model.edges.filter((e) => e.synthetic).map((e) => `${e.kind}:${e.from}->${e.to}`).sort();
    expect(synth).toEqual(['package_reference:prj:app->pkg:Lib.Pkg@1.0.0', 'project_reference:prj:app->prj:core', 'project_reference:prj:tests->prj:core']);
  });
});

describe('view', () => {
  it('aggregates relations between collapsed roots', () => {
    const v = computeView(model, state());
    expect(v.nodes.map((n) => n.id).sort()).toEqual(['group:packages', 'prj:app', 'prj:core', 'prj:tests']);
    expect(edgeKey(v)).toEqual([
      'prj:app -> group:packages [package_reference] x1',
      'prj:app -> prj:core [calls_declared_target] x1',
      'prj:app -> prj:core [possible_runtime_target] x1',
      'prj:app -> prj:core [project_reference] x1',
      'prj:core -> group:packages [references] x1',
      'prj:tests -> prj:core [project_reference] x1',
      'prj:tests -> prj:core [references] x1',
    ]);
  });

  it('merges kinds into one edge per pair', () => {
    const v = computeView(model, state({ mergeKinds: true }));
    const e = v.edges.find((x) => x.source === 'prj:app' && x.target === 'prj:core')!;
    expect(e.count).toBe(3);
    expect(Object.keys(e.kinds).length).toBe(3);
    expect(e.weakest).toBe('candidate');
  });

  it('expanding shows children as a compound and re-routes edges to them', () => {
    const v = computeView(model, state({ expanded: expandedForLevel(model, 3) }));
    expect(v.nodes.find((n) => n.id === 'prj:core')!.compound).toBe(true);
    expect(edgeKey(v)).toContain(`${RUN} -> ${REPO_GET} [possible_runtime_target] x1`);
    expect(edgeKey(v)).toContain(`${REPO} -> ${C}:T:Acme.Core.IRepo [implements] x1`);
  });

  it('kind filter hides members but lifts their edges to the container', () => {
    const kinds = new Set([...model.entityKinds.keys()].filter((k) => k !== 'method'));
    const v = computeView(model, state({ expanded: expandedForLevel(model, 3), entityKinds: kinds }));
    expect(v.nodes.some((n) => n.id === RUN)).toBe(false);
    expect(edgeKey(v)).toContain(`${P}:T:Acme.App.Service -> ${REPO} [possible_runtime_target] x1`);
  });

  it('origin filter drops metadata nodes and their edges', () => {
    const v = computeView(model, state({ origins: new Set(['source']) }));
    expect(v.nodes.some((n) => n.id === 'group:packages')).toBe(false);
    expect(v.edges.some((e) => e.target === 'group:packages')).toBe(false);
  });

  it('hideTests, disabledRoots and hidden remove nodes', () => {
    expect(computeView(model, state({ hideTests: true })).nodes.some((n) => n.id === 'prj:tests')).toBe(false);
    expect(computeView(model, state({ disabledRoots: new Set(['prj:app']) })).nodes.some((n) => n.id === 'prj:app')).toBe(false);
    const v = computeView(model, state({ expanded: expandedForLevel(model, 3), hidden: new Set([REPO]) }));
    expect(v.nodes.some((n) => n.id === REPO || n.id === REPO_GET)).toBe(false);
  });

  it('hideIsolated removes leaves without edges', () => {
    const kinds = new Set([...model.edgeKinds.keys()].filter((k) => !STRUCTURAL_KINDS.has(k) && k !== 'future.kind'));
    const v = computeView(model, state({ expanded: expandedForLevel(model, 3), hideIsolated: true, edgeKinds: kinds }));
    expect(v.nodes.some((n) => n.id === `${C}:T:Acme.Core.Unused`)).toBe(false);
    expect(v.nodes.some((n) => n.id === REPO)).toBe(true);
  });

  it('focus shows the neighbourhood with ancestors expanded, never traversing unknown kinds', () => {
    const v = computeView(model, state({ focus: { ids: [REPO], depth: 1, direction: 'both' } }));
    const ids = new Set(v.nodes.map((n) => n.id));
    expect(ids.has(REPO)).toBe(true);
    expect(ids.has(`${C}:T:Acme.Core.IRepo`)).toBe(true);
    expect(ids.has('dotnet:tests/Core.Tests/Core.Tests.csproj:T:RepoTests')).toBe(true);
    expect(ids.has(`${C}:T:Acme.Core.Unused`)).toBe(false); // only reachable through future.kind
    expect(ids.has(RUN)).toBe(true); // a type seed stands for its members, so Run reaches Repo.Get
    expect(v.nodes.find((n) => n.id === 'prj:core')!.compound).toBe(true);
  });

  it('directional focus follows only incoming edges', () => {
    const v = computeView(model, state({ focus: { ids: [REPO_GET], depth: 2, direction: 'in' } }));
    const ids = new Set(v.nodes.map((n) => n.id));
    expect(ids.has(RUN)).toBe(true);
    expect(ids.has(`${K}:M:Lib.Helper.Do`)).toBe(false);
  });

  it('finds shortest paths over enabled kinds', () => {
    expect(shortestPath(model, state(), RUN, `${K}:M:Lib.Helper.Do`, true)).toEqual([RUN, REPO_GET, `${K}:M:Lib.Helper.Do`]);
    expect(shortestPath(model, state({ edgeKinds: new Set(['calls_declared_target']) }), RUN, `${K}:M:Lib.Helper.Do`, true)).toBeNull();
  });
});

describe('search and evidence', () => {
  it('ranks exact label matches first and supports kind:', () => {
    expect(searchNodes(model, 'repo')[0]).toBe(REPO);
    expect(searchNodes(model, 'kind:interface')).toEqual([`${C}:T:Acme.Core.IRepo`]);
  });

  it('joins snippets to evidence', () => {
    const idx = buildEvidenceIndex(texts, []);
    expect(idx.evidence.get('ev:1')!.snippet).toBe('snip:1');
    expect(idx.snippets.get('snip:1')).toBe('    repo.Get();');
  });
});

import { buildMapLayout, computeFrame, locate, nearestSibling, OPEN_PX, OPEN_START_PX } from '../src/model/mapLayout';
import { bundle, controlPoints, createEdgeRouter } from '../src/map/edges';
import { contrast, kindColor, projectColor } from '../src/theme/palette';

describe('map', () => {
  const s = state();
  const layout = buildMapLayout(model, s);
  const all = { minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9 };

  it('nests every included node inside its parent circle', () => {
    for (const n of layout.nodes.values()) {
      if (!n.parent) continue;
      const p = layout.nodes.get(n.parent)!;
      expect(Math.hypot(n.x - p.x, n.y - p.y) + n.r).toBeLessThanOrEqual(p.r + 1e-6);
    }
    expect(layout.roots.sort()).toEqual(['group:packages', 'prj:app', 'prj:core', 'prj:tests']);
  });

  it('zoomed out shows only roots, with relations aggregated between them', () => {
    const f = computeFrame(model, layout, s, { scale: 1e-6, ...all });
    expect(f.open.size).toBe(0);
    expect(f.drawn.map((n) => n.id).sort()).toEqual(['group:packages', 'prj:app', 'prj:core', 'prj:tests']);
    const appCore = f.edges.find((e) => [e.source, e.target].sort().join() === 'prj:app,prj:core')!;
    expect(appCore.count).toBe(3); // call + possible runtime target + project reference
  });

  it('zoomed in opens circles and routes relations to members', () => {
    const f = computeFrame(model, layout, s, { scale: 1e6, ...all });
    expect(f.open.has('prj:core')).toBe(true);
    expect(f.edges.some((e) => [e.source, e.target].includes(RUN) && [e.source, e.target].includes(REPO_GET))).toBe(true);
  });

  it('starts opening at OPEN_START_PX and fades children in until OPEN_PX', () => {
    const core = layout.nodes.get('prj:core')!;
    const child = core.children[0];
    expect(computeFrame(model, layout, s, { scale: (OPEN_START_PX - 1) / core.r, ...all }).open.has('prj:core')).toBe(false);
    const mid = computeFrame(model, layout, s, { scale: ((OPEN_START_PX + OPEN_PX) / 2) / core.r, ...all });
    expect(mid.open.has('prj:core')).toBe(true);
    expect(mid.openness.get('prj:core')).toBeCloseTo(0.5, 5);
    expect(mid.fade.get(child)).toBeCloseTo(0.5, 5);
    const full = computeFrame(model, layout, s, { scale: (OPEN_PX * (1 + 1e-9)) / core.r, ...all });
    expect(full.openness.get('prj:core')).toBe(1);
    expect(full.fade.get(child)).toBe(1);
  });

  it('records relation direction on aggregated edges', () => {
    const f = computeFrame(model, layout, s, { scale: 1e-6, ...all });
    const appCore = f.edges.find((e) => [e.source, e.target].sort().join() === 'prj:app,prj:core')!;
    expect(appCore.source).toBe('prj:app');
    expect(appCore.back).toBe(0);
  });

  it('finds the nearest sibling in each direction', () => {
    for (const id of layout.roots) {
      for (const dir of ['left', 'right', 'up', 'down'] as const) {
        const next = nearestSibling(layout, id, dir);
        if (!next) continue;
        const a = layout.nodes.get(id)!;
        const b = layout.nodes.get(next)!;
        const d = dir === 'left' ? a.x - b.x : dir === 'right' ? b.x - a.x : dir === 'up' ? a.y - b.y : b.y - a.y;
        expect(d).toBeGreaterThan(0);
        expect(layout.nodes.get(next)!.parent).toBe(a.parent);
      }
    }
  });

  it('origin filter removes packages from the map and their relations', () => {
    const src = state({ origins: new Set(['source']) });
    const l2 = buildMapLayout(model, src);
    expect(l2.nodes.has('group:packages')).toBe(false);
    const f = computeFrame(model, l2, src, { scale: 1e6, ...all });
    expect(f.edges.some((e) => e.target.includes('pkg') || e.source.includes('pkg'))).toBe(false);
  });

  it('locates the deepest open circle under a point for the breadcrumb', () => {
    const core = layout.nodes.get('prj:core')!;
    const f = computeFrame(model, layout, s, { scale: (OPEN_PX * (1 + 1e-9)) / core.r, ...all });
    expect(locate(layout, f.open, core.x, core.y)[0]).toBe('prj:core');
  });
});

describe('edge bundling', () => {
  const s = state();
  const layout = buildMapLayout(model, s);

  it('routes through the lowest common ancestor', () => {
    const cps = controlPoints(layout, RUN, REPO_GET);
    const run = layout.nodes.get(RUN)!;
    const get = layout.nodes.get(REPO_GET)!;
    expect(cps[0]).toEqual([run.x, run.y]);
    expect(cps[cps.length - 1]).toEqual([get.x, get.y]);
    // Different projects: no common ancestor, so the route passes the map centre between the two chains.
    expect(cps.some(([x, y]) => x === 0 && y === 0)).toBe(true);
    const sameProject = controlPoints(layout, REPO_GET, `${C}:M:Acme.Core.IRepo.Get`);
    const ns = layout.nodes.get(`${C}:N:Acme.Core`)!;
    expect(sameProject).toContainEqual([ns.x, ns.y]);
  });

  it('keeps the endpoints and caches paths', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [20, 10]];
    const b = bundle(pts);
    expect(b[0]).toEqual([0, 0]);
    expect(b[b.length - 1]).toEqual([20, 10]);
    const route = createEdgeRouter(layout);
    expect(route(RUN, REPO_GET)).toBe(route(RUN, REPO_GET));
  });
});

describe('palette', () => {
  it('keeps light label text readable on every project and kind colour with the label halo', () => {
    const halo: [number, number, number] = [8, 12, 22];
    const text: [number, number, number] = [244, 247, 252];
    expect(contrast(text, halo)).toBeGreaterThan(4.5);
    for (let i = 0; i < 40; i++) expect(contrast(projectColor(i), halo)).toBeGreaterThan(3);
    for (const k of ['class', 'interface', 'method', 'property', 'field', 'enum']) expect(contrast(kindColor(k), halo)).toBeGreaterThan(3);
  });
});

import { fitLabel } from '../src/map/labels';

describe('map labels', () => {
  it('splits long identifiers at camelCase boundaries before truncating', () => {
    expect(fitLabel('Orders', 10, true)).toBe('Orders');
    const two = fitLabel('BeginTransactionAsync', 12, true).split('\n');
    expect(two).toHaveLength(2);
    expect(two.every((l) => l.length <= 12)).toBe(true);
    expect(fitLabel('BeginTransactionAsync', 12, false)).toBe('BeginTransa…');
  });
});
