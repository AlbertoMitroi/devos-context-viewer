import { useEffect, useState } from 'react';
import type { GraphModel } from '../model/graphModel';
import type { MapEdge, MapLayout, MapNode } from '../model/mapLayout';
import { edgeColor, kindLabel } from '../model/kinds';
import { KIND_GLYPH } from '../theme/palette';

function counts(model: GraphModel, id: string, dir: 'out' | 'in') {
  const m = new Map<string, number>();
  for (const idx of (dir === 'out' ? model.out : model.in).get(id) ?? []) {
    const k = model.edges[idx].kind;
    if (k === 'contains' || k === 'declares') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Rich hover card, shown after a short delay so it does not flicker while the pointer travels. */
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
  if (hover.edge) {
    const e = hover.edge;
    return (
      <div className="hovercard panel" style={style} role="tooltip">
        <div className="hc-title">
          {layout.nodes.get(e.source)?.label} <span className="muted">↔</span> {layout.nodes.get(e.target)?.label}
        </div>
        <div className="hc-meta">{e.count.toLocaleString('en-US')} relations · click to frame both</div>
        <div className="hc-kinds">
          {Object.entries(e.kinds)
            .sort((a, b) => b[1] - a[1])
            .map(([k, c]) => (
              <span key={k} className="chip">
                <i className="swatch" style={{ background: edgeColor(k) }} />
                {kindLabel(k)} <b>{c}</b>
              </span>
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
    <div className="hovercard panel" style={style} role="tooltip">
      <div className="hc-head">
        <span className="glyph" data-kind={n.kind}>
          {KIND_GLYPH[n.kind] ?? '·'}
        </span>
        <div>
          <div className="hc-title">{n.label}</div>
          <div className="hc-meta">
            {n.kind}
            {root && root.id !== n.id ? ` in ${root.label}` : ''}
            {h?.origin && h.origin !== 'source' && h.origin !== 'group' ? ` · ${h.origin}` : ''}
          </div>
        </div>
      </div>
      {h && h.fullName !== n.label && <div className="hc-full mono">{h.fullName}</div>}
      {n.children.length > 0 && <div className="hc-meta">{n.size.toLocaleString('en-US')} symbols inside</div>}
      {(outs.length > 0 || ins.length > 0) && (
        <div className="hc-rel">
          {outs.length > 0 && <div>uses: {outs.map(([k, c]) => `${kindLabel(k)} ${c}`).join(', ')}</div>}
          {ins.length > 0 && <div>used by: {ins.map(([k, c]) => `${kindLabel(k)} ${c}`).join(', ')}</div>}
        </div>
      )}
      <div className="hc-hint">{open ? 'Click empty space to go up' : n.children.length ? 'Click to enter' : 'Click for details'}</div>
    </div>
  );
}
