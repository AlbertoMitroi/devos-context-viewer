import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, ChevronRight, Copy, Crosshair, EyeOff, GitFork, MoreHorizontal, Network, PhoneIncoming, PhoneOutgoing, Route, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { KindGlyph } from '@/components/kind-glyph';
import { ancestors, type Edge, type GraphModel, type HNode } from '@/model/graphModel';
import { edgeColor, kindLabel } from '@/model/kinds';
import { useStore } from '@/store';
import type { Json } from '@/model/types';
import { EvidenceList, SourceContext } from './Evidence';

const CALLS = ['calls_declared_target', 'possible_runtime_target'];

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">null</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">[]</span>;
    if (v.every((x) => typeof x !== 'object')) return <span>{v.join(', ')}</span>;
    return <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(v, null, 1)}</pre>;
  }
  if (typeof v === 'object') return <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(v, null, 1)}</pre>;
  return <span>{String(v)}</span>;
}

/** Key/value list of a record; unknown fields and ext.* are shown as they are. */
export function Fields({ rec, skip = [] }: { rec: Json; skip?: string[] }) {
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {Object.entries(rec)
        .filter(([k]) => !skip.includes(k))
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={`truncate text-muted-foreground ${k.startsWith('ext.') ? 'text-violet-300' : ''}`}>{k}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              <Value v={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}

function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
      {count !== undefined && (
        <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
          {count}
        </Badge>
      )}
    </h3>
  );
}

function NodeLink({ id, model }: { id: string; model: GraphModel }) {
  const reveal = useStore((s) => s.reveal);
  const n = model.nodes.get(id);
  if (!n) return <span className="font-mono text-xs text-muted-foreground">{id}</span>;
  return (
    <button className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => reveal(id)} title={n.fullName}>
      <KindGlyph kind={n.kind} />
      <span className="truncate">{n.label}</span>
    </button>
  );
}

function RelationRow({ e, other, model }: { e: Edge; other: string; model: GraphModel }) {
  const [open, setOpen] = useState(false);
  const ev = e.relation?.evidence ?? e.link?.evidence ?? [];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Evidence and fields">
            <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <NodeLink id={other} model={model} />
        <div className="ml-auto flex shrink-0 gap-1">
          {e.usage && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              {e.usage}
            </Badge>
          )}
          {e.resolution !== 'exact' && (
            <Badge variant="outline" className="h-5 border-amber-500/40 px-1.5 text-[10px] font-normal text-amber-400">
              {e.resolution}
            </Badge>
          )}
          {e.synthetic && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              derived
            </Badge>
          )}
        </div>
      </div>
      <CollapsibleContent className="ml-7 mt-1 space-y-3 border-l pb-2 pl-3">
        {e.relation && <Fields rec={e.relation} skip={['evidence', 'from', 'to', 'id']} />}
        <EvidenceList ids={ev} limit={5} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function RelationGroups({ node, model, dir }: { node: HNode; model: GraphModel; dir: 'out' | 'in' }) {
  const groups = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const idx of (dir === 'out' ? model.out : model.in).get(node.id) ?? []) {
      const e = model.edges[idx];
      m.set(e.kind, [...(m.get(e.kind) ?? []), e]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [node, model, dir]);
  const [limit, setLimit] = useState<Record<string, number>>({});
  if (!groups.length) return <p className="px-1 text-sm text-muted-foreground">None.</p>;
  return (
    <div className="space-y-1">
      {groups.map(([kind, list], gi) => {
        const max = limit[kind] ?? 25;
        return (
          <Collapsible key={kind} defaultOpen={gi === 0 && list.length <= 25}>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
              <span className="size-2.5 rounded-sm" style={{ background: edgeColor(kind) }} />
              <span className="flex-1 text-left">{kindLabel(kind)}</span>
              <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 py-1 pl-4">
              {list.slice(0, max).map((e) => (
                <RelationRow key={e.idx} e={e} other={dir === 'out' ? e.to : e.from} model={model} />
              ))}
              {list.length > max && (
                <Button variant="link" size="sm" className="h-auto px-2 text-xs" onClick={() => setLimit({ ...limit, [kind]: max + 100 })}>
                  Show {Math.min(100, list.length - max)} more of {list.length - max}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function NodeInspector({ node, model }: { node: HNode; model: GraphModel }) {
  const st = useStore();
  const data = st.data!;
  const decls = model.declarationsByEntity.get(node.id) ?? [];
  const crumbs = ancestors(model, node.id).reverse();
  const outCount = model.out.get(node.id)?.length ?? 0;
  const inCount = model.in.get(node.id)?.length ?? 0;
  const childKinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of node.children) {
      const k = model.nodes.get(c)!.kind;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [node, model]);
  const project = node.kind === 'project' ? node.record : null;
  const contexts = project ? data.contexts.filter((c) => c.projectId === node.id || c.project === node.fullName) : [];
  const diags = data.diagnostics.filter((d) => d.scope === node.fullName || (project && d.scope === project.path));
  const card = project ? data.files.find((f) => f.path.startsWith('context/projects/') && f.path.includes(`/${node.label}-`)) : null;
  const focus = (direction: 'in' | 'out' | 'both', kinds?: string[], label?: string) => st.setFocus({ ids: [node.id], depth: kinds ? 3 : 2, direction, kinds, label: label ?? node.label });
  const summary = node.entity ? Object.fromEntries(Object.entries(node.entity).filter(([k]) => ['kind', 'accessibility', 'modifiers', 'origin', 'project', 'assembly', 'namespace', 'signature'].includes(k))) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <KindGlyph kind={node.kind} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{node.label}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{node.kind}</Badge>
            {node.origin !== 'group' && <Badge variant="outline">{node.origin}</Badge>}
            {node.isTest && <Badge variant="outline">test</Badge>}
          </div>
        </div>
      </div>

      {crumbs.length > 0 && (
        <nav className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground" aria-label="Containers">
          {crumbs.map((c, i) => (
            <span key={c} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-3" />}
              <button className="rounded px-1 hover:bg-accent hover:text-foreground" onClick={() => st.reveal(c)}>
                {model.nodes.get(c)!.label}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={node.id}>
          {node.id}
        </code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => navigator.clipboard?.writeText(node.id)} aria-label="Copy id">
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy id</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => (st.set({ tab: 'map' }), st.navigate(node.id))}>
          <Crosshair className="size-4" /> Show on map
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => focus('both')}>
          <Network className="size-4" /> Neighbourhood
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="px-2" aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => focus('in', CALLS, `callers of ${node.label}`)}>
              <PhoneIncoming /> Callers
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => focus('out', CALLS, `called by ${node.label}`)}>
              <PhoneOutgoing /> Callees
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => focus('both', ['implements', 'inherits', 'overrides'], `hierarchy of ${node.label}`)}>
              <GitFork /> Type hierarchy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => st.set({ pathStart: node.id, tab: 'graph' })}>
              <Route /> Path from here…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => st.hide(node.id)}>
              <EyeOff /> Hide
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="relations" className="gap-1">
            Relations <span className="font-mono text-[10px] text-muted-foreground">{outCount + inCount}</span>
          </TabsTrigger>
          <TabsTrigger value="source" className="gap-1">
            Source <span className="font-mono text-[10px] text-muted-foreground">{decls.length}</span>
          </TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          {summary && (
            <section>
              <SectionTitle>Summary</SectionTitle>
              <Fields rec={summary} />
            </section>
          )}
          {project && (
            <>
              <section>
                <SectionTitle>Project</SectionTitle>
                <Fields rec={project} skip={['packages', 'projectReferences', 'id', 'recordType']} />
                {card && (
                  <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => st.set({ tab: 'docs', docPath: card.path })}>
                    Open context card
                  </Button>
                )}
              </section>
              <section>
                <SectionTitle count={(project.projectReferences as string[] | undefined)?.length ?? 0}>Project references</SectionTitle>
                <div className="space-y-0.5">
                  {((project.projectReferences as string[]) ?? []).map((p) => {
                    const t = model.projectByPath.get(p);
                    return t ? <NodeLink key={p} id={t.id} model={model} /> : <p key={p} className="font-mono text-xs text-muted-foreground">{p}</p>;
                  })}
                </div>
              </section>
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  Packages
                  <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
                    {(project.packages as unknown[] | undefined)?.length ?? 0}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {((project.packages as { id: string; version: string; direct?: boolean }[]) ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{p.id}</span>
                      <span className="font-mono text-xs text-muted-foreground">{p.version}</span>
                      {p.direct && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          direct
                        </Badge>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
              {contexts.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                    Analysis contexts
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-3">
                    {contexts.map((c) => (
                      <Fields key={c.id} rec={c} skip={['preprocessorSymbols', 'recordType']} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
          {diags.length > 0 && (
            <section>
              <SectionTitle count={diags.length}>Diagnostics</SectionTitle>
              <div className="space-y-2">
                {diags.map((d) => (
                  <div key={d.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {d.code}
                      <Badge variant="outline" className="h-5 text-[10px]">
                        {d.state}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{d.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {childKinds.length > 0 && (
            <section>
              <SectionTitle count={node.children.length}>Contains</SectionTitle>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {childKinds.map(([k, c]) => (
                  <Badge key={k} variant="outline" className="gap-1.5 font-normal">
                    <KindGlyph kind={k} className="size-3.5 text-[8px]" />
                    {k} <span className="font-mono text-muted-foreground">{c}</span>
                  </Badge>
                ))}
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {node.children.slice(0, 200).map((c) => (
                  <NodeLink key={c} id={c} model={model} />
                ))}
              </div>
            </section>
          )}
          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Uses</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">{outCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Used by</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">{inCount}</p>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="relations" className="mt-4 space-y-5">
          <section>
            <SectionTitle count={outCount}>Uses</SectionTitle>
            <RelationGroups node={node} model={model} dir="out" />
          </section>
          <section>
            <SectionTitle count={inCount}>Used by</SectionTitle>
            <RelationGroups node={node} model={model} dir="in" />
          </section>
        </TabsContent>

        <TabsContent value="source" className="mt-4 space-y-4">
          {decls.length === 0 && <p className="text-sm text-muted-foreground">No declarations in this generation. Metadata symbols and groups have none.</p>}
          {decls.map((d) => (
            <div key={d.id}>
              <div className="flex flex-wrap items-center gap-1.5">
                <code className="font-mono text-xs text-sky-400">
                  {d.path}:{d.span?.startLine}
                </code>
                {d.generator && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    {d.generator}
                  </Badge>
                )}
              </div>
              <SourceContext path={d.path} store={d.store} span={d.extent ?? d.span} radius={2} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <Fields rec={node.entity ?? node.record ?? { id: node.id, kind: node.kind }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EdgeInspector({ sel, model }: { sel: { edgeIdx: number[]; source: string; target: string; kinds: Record<string, number> }; model: GraphModel }) {
  const [max, setMax] = useState(100);
  const total = Object.values(sel.kinds).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <ArrowLeftRight className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold">{total.toLocaleString('en-US')} relations</h2>
          <p className="text-xs text-muted-foreground">between two map regions</p>
        </div>
      </div>
      <div className="space-y-1 rounded-lg border p-2">
        <NodeLink id={sel.source} model={model} />
        <NodeLink id={sel.target} model={model} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(sel.kinds)
          .sort((a, b) => b[1] - a[1])
          .map(([k, c]) => (
            <Badge key={k} variant="outline" className="gap-1.5 font-normal">
              <span className="size-2 rounded-sm" style={{ background: edgeColor(k) }} />
              {kindLabel(k)} <span className="font-mono text-muted-foreground">{c}</span>
            </Badge>
          ))}
      </div>
      {sel.edgeIdx.length < total && <p className="text-xs text-muted-foreground">Showing the first {sel.edgeIdx.length}.</p>}
      <div className="space-y-0.5">
        {sel.edgeIdx.slice(0, max).map((idx) => {
          const e = model.edges[idx];
          return <RelationRowPair key={idx} e={e} model={model} />;
        })}
      </div>
      {sel.edgeIdx.length > max && (
        <Button variant="outline" size="sm" onClick={() => setMax(max + 200)}>
          Show {Math.min(200, sel.edgeIdx.length - max)} more
        </Button>
      )}
    </div>
  );
}

function RelationRowPair({ e, model }: { e: Edge; model: GraphModel }) {
  const [open, setOpen] = useState(false);
  const label = (id: string) => model.nodes.get(id)?.label ?? id;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="size-2 shrink-0 rounded-sm" style={{ background: edgeColor(e.kind) }} />
        <span className="truncate">{label(e.from)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="truncate">{label(e.to)}</span>
        {e.usage && (
          <Badge variant="secondary" className="ml-auto h-5 shrink-0 px-1.5 text-[10px] font-normal">
            {e.usage}
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-6 mt-1 space-y-3 border-l pb-2 pl-3">
        <div className="flex flex-col">
          <NodeLink id={e.from} model={model} />
          <NodeLink id={e.to} model={model} />
        </div>
        {e.relation && <Fields rec={e.relation} skip={['evidence', 'id']} />}
        <EvidenceList ids={e.relation?.evidence ?? e.link?.evidence ?? []} limit={5} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Right-hand details panel for the map and the neighbourhood graph. */
export function Inspector() {
  const selection = useStore((s) => s.selection);
  const model = useStore((s) => s.model);
  const set = useStore((s) => s.set);
  if (!model) return null;
  const node = selection?.type === 'node' ? model.nodes.get(selection.id) : null;
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{selection?.type === 'edge' ? 'Relations' : 'Details'}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => set({ inspectorOpen: false })} aria-label="Close details">
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Close <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1">
        {!selection && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Crosshair className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium">Nothing selected</p>
            <p className="text-sm text-muted-foreground">Click a circle on the map, or press <Kbd>⌘K</Kbd> to find a symbol.</p>
          </div>
        )}
        {selection?.type === 'edge' && <EdgeInspector key={selection.id} sel={selection} model={model} />}
        {node && <NodeInspector key={node.id} node={node} model={model} />}
      </ScrollArea>
    </div>
  );
}
