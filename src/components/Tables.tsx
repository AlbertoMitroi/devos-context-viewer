import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronRight, Crosshair, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { KindGlyph } from '@/components/kind-glyph';
import { useStore } from '@/store';
import type { GenerationData, Json } from '@/model/types';
import { isSystem } from '@/model/parse';
import { projectKey, repositoryId, type GraphModel } from '@/model/graphModel';
import { Fields, LinkDetails } from './Inspector';
import { middleTruncate, PageHeader } from './blocks';
import { EvidenceList } from './Evidence';

type TableId = 'entities' | 'relations' | 'declarations' | 'observations' | 'links' | 'traces' | 'inputs' | 'packages' | 'diagnostics' | 'projects' | 'contexts' | 'files';

const TABLES: { id: TableId; label: string; priority: string[]; system?: boolean }[] = [
  { id: 'entities', label: 'Entities', priority: ['kind', 'name', 'signature', 'origin', 'accessibility', 'project', 'assembly', 'id'] },
  { id: 'relations', label: 'Relations', priority: ['kind', 'from', 'to', 'usage', 'resolution', 'context'] },
  { id: 'declarations', label: 'Declarations', priority: ['entity', 'path', 'store', 'generator', 'context'] },
  { id: 'observations', label: 'Observations', priority: ['kind'] },
  { id: 'links', label: 'Links', priority: ['kind', 'via', 'resolution', 'from', 'to', 'match', 'reason', 'versionMatch', 'scope'] },
  { id: 'traces', label: 'Traces', priority: ['start', 'end', 'inputs', 'resolution', 'segments', 'weakest'], system: true },
  { id: 'inputs', label: 'Inputs', priority: ['id', 'commit', 'status', 'included', 'engine', 'repository', 'verification'], system: true },
  { id: 'packages', label: 'Packages', priority: ['packageId', 'version', 'resolution', 'versionMatch', 'producer', 'consumer', 'entities'], system: true },
  { id: 'diagnostics', label: 'Diagnostics', priority: ['severity', 'state', 'code', 'scope', 'message'] },
  { id: 'projects', label: 'Projects', priority: ['assemblyName', 'path', 'targetFrameworks', 'resolvedSdk'] },
  { id: 'contexts', label: 'Contexts', priority: ['project', 'loadMode', 'reason', 'targetFramework', 'configuration'] },
  { id: 'files', label: 'Files', priority: ['path', 'size'] },
];

const rowsFor = (data: GenerationData, id: TableId): Json[] => (id === 'files' ? (data.files as unknown as Json[]) : ((data[id] as unknown as Json[]) ?? []));

/** The entity (or project) a side of a system link, a trace end or a package producer points to. */
function sideTarget(v: unknown, model: GraphModel | null): string | undefined {
  if (!model || !v) return undefined;
  if (typeof v === 'string') return model.nodes.has(v) ? v : model.alias.get(v);
  if (typeof v !== 'object') return undefined;
  const s = v as Json;
  if (typeof s.entity === 'string' && model.nodes.has(s.entity)) return s.entity;
  const project = typeof s.project === 'string' ? model.projectByPath.get(projectKey(s.input, s.project)) : undefined;
  return project?.id;
}

/** An observation without a symbol (a minimal API endpoint, say): its route, else its kind. */
function observationText(o: Json, withInput = true): string {
  const route = o.routeTemplate ?? o.canonicalRoute ?? o.route ?? o.contract ?? o.method;
  const text = route ? `${o.method && o.method !== route ? `${String(o.method)} ` : ''}${String(route)}` : String(o.kind);
  return withInput && typeof o.input === 'string' ? `[${o.input}] ${text}` : text;
}

/** `[leasing] Withdraw()`: a side of a system record, labelled with its input. */
function sideText(v: Json, model: GraphModel | null): string {
  const target = sideTarget(v, model);
  const label = target ? model!.nodes.get(target)!.label : String(v.entity ?? v.project ?? v.observation ?? JSON.stringify(v));
  return typeof v.input === 'string' ? `[${v.input}] ${label}` : label;
}

function cell(v: unknown, model: GraphModel | null = null): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !Array.isArray(v) && typeof (v as Json).input === 'string') return sideText(v as Json, model);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function Tables() {
  const st = useStore();
  const data = st.data!;
  const model = st.model;
  const tables = TABLES.filter((t) => !t.system || isSystem(data));
  const tab = tables.find((t) => t.id === st.tableTab)?.id ?? 'entities';
  const def = TABLES.find((t) => t.id === tab)!;
  const rows = rowsFor(data, tab);
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [picked, setPicked] = useState<Json | null>(null);
  const parent = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows.slice(0, 1000)) for (const k of Object.keys(r)) keys.add(k);
    const pri = def.priority.filter((k) => keys.has(k));
    const rest = [...keys].filter((k) => !pri.includes(k) && !['evidence', 'preprocessorSymbols', 'packages'].includes(k)).sort();
    return [...pri, ...rest].slice(0, 10);
  }, [rows, def]);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (typeof r.kind === 'string') m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = st.tableFilter.toLowerCase().trim();
    let out = rows;
    if (kind !== 'all') out = out.filter((r) => r.kind === kind);
    if (q) {
      const tokens = q.split(/\s+/);
      out = out.filter((r) => {
        const s = JSON.stringify(r).toLowerCase();
        return tokens.every((t) => s.includes(t));
      });
    }
    if (sort) out = [...out].sort((a, b) => cell(a[sort.col], model).localeCompare(cell(b[sort.col], model), 'en', { numeric: true }) * sort.dir);
    return out;
  }, [rows, kind, st.tableFilter, sort, model]);

  const observations = useMemo(() => new Map(data.observations.map((o) => [o.id, o as Json])), [data]);
  const virt = useVirtualizer({ count: filtered.length, getScrollElement: () => parent.current, estimateSize: () => 32, overscan: 20 });
  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))` };

  const targetOf = (r: Json) =>
    tab === 'links'
      ? (sideTarget(r.from, model) ?? sideTarget(r.to, model))
      : tab === 'traces'
        ? sideTarget(r.start, model)
        : tab === 'inputs'
          ? repositoryId(String(r.id))
          : ((tab === 'relations' ? r.from : tab === 'declarations' ? r.entity : r.id) as string | undefined);
  const reveal = (r: Json) => {
    const target = targetOf(r);
    if (target && model?.nodes.has(target)) st.reveal(target);
    else if (tab === 'files' && /^(context|wiki)\/.*\.md$/.test(String(r.path))) st.set({ tab: 'docs', docPath: String(r.path) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6">
      <PageHeader title="Records" description="Every record in the generation, as written by the engine. Unknown fields are shown as they are. Double-click a row to show it on the map." />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          st.set({ tableTab: v });
          setKind('all');
          setSort(null);
        }}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {tables.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
              {t.label}
              <span className="font-mono text-[10px] text-muted-foreground">{rowsFor(data, t.id).length.toLocaleString('en-US')}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 w-80 pl-8" placeholder="Filter all fields…" value={st.tableFilter} onChange={(e) => st.set({ tableFilter: e.target.value })} />
        </div>
        {kinds.length > 0 && (
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {kinds.map(([k, c]) => (
                <SelectItem key={k} value={k}>
                  {k} <span className="text-muted-foreground">({c})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length.toLocaleString('en-US')} rows</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
        <div className="h-full overflow-auto" ref={parent}>
          <div className="sticky top-0 z-10 grid border-b bg-surface-1" style={grid}>
            {columns.map((c) => (
              <button
                key={c}
                className="flex h-9 items-center gap-1 px-3 text-left text-2xs font-medium uppercase tracking-[0.06em] text-subtle-foreground hover:text-foreground"
                onClick={() => setSort(sort?.col === c ? { col: c, dir: sort.dir === 1 ? -1 : 1 } : { col: c, dir: 1 })}
                aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
              >
                <span className="truncate">{c}</span>
                {sort?.col === c ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-30" />}
              </button>
            ))}
          </div>
          {!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">This file is empty in this generation.</p>}
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vi) => {
              const r = filtered[vi.index];
              return (
                <div
                  key={vi.key}
                  className="absolute left-0 top-0 grid w-full cursor-pointer border-b border-border-subtle text-sm transition-colors hover:bg-surface-3/60 data-[state=selected]:bg-surface-3"
                  data-state={picked === r ? 'selected' : undefined}
                  style={{ ...grid, transform: `translateY(${vi.start}px)`, height: 32 }}
                  onClick={() => setPicked(r)}
                  onDoubleClick={() => reveal(r)}
                >
                  {columns.map((c) => {
                    const v = r[c];
                    const node = ['from', 'to', 'entity', 'start', 'end'].includes(c) && typeof v === 'string' ? model?.nodes.get(v) : undefined;
                    const obs = !node && (c === 'start' || c === 'end') && typeof v === 'string' ? observations.get(v) : undefined;
                    const text = c === 'segments' && Array.isArray(v) ? `${v.length} segments` : obs ? observationText(obs) : cell(v, model);
                    return (
                      <div key={c} className="flex min-w-0 items-center gap-2 px-3" title={text}>
                        {c === 'kind' && typeof v === 'string' && model?.entityKinds.has(v) && <KindGlyph kind={v} />}
                        {node ? (
                          <>
                            <KindGlyph kind={node.kind} />
                            {node.input && <span className="shrink-0 font-mono text-2xs text-subtle-foreground">[{node.input}]</span>}
                            <span className="truncate">{node.label}</span>
                          </>
                        ) : (
                          <span className={`truncate ${['id', 'path', 'container', 'documentationId', 'context', 'blobId'].includes(c) ? 'font-mono text-2xs text-subtle-foreground' : ''}`}>
                            {['id', 'container', 'documentationId'].includes(c) ? middleTruncate(text, 40) : text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Sheet open={!!picked} onOpenChange={(v) => !v && setPicked(null)}>
        <SheetContent className="flex w-[520px] flex-col gap-0 p-0 sm:max-w-[520px]">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{def.label.replace(/s$/, '')}</SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">{String(picked?.id ?? picked?.path ?? '')}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              {picked && targetOf(picked) && model?.nodes.has(targetOf(picked)!) && (
                <Button size="sm" className="gap-1.5" onClick={() => picked && reveal(picked)}>
                  <Crosshair className="size-4" /> Show on map
                </Button>
              )}
              {picked && tab === 'links' && picked.scope === 'system' && model && <LinkDetails link={picked} model={model} />}
              {picked && tab === 'traces' && model && <TraceSegments trace={picked} model={model} observations={observations} />}
              {picked && <Fields rec={picked} skip={['evidence', ...(tab === 'traces' ? ['segments'] : [])]} />}
              {picked && Array.isArray(picked.evidence) && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Evidence</h3>
                  <EvidenceList ids={picked.evidence as string[]} limit={10} />
                </section>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The segments of a trace in order: inside one repository, or a link from one repository to another. */
function TraceSegments({ trace, model, observations }: { trace: Json; model: GraphModel; observations: Map<string, Json> }) {
  const segments = (Array.isArray(trace.segments) ? trace.segments : []) as Json[];
  const label = (id: unknown, input: unknown) => {
    const target = sideTarget(id, model);
    const obs = typeof id === 'string' ? observations.get(id) : undefined;
    const name = target ? model.nodes.get(target)!.label : obs ? observationText(obs, false) : String(id ?? '');
    return typeof input === 'string' ? `[${input}] ${name}` : name;
  };
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Segments</h3>
      <p className="mb-2 text-sm">
        {label(trace.start, segments[0]?.fromInput ?? segments[0]?.input)} <ArrowRight className="inline size-3.5 text-subtle-foreground" />{' '}
        {label(trace.end, segments[segments.length - 1]?.toInput ?? segments[segments.length - 1]?.input)}
      </p>
      <ol className="space-y-1">
        {segments.map((g, i) => (
          <li key={i}>
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                <span className="w-5 shrink-0 font-mono text-2xs text-subtle-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{g.type === 'link' ? `${label(g.from, g.fromInput)} → ${label(g.to, g.toInput)}` : label(g.to, g.input)}</span>
                <Badge variant={g.type === 'link' ? 'default' : 'outline'} className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
                  {g.type === 'link' ? String(g.via ?? g.kind) : String(g.kind)}
                </Badge>
                {g.resolution !== 'exact' && (
                  <Badge variant="outline" className="h-5 shrink-0 border-amber-500/40 px-1.5 text-[10px] font-normal text-amber-400">
                    {String(g.resolution)}
                  </Badge>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-6 mt-1 space-y-3 border-l pb-2 pl-3">
                <Fields rec={g} skip={['evidence']} />
                <EvidenceList ids={(g.evidence as string[] | undefined) ?? []} limit={5} />
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ol>
    </section>
  );
}
