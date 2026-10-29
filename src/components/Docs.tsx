import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { BookOpen, FileText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStore } from '@/store';

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
      if (alive) setHtml(t ? (marked.parse(t, { async: false }) as string) : '<p>File missing.</p>');
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
          div.className = 'not-prose my-4 overflow-x-auto rounded-lg border bg-card p-4';
          div.innerHTML = svg;
          b.parentElement?.replaceWith(div);
        } catch (e) {
          b.parentElement?.insertAdjacentHTML('afterend', `<div class="not-prose rounded-md border border-amber-500/40 p-2 text-xs">Mermaid: ${String((e as Error).message)}</div>`);
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

  if (!docs.length)
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="font-medium">No context packs or wiki yet</p>
          <p className="text-sm text-muted-foreground">This generation has no context/ or wiki/ folder.</p>
        </div>
      </div>
    );
  const filtered = docs.filter((d) => d.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(filtered.map((d) => d.split('/').slice(0, -1).join('/')))];
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r">
        <div className="relative p-3">
          <Search className="absolute left-5 top-5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Filter pages…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ScrollArea className="flex-1">
          <nav className="space-y-4 px-3 pb-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.replace(/\//g, ' › ')}</p>
                {filtered
                  .filter((d) => d.split('/').slice(0, -1).join('/') === g)
                  .map((d) => (
                    <button
                      key={d}
                      onClick={() => st.set({ docPath: d })}
                      title={d}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${d === path ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{d.split('/').pop()!.replace(/\.md$/, '').replace(/-[0-9a-f]{8}$/, '')}</span>
                    </button>
                  ))}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>
      <ScrollArea className="flex-1">
        <article
          className="prose prose-sm prose-invert mx-auto max-w-4xl px-8 py-8 prose-headings:font-semibold prose-a:text-sky-400 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:bg-zinc-950 prose-table:text-sm prose-th:border prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:px-3 prose-td:py-1.5"
          ref={body}
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </ScrollArea>
    </div>
  );
}
