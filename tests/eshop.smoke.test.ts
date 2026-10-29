// Smoke test against a real generation when CV_SAMPLE points to one; skipped otherwise.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGenerationData, GRAPH_FILES } from '../src/model/parse';
import { buildGraphModel } from '../src/model/graphModel';
import { computeView, expandedForLevel, type ViewState } from '../src/model/graphView';
import { STRUCTURAL_KINDS } from '../src/model/kinds';

const sample = process.env.CV_SAMPLE;

describe.skipIf(!sample || !existsSync(sample))('real generation smoke', () => {
  it('builds the model and views at every level quickly', () => {
    const texts: Record<string, string | null> = {};
    for (const f of ['manifest.json', 'run.json', ...GRAPH_FILES]) {
      const p = path.join(sample!, f);
      texts[f] = existsSync(p) ? readFileSync(p, 'utf8') : null;
    }
    let t = performance.now();
    const data = buildGenerationData(texts, []);
    const model = buildGraphModel(data);
    console.log('model ms', Math.round(performance.now() - t), 'nodes', model.nodes.size, 'roots', model.roots.length, 'edges', model.edges.length, 'dangling', model.dangling, 'unknown', model.unknownKinds);
    expect(data.parseErrors).toEqual([]);
    const s: ViewState = {
      expanded: new Set(), hidden: new Set(),
      edgeKinds: new Set([...model.edgeKinds.keys()].filter((k) => !STRUCTURAL_KINDS.has(k))),
      entityKinds: new Set(model.entityKinds.keys()), origins: new Set(['source', 'generated', 'metadata']),
      resolutions: new Set(model.resolutions.keys()), usages: new Set(model.usages.keys()),
      disabledRoots: new Set(), hideTests: false, hideIsolated: false, minWeight: 1, mergeKinds: false,
      focus: null, searchFilter: null, maxFocusNodes: 400,
    };
    for (const level of [0, 1, 2, 3]) {
      t = performance.now();
      const v = computeView(model, { ...s, expanded: expandedForLevel(model, level) });
      console.log('level', level, 'ms', Math.round(performance.now() - t), 'nodes', v.nodes.length, 'edges', v.edges.length, v.stats);
      expect(v.nodes.length).toBeGreaterThan(0);
    }
    const target = [...model.nodes.values()].find((n) => n.kind === 'interface' && n.origin === 'source')!;
    t = performance.now();
    const f = computeView(model, { ...s, focus: { ids: [target.id], depth: 2, direction: 'both' } });
    console.log('focus', target.id, 'ms', Math.round(performance.now() - t), 'nodes', f.nodes.length, 'edges', f.edges.length, f.stats);
    expect(f.nodes.some((n) => n.id === target.id)).toBe(true);
  });
});
