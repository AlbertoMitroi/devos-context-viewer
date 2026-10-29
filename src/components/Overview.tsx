import { AlertTriangle, Boxes, FileCode2, GitCommitHorizontal, Info, Network, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KindGlyph } from '@/components/kind-glyph';
import { useStore } from '@/store';
import { edgeColor, kindLabel } from '@/model/kinds';
import type { Json } from '@/model/types';

const SUPPORTED_CAPABILITIES = new Set<string>();

function Bars({ entries, color, label = (k) => k, glyph }: { entries: [string, number][]; color: (k: string) => string; label?: (k: string) => string; glyph?: boolean }) {
  const max = Math.max(1, ...entries.map(([, c]) => c));
  return (
    <div className="space-y-2">
      {entries.map(([k, c]) => (
        <div key={k} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {glyph && <KindGlyph kind={k} />}
            <span className="truncate">{label(k)}</span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(c / max) * 100}%`, background: color(k) }} />
          </span>
          <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{c.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ title, value, hint, icon: Icon, badge }: { title: string; value: string; hint: string; icon: typeof Boxes; badge?: React.ReactNode }) {
  return (
    <Card className="bg-gradient-to-t from-muted/30 to-card">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          {title}
          {badge}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {hint}
      </CardFooter>
    </Card>
  );
}

export function Overview() {
  const st = useStore();
  const data = st.data!;
  const model = st.model!;
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

  const alerts: { tone: 'warn' | 'info'; text: string }[] = [];
  if (unsupported.length) alerts.push({ tone: 'warn', text: `The generation requires capabilities this viewer does not know: ${unsupported.join(', ')}. Per the contract, the data should not be interpreted.` });
  if (data.parseErrors.length) alerts.push({ tone: 'warn', text: `${data.parseErrors.length} parse errors, e.g. ${data.parseErrors[0].file}:${data.parseErrors[0].line} ${data.parseErrors[0].message}` });
  if (model.unknownKinds.length) alerts.push({ tone: 'info', text: `Unknown relation kinds (kept, excluded from traversal): ${model.unknownKinds.join(', ')}` });
  if (model.dangling.count) alerts.push({ tone: 'info', text: `${model.dangling.count} relations with a missing endpoint are ignored in the graph. E.g. ${model.dangling.samples[0]}` });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{repo ? repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '') : 'Generation'}</h2>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitCommitHorizontal className="size-4" />
              <span className="font-mono">{String(m.commit ?? '').slice(0, 12)}</span>
              {m.dirty ? <Badge variant="outline">dirty</Badge> : null}
              <span>·</span>
              {engine ? `${engine.name} ${engine.version}` : 'unknown engine'}
              <span>·</span>
              schema {String(m.schemaVersion ?? '?')}
            </p>
          </div>
          <Badge variant="outline" className={status === 'complete' ? 'border-emerald-500/40 text-emerald-400' : status === 'failed' ? 'border-red-500/40 text-red-400' : 'border-amber-500/40 text-amber-400'}>
            {status}
          </Badge>
        </div>

        {alerts.map((a, i) => (
          <div key={i} className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${a.tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/30'}`}>
            {a.tone === 'warn' ? <ShieldAlert className="mt-0.5 size-4 text-amber-400" /> : <Info className="mt-0.5 size-4 text-muted-foreground" />}
            <p>{a.text}</p>
          </div>
        ))}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat title="Symbols" value={(data.counts.entities ?? 0).toLocaleString('en-US')} hint={`${(model.origins.get('source') ?? 0).toLocaleString('en-US')} in source code`} icon={FileCode2} />
          <Stat title="Relations" value={(data.counts.relations ?? 0).toLocaleString('en-US')} hint={`${(data.counts.evidence ?? 0).toLocaleString('en-US')} pieces of evidence`} icon={Network} />
          <Stat
            title="Projects"
            value={String(coverage.length || data.projects.length)}
            hint={`${semantic} loaded semantically`}
            icon={Boxes}
            badge={
              <Badge variant="outline" className="text-[10px]">
                {coverage.length ? Math.round((semantic / coverage.length) * 100) : 0}%
              </Badge>
            }
          />
          <Stat title="Diagnostics" value={String(data.diagnostics.length)} hint={`${warnings} warnings or errors`} icon={AlertTriangle} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relations by kind</CardTitle>
              <CardDescription>Typed edges in graph/relations.ndjson, plus project and package references.</CardDescription>
            </CardHeader>
            <CardContent>
              <Bars entries={sorted(model.edgeKinds)} color={edgeColor} label={kindLabel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Symbols by kind</CardTitle>
              <CardDescription>Logical entities, across source, generated code and packages.</CardDescription>
            </CardHeader>
            <CardContent>
              <Bars entries={sorted(model.entityKinds).slice(0, 12)} color={() => 'hsl(var(--chart-1))'} glyph />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Origin and resolution</CardTitle>
              <CardDescription>Where symbols come from, and how certain each relation is.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Bars entries={sorted(model.origins)} color={(k) => (k === 'source' ? 'hsl(var(--chart-1))' : k === 'generated' ? 'hsl(var(--chart-4))' : 'hsl(240 5% 50%)')} />
              <Bars entries={sorted(model.resolutions)} color={(k) => (k === 'exact' ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-3))')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Toolchain and run</CardTitle>
              <CardDescription>
                Roslyn {roslyn ? String(roslyn.build ?? roslyn.apiVersion) : '?'} · SDK {((m.sdks as Json[] | undefined) ?? []).map((s) => String(s.version)).join(', ') || '?'} · viewer load {data.loadMs} ms
              </CardDescription>
            </CardHeader>
            <CardContent>{stages.length ? <Bars entries={stages} color={() => 'hsl(var(--chart-2))'} label={(k) => `${k} (ms)`} /> : <p className="text-sm text-muted-foreground">No run.json in this generation.</p>}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage by project</CardTitle>
            <CardDescription>Load mode per project and the diagnostics scoped to it.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Symbols</TableHead>
                  <TableHead>Diagnostics</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.map((c) => {
                  const node = model.nodes.get(String(c.project));
                  const diags = data.diagnostics.filter((d) => d.scope === c.path);
                  return (
                    <TableRow key={String(c.path)}>
                      <TableCell>
                        <div className="font-medium">{node?.label ?? String(c.path)}</div>
                        <div className="font-mono text-xs text-muted-foreground">{String(c.path)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.state === 'semantic' ? 'border-emerald-500/40 text-emerald-400' : c.state === 'failed' ? 'border-red-500/40 text-red-400' : 'border-amber-500/40 text-amber-400'}>
                          {String(c.state)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{node?.descendants.toLocaleString('en-US') ?? ''}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{diags.map((d) => d.code).join(', ')}</TableCell>
                      <TableCell>
                        {node && (
                          <Button variant="ghost" size="sm" onClick={() => (st.set({ tab: 'map' }), st.navigate(node.id))}>
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostics</CardTitle>
            <CardDescription>Failed, partial, unsupported or unknown parts of the analysis, with reasons.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.diagnostics.map((d) => (
              <div key={d.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.code}</span>
                  <Badge variant="outline" className={d.severity === 'warning' ? 'border-amber-500/40 text-amber-400' : d.severity === 'error' ? 'border-red-500/40 text-red-400' : ''}>
                    {d.severity}
                  </Badge>
                  <Badge variant="secondary">{d.state}</Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground">{d.scope}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{d.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
