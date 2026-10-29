// Neighbourhood: an ego graph around one symbol, as readable cards. Users on the left, what it uses on the right.
import { memo, useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, getNodesBounds, getViewportForBounds, useNodesInitialized, useReactFlow, type Edge as FlowEdge, type Node as FlowNode, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { ChevronRight, Crosshair, Download, Expand, Map as MapIcon, Network, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KindGlyph } from '@/components/kind-glyph';
import { EmptyState } from '@/components/blocks';
import { searchNodes } from '@/model/graphModel';
import { buildEgo, layoutEgo, type EgoItem, type EgoLink } from '@/model/egoGraph';
import { kindLabel } from '@/model/kinds';
import { relationColor, rgbCss } from '@/theme/palette';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

const PRESETS: Record<string, { label: string; kinds: string[] | null }> = {
  all: { label: 'All', kinds: null },
  calls: { label: 'Calls', kinds: ['calls_declared_target', 'possible_runtime_target'] },
  types: { label: 'Types', kinds: ['implements', 'inherits', 'overrides'] },
  usage: { label: 'Usage', kinds: ['references'] },
};

type CardData = { item: EgoItem; project: string; selected: boolean; expanded: boolean };

const SymbolCard = memo(function SymbolCard({ data }: NodeProps<FlowNode<CardData>>) {
  const { item, project, selected } = data;
  const center = item.type === 'center';
  return (
    <div
      className={cn(
        'flex w-[260px] items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-sm transition-colors hover:border-border-strong',
        center && 'border-foreground/60 bg-surface-3 shadow-[0_0_0_4px_hsl(var(--foreground)/0.08)]',
        selected && 'ring-2 ring-foreground/70',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-strong" />
      <KindGlyph kind={item.symbolKind} size={center ? 'lg' : 'sm'} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', center ? 'text-sm' : 'text-[13px]')} title={item.label}>
          {item.label}
        </p>
        <p className="truncate text-2xs text-subtle-foreground">
          {item.symbolKind} · {project}
        </p>
      </div>
      {item.degree > 0 && <span className="font-mono text-2xs tabular-nums text-subtle-foreground">{item.degree}</span>}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-strong" />
    </div>
  );
});

const GroupCard = memo(function GroupCard({ data }: NodeProps<FlowNode<CardData>>) {
  const { item } = data;
  return (
    <div className="flex w-[260px] items-center gap-2.5 rounded-lg border border-dashed border-border-strong bg-surface-1 px-3 py-2 hover:bg-surface-3">
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-strong" />
      <KindGlyph kind={item.symbolKind} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{item.label}</p>
        <p className="text-2xs text-subtle-foreground">{item.members?.length} symbols · click to expand</p>
      </div>
      <ChevronRight className="size-4 text-subtle-foreground" />
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-strong" />
    </div>
  );
});

// 'cluster', not 'group': React Flow styles its built-in group node type.
const nodeTypes = { symbol: SymbolCard, center: SymbolCard, cluster: GroupCard };

function FocusPicker() {
  const model = useStore((s) => s.model);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(() => (model && q.trim().length >= 2 ? searchNodes(model, q, 40) : []), [model, q]);
  const current = focus ? model?.nodes.get(focus.ids[0]) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-72 gap-2">
          {current ? <KindGlyph kind={current.kind} /> : <Search className="size-4" />}
          <span className="truncate">{current?.label ?? 'Pick a symbol…'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2">
        <Input autoFocus placeholder="Search symbols…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />
        <div className="max-h-72 overflow-y-auto">
          {model &&
            hits.map((id) => {
              const n = model.nodes.get(id)!;
              return (
                <button
                  key={id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setFocus({ ids: [id], depth: focus?.depth ?? 2, direction: focus?.direction ?? 'both', kinds: focus?.kinds, label: n.label });
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <KindGlyph kind={n.kind} />
                  <span className="truncate">{n.label}</span>
                  <span className="ml-auto truncate text-2xs text-subtle-foreground">{model.nodes.get(n.root)?.label}</span>
                </button>
              );
            })}
          {q.trim().length >= 2 && !hits.length && <p className="px-2 py-4 text-center text-sm text-muted-foreground">No matches.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Graph() {
  const model = useStore((s) => s.model)!;
  const view = useStore((s) => s);
  const focus = useStore((s) => s.focus);
  const selection = useStore((s) => s.selection);
  const setFocus = useStore((s) => s.setFocus);
  const set = useStore((s) => s.set);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'columns' | 'radial'>('columns');
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const flow = useReactFlow();
  const centerId = focus!.ids[0];
  const preset = Object.entries(PRESETS).find(([, p]) => JSON.stringify(p.kinds) === JSON.stringify(focus!.kinds ?? null))?.[0] ?? 'all';

  useEffect(() => setExpanded(new Set()), [centerId, focus!.direction, focus!.depth, preset]);

  const ego = useMemo(
    () => buildEgo(model, view, centerId, { direction: focus!.direction, depth: Math.max(1, focus!.depth), kinds: focus!.kinds?.length ? focus!.kinds : null, groupThreshold: 12, expanded, maxNodes: 3000 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, centerId, focus, expanded, view.edgeKinds, view.resolutions, view.usages, view.origins, view.hidden, view.disabledRoots, view.hideTests],
  );
  const pos = useMemo(() => layoutEgo(ego.items, mode), [ego, mode]);
  const selectedId = selection?.type === 'node' ? selection.id : null;

  const nodes: FlowNode<CardData>[] = useMemo(
    () =>
      ego.items.map((item) => ({
        id: item.id,
        type: item.type === 'group' ? 'cluster' : item.type,
        position: { x: pos.get(item.id)!.x - 130, y: pos.get(item.id)!.y - 24 },
        data: { item, project: model.nodes.get(item.root)?.label ?? '', selected: !!item.nodeId && item.nodeId === selectedId, expanded: expanded.has(item.id) },
        draggable: true,
      })),
    [ego, pos, model, selectedId, expanded],
  );
  const edges: FlowEdge[] = useMemo(
    () =>
      ego.links.map((l: EgoLink) => {
        const kind = Object.entries(l.kinds).sort((a, b) => b[1] - a[1])[0][0];
        const color = rgbCss(relationColor(kind));
        const hot = hoverEdge === l.id || (selection?.type === 'edge' && selection.id === l.id);
        return {
          id: l.id,
          source: l.source,
          target: l.target,
          type: 'default',
          style: { stroke: hot ? '#fafafa' : color, strokeWidth: Math.min(5, 1.2 + Math.log2(l.count)), opacity: hot ? 1 : 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: hot ? '#fafafa' : color, width: 14, height: 14 },
          label: hot ? `${l.count} · ${Object.entries(l.kinds).map(([k, c]) => `${kindLabel(k)} ${c}`).join(', ')}` : undefined,
          labelStyle: { fill: '#fafafa', fontSize: 11 },
          labelBgStyle: { fill: '#18181b' },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          data: { link: l },
        };
      }),
    [ego, hoverEdge, selection],
  );

  // Fit once the cards have been measured, and again whenever the graph or the layout changes.
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (initialized) flow.fitView({ padding: 0.15, duration: 250, maxZoom: 1.1 });
  }, [initialized, ego, mode, flow]);

  const exportPng = () => {
    const bounds = getNodesBounds(flow.getNodes());
    const w = Math.min(4000, bounds.width + 200);
    const h = Math.min(4000, bounds.height + 200);
    const vp = getViewportForBounds(bounds, w, h, 0.2, 2, 0.1);
    const el = document.querySelector('.ego-flow .react-flow__viewport') as HTMLElement | null;
    if (!el) return;
    toPng(el, { backgroundColor: '#0b0b0d', width: w, height: h, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } }).then((url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `neighbourhood-${model.nodes.get(centerId)?.label ?? 'graph'}.png`;
      a.click();
    });
  };

  const left = ego.items.filter((i) => i.column < 0).length;
  const right = ego.items.filter((i) => i.column > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <FocusPicker />
        <Separator orientation="vertical" className="h-5" />
        <ToggleGroup type="single" variant="outline" size="sm" value={focus!.direction} onValueChange={(v) => v && setFocus({ ...focus!, direction: v as 'in' | 'out' | 'both' })} aria-label="Direction">
          <ToggleGroupItem value="in" className="h-8 px-2.5 text-xs">
            Used by
          </ToggleGroupItem>
          <ToggleGroupItem value="both" className="h-8 px-2.5 text-xs">
            Both
          </ToggleGroupItem>
          <ToggleGroupItem value="out" className="h-8 px-2.5 text-xs">
            Uses
          </ToggleGroupItem>
        </ToggleGroup>
        <Select value={String(focus!.depth)} onValueChange={(v) => setFocus({ ...focus!, depth: Number(v) })}>
          <SelectTrigger className="h-8 w-28 text-xs" aria-label="Depth">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((d) => (
              <SelectItem key={d} value={String(d)} className="text-xs">
                {d} {d === 1 ? 'hop' : 'hops'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" variant="outline" size="sm" value={preset} onValueChange={(v) => v && setFocus({ ...focus!, kinds: PRESETS[v].kinds ?? undefined })} aria-label="Relations">
          {Object.entries(PRESETS).map(([id, p]) => (
            <ToggleGroupItem key={id} value={id} className="h-8 px-2.5 text-xs">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as 'columns' | 'radial')} aria-label="Layout">
          <ToggleGroupItem value="columns" className="h-8 px-2.5 text-xs">
            Columns
          </ToggleGroupItem>
          <ToggleGroupItem value="radial" className="h-8 px-2.5 text-xs">
            Radial
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 font-mono text-2xs tabular-nums text-subtle-foreground">
            {left} used by · {right} uses{ego.truncated ? ' · capped' : ''}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => flow.fitView({ padding: 0.15, duration: 300 })} aria-label="Fit">
                <Expand className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={exportPng} aria-label="Export PNG">
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export PNG</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => (set({ tab: 'map' }), useStore.getState().navigate(centerId))} aria-label="Show on map">
                <MapIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show on map</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setFocus(null)} aria-label="Close neighbourhood">
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="ego-flow relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-between px-6 text-2xs font-medium uppercase tracking-[0.08em] text-faint-foreground">
          <span>{mode === 'columns' && focus!.direction !== 'out' ? '← Used by' : ''}</span>
          <span>{mode === 'columns' && focus!.direction !== 'in' ? 'Uses →' : ''}</span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => {
            const item = (n.data as CardData).item;
            if (item.type === 'group') setExpanded(new Set([...expanded, item.id]));
            else if (item.nodeId) set({ selection: { type: 'node', id: item.nodeId }, inspectorOpen: true });
          }}
          onNodeDoubleClick={(_, n) => {
            const item = (n.data as CardData).item;
            if (item.type === 'symbol' && item.nodeId) setFocus({ ...focus!, ids: [item.nodeId], label: item.label });
          }}
          onEdgeClick={(_, e) => {
            const l = (e.data as { link: EgoLink }).link;
            set({ selection: { type: 'edge', id: l.id, edgeIdx: l.edgeIdx, source: ego.items.find((i) => i.id === l.source)?.nodeId ?? l.source, target: ego.items.find((i) => i.id === l.target)?.nodeId ?? l.target, kinds: l.kinds }, inspectorOpen: true });
          }}
          onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
          onEdgeMouseLeave={() => setHoverEdge(null)}
          onPaneClick={() => set({ selection: null })}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(240 4% 20%)" />
        </ReactFlow>
      </div>
    </div>
  );
}

export function NeighbourhoodView() {
  const focus = useStore((s) => s.focus);
  const recent = useStore((s) => s.recent);
  const model = useStore((s) => s.model);
  const setFocus = useStore((s) => s.setFocus);
  if (!focus)
    return (
      <div className="flex flex-1 items-start justify-center overflow-y-auto">
        <EmptyState icon={<Network className="size-5" />} title="Explore the neighbourhood of a symbol" action={<FocusPicker />}>
          See what uses a symbol and what it uses, a few hops away. Pick one here, or select a circle on the map and choose Neighbourhood.
          {recent.length > 0 && model && (
            <div className="mt-6 space-y-1 text-left">
              <p className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle-foreground">Recent</p>
              {recent.slice(0, 5).map((id) => {
                const n = model.nodes.get(id);
                if (!n) return null;
                return (
                  <button key={id} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent" onClick={() => setFocus({ ids: [id], depth: 2, direction: 'both', label: n.label })}>
                    <KindGlyph kind={n.kind} />
                    <span className="truncate text-foreground">{n.label}</span>
                    <Crosshair className="ml-auto size-3.5 text-subtle-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </EmptyState>
      </div>
    );
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  );
}
