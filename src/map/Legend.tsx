import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { KindGlyph } from '@/components/kind-glyph';
import { kindLabel } from '@/model/kinds';
import type { MapEdge, MapNode } from '@/model/mapLayout';
import { relationColor, rgbCss } from '@/theme/palette';
import { useStore } from '@/store';

const GROUPS = new Set(['project', 'package', 'group', 'pkgnamespace']);

/** What the colours mean, for what is on screen. Clicking an entry hides or shows that kind. */
export function Legend({ drawn, edges }: { drawn: MapNode[]; edges: MapEdge[] }) {
  const [open, setOpen] = useState(true);
  const entityKinds = useStore((s) => s.entityKinds);
  const edgeKinds = useStore((s) => s.edgeKinds);
  const toggleIn = useStore((s) => s.toggleIn);
  const kinds = useMemo(() => [...new Set(drawn.map((n) => n.kind).filter((k) => !GROUPS.has(k)))].sort(), [drawn]);
  const rels = useMemo(() => [...new Set(edges.flatMap((e) => Object.keys(e.kinds)))].sort(), [edges]);
  if (!kinds.length && !rels.length) return null;
  return (
    <div
      className="absolute bottom-4 left-[180px] z-10 w-56 rounded-xl border bg-popover/90 text-xs shadow-lg backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <button className="flex w-full items-center justify-between px-3 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-expanded={open}>
        Legend
        <ChevronDown className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="max-h-64 space-y-3 overflow-y-auto border-t px-2 pb-2 pt-2">
          {kinds.length > 0 && (
            <div className="space-y-0.5">
              {kinds.map((k) => (
                <button key={k} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent ${entityKinds.has(k) ? '' : 'opacity-40'}`} onClick={() => toggleIn('entityKinds', k)} title="Show or hide">
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
    </div>
  );
}
