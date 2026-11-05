import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGenerationData, GRAPH_FILES, isSystem, SIDE_FILES } from '../src/model/parse';
import { buildGraphModel, type GraphModel } from '../src/model/graphModel';
import { buildMapLayout, clampSpacing, colorIndex, computeFrame, MAP_EXTENT, SPACING_MAX, SPACING_MIN, type MapLayout } from '../src/model/mapLayout';
import type { ViewState } from '../src/model/graphView';
import { STRUCTURAL_KINDS } from '../src/model/kinds';
import { projectRoles } from '../src/model/roles';
import { coverageRows } from '../src/model/coverage';
import { staticSource } from '../src/model/source';
import type { GenerationData, GenerationInfo } from '../src/model/types';

function load(dir: string): GenerationData {
  const texts: Record<string, string | null> = {};
  for (const f of ['manifest.json', 'run.json', ...GRAPH_FILES, ...SIDE_FILES]) texts[f] = existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : null;
  return buildGenerationData(texts, []);
}

function state(model: GraphModel, over: Partial<ViewState> = {}): ViewState {
  return {
    expanded: new Set(),
    hidden: new Set(),
    edgeKinds: new Set([...model.edgeKinds.keys()].filter((k) => !STRUCTURAL_KINDS.has(k))),
    entityKinds: new Set(model.entityKinds.keys()),
    origins: new Set(['source', 'generated']),
    resolutions: new Set(model.resolutions.keys()),
    usages: new Set(model.usages.keys()),
    disabledRoots: new Set(),
    hideTests: false,
    hideIsolated: false,
    minWeight: 1,
    mergeKinds: true,
    focus: null,
    searchFilter: null,
    maxFocusNodes: 400,
    ...over,
  };
}

const data = load(path.join(__dirname, '..', 'fixtures', 'mini-system'));
const model = buildGraphModel(data);

const HOST = 'api/dotnet:src/Host/Host.csproj';
const CORE = 'api/dotnet:src/Core/Core.csproj';
const PKG = 'tool/dotnet:pkg:Api.Core@1.0.0:Api.Core';
const LIST = 'web/ts:.:src/app/orders.service#OrdersService.list';

describe('system generation', () => {
  it('is recognised and parses inputs, packages and traces', () => {
    expect(isSystem(data)).toBe(true);
    expect(data.inputs.map((i) => i.id)).toEqual(['api', 'web', 'tool']);
    expect(data.packages).toHaveLength(1);
    expect(data.traces).toHaveLength(1);
    expect(data.counts).toMatchObject({ inputs: 3, packages: 1, traces: 1 });
  });

  it('puts every input repository on top, holding its projects and packages', () => {
    expect(model.roots).toEqual(['repo:api', 'repo:tool', 'repo:web']);
    expect(model.nodes.get('repo:api')!.label).toBe('api');
    expect(model.nodes.get('repo:api')!.children).toEqual(['api/prj:core', 'api/prj:host']);
    expect(model.nodes.get('repo:tool')!.children).toEqual(['tool/prj:core', 'tool/group:packages']);
    expect(model.nodes.get('tool/pkg:Api.Core@1.0.0')!.parent).toBe('tool/group:packages');
    expect(model.nodes.get(`${PKG}:T:Api.Core.Order`)!.parent).toBe('tool/pkgns:Api.Core@1.0.0:Api.Core');
  });

  it('keeps the project as root (colour, tests) and the repository as top', () => {
    const n = model.nodes.get(`${HOST}:M:Api.Host.OrdersController.Get`)!;
    expect(n.root).toBe('api/prj:host');
    expect(n.top).toBe('repo:api');
    expect(n.input).toBe('api');
    expect(model.nodes.get('repo:web')!.root).toBe('repo:web');
  });

  it('resolves project paths per input, though they repeat across inputs', () => {
    expect(model.nodes.get(`${CORE}:T:Api.Core.Order`)!.parent).toBe('api/prj:core');
    expect(model.nodes.get('tool/dotnet:src/Core/Core.csproj:T:Tool.Core.Runner')!.parent).toBe('tool/prj:core');
    const refs = model.edges.filter((e) => e.kind === 'project_reference').map((e) => `${e.from} -> ${e.to}`);
    expect(refs).toEqual(['api/prj:host -> api/prj:core']);
    const pkgRefs = model.edges.filter((e) => e.kind === 'package_reference').map((e) => `${e.from} -> ${e.to}`);
    expect(pkgRefs).toEqual(['tool/prj:core -> tool/pkg:Api.Core@1.0.0']);
    expect(model.dangling.count).toBe(0);
  });

  it('draws system links between their sides; unresolved and input-local links stay off the map', () => {
    const links = model.edges.filter((e) => e.link).map((e) => `${e.kind}: ${e.from} -> ${e.to}`);
    expect(links).toEqual([`configured_route: ${LIST} -> ${HOST}:M:Api.Host.OrdersController.Get`, `implemented_by_package: ${PKG}:T:Api.Core.Order -> ${CORE}:T:Api.Core.Order`]);
    expect(model.unknownKinds).toEqual([]);
    // The package entity is metadata: the map can draw it at the project that references the package.
    expect(model.edges.find((e) => e.kind === 'implemented_by_package')!.fromAlt).toBe('tool/prj:core');
  });

  it('reads roles and coverage per input', () => {
    expect(Object.fromEntries(projectRoles(data))).toEqual({ 'api/prj:host': 'service', 'api/prj:core': 'library', 'tool/prj:core': 'library', 'web/prj:app': 'frontend' });
    expect(coverageRows(data).map((c) => c.id)).toEqual(['api/prj:host', 'api/prj:core', 'tool/prj:core', 'web/prj:app']);
  });
});

describe('system map', () => {
  const s = state(model);
  const layout = buildMapLayout(model, s);

  it('lays out repositories as top-level regions with their projects inside', () => {
    expect([...layout.roots].sort()).toEqual(['repo:api', 'repo:tool', 'repo:web']);
    expect(layout.nodes.get('api/prj:host')!.parent).toBe('repo:api');
    expect(layout.nodes.get('api/prj:host')!.top).toBe('repo:api');
    // Packages are metadata, hidden by default: tool's package group leaves the map, the repository stays.
    expect(layout.nodes.has('tool/group:packages')).toBe(false);
    const colors = colorIndex(layout);
    expect(colors.get('repo:api')).toBeDefined();
    expect(colors.get('api/prj:host')).toBeDefined();
    expect(new Set(colors.values()).size).toBe(colors.size);
  });

  it('aggregates cross-repository links between the repositories at the overview', () => {
    const f = computeFrame(model, layout, s, { scale: 0.01, minX: -MAP_EXTENT, minY: -MAP_EXTENT, maxX: MAP_EXTENT, maxY: MAP_EXTENT });
    const pairs = f.edges.map((e) => `${[e.source, e.target].sort().join(' ')} ${Object.keys(e.kinds).sort().join(',')}`).sort();
    expect(pairs).toEqual(['repo:api repo:tool implemented_by_package', 'repo:api repo:web configured_route']);
  });

  it('routes a package link to the package entity once metadata is shown', () => {
    const all = state(model, { origins: new Set(['source', 'generated', 'metadata']) });
    const l = buildMapLayout(model, all);
    const f = computeFrame(model, l, all, { scale: 100, minX: -MAP_EXTENT, minY: -MAP_EXTENT, maxX: MAP_EXTENT, maxY: MAP_EXTENT });
    const pkg = f.edges.find((e) => e.kinds.implemented_by_package);
    expect([pkg!.source, pkg!.target].sort()).toEqual([`${CORE}:T:Api.Core.Order`, `${PKG}:T:Api.Core.Order`].sort());
  });
});

describe('static sources of a system', () => {
  afterEach(() => vi.unstubAllGlobals());
  const info: GenerationInfo = {
    id: 'acme',
    label: 'acme',
    repository: null,
    repoKey: 'acme',
    commit: `system:${'d'.repeat(64)}`,
    status: 'complete',
    schemaVersion: '1.2',
    hasSource: true,
    generationType: 'system',
    inputs: data.inputs.map((i) => ({ id: i.id, repository: i.repository?.remoteUrl ?? null, commit: i.commit ?? null })),
  };

  it('reads a file from the repository of its input, at the input commit', async () => {
    const fetch = vi.fn(async () => new Response('source'));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('location', { href: 'https://example.test/viewer/' });
    const s = staticSource(info);
    expect(await s.readSource('src/app/orders.service.ts', 'repository', 'web')).toBe('source');
    expect(fetch).toHaveBeenCalledWith(`https://raw.githubusercontent.com/acme/web/${'b'.repeat(40)}/src/app/orders.service.ts`);
    expect(await s.readSource('generated/x.cs', 'generation', 'api')).toBeNull();
    expect(s.inputHint!('web')).toContain(`acme/web.git at bbbbbbb`);
  });
});

describe('map spacing', () => {
  const s = state(model, { origins: new Set(['source', 'generated', 'metadata']) });

  const check = (layout: MapLayout) => {
    for (const n of layout.order) {
      for (const v of [n.x, n.y, n.r]) expect(Number.isFinite(v)).toBe(true);
      expect(n.r).toBeGreaterThan(0);
      if (!n.parent) continue;
      const p = layout.nodes.get(n.parent)!;
      expect(Math.hypot(n.x - p.x, n.y - p.y) + n.r).toBeLessThanOrEqual(p.r + 1e-6);
    }
    // Siblings never overlap.
    for (const n of layout.order) {
      const siblings = n.parent ? layout.nodes.get(n.parent)!.children : layout.roots;
      for (const id of siblings) {
        if (id <= n.id) continue;
        const m = layout.nodes.get(id)!;
        expect(Math.hypot(n.x - m.x, n.y - m.y)).toBeGreaterThanOrEqual(n.r + m.r - 1e-6);
      }
    }
  };

  it('keeps every circle nested and finite at both ends of the range', () => {
    for (const k of [SPACING_MIN, 1, SPACING_MAX]) check(buildMapLayout(model, s, k));
  });

  it('leaves more room between circles as spacing grows', () => {
    const tight = buildMapLayout(model, s, SPACING_MIN);
    const wide = buildMapLayout(model, s, SPACING_MAX);
    // With more padding the leaves shrink inside the same extent.
    expect(wide.nodes.get(`${HOST}:M:Api.Host.OrdersController.Get`)!.r).toBeLessThan(tight.nodes.get(`${HOST}:M:Api.Host.OrdersController.Get`)!.r);
  });

  it('clamps stored values to the slider range', () => {
    expect(clampSpacing(10)).toBe(SPACING_MAX);
    expect(clampSpacing(0)).toBe(SPACING_MIN);
    expect(clampSpacing(Number.NaN)).toBe(1);
    expect(clampSpacing('2')).toBe(1);
  });
});

// Smoke test on a real system generation: CV_SYSTEM_SAMPLE=/path/to/_generations/lab-system npm test
const sample = process.env.CV_SYSTEM_SAMPLE;
describe.skipIf(!sample || !existsSync(sample))('real system generation', () => {
  it('builds one region per input and draws its system links', () => {
    const d = load(sample!);
    const m = buildGraphModel(d);
    const inputs = d.inputs.filter((i) => i.included !== false);
    expect(m.roots.filter((r) => r.startsWith('repo:'))).toHaveLength(inputs.length);
    expect(m.dangling.count).toBe(0);
    const system = d.links.filter((l) => l.scope === 'system' && l.to);
    expect(m.edges.filter((e) => e.link?.scope === 'system')).toHaveLength(system.length);
    for (const k of [SPACING_MIN, SPACING_MAX]) {
      const l = buildMapLayout(m, state(m), k);
      for (const n of l.order) expect(Number.isFinite(n.x + n.y + n.r)).toBe(true);
    }
  });
});
