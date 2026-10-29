import { useEffect, useRef, useState } from 'react';
import { searchNodes } from '../model/graphModel';
import { nodeColor } from '../model/kinds';
import { useStore } from '../store';

/** Search box that flies the map (or the neighbourhood graph) to the picked symbol. */
export function MapSearch() {
  const model = useStore((s) => s.model);
  const reveal = useStore((s) => s.reveal);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!model) return;
    const t = setTimeout(() => {
      const h = q.trim().length >= 2 ? searchNodes(model, q) : [];
      setHits(h);
      setCursor(0);
      useStore.getState().set({ searchHits: h, searchQuery: q });
    }, 150);
    return () => clearTimeout(t);
  }, [q, model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: string) => {
    reveal(id);
    setOpen(false);
  };

  return (
    <div className="search">
      <input
        ref={input}
        placeholder="Search symbol, type, project…  (/)   e.g. Basket kind:interface"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, Math.min(hits.length, 50) - 1));
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === 'Enter' && hits[cursor]) pick(hits[cursor]);
          else if (e.key === 'Escape') {
            setQ('');
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {q.trim().length >= 2 && <span className="search-count">{hits.length}</span>}
      {open && hits.length > 0 && model && (
        <div className="search-results">
          {hits.slice(0, 50).map((id, i) => {
            const n = model.nodes.get(id)!;
            return (
              <button key={id} className={`search-hit ${i === cursor ? 'active' : ''}`} onMouseDown={() => pick(id)}>
                <span className="dot" style={{ background: nodeColor(n.kind) }} />
                <span className="hit-label">{n.label}</span>
                <span className="hit-kind">{n.kind}</span>
                <span className="hit-full">{n.fullName}</span>
              </button>
            );
          })}
          {hits.length > 50 && <div className="search-more">+{hits.length - 50} more results; refine the search</div>}
        </div>
      )}
    </div>
  );
}
