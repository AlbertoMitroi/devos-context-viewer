import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useStore } from '../store';

function resolveRelative(from: string, href: string) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

let mermaidId = 0;

// Raw HTML inside generation Markdown is shown as text, never injected.
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
marked.use({ renderer: { html: (token: { text: string }) => escapeHtml(token.text) } });

export function Docs() {
  const st = useStore();
  const data = st.data!;
  const source = st.activeId ? st.sources[st.activeId] : null;
  const docs = useMemo(() => data.files.filter((f) => /^(context|wiki)\/.*\.md$/.test(f.path)).map((f) => f.path), [data]);
  const [html, setHtml] = useState<string>('');
  const [q, setQ] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const path = st.docPath;

  useEffect(() => {
    if (!path || !source) return;
    let alive = true;
    source.readText(path).then((t) => {
      if (alive) setHtml(t ? (marked.parse(t, { async: false }) as string) : '<p>Fișier lipsă.</p>');
    });
    return () => {
      alive = false;
    };
  }, [path, source]);

  // Mermaid diagrams (wiki) render lazily, only when a page contains one.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const blocks = [...el.querySelectorAll('code.language-mermaid')];
    if (!blocks.length) return;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
      for (const b of blocks) {
        try {
          const { svg } = await mermaid.render(`mmd-${++mermaidId}`, b.textContent ?? '');
          const div = document.createElement('div');
          div.className = 'mermaid';
          div.innerHTML = svg;
          b.parentElement?.replaceWith(div);
        } catch (e) {
          b.parentElement?.insertAdjacentHTML('afterend', `<div class="alert">Mermaid: ${String((e as Error).message)}</div>`);
        }
      }
    });
  }, [html]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || !path) return;
    const href = a.getAttribute('href') ?? '';
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return;
    e.preventDefault();
    const target = resolveRelative(path, href.split('#')[0]);
    if (docs.includes(target)) st.set({ docPath: target });
  };

  if (!docs.length) return <div className="empty muted">Generația nu conține context/ sau wiki/ (încă).</div>;
  const filtered = docs.filter((d) => d.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="docs">
      <nav className="docs-nav">
        <input className="mini-search" placeholder="filtrează pagini…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filtered.map((d) => (
          <button key={d} className={`doc-link ${d === path ? 'on' : ''}`} onClick={() => st.set({ docPath: d })} title={d}>
            {d.replace(/^(context|wiki)\//, '$1 › ').replace(/\//g, ' › ')}
          </button>
        ))}
      </nav>
      <article className="markdown" ref={body} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
