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
