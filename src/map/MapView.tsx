// Map view: a zoomable map of the repository. Projects are planets; zooming in opens them into namespaces,
// types and members. Click to enter a circle, click its background to go up, arrows move between siblings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import { OrthographicView, type PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { CollisionFilterExtension } from '@deck.gl/extensions';
import { useShallow } from 'zustand/react/shallow';
import { ROOT, useStore } from '../store';
import { buildMapLayout, computeFrame, locate, MAP_EXTENT, nearestSibling, zoomToFit, type Direction, type MapEdge, type MapNode } from '../model/mapLayout';
import { edgeColor } from '../model/kinds';
import { ancestors } from '../model/graphModel';
import { KIND_GLYPH, kindColor, projectColor, type RGB } from '../theme/palette';
import { Camera, prefersReducedMotion, wheelZoomDelta, type Cam } from './camera';
import { OrbLayer, RegionLayer, ShadowLayer } from './OrbLayer';
import { createEdgeRouter, pointAt, type Point } from './edges';
import { Breadcrumbs } from './Breadcrumbs';
import { Minimap } from './Minimap';
import { HoverCard } from './HoverCard';
import { MapControls } from './MapControls';
import { fitLabel } from './labels';

type RGBA = [number, number, number, number];

const GROUP_KINDS = new Set(['project', 'package', 'group', 'namespace', 'pkgnamespace']);
const VIEW = new OrthographicView({ id: 'map', flipY: true });
const collision = new CollisionFilterExtension();
const FONT = '"IBM Plex Sans", Inter, system-ui, sans-serif';
const ADDITIVE = { blend: true, blendColorOperation: 'add', blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one', blendAlphaOperation: 'add', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one' } as const;

function hexRgb(c: string): RGB {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const lighten = ([r, g, b]: RGB, k: number): RGB => [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k].map(Math.round) as RGB;
const a8 = (x: number) => Math.max(0, Math.min(255, Math.round(x)));

interface EdgeHalf {
  edge: MapEdge;
  path: Point[];
  head: boolean;
}

export function MapView() {
  const model = useStore((s) => s.model)!;
  const filters = useStore(
    useShallow((s) => ({
      hidden: s.hidden,
      edgeKinds: s.edgeKinds,
      entityKinds: s.entityKinds,
      origins: s.origins,
      resolutions: s.resolutions,
      usages: s.usages,
      disabledRoots: s.disabledRoots,
      hideTests: s.hideTests,
      minWeight: s.minWeight,
      expanded: s.expanded,
      hideIsolated: s.hideIsolated,
      mergeKinds: s.mergeKinds,
      focus: s.focus,
      searchFilter: s.searchFilter,
      maxFocusNodes: s.maxFocusNodes,
    })),
  );
  const selection = useStore((s) => s.selection);
  const centerOn = useStore((s) => s.centerOn);
  const searchHits = useStore((s) => s.searchHits);
  const searchQuery = useStore((s) => s.searchQuery);
  const edgeMode = useStore((s) => s.mapEdges);
  const fitTick = useStore((s) => s.fitTick);
  const set = useStore((s) => s.set);
  const navigate = useStore((s) => s.navigate);
  const inspectorOpen = useStore((s) => s.inspectorOpen);

  const wrap = useRef<HTMLDivElement>(null);
  const deck = useRef<DeckGLRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, zoom: -3 });
  const camera = useMemo(() => new Camera(setCam), []);
  const [hover, setHover] = useState<{ x: number; y: number; node?: MapNode; edge?: MapEdge } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [time, setTime] = useState(0);
  const fitted = useRef(false);

  useEffect(() => () => camera.dispose(), [camera]);
  useEffect(() => {
    Promise.all([document.fonts.load(`600 13px ${FONT}`), document.fonts.load(`500 11px ${FONT}`)]).finally(() => setFontsReady(true));
  }, []);

  const layout = useMemo(() => buildMapLayout(model, filters), [model, filters.hidden, filters.entityKinds, filters.origins, filters.disabledRoots, filters.hideTests]); // eslint-disable-line react-hooks/exhaustive-deps
  const route = useMemo(() => createEdgeRouter(layout), [layout]);
  const rootColor = useMemo(() => {
    const m = new Map<string, RGB>();
    layout.roots.forEach((r, i) => m.set(r, projectColor(i)));
    return m;
  }, [layout]);
  const colorOf = useCallback((n: MapNode): RGB => (GROUP_KINDS.has(n.kind) ? rootColor.get(n.root) ?? [120, 130, 150] : kindColor(n.kind)), [rootColor]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = { width: el.clientWidth, height: el.clientHeight };
      camera.size = s;
      setSize(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [camera]);

  const fitZoom = useCallback(() => Math.log2(Math.min(size.width, size.height) / (MAP_EXTENT * 1.04)), [size]);
  const fitAll = useCallback(() => camera.flyTo({ x: 0, y: 0, zoom: fitZoom() }), [camera, fitZoom]);
  const flyInto = useCallback(
    (n: MapNode) => {
      const leaf = n.children.length === 0;
      camera.flyTo({ x: n.x, y: n.y, zoom: zoomToFit(n, size.width, size.height, leaf ? 0.16 : 0.86) });
    },
    [camera, size],
  );

  // First fit happens without animation; later layout changes fly.
  useEffect(() => {
    if (!size.width) return;
    if (!fitted.current) {
      camera.set({ x: 0, y: 0, zoom: fitZoom() });
      fitted.current = true;
    }
  }, [size, camera, fitZoom]);
  useEffect(() => {
    if (fitTick) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  const layoutNodeFor = useCallback(
    (id: string) => {
      const found = [id, ...ancestors(model, id)].find((x) => layout.nodes.has(x));
      return found ? layout.nodes.get(found)! : null;
    },
    [model, layout],
  );

  // Search, inspector links, breadcrumbs and browser history all arrive as centerOn.
  useEffect(() => {
    if (!centerOn || !size.width) return;
    if (centerOn === ROOT) fitAll();
    else {
      const n = layoutNodeFor(centerOn);
      if (n) flyInto(n);
    }
    set({ centerOn: null });
  }, [centerOn, size.width, fitAll, flyInto, layoutNodeFor, set]);

  // Level of detail: recomputed per quantised zoom and coarse pan bucket.
  const scale = Math.pow(2, cam.zoom);
  const halfW = size.width / 2 / scale || 1;
  const halfH = size.height / 2 / scale || 1;
  const zq = Math.round(cam.zoom * 16) / 16;
  const bx = Math.round(cam.x / (halfW * 0.25));
  const by = Math.round(cam.y / (halfH * 0.25));
  const frame = useMemo(
    () => computeFrame(model, layout, filters, { scale: Math.pow(2, zq), minX: cam.x - halfW * 1.3, maxX: cam.x + halfW * 1.3, minY: cam.y - halfH * 1.3, maxY: cam.y + halfH * 1.3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, layout, filters, zq, bx, by],
  );

  const crumbs = locate(layout, frame.open, cam.x, cam.y).filter((id) => (frame.openness.get(id) ?? 0) > 0.5);
  const selectedId = selection?.type === 'node' ? selection.id : null;
  const selectedOnMap = useMemo(() => (selectedId ? layoutNodeFor(selectedId)?.id ?? null : null), [selectedId, layoutNodeFor]);
  const hoverId = hover?.node?.id ?? null;
  const active = useMemo(() => new Set([hoverId, selectedOnMap].filter(Boolean) as string[]), [hoverId, selectedOnMap]);
  const hits = useMemo(() => {
    const token = searchQuery.toLowerCase().split(/\s+/).find((t) => t && !t.startsWith('kind:')) ?? '';
    return new Set(searchHits.filter((id) => !token || (model.nodes.get(id)?.label.toLowerCase().includes(token) ?? false)));
  }, [searchHits, searchQuery, model]);

  const drawnIds = useMemo(() => new Set(frame.drawn.map((n) => n.id)), [frame]);
  const edgeFade = useCallback((e: MapEdge) => Math.min(frame.fade.get(e.source) ?? 1, frame.fade.get(e.target) ?? 1), [frame]);
  const edges = useMemo(() => {
    if (edgeMode === 'none') return [];
    let list = frame.edges.filter((e) => drawnIds.has(e.source) || drawnIds.has(e.target));
    if (edgeMode === 'selection') list = list.filter((e) => active.has(e.source) || active.has(e.target));
    return list;
  }, [frame, drawnIds, edgeMode, active]);
  const activeEdges = useMemo(() => (active.size ? edges.filter((e) => active.has(e.source) || active.has(e.target)) : []), [edges, active]);

  // Edges drawn in two halves: the tail fainter than the head, so direction reads at a glance.
  const halves = useMemo(() => {
    const out: EdgeHalf[] = [];
    for (const e of edges) {
      const path = route(e.source, e.target);
      const mid = Math.floor(path.length / 2);
      out.push({ edge: e, path: path.slice(0, mid + 1), head: false }, { edge: e, path: path.slice(mid), head: true });
    }
    return out;
  }, [edges, route]);

  // Particles flow along active edges while something is hovered or selected.
  useEffect(() => {
    if (!activeEdges.length || prefersReducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setTime((now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeEdges]);
  const particles = useMemo(() => {
    const out: { p: Point; c: RGB }[] = [];
    for (const e of activeEdges.slice(0, 300)) {
      const path = route(e.source, e.target);
      const c = lighten(hexRgb(edgeColor(e.kind)), 0.35);
      const n = Math.min(4, 1 + Math.floor(Math.log2(e.count + 1)));
      const forward = e.count - e.back;
      for (let k = 0; k < n; k++) {
        const t = (time * 0.35 + k / n) % 1;
        if (forward > 0) out.push({ p: pointAt(path, t), c });
        if (e.back > 0) out.push({ p: pointAt(path, 1 - t), c });
      }
    }
    return out;
  }, [activeEdges, route, time]);

  // Up from the current node (the selection, else the deepest breadcrumb) to the nearest ancestor that is
  // visibly larger, so namespaces with a single child never make Up feel stuck.
  const upFrom = useCallback(
    (id: string | null) => {
      const base = id ? layout.nodes.get(id) : null;
      if (!base) return navigate(null, { select: false });
      let p = base.parent ? layout.nodes.get(base.parent) : null;
      while (p && p.r < base.r * 1.35 && p.parent) p = layout.nodes.get(p.parent)!;
      navigate(p && p.r >= base.r * 1.35 ? p.id : null, p && p.r >= base.r * 1.35 ? {} : { select: false });
    },
    [layout, navigate],
  );
  const goUp = useCallback(() => upFrom(selectedOnMap ?? crumbs[crumbs.length - 1] ?? null), [upFrom, selectedOnMap, crumbs]);

  // Pointer: drag pans with momentum; a click without movement picks.
  const drag = useRef<{ x: number; y: number; moved: boolean; vx: number; vy: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, vx: 0, vy: 0, t: performance.now() };
    camera.stop();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.vx = 0.7 * d.vx + 0.3 * (dx / dt);
    d.vy = 0.7 * d.vy + 0.3 * (dy / dt);
    d.t = now;
    d.x = e.clientX;
    d.y = e.clientY;
    camera.panBy(dx, dy);
    setHover(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      if (performance.now() - d.t < 80) camera.release(d.vx, d.vy);
      return;
    }
    const rect = wrap.current!.getBoundingClientRect();
    const info = deck.current?.pickObject({ x: e.clientX - rect.left, y: e.clientY - rect.top, radius: 3, layerIds: ['orbs', 'regions', 'edges-active'] });
    onPick(info ?? null);
  };

  const onPick = (info: PickingInfo | null) => {
    const obj = info?.object as MapNode | EdgeHalf | MapEdge | undefined;
    if (!obj) {
      goUp();
      return;
    }
    if ('edge' in obj || 'edgeIdx' in obj) {
      const e = 'edge' in obj ? obj.edge : obj;
      set({ selection: { type: 'edge', id: `${e.source}|${e.target}`, edgeIdx: e.edgeIdx, source: e.source, target: e.target, kinds: e.kinds } });
      const a = layout.nodes.get(e.source)!;
      const b = layout.nodes.get(e.target)!;
      const span = Math.max(Math.abs(a.x - b.x) + a.r + b.r, Math.abs(a.y - b.y) + a.r + b.r);
      camera.flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, zoom: Math.min(cam.zoom, Math.log2((Math.min(size.width, size.height) * 0.85) / span)) });
      return;
    }
    // Clicking the background of the circle you are in goes up; clicking anything else goes into it.
    if (crumbs.includes(obj.id) && frame.open.has(obj.id)) {
      upFrom(obj.id);
      return;
    }
    navigate(obj.id);
  };

  // Wheel zooms towards the cursor (pinch arrives as ctrl+wheel).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, wheelZoomDelta(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [camera]);

  // Keyboard: arrows between siblings, Enter goes in, Backspace goes up, Esc closes the inspector or goes up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useStore.getState();
      if (st.tab !== 'map' || st.paletteOpen) return;
      const dirs: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const current = selectedOnMap ?? crumbs[crumbs.length - 1] ?? null;
      if (dirs[e.key]) {
        e.preventDefault();
        const start = current ?? layout.roots[0];
        const next = current ? nearestSibling(layout, start, dirs[e.key]) : start;
        if (!next) return;
        const n = layout.nodes.get(next)!;
        st.set({ selection: { type: 'node', id: next } });
        // Keep the zoom unless the sibling would be too small to see.
        const minZoom = Math.log2(18 / n.r);
        camera.flyTo({ x: n.x, y: n.y, zoom: Math.max(cam.zoom, minZoom) }, { maxDuration: 450 });
      } else if (e.key === 'Enter' && current) {
        e.preventDefault();
        navigate(current);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      } else if (e.key === 'Escape') {
        if (st.inspectorOpen) st.set({ inspectorOpen: false });
        else goUp();
      } else if (e.key === 'i') {
        st.set({ inspectorOpen: !st.inspectorOpen });
      } else if (e.key === 'f' || e.key === '0') {
        navigate(null, { select: false });
      } else if (e.key === '=' || e.key === '+') {
        camera.zoomAt(size.width / 2, size.height / 2, 0.75);
      } else if (e.key === '-') {
        camera.zoomAt(size.width / 2, size.height / 2, -0.75);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOnMap, crumbs, layout, camera, cam.zoom, navigate, goUp, size]);

  // Layers.
  const fadeOf = (n: MapNode) => frame.fade.get(n.id) ?? 1;
  const openOf = (n: MapNode) => frame.openness.get(n.id) ?? 0;
  const regions = frame.drawn.filter((n) => openOf(n) > 0);
  const orbs = frame.drawn.filter((n) => openOf(n) < 1);
  const rimOf = (n: MapNode): RGB => (GROUP_KINDS.has(n.kind) ? lighten(colorOf(n), 0.25) : rootColor.get(n.root) ?? colorOf(n));

  const showLabel = (n: MapNode) => n.r * scale >= 16 && openOf(n) < 0.6;
  const closedLabels = orbs.filter(showLabel);
  const glyphNodes = closedLabels.filter((n) => !GROUP_KINDS.has(n.kind) && n.r * scale > 30 && KIND_GLYPH[n.kind]);
  const labelSize = (n: MapNode) => Math.max(11, Math.min(17, (n.r * scale) / 4.2));
  const truncate = (n: MapNode) => fitLabel(n.label, Math.max(3, Math.floor((1.7 * n.r * scale) / (labelSize(n) * 0.56))), n.r * scale > 34);
  const pills = regions.filter((n) => openOf(n) > 0.35);
  const symbolsText = (n: MapNode) => `${n.size.toLocaleString('en-US')} symbols`;

  const layers = [
    new RegionLayer<MapNode>({
      id: 'regions',
      data: regions,
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      stroked: true,
      filled: true,
      getFillColor: (n) => [...colorOf(n), a8(46 * openOf(n) * fadeOf(n))] as RGBA,
      getLineColor: (n) => (n.id === selectedOnMap ? [255, 255, 255, 230] : ([...rimOf(n), a8(150 * openOf(n) * fadeOf(n))] as RGBA)),
      getLineWidth: (n) => (n.id === selectedOnMap ? 2 : 1.25),
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [frame], getLineColor: [frame, selectedOnMap], getLineWidth: [selectedOnMap] },
    }),
    new ShadowLayer<MapNode>({
      id: 'shadows',
      data: orbs,
      getPosition: (n) => [n.x + n.r * 0.03, n.y + n.r * 0.06],
      getRadius: (n) => n.r * 1.07,
      radiusUnits: 'common',
      getFillColor: (n) => [2, 4, 12, a8(150 * (1 - openOf(n)) * fadeOf(n))],
      updateTriggers: { getFillColor: [frame] },
    }),
    new OrbLayer<MapNode>({
      id: 'orbs',
      data: orbs,
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      filled: true,
      stroked: true,
      getFillColor: (n) => [...colorOf(n), a8(242 * (1 - openOf(n)) * fadeOf(n))] as RGBA,
      getLineColor: (n) => {
        const a = (1 - openOf(n)) * fadeOf(n);
        if (n.id === selectedOnMap) return [255, 255, 255, a8(255 * a)];
        if (hits.has(n.id)) return [250, 204, 21, a8(255 * a)];
        if (n.id === hoverId) return [...lighten(rimOf(n), 0.5), a8(255 * a)] as RGBA;
        return [...rimOf(n), a8(190 * a)] as RGBA;
      },
      getLineWidth: (n) => (n.id === selectedOnMap || hits.has(n.id) ? 2.5 : n.id === hoverId ? 2 : 1),
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [frame, rootColor], getLineColor: [frame, selectedOnMap, hits, hoverId], getLineWidth: [selectedOnMap, hits, hoverId] },
    }),
    new PathLayer<EdgeHalf>({
      id: 'edges',
      data: halves,
      getPath: (h) => h.path as never,
      getColor: (h) => {
        const c = hexRgb(edgeColor(h.edge.kind));
        const dim = active.size > 0 && !active.has(h.edge.source) && !active.has(h.edge.target);
        const base = dim ? 10 : active.size ? 0 : 52;
        return [...c, a8(base * (h.head ? 1 : 0.5) * edgeFade(h.edge))] as RGBA;
      },
      getWidth: (h) => Math.min(9, 1 + Math.log2(h.edge.count) * 1.1),
      widthUnits: 'pixels',
      widthMinPixels: 1,
      capRounded: true,
      jointRounded: true,
      pickable: false,
      parameters: ADDITIVE as never,
      updateTriggers: { getColor: [active, frame] },
    }),
    new PathLayer<MapEdge>({
      id: 'edges-active',
      data: activeEdges,
      getPath: (e) => route(e.source, e.target) as never,
      getColor: (e) => [...lighten(hexRgb(edgeColor(e.kind)), 0.15), a8(230 * edgeFade(e))] as RGBA,
      getWidth: (e) => Math.min(10, 1.6 + Math.log2(e.count) * 1.2),
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      pickable: true,
      updateTriggers: { getColor: [frame] },
    }),
    new ScatterplotLayer<{ p: Point; c: RGB }>({
      id: 'particles',
      data: particles,
      getPosition: (d) => d.p,
      getRadius: 2.6,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...d.c, 255] as RGBA,
      parameters: ADDITIVE as never,
    }),
    new TextLayer<MapNode>({
      id: 'region-pills',
      data: pills,
      getText: (n: MapNode) => n.label,
      getPosition: (n: MapNode) => [n.x, n.y - n.r],
      getPixelOffset: [0, 16],
      getSize: (n: MapNode) => (n.depth === 0 ? 14 : 12.5),
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [236, 241, 250, a8(255 * Math.min(1, (openOf(n) - 0.35) / 0.4) * fadeOf(n))],
      background: true,
      getBackgroundColor: (n: MapNode) => [13, 18, 32, a8(225 * Math.min(1, (openOf(n) - 0.35) / 0.4) * fadeOf(n))],
      getBorderColor: (n: MapNode) => [...rimOf(n), a8(170 * Math.min(1, (openOf(n) - 0.35) / 0.4) * fadeOf(n))] as RGBA,
      getBorderWidth: 1,
      backgroundPadding: [10, 5, 10, 5],
      fontFamily: FONT,
      fontWeight: 600,
      fontSettings: { sdf: true, buffer: 8 },
      characterSet: 'auto',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getColor: [frame], getBackgroundColor: [frame], getBorderColor: [frame] },
    }),
    new TextLayer<MapNode>({
      id: 'region-subtitles',
      data: pills.filter((n) => n.r * scale > 160),
      getText: symbolsText,
      getPosition: (n: MapNode) => [n.x, n.y - n.r],
      getPixelOffset: [0, 38],
      getSize: 11,
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [148, 160, 184, a8(220 * Math.min(1, (openOf(n) - 0.35) / 0.4) * fadeOf(n))],
      fontFamily: FONT,
      fontWeight: 500,
      outlineWidth: 2,
      outlineColor: [8, 12, 22, 255],
      fontSettings: { sdf: true, buffer: 6 },
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getColor: [frame] },
    }),
    new TextLayer<MapNode>({
      id: 'glyphs',
      data: glyphNodes,
      getText: (n: MapNode) => KIND_GLYPH[n.kind],
      getPosition: (n: MapNode) => [n.x, n.y],
      getPixelOffset: (n: MapNode) => [0, -labelSize(n) * (truncate(n).includes('\n') ? 1.5 : 0.95)],
      getSize: (n: MapNode) => labelSize(n) * 1.05,
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [...lighten(colorOf(n), 0.55), a8(230 * (1 - openOf(n)) * fadeOf(n))] as RGBA,
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontWeight: 700,
      outlineWidth: 3,
      outlineColor: [8, 12, 22, 200],
      fontSettings: { sdf: true, buffer: 6 },
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getPixelOffset: [zq], getSize: [zq], getColor: [frame] },
    }),
    new TextLayer<MapNode>({
      id: 'labels',
      data: closedLabels,
      getText: truncate,
      getPosition: (n: MapNode) => [n.x, n.y],
      getPixelOffset: (n: MapNode) => (glyphNodes.includes(n) ? [0, labelSize(n) * (truncate(n).includes('\n') ? 0.75 : 0.55)] : [0, 0]),
      lineHeight: 1.15,
      getSize: labelSize,
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [244, 247, 252, a8(255 * (1 - openOf(n)) * fadeOf(n))],
      fontFamily: FONT,
      fontWeight: 600,
      outlineWidth: 3,
      outlineColor: [8, 12, 22, 235],
      fontSettings: { sdf: true, buffer: 8 },
      characterSet: 'auto',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      extensions: [collision],
      collisionEnabled: true,
      getCollisionPriority: (n: MapNode) => n.r * scale,
      collisionTestProps: { sizeScale: 1.25 },
      updateTriggers: { getText: [zq], getSize: [zq], getPixelOffset: [zq, glyphNodes], getColor: [frame], getCollisionPriority: [zq] },
    } as never),
  ];

  if (import.meta.env.DEV) (window as unknown as { __mapDebug: unknown }).__mapDebug = { deck, cam, size, frame, layers };
  // Dot grid that moves and scales with the map, snapped to powers of two so it never jumps in density.
  const gridWorld = Math.pow(2, Math.ceil(Math.log2(26 / scale)));
  const step = gridWorld * scale;
  const ox = (((size.width / 2 - cam.x * scale) % step) + step) % step;
  const oy = (((size.height / 2 - cam.y * scale) % step) + step) % step;
  const gridAlpha = Math.min(1, (step - 26) / 26) * 0.5 + 0.5;

  return (
    <div
      className={`map-wrap ${inspectorOpen && selection ? 'with-drawer' : ''}`}
      ref={wrap}
      style={{ backgroundSize: `${step}px ${step}px`, backgroundPosition: `${ox}px ${oy}px`, ['--grid-alpha' as string]: gridAlpha }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
      aria-label="Repository map. Arrow keys move between siblings, Enter goes in, Backspace goes up."
    >
      {size.width > 0 && fontsReady && (
        <DeckGL
          ref={deck}
          views={VIEW}
          viewState={{ target: [cam.x, cam.y, 0], zoom: cam.zoom }}
          controller={false}
          layers={layers}
          onHover={(info) => {
            if (drag.current?.moved) return;
            const obj = info.object as MapNode | EdgeHalf | MapEdge | undefined;
            if (!obj) setHover(null);
            else if ('edge' in obj) setHover({ x: info.x, y: info.y, edge: obj.edge });
            else if ('edgeIdx' in obj) setHover((h) => ({ x: info.x, y: info.y, edge: obj, node: h?.node }));
            else setHover({ x: info.x, y: info.y, node: obj });
          }}
          getCursor={({ isHovering }) => (drag.current?.moved ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        />
      )}
      <div className="map-vignette" />
      <Breadcrumbs layout={layout} path={crumbs} onPick={(id) => navigate(id)} />
      <Minimap layout={layout} colors={rootColor} cam={cam} size={size} onJump={(x, y) => camera.flyTo({ x, y, zoom: cam.zoom }, { maxDuration: 500 })} />
      <MapControls
        onZoomIn={() => camera.zoomAt(size.width / 2, size.height / 2, 1)}
        onZoomOut={() => camera.zoomAt(size.width / 2, size.height / 2, -1)}
        onFit={() => navigate(null, { select: false })}
        infoOpen={inspectorOpen}
        onToggleInfo={() => set({ inspectorOpen: !inspectorOpen })}
      />
      {hover && <HoverCard hover={hover} layout={layout} model={model} open={hover.node ? frame.open.has(hover.node.id) && crumbs.includes(hover.node.id) : false} />}
    </div>
  );
}
