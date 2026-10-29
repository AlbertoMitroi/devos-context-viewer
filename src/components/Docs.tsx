import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { BookOpen, Crosshair, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PathText } from '@/components/blocks';
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
  const [toc, setToc] = useState<{ id: string; text: string; level: number }[]>([]);
  const [title, setTitle] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const path = st.docPath;
  const model = st.model;
  // Symbols by their full name, so type names in context cards link to the map.
  const bySignature = useMemo(() => {
    const m = new Map<string, string>();
    if (model) for (const n of model.nodes.values()) if (n.tier === 'entity' && n.origin !== 'metadata' && !m.has(n.fullName)) m.set(n.fullName, n.id);
    return m;
  }, [model]);
  const projectPath = useMemo(() => {
    const m = /- Project: `([^`]+)`/.exec(body.current?.textContent ?? '');
    return m?.[1] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);
  const project = projectPath ? model?.projectByPath.get(projectPath) : undefined;

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

  // After each page renders: heading ids for the table of contents, scrollable tables, symbol links.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const h1 = el.querySelector('h1');
    setTitle(h1?.textContent ?? path?.split('/').pop() ?? '');
    const heads = [...el.querySelectorAll('h2, h3')] as HTMLElement[];
    heads.forEach((h, i) => (h.id = `h-${i}`));
    setToc(heads.map((h) => ({ id: h.id, text: h.textContent ?? '', level: h.tagName === 'H2' ? 2 : 3 })));
    for (const t of [...el.querySelectorAll('table')]) {
      if (t.parentElement?.classList.contains('table-scroll')) continue;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll not-prose my-4 overflow-x-auto rounded-lg border';
      t.replaceWith(wrap);
      wrap.appendChild(t);
      t.className = 'w-full text-sm [&_td]:border-t [&_td]:border-border-subtle [&_td]:px-3 [&_td]:py-2 [&_th]:bg-surface-1 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-subtle-foreground';
    }
    for (const c of [...el.querySelectorAll('code')]) {
      const id = bySignature.get(c.textContent ?? '');
      if (id && !c.closest('pre')) {
        c.dataset.entity = id;
        c.classList.add('cursor-pointer', 'underline', 'decoration-dotted', 'underline-offset-4', 'hover:text-foreground');
        c.title = 'Show on map';
      }
    }
  }, [html, bySignature, path]);

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
          div.className = 'not-prose my-4 overflow-x-auto rounded-xl border bg-surface-1 p-4';
          div.innerHTML = svg;
          b.parentElement?.replaceWith(div);
        } catch (e) {
          b.parentElement?.insertAdjacentHTML('afterend', `<div class="not-prose rounded-md border border-warning/30 p-2 text-xs">Mermaid: ${String((e as Error).message)}</div>`);
        }
      }
    });
  }, [html]);

  const onClick = (e: React.MouseEvent) => {
    const entity = (e.target as HTMLElement).closest('code')?.dataset.entity;
    if (entity) {
      st.set({ tab: 'map' });
      st.navigate(entity);
      return;
    }
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
                      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent ${d === path ? 'bg-surface-3 font-medium text-foreground' : 'text-muted-foreground'}`}
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
        <div className="mx-auto flex max-w-6xl gap-10 px-8 py-8">
          <div className="min-w-0 flex-1 space-y-6">
            <PageHeader
              title={title}
              meta={path && <PathText text={path} max={80} />}
              actions={
                project && (
                  <Button size="sm" className="gap-1.5" onClick={() => (st.set({ tab: 'map' }), st.navigate(project.id))}>
                    <Crosshair className="size-4" /> Show on map
                  </Button>
                )
              }
            />
            <article
              className="prose prose-sm prose-invert max-w-[72ch] prose-headings:scroll-mt-6 prose-headings:font-semibold prose-h1:hidden prose-h2:mt-10 prose-h2:border-b prose-h2:border-border-subtle prose-h2:pb-2 prose-h2:text-base prose-h3:text-sm prose-p:text-muted-foreground prose-a:text-foreground prose-a:underline-offset-4 prose-strong:text-foreground prose-code:rounded prose-code:bg-surface-3 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.85em] prose-code:font-normal prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:bg-canvas prose-li:text-muted-foreground prose-li:marker:text-faint-foreground [&_li]:[overflow-wrap:anywhere]"
              ref={body}
              onClick={onClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
          {toc.length > 2 && (
            <nav className="sticky top-8 hidden h-fit w-56 shrink-0 space-y-1 xl:block" aria-label="On this page">
              <p className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle-foreground">On this page</p>
              {toc.map((t) => (
                <button
                  key={t.id}
                  onClick={() => body.current?.querySelector(`#${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={`block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground ${t.level === 3 ? 'pl-3' : ''}`}
                >
                  {t.text}
                </button>
              ))}
            </nav>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
