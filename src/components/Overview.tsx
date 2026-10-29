import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ChevronRight, FileCode2, GitCommitHorizontal, Info, Network, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KindGlyph } from '@/components/kind-glyph';
import { PageHeader, PathText, Section, StatCard } from '@/components/blocks';
import { useStore } from '@/store';
import { kindLabel } from '@/model/kinds';
import { relationColor, rgbCss, symbolColor } from '@/theme/palette';
import type { Diagnostic, Json } from '@/model/types';
import { cn } from '@/lib/utils';

const SUPPORTED_CAPABILITIES = new Set<string>();
const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

function severityClass(sev?: string) {
  return sev === 'error' ? 'border-destructive/30 bg-destructive/10 text-destructive' : sev === 'warning' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-info/30 bg-info/10 text-info';
}
function stateClass(state?: string) {
  return state === 'semantic' ? 'border-success/30 bg-success/10 text-success' : state === 'failed' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning';
}

function Bars({ entries, color, label = (k) => k, glyph }: { entries: [string, number][]; color: (k: string) => string; label?: (k: string) => string; glyph?: boolean }) {
  const max = Math.max(1, ...entries.map(([, c]) => c));
  return (
    <div className="space-y-2.5">
      {entries.map(([k, c]) => (
        <div key={k} className="grid grid-cols-[160px_1fr_56px] items-center gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {glyph && <KindGlyph kind={k} />}
            <span className="truncate text-muted-foreground">{label(k)}</span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (c / max) * 100)}%`, background: color(k) }} />
          </span>
          <span className="text-right font-mono text-xs tabular-nums">{c.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

/** Counts of the previous generation of the same repository, for deltas. */
function usePreviousCounts() {
  const generations = useStore((s) => s.generations);
  const activeId = useStore((s) => s.activeId);
  const sources = useStore((s) => s.sources);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    setCounts(null);
    const active = generations.find((g) => g.id === activeId);
    if (!active?.modified) return;
    const prev = generations.filter((g) => g.repoKey === active.repoKey && g.id !== active.id && (g.modified ?? 0) < active.modified!).sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))[0];
    if (!prev) return;
    let alive = true;
    sources[prev.id]?.readText('run.json').then((t) => {
      try {
        if (alive && t) setCounts((JSON.parse(t) as { counts?: Record<string, number> }).counts ?? null);
      } catch {
        // previous run.json unreadable: no deltas
      }
    });
    return () => {
      alive = false;
    };
  }, [generations, activeId, sources]);
  return counts;
}

function DiagnosticGroups({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const st = useStore();
  const model = st.model!;
  const [filter, setFilter] = useState('all');
  const groups = useMemo(() => {
    const m = new Map<string, Diagnostic[]>();
    for (const d of diagnostics) m.set(String(d.code), [...(m.get(String(d.code)) ?? []), d]);
    return [...m.entries()]
      .map(([code, items]) => ({ code, items, severity: items.map((d) => d.severity ?? 'info').sort((a, b) => (SEVERITY_RANK[a] ?? 3) - (SEVERITY_RANK[b] ?? 3))[0] }))
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.items.length - a.items.length);
  }, [diagnostics]);
  const shown = groups.filter((g) => filter === 'all' || (filter === 'warnings' ? g.severity !== 'info' : g.severity === 'info'));
  return (
    <Section
      title="Diagnostics"
      count={diagnostics.length}
      action={
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v)}>
          <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="warnings" className="h-7 px-2.5 text-xs">
            Warnings
          </ToggleGroupItem>
          <ToggleGroupItem value="info" className="h-7 px-2.5 text-xs">
            Info
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <Card className="divide-y divide-border-subtle overflow-hidden rounded-xl">
        {shown.map((g) => (
          <Collapsible key={g.code}>
            <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-3/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <ChevronRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-data-[state=open]:rotate-90" />
              <Badge variant="outline" className={cn('w-16 justify-center capitalize', severityClass(g.severity))}>
                {g.severity}
              </Badge>
              <code className="font-mono text-sm">{g.code}</code>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{String(g.items[0].message ?? '')}</span>
              <span className="font-mono text-xs tabular-nums text-subtle-foreground">×{g.items.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border-subtle bg-surface-1/60">
              {g.items.map((d) => {
                const project = d.scope ? model.projectByPath.get(String(d.scope)) : undefined;
                return (
                  <div key={d.id} className="flex items-start gap-3 px-4 py-3 pl-12 text-sm">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <PathText text={String(d.scope ?? '')} max={64} />
                        <Badge variant="secondary" className="h-5 text-2xs font-normal">
                          {d.state}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground [overflow-wrap:anywhere]">{d.message}</p>
                    </div>
                    {project && (
                      <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => (st.set({ tab: 'map' }), st.navigate(project.id))}>
                        Show on map
                      </Button>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </Card>
    </Section>
  );
}

export function Overview() {
  const st = useStore();
  const data = st.data!;
  const model = st.model!;
  const prev = usePreviousCounts();
  const m = (data.manifest ?? {}) as Json;
  const repo = (m.repository as Json | undefined)?.remoteUrl as string | undefined;
  const engine = m.engine as Json | undefined;
  const roslyn = m.roslyn as Json | undefined;
  const required = (m.requiredCapabilities as string[] | undefined) ?? [];
  const unsupported = required.filter((c) => !SUPPORTED_CAPABILITIES.has(c));
  const coverage = ((m.coverage as Json | undefined)?.projects as Json[] | undefined) ?? [];
  const stages = ((data.run?.stages as { name: string; elapsedMs: number }[] | undefined) ?? []).map((s) => [s.name, s.elapsedMs] as [string, number]);
  const sorted = (mm: Map<string, number>) => [...mm.entries()].sort((a, b) => b[1] - a[1]);
  const semantic = coverage.filter((c) => c.state === 'semantic').length;
  const warnings = data.diagnostics.filter((d) => d.severity === 'warning' || d.severity === 'error').length;
  const status = String(m.status ?? 'unknown');
  const delta = (k: string) => (prev && prev[k] !== undefined ? (data.counts[k] ?? 0) - prev[k] : null);
  const maxSymbols = Math.max(1, ...coverage.map((c) => model.nodes.get(String(c.project))?.descendants ?? 0));

  const alerts: { tone: 'warn' | 'info'; text: string }[] = [];
  if (unsupported.length) alerts.push({ tone: 'warn', text: `The generation requires capabilities this viewer does not know: ${unsupported.join(', ')}. Per the contract, the data should not be interpreted.` });
  if (data.parseErrors.length) alerts.push({ tone: 'warn', text: `${data.parseErrors.length} parse errors, e.g. ${data.parseErrors[0].file}:${data.parseErrors[0].line} ${data.parseErrors[0].message}` });
  if (model.unknownKinds.length) alerts.push({ tone: 'info', text: `Unknown relation kinds are kept but not traversed: ${model.unknownKinds.join(', ')}` });
  if (model.dangling.count) alerts.push({ tone: 'info', text: `${model.dangling.count} relations point to a missing symbol and are left out of the graph.` });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <PageHeader
          title={repo ? repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '') : 'Generation'}
          description="What the engine extracted from this commit, how complete it is, and what it could not determine."
          meta={
            <>
              <span className="flex items-center gap-1.5">
                <GitCommitHorizontal className="size-3.5" />
                <span className="font-mono">{String(m.commit ?? '').slice(0, 12)}</span>
              </span>
              <span>{engine ? `${engine.name} ${engine.version}` : 'unknown engine'}</span>
              <span>schema {String(m.schemaVersion ?? '?')}</span>
              <span>Roslyn {roslyn ? String(roslyn.apiVersion ?? roslyn.build) : '?'}</span>
            </>
          }
          actions={
            <Badge variant="outline" className={cn('capitalize', status === 'complete' ? stateClass('semantic') : status === 'failed' ? stateClass('failed') : stateClass('partial'))}>
              {status}
            </Badge>
          }
        />

        {alerts.map((a, i) => (
          <div key={i} className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm', a.tone === 'warn' ? 'border-warning/30 bg-warning/10' : 'bg-surface-1')}>
            {a.tone === 'warn' ? <ShieldAlert className="mt-0.5 size-4 text-warning" /> : <Info className="mt-0.5 size-4 text-subtle-foreground" />}
            <p className="text-muted-foreground">{a.text}</p>
          </div>
        ))}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Symbols" value={(data.counts.entities ?? 0).toLocaleString('en-US')} delta={delta('entities')} hint={`${(model.origins.get('source') ?? 0).toLocaleString('en-US')} in source code`} icon={<FileCode2 className="size-4" />} />
          <StatCard label="Relations" value={(data.counts.relations ?? 0).toLocaleString('en-US')} delta={delta('relations')} hint={`${(data.counts.evidence ?? 0).toLocaleString('en-US')} pieces of evidence`} icon={<Network className="size-4" />} />
          <StatCard label="Projects" value={String(coverage.length || data.projects.length)} hint={`${semantic} of ${coverage.length} loaded semantically`} icon={<Boxes className="size-4" />} />
          <StatCard label="Warnings" value={String(warnings)} hint={`${data.diagnostics.length} diagnostics in total`} icon={<AlertTriangle className="size-4" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Relations by kind</CardTitle>
              <CardDescription>Typed edges, plus project and package references.</CardDescription>
            </CardHeader>
            <CardContent>
              <Bars entries={sorted(model.edgeKinds)} color={(k) => rgbCss(relationColor(k))} label={kindLabel} />
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Symbols by kind</CardTitle>
              <CardDescription>Across source, generated code and packages.</CardDescription>
            </CardHeader>
            <CardContent>
              <Bars entries={sorted(model.entityKinds).slice(0, 10)} color={(k) => rgbCss(symbolColor(k))} glyph />
            </CardContent>
          </Card>
        </div>

        <Section title="Coverage by project" count={coverage.length}>
          <Card className="overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Project</TableHead>
                  <TableHead>Load mode</TableHead>
                  <TableHead className="w-[28%]">Symbols</TableHead>
                  <TableHead>Diagnostics</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.map((c) => {
                  const node = model.nodes.get(String(c.project));
                  const diags = data.diagnostics.filter((d) => d.scope === c.path);
                  const n = node?.descendants ?? 0;
                  return (
                    <TableRow key={String(c.path)}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{node?.label ?? String(c.path)}</div>
                        <div className="font-mono text-2xs text-subtle-foreground">{String(c.path)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={stateClass(String(c.state))}>
                          {String(c.state)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(1, (n / maxSymbols) * 100)}%` }} />
                          </span>
                          <span className="w-12 text-right font-mono text-xs tabular-nums">{n.toLocaleString('en-US')}</span>
                        </div>
                      </TableCell>
                      <TableCell>{diags.length > 0 ? <span className="font-mono text-xs text-warning">{diags.length}</span> : <span className="text-faint-foreground">none</span>}</TableCell>
                      <TableCell>
                        {node && (
                          <Button variant="ghost" size="sm" className="h-7" onClick={() => (st.set({ tab: 'map' }), st.navigate(node.id))}>
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </Section>

        <DiagnosticGroups diagnostics={data.diagnostics} />

        {stages.length > 0 && (
          <Section title="Run stages (ms)">
            <Card className="rounded-xl p-5">
              <Bars entries={stages} color={() => 'hsl(var(--foreground) / 0.7)'} />
              <p className="mt-4 text-xs text-subtle-foreground">Viewer load {data.loadMs} ms.</p>
            </Card>
          </Section>
        )}
      </div>
    </div>
  );
}
