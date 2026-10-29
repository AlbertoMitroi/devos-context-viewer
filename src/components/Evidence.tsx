import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Evidence, Span } from '../model/types';

const loc = (path: string, span?: Span) => (span ? `${path}:${span.startLine}:${span.startColumn}` : path);

export function SourceContext({ path, store, span, radius = 6 }: { path: string; store?: string; span?: Span; radius?: number }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  const source = useStore((s) => (s.activeId ? s.sources[s.activeId] : null));
  useEffect(() => {
    let alive = true;
    source?.readSource(path, store).then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, [path, store, source]);
  if (text === undefined) return <div className="muted small">se încarcă sursa…</div>;
  if (text === null)
    return (
      <div className="muted small">
        Sursa nu e disponibilă ({store === 'generation' ? 'fișier generat lipsă' : 'adaugă "source" în viewer.config.json pentru fișierele din repo'}).
      </div>
    );
  const lines = text.split(/\r?\n/);
  const start = Math.max(1, (span?.startLine ?? 1) - radius);
  const end = Math.min(lines.length, (span?.endLine ?? span?.startLine ?? 1) + radius);
  return (
    <pre className="code">
      {lines.slice(start - 1, end).map((l, i) => {
        const n = start + i;
        const hit = span && n >= span.startLine && n <= span.endLine;
        return (
          <div key={n} className={hit ? 'code-hit' : undefined}>
            <span className="ln">{n}</span>
            {l || ' '}
          </div>
        );
      })}
    </pre>
  );
}

function EvidenceItem({ e }: { e: Evidence }) {
  const [open, setOpen] = useState(false);
  if (e.missing) return <div className="ev missing">dovadă lipsă: {e.id}</div>;
  return (
    <div className="ev">
      <div className="ev-head">
        <button className="link mono" onClick={() => setOpen(!open)} title="Arată contextul sursei">
          {loc(e.path, e.span)}
        </button>
        <span className="badge">{e.method}</span>
        {e.store === 'generation' && <span className="badge">generat</span>}
      </div>
      {e.snippetText && !open && <pre className="code snippet">{e.snippetText}</pre>}
      {open && <SourceContext path={e.path} store={e.store} span={e.span} />}
      <div className="ev-meta muted small">
        {e.extractor} · blob {String(e.blobId ?? '').slice(0, 10)} · {e.context}
        {e.generator ? ` · generator ${String(e.generator)}` : ''}
      </div>
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
  if (!ids.length) return <div className="muted small">fără dovezi</div>;
  if (!items) return <div className="muted small">se încarcă dovezile…</div>;
  return (
    <div className="ev-list">
      {items.map((e) => (
        <EvidenceItem key={e.id} e={e} />
      ))}
      {ids.length > max && (
        <button className="link" onClick={() => setMax(max + 50)}>
          încă {Math.min(50, ids.length - max)} din {ids.length - max} rămase
        </button>
      )}
    </div>
  );
}
