import { useEffect, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { KindGlyph } from '@/components/kind-glyph';
import type { GraphModel } from '@/model/graphModel';
import type { MapEdge, MapLayout, MapNode } from '@/model/mapLayout';
import { edgeColor, kindLabel } from '@/model/kinds';

function counts(model: GraphModel, id: string, dir: 'out' | 'in') {
  const m = new Map<string, number>();
  for (const idx of (dir === 'out' ? model.out : model.in).get(id) ?? []) {
    const k = model.edges[idx].kind;
    if (k === 'contains' || k === 'declares') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Hover card on the map, shown after a short delay so it does not flicker while the pointer travels. */
export function HoverCard({ hover, layout, model, open }: { hover: { x: number; y: number; node?: MapNode; edge?: MapEdge }; layout: MapLayout; model: GraphModel; open: boolean }) {
  const [shown, setShown] = useState(false);
  const key = hover.node?.id ?? (hover.edge ? `${hover.edge.source}|${hover.edge.target}` : '');
  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(t);
  }, [key]);
  if (!shown) return null;
  const style = { left: hover.x + 16, top: hover.y + 16 };
  const shell = 'pointer-events-none absolute z-20 w-max max-w-sm rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95';

  if (hover.edge) {
    const e = hover.edge;
    return (
      <div className={shell} style={style} role="tooltip">
        <p className="text-sm font-medium">
          {layout.nodes.get(e.source)?.label} <span className="text-muted-foreground">↔</span> {layout.nodes.get(e.target)?.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{e.count.toLocaleString('en-US')} relations · click to frame both</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(e.kinds)
            .sort((a, b) => b[1] - a[1])
            .map(([k, c]) => (
              <Badge key={k} variant="outline" className="gap-1.5 font-normal">
                <span className="size-2 rounded-sm" style={{ background: edgeColor(k) }} />
                {kindLabel(k)} <span className="font-mono text-muted-foreground">{c}</span>
              </Badge>
            ))}
        </div>
      </div>
    );
  }

  const n = hover.node!;
  const h = model.nodes.get(n.id);
  const root = layout.nodes.get(n.root);
  const outs = counts(model, n.id, 'out').slice(0, 3);
  const ins = counts(model, n.id, 'in').slice(0, 3);
  return (
    <div className={shell} style={style} role="tooltip">
      <div className="flex items-center gap-2.5">
        <KindGlyph kind={n.kind} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{n.label}</p>
          <p className="text-xs text-muted-foreground">
            {n.kind}
            {root && root.id !== n.id ? ` in ${root.label}` : ''}
            {h?.origin && h.origin !== 'source' && h.origin !== 'group' ? ` · ${h.origin}` : ''}
          </p>
        </div>
      </div>
      {h && h.fullName !== n.label && <p className="mt-2 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{h.fullName}</p>}
      {(n.children.length > 0 || outs.length > 0 || ins.length > 0) && (
        <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
          {n.children.length > 0 && <p>{n.size.toLocaleString('en-US')} symbols inside</p>}
          {outs.length > 0 && <p>Uses: {outs.map(([k, c]) => `${kindLabel(k)} ${c}`).join(', ')}</p>}
          {ins.length > 0 && <p>Used by: {ins.map(([k, c]) => `${kindLabel(k)} ${c}`).join(', ')}</p>}
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-sky-400">
        <MousePointerClick className="size-3.5" />
        {open ? 'Click empty space to go up' : n.children.length ? 'Click to enter' : 'Click for details'}
      </p>
    </div>
  );
}
