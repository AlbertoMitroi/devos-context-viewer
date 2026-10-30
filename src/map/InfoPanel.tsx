import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ListTree } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KindGlyph } from '@/components/kind-glyph';
import { kindLabel } from '@/model/kinds';
import type { GraphModel } from '@/model/graphModel';
import type { MapEdge, MapLayout, MapNode } from '@/model/mapLayout';
import { relationColor, rgbCss } from '@/theme/palette';
import { useStore } from '@/store';
import { HoverDetails } from './HoverCard';

const GROUPS = new Set(['project', 'package', 'group', 'pkgnamespace']);

export interface HoverState {
  x: number;
  y: number;
  node?: MapNode;
  edge?: MapEdge;
}

function KindChips({ kinds }: { kinds: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(kinds)
        .sort((a, b) => b[1] - a[1])
        .map(([k, c]) => (
          <Badge key={k} variant="outline" className="gap-1.5 font-normal">
            <span className="size-2 rounded-sm" style={{ background: rgbCss(relationColor(k)) }} />
            {kindLabel(k)} <span className="font-mono text-subtle-foreground">{c}</span>
          </Badge>
        ))}
    </div>
  );
}

const sumKinds = (edges: MapEdge[]) => {
  const out: Record<string, number> = {};
  for (const e of edges) for (const [k, c] of Object.entries(e.kinds)) out[k] = (out[k] ?? 0) + c;
  return out;
};

/**
 * Right-hand panel on the map: what is under the pointer, or a summary of the focus, and the legend.
 * The map itself never changes on hover; everything about the hovered circle is shown here.
 */
export function InfoPanel(props: {
  drawn: MapNode[];
  focused: MapEdge[];
  hoverPair: Set<MapEdge>;
  hover: HoverState | null;
  focusId: string | null;
  layout: MapLayout;
  model: GraphModel;
  hoverOpen: boolean;
}) {
  const { drawn, focused, hoverPair, hover, focusId, layout, model, hoverOpen } = props;
  const [legendOpen, setLegendOpen] = useState(true);
  const entityKinds = useStore((s) => s.entityKinds);
  const edgeKinds = useStore((s) => s.edgeKinds);
  const toggleIn = useStore((s) => s.toggleIn);
  const set = useStore((s) => s.set);
  const kinds = useMemo(() => [...new Set(drawn.map((n) => n.kind).filter((k) => !GROUPS.has(k)))].sort(), [drawn]);
  const rels = useMemo(() => [...new Set(focused.flatMap((e) => Object.keys(e.kinds)))].sort(), [focused]);
  const label = (id: string) => layout.nodes.get(id)?.label ?? id;
  const focusNode = focusId ? layout.nodes.get(focusId) : undefined;
  const showEdges = (edges: MapEdge[], a: string, b: string) => {
    const edgeIdx = edges.flatMap((e) => e.edgeIdx);
    set({ selection: { type: 'edge', id: `${a}|${b}`, edgeIdx, source: a, target: b, kinds: sumKinds(edges) }, inspectorOpen: true });
  };

  // Top section, in order of priority: edge under the pointer, focus pair, hovered circle, focus summary.
  let top: React.ReactNode = null;
  if (hover?.edge) {
    const e = hover.edge;
    top = (
      <div className="space-y-2 px-3 py-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{label(e.source)}</span>
          <ArrowRight className="size-3.5 shrink-0 text-subtle-foreground" />
          <span className="truncate">{label(e.target)}</span>
        </p>
        <p className="text-xs text-subtle-foreground">{e.count.toLocaleString('en-US')} relations</p>
        <KindChips kinds={e.kinds} />
      </div>
    );
  } else if (hover?.node && focusNode && hover.node.id !== focusNode.id && hoverPair.size) {
    const pair = [...hoverPair];
    top = (
      <div className="space-y-2 px-3 py-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <KindGlyph kind={focusNode.kind} />
          <span className="truncate">{focusNode.label}</span>
          <ArrowRight className="size-3.5 shrink-0 text-subtle-foreground" />
          <KindGlyph kind={hover.node.kind} />
          <span className="truncate">{hover.node.label}</span>
        </p>
        <p className="text-xs text-subtle-foreground">{pair.reduce((a, e) => a + e.count, 0).toLocaleString('en-US')} relations between them</p>
        <KindChips kinds={sumKinds(pair)} />
        <Button size="sm" variant="secondary" className="h-7 w-full gap-1.5 text-xs" onClick={() => showEdges(pair, focusNode.id, hover.node!.id)}>
          <ListTree className="size-3.5" /> Show relations
        </Button>
      </div>
    );
  } else if (hover?.node) {
    top = <HoverDetails hover={hover} layout={layout} model={model} open={hoverOpen} selected={hover.node.id === focusId} />;
  } else if (focusNode) {
    const others = new Map<string, number>();
    for (const e of focused) {
      const o = e.source === focusNode.id ? e.target : e.source;
      others.set(o, (others.get(o) ?? 0) + e.count);
    }
    const top6 = [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    top = (
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-center gap-2">
          <KindGlyph kind={focusNode.kind} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{focusNode.label}</p>
            <p className="text-2xs text-subtle-foreground">
              {others.size} connected · {focused.reduce((a, e) => a + e.count, 0).toLocaleString('en-US')} relations
            </p>
          </div>
        </div>
        {focused.length > 0 && <KindChips kinds={sumKinds(focused)} />}
        {top6.length > 0 && (
          <div className="space-y-0.5">
            {top6.map(([id, c]) => {
              const n = layout.nodes.get(id);
              if (!n) return null;
              return (
                <button key={id} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent" onClick={() => set({ selection: { type: 'node', id } })}>
                  <KindGlyph kind={n.kind} />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span className="font-mono text-2xs text-subtle-foreground">{c}</span>
                </button>
              );
            })}
          </div>
        )}
        {!focused.length && <p className="text-xs text-subtle-foreground">No relations drawn for this selection with the current filters.</p>}
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-10 w-80 overflow-hidden rounded-xl border bg-popover/95 text-xs shadow-lg backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {top && <div className="border-b">{top}</div>}
      {(kinds.length > 0 || rels.length > 0) && (
        <>
          <button className="flex w-full items-center justify-between px-3 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle-foreground hover:text-foreground" onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}>
            Legend
            <ChevronDown className={`size-3.5 transition-transform ${legendOpen ? '' : '-rotate-90'}`} />
          </button>
          {legendOpen && (
            <div className="max-h-56 space-y-3 overflow-y-auto border-t px-2 pb-2 pt-2">
              {kinds.length > 0 && (
                <div className="grid grid-cols-2 gap-0.5">
                  {kinds.map((k) => (
                    <button key={k} className={`flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent ${entityKinds.has(k) ? '' : 'opacity-40'}`} onClick={() => toggleIn('entityKinds', k)} title="Show or hide">
                      <KindGlyph kind={k} />
                      <span className="truncate">{k.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
              {rels.length > 0 && (
                <div className="space-y-0.5 border-t pt-2">
                  {rels.map((k) => (
                    <button key={k} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent ${edgeKinds.has(k) ? '' : 'opacity-40'}`} onClick={() => toggleIn('edgeKinds', k)} title="Show or hide">
                      <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ background: rgbCss(relationColor(k)) }} />
                      <span className="truncate">{kindLabel(k)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
