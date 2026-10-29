// Map view: pan and zoom like a map. Projects are large circles; zooming in opens them to show namespaces,
// then types, then members. Relations aggregate between whatever is visible at the current zoom.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView, type OrthographicViewState, type PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { CollisionFilterExtension } from '@deck.gl/extensions';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { buildMapLayout, computeFrame, locate, MAP_EXTENT, OPEN_PX, zoomToFit, type MapEdge, type MapNode } from '../model/mapLayout';
import { edgeColor, kindLabel, nodeColor } from '../model/kinds';
import { ancestors } from '../model/graphModel';

type RGBA = [number, number, number, number];

function hex(c: string, a = 255): RGBA {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, a];
}

/** Distinct hue per project, golden-angle spaced, so each "planet" keeps its colour at every depth. */
function rootColor(index: number): RGBA {
  const h = (index * 137.508) % 360;
  const s = 0.55;
  const l = 0.58;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), 255];
}

const GROUP_KINDS = new Set(['project', 'package', 'group', 'namespace', 'pkgnamespace']);

const VIEW = new OrthographicView({ id: 'map', flipY: true });
const collision = new CollisionFilterExtension();

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
  const edgeMode = useStore((s) => s.mapEdges);
  const fitTick = useStore((s) => s.fitTick);
  const set = useStore((s) => s.set);

  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 800 });
  const [viewState, setViewState] = useState<OrthographicViewState>({ target: [0, 0, 0], zoom: -3.5, minZoom: -6, maxZoom: 8 });
  const [hover, setHover] = useState<{ x: number; y: number; node?: MapNode; edge?: MapEdge } | null>(null);

  // Layout depends only on membership filters, never on zoom.
  const layout = useMemo(() => buildMapLayout(model, filters), [model, filters.hidden, filters.entityKinds, filters.origins, filters.disabledRoots, filters.hideTests]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = useMemo(() => {
    const m = new Map<string, RGBA>();
    layout.roots.forEach((r, i) => m.set(r, rootColor(i)));
    return m;
  }, [layout]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitAll = useCallback(() => {
    const zoom = Math.log2(Math.min(size.width, size.height) / (MAP_EXTENT * 1.02));
    setViewState((v) => ({ ...v, target: [0, 0, 0], zoom, transitionDuration: 500 }));
  }, [size]);

  // Fit on first load and when the layout changes size.
  useEffect(() => {
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, size.width > 0]);
  useEffect(() => {
    if (fitTick) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  const flyTo = useCallback(
    (n: MapNode, fraction = 0.8) => {
      setViewState((v) => ({ ...v, target: [n.x, n.y, 0], zoom: zoomToFit(n, size.width, size.height, fraction), transitionDuration: 700 }));
    },
    [size],
  );

  // Search, inspector links and breadcrumbs ask to show a node: fly to it (or its nearest laid-out ancestor).
  useEffect(() => {
    if (!centerOn) return;
    const id = [centerOn, ...ancestors(model, centerOn)].find((x) => layout.nodes.has(x));
    if (id) {
      const n = layout.nodes.get(id)!;
      // Zoom so the node itself is open enough to read, which also opens every ancestor.
      const leaf = n.children.length === 0;
      flyTo(n, leaf ? 0.12 : 0.85);
    }
    set({ centerOn: null });
  }, [centerOn, layout, model, flyTo, set]);

  const scale = Math.pow(2, Number(viewState.zoom ?? 0));
  const [tx, ty] = (viewState.target as number[]) ?? [0, 0];
  const halfW = size.width / 2 / scale;
  const halfH = size.height / 2 / scale;
  // Frame recomputation is cheap (about 10 ms on eShop); quantise zoom so panning reuses most of it.
  const zq = Math.round(Number(viewState.zoom ?? 0) * 8) / 8;
  const frame = useMemo(
    () => computeFrame(model, layout, filters, { scale: Math.pow(2, zq), minX: tx - halfW * 1.3, maxX: tx + halfW * 1.3, minY: ty - halfH * 1.3, maxY: ty + halfH * 1.3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, layout, filters, zq, Math.round(tx / (halfW * 0.25 || 1)), Math.round(ty / (halfH * 0.25 || 1))],
  );

  const selectedId = selection?.type === 'node' ? selection.id : null;
  const selectedOnMap = useMemo(() => {
    if (!selectedId) return null;
    return [selectedId, ...ancestors(model, selectedId)].find((x) => frame.open.has(x) || frame.drawn.some((d) => d.id === x)) ?? null;
  }, [selectedId, model, frame]);
  const hoverId = hover?.node?.id ?? null;
  const searchQuery = useStore((s) => s.searchQuery);
  // Outline only symbols whose own name matches; ids of members also contain their type's name.
  const hits = useMemo(() => {
    const token = searchQuery.toLowerCase().split(/\s+/).find((t) => t && !t.startsWith('kind:')) ?? '';
    return new Set(searchHits.filter((id) => !token || (model.nodes.get(id)?.label.toLowerCase().includes(token) ?? false)));
  }, [searchHits, searchQuery, model]);

  const drawnIds = useMemo(() => new Set(frame.drawn.map((n) => n.id)), [frame]);
  const edges = useMemo(() => {
    if (edgeMode === 'none') return [];
    const focusIds = [hoverId, selectedOnMap].filter(Boolean) as string[];
    let list = frame.edges.filter((e) => drawnIds.has(e.source) || drawnIds.has(e.target));
    if (edgeMode === 'selection') list = list.filter((e) => focusIds.includes(e.source) || focusIds.includes(e.target));
    return list;
  }, [frame, drawnIds, edgeMode, hoverId, selectedOnMap]);

  const nodeById = layout.nodes;
  const activeIds = new Set([hoverId, selectedOnMap].filter(Boolean) as string[]);

  const curve = (e: MapEdge): number[][] => {
    const a = nodeById.get(e.source)!;
    const b = nodeById.get(e.target)!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bend = 0.18;
    const cx = mx - dy * bend;
    const cy = my + dx * bend;
    const pts: number[][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      pts.push([u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y]);
    }
    return pts;
  };

  const fillFor = (n: MapNode): RGBA => {
    const base = GROUP_KINDS.has(n.kind) ? colors.get(n.root) ?? hex('#64748b') : hex(nodeColor(n.kind));
    const isOpen = frame.open.has(n.id);
    return [base[0], base[1], base[2], isOpen ? 22 : n.children.length ? 105 : 170];
  };

  const layers = [
    new PathLayer<MapEdge>({
      id: 'edges',
      data: edges,
      getPath: (e) => curve(e) as never,
      getColor: (e) => {
        const c = hex(edgeColor(e.kind));
        const active = activeIds.size === 0 || activeIds.has(e.source) || activeIds.has(e.target);
        return [c[0], c[1], c[2], active ? (activeIds.size ? 235 : 70) : 14];
      },
      getWidth: (e) => Math.min(10, 1 + Math.log2(e.count) * 1.2),
      widthUnits: 'pixels',
      capRounded: true,
      pickable: true,
      updateTriggers: { getColor: [hoverId, selectedOnMap] },
    }),
    new ScatterplotLayer<MapNode>({
      id: 'circles',
      data: frame.drawn,
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      filled: true,
      stroked: true,
      getFillColor: fillFor,
      getLineColor: (n) => {
        if (n.id === selectedOnMap) return [255, 255, 255, 255];
        if (hits.has(n.id)) return [253, 224, 71, 255];
        const c = GROUP_KINDS.has(n.kind) ? colors.get(n.root) ?? hex('#64748b') : hex(nodeColor(n.kind));
        return [c[0], c[1], c[2], frame.open.has(n.id) ? 170 : 230];
      },
      getLineWidth: (n) => (n.id === selectedOnMap || hits.has(n.id) ? 3 : frame.open.has(n.id) ? 1.5 : 1),
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [frame, colors], getLineColor: [selectedOnMap, hits, frame], getLineWidth: [selectedOnMap, hits, frame] },
    }),
    // Edges of the hovered or selected node, drawn again above the circles so they stay readable.
    new PathLayer<MapEdge>({
      id: 'edges-active',
      data: activeIds.size ? edges.filter((e) => activeIds.has(e.source) || activeIds.has(e.target)) : [],
      getPath: (e) => curve(e) as never,
      getColor: (e) => hex(edgeColor(e.kind), 240),
      getWidth: (e) => Math.min(10, 1.5 + Math.log2(e.count) * 1.2),
      widthUnits: 'pixels',
      capRounded: true,
      pickable: false,
    }),
    new TextLayer<MapNode>({
      id: 'labels',
      data: frame.drawn.filter((n) => n.r * scale >= (frame.open.has(n.id) ? OPEN_PX : 16)),
      getText: (n: MapNode) => {
        if (frame.open.has(n.id)) return n.label;
        // Closed circles: keep the label inside the circle.
        const px = n.r * scale;
        const size = Math.max(10, Math.min(18, px / 4));
        const max = Math.max(3, Math.floor((1.9 * px) / (size * 0.58)));
        return n.label.length > max ? n.label.slice(0, max - 1) + '…' : n.label;
      },
      getPosition: (n: MapNode) => (frame.open.has(n.id) ? [n.x, n.y - n.r + Math.min(n.r * 0.06, 22 / scale)] : [n.x, n.y]),
      getSize: (n: MapNode) => {
        const px = n.r * scale;
        return frame.open.has(n.id) ? Math.max(12, Math.min(22, px / 14)) : Math.max(10, Math.min(18, px / 4));
      },
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => (frame.open.has(n.id) ? [226, 232, 240, 255] : [241, 245, 249, 255]),
      getTextAnchor: 'middle',
      getAlignmentBaseline: (n: MapNode) => (frame.open.has(n.id) ? 'top' : 'center'),
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      outlineWidth: 3,
      outlineColor: [11, 15, 23, 255],
      fontSettings: { sdf: true, buffer: 6 },
      characterSet: 'auto',
      extensions: [collision],
      collisionEnabled: true,
      getCollisionPriority: (n: MapNode) => (frame.open.has(n.id) ? 1000 - n.depth : n.r * scale),
      collisionTestProps: { sizeScale: 1.4 },
      updateTriggers: { getText: [zq, frame], getPosition: [zq, frame], getSize: [zq, frame], getAlignmentBaseline: [frame], getCollisionPriority: [zq, frame] },
    } as never),
  ];

  const onClick = (info: PickingInfo) => {
    const obj = info.object as MapNode | MapEdge | undefined;
    if (!obj) {
      set({ selection: null });
      return;
    }
    if ('r' in obj) {
      set({ selection: { type: 'node', id: obj.id } });
    } else {
      set({ selection: { type: 'edge', id: `${obj.source}|${obj.target}`, edgeIdx: obj.edgeIdx, source: obj.source, target: obj.target, kinds: obj.kinds } });
    }
  };

  const crumbs = locate(layout, frame.open, tx, ty);

  return (
    <div
      className="map-wrap"
      ref={wrap}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => {
        // Double-click flies into the circle under the pointer (deck.gl reports single clicks only).
        const n = hover?.node;
        if (n) flyTo(n, n.children.length ? 0.9 : 0.15);
      }}
    >
      <DeckGL
        views={VIEW}
        viewState={viewState}
        onViewStateChange={(e) => setViewState(e.viewState as OrthographicViewState)}
        controller={{ doubleClickZoom: false, inertia: false, scrollZoom: { speed: 0.015, smooth: true } }}
        layers={layers}
        onClick={onClick}
        onHover={(info) => {
          const obj = info.object as MapNode | MapEdge | undefined;
          if (!obj) setHover(null);
          else if ('r' in obj) setHover({ x: info.x, y: info.y, node: obj });
          else setHover({ x: info.x, y: info.y, edge: obj });
        }}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      <div className="map-crumbs">
        <button className="link" onClick={fitAll}>
          All projects
        </button>
        {crumbs.map((id) => (
          <span key={id}>
            <span className="muted"> › </span>
            <button className="link" onClick={() => flyTo(layout.nodes.get(id)!, 0.9)}>
              {layout.nodes.get(id)!.label}
            </button>
          </span>
        ))}
      </div>
      <div className="map-zoom">
        <button onClick={() => setViewState((v) => ({ ...v, zoom: Number(v.zoom) + 1, transitionDuration: 250 }))} title="Zoom in">
          +
        </button>
        <button onClick={() => setViewState((v) => ({ ...v, zoom: Number(v.zoom) - 1, transitionDuration: 250 }))} title="Zoom out">
          −
        </button>
        <button onClick={fitAll} title="Fit everything">
          ⤢
        </button>
      </div>
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.node && (
            <>
              <b>{hover.node.label}</b> <span className="muted">{hover.node.kind}</span>
              {hover.node.children.length > 0 && <div className="muted">{hover.node.size.toLocaleString('en-US')} items inside{frame.open.has(hover.node.id) ? '' : ', zoom in or double-click to open'}</div>}
              <div className="muted">{model.nodes.get(hover.node.id)?.fullName}</div>
            </>
          )}
          {hover.edge && (
            <>
              <b>
                {layout.nodes.get(hover.edge.source)?.label} ↔ {layout.nodes.get(hover.edge.target)?.label}
              </b>
              <div>
                {hover.edge.count.toLocaleString('en-US')} relations:{' '}
                {Object.entries(hover.edge.kinds)
                  .map(([k, c]) => `${kindLabel(k)} ${c}`)
                  .join(', ')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
