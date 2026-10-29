import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useStore } from '@/store';
import { CodeBlock } from './blocks';
import type { Evidence, Span } from '@/model/types';

const loc = (path: string, span?: Span) => (span ? `${path}:${span.startLine}:${span.startColumn}` : path);

export function SourceContext({ path, store, span, radius = 6 }: { path: string; store?: string; span?: Span; radius?: number }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  const source = useStore((s) => (s.activeId ? s.sources[s.activeId] : null));
  useEffect(() => {
    let alive = true;
    setText(undefined);
    source?.readSource(path, store).then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, [path, store, source]);
  if (text === undefined) return <Skeleton className="my-2 h-24 w-full" />;
  if (text === null)
    return (
      <p className="my-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Source not available. {store === 'generation' ? 'The generated file is missing from the generation.' : 'Add "source" to viewer.config.json to show repository files.'}
      </p>
    );
  const lines = text.split(/\r?\n/);
  const start = Math.max(1, (span?.startLine ?? 1) - radius);
  const end = Math.min(lines.length, (span?.endLine ?? span?.startLine ?? 1) + radius);
  return (
    <div className="my-2">
      <CodeBlock lines={lines.slice(start - 1, end)} start={start} highlight={span ? [span.startLine, span.endLine] : undefined} />
    </div>
  );
}

function EvidenceItem({ e }: { e: Evidence }) {
  const [open, setOpen] = useState(false);
  if (e.missing) return <p className="text-xs text-destructive">Missing evidence: {e.id}</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="flex min-w-0 items-center gap-1 rounded-sm font-mono text-xs text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(!open)} title="Show source context">
          <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="truncate">{loc(e.path, e.span)}</span>
        </button>
        {e.method && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {e.method}
          </Badge>
        )}
        {e.store === 'generation' && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
            generated
          </Badge>
        )}
      </div>
      {e.snippetText && !open && <pre className="overflow-x-auto rounded-lg border bg-canvas px-3 py-1.5 font-mono text-xs">{e.snippetText}</pre>}
      {open && <SourceContext path={e.path} store={e.store} span={e.span} />}
      <p className="font-mono text-[10.5px] text-muted-foreground">
        {e.extractor} · blob {String(e.blobId ?? '').slice(0, 10)}
        {e.generator ? ` · ${String(e.generator)}` : ''}
      </p>
    </div>
  );
}

export function EvidenceList({ ids, limit = 20 }: { ids: string[]; limit?: number }) {
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [max, setMax] = useState(limit);
  const evidence = useStore((s) => s.evidence);
  useEffect(() => {
    let alive = true;
    setItems(null);
    evidence(ids.slice(0, max)).then((r) => alive && setItems(r));
    return () => {
      alive = false;
    };
  }, [ids, max, evidence]);
  if (!ids.length) return <p className="text-xs text-muted-foreground">No evidence.</p>;
  if (!items) return <Skeleton className="h-12 w-full" />;
  return (
    <div className="space-y-3">
      {items.map((e) => (
        <EvidenceItem key={e.id} e={e} />
      ))}
      {ids.length > max && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMax(max + 50)}>
          Show {Math.min(50, ids.length - max)} more of {ids.length - max}
        </Button>
      )}
    </div>
  );
}
