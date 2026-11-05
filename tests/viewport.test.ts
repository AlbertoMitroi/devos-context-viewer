import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGenerationData, GRAPH_FILES } from '../src/model/parse';
import { buildGraphModel, type GraphModel } from '../src/model/graphModel';
import { buildMapLayout, computeFrame, locate } from '../src/model/mapLayout';
import type { ViewState } from '../src/model/graphView';
import { STRUCTURAL_KINDS } from '../src/model/kinds';
import { fitCamera, needsFit, type Size } from '../src/map/viewport';
import type { Cam } from '../src/map/camera';

function load(dir: string): GraphModel {
  const texts: Record<string, string | null> = {};
  for (const f of ['manifest.json', ...GRAPH_FILES]) texts[f] = existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : null;
  return buildGraphModel(buildGenerationData(texts, []));
}

const state = (model: GraphModel): ViewState => ({
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
});

/** What the map draws for a camera and viewport, as MapView computes it. */
function view(model: GraphModel, cam: Cam, size: Size) {
  const s = state(model);
  const layout = buildMapLayout(model, s);
  const scale = Math.pow(2, cam.zoom);
  const halfW = size.width / 2 / scale || 1;
  const halfH = size.height / 2 / scale || 1;
  const frame = computeFrame(model, layout, s, { scale, minX: cam.x - halfW * 1.3, maxX: cam.x + halfW * 1.3, minY: cam.y - halfH * 1.3, maxY: cam.y + halfH * 1.3 });
  return { layout, frame, drawn: new Set(frame.drawn.map((n) => n.id)) };
}

const fixtures = path.join(__dirname, '..', 'fixtures');
const sample = process.env.CV_SYSTEM_SAMPLE;
const generations = [
  ['single repository', path.join(fixtures, 'mini')],
  ['system', path.join(fixtures, 'mini-system')],
  ...(sample && existsSync(sample) ? [['real system', sample]] : []),
] as const;

describe('first view of a generation', () => {
  const size = { width: 846, height: 828 };

  for (const [name, dir] of generations) {
    it(`fits every top-level circle of a ${name} in the viewport`, () => {
      const model = load(dir);
      const cam = fitCamera(size);
      const { layout, drawn } = view(model, cam, size);
      const scale = Math.pow(2, cam.zoom);
      for (const id of layout.roots) {
        const n = layout.nodes.get(id)!;
        expect(drawn.has(id)).toBe(true);
        expect(Math.abs(n.x - cam.x) + n.r).toBeLessThanOrEqual(size.width / 2 / scale);
        expect(Math.abs(n.y - cam.y) + n.r).toBeLessThanOrEqual(size.height / 2 / scale);
      }
    });
  }

  it('the camera before a measured viewport does not show the overview (the blank map of 74957f0)', () => {
    // Before the fix the map kept its initial camera (zoom -3) with a 0x0 size, drawing only what contains the centre.
    if (!sample || !existsSync(sample)) return;
    const model = load(sample);
    const { layout, drawn, frame } = view(model, { x: 0, y: 0, zoom: -3 }, { width: 0, height: 0 });
    expect(layout.roots.every((id) => drawn.has(id))).toBe(false);
    expect(locate(layout, frame.open, 0, 0).length).toBeGreaterThan(1);
  });

  it('fits once a viewport is measured, again for every other generation, and while the overview is untouched', () => {
    const a = {};
    const b = {};
    const cam = (size: Size) => fitCamera(size);
    const small = { width: 60, height: 600 };
    const full = { width: 846, height: 828 };
    expect(needsFit(null, a, { width: 0, height: 0 }, cam(full), null)).toBe(false);
    expect(needsFit(null, a, { width: 800, height: 0 }, cam(full), null)).toBe(false);
    expect(needsFit(null, a, small, { x: 0, y: 0, zoom: -3 }, null)).toBe(true);
    // The first size was provisional: the panel settled and the camera has not moved since the fit.
    expect(needsFit(a, a, full, cam(small), cam(small))).toBe(true);
    expect(needsFit(a, a, full, cam(full), cam(full))).toBe(false);
    // The user zoomed or panned: a resize keeps their view.
    expect(needsFit(a, a, full, { ...cam(small), zoom: -1 }, cam(small))).toBe(false);
    expect(needsFit(a, b, full, { x: 5, y: 5, zoom: -1 }, cam(small))).toBe(true);
    // Sent to a node by a deep link: stays there, but the next generation opens at its overview again.
    expect(needsFit(a, a, full, { x: 5, y: 5, zoom: -1 }, null)).toBe(false);
    expect(needsFit(a, b, full, { x: 5, y: 5, zoom: -1 }, null)).toBe(true);
  });
});
