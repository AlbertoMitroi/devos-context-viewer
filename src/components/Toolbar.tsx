import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Expand, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { KindGlyph } from '@/components/kind-glyph';
import { searchNodes } from '@/model/graphModel';
import { LAYOUTS } from '@/graph/cytoscapeSetup';
import { exportJson, exportPng, exportSvg } from '@/graph/graphRef';
import { useStore, type LayoutName } from '@/store';
import type { ViewResult } from '@/model/graphView';

const LEVELS = ['Projects', 'Namespaces', 'Types', 'Members'];

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function GraphSearch() {
  const model = useStore((s) => s.model);
  const reveal = useStore((s) => s.reveal);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<string[]>([]);
  useEffect(() => {
    if (!model) return;
    const t = setTimeout(() => {
      const h = q.trim().length >= 2 ? searchNodes(model, q) : [];
      setHits(h);
      useStore.getState().set({ searchHits: h, searchQuery: q });
    }, 150);
    return () => clearTimeout(t);
  }, [q, model]);
  return (
    <Popover open={hits.length > 0 && q.length >= 2}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input className="h-8 w-64" placeholder="Find in graph…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q.length >= 2 && <span className="absolute right-2 top-1.5 font-mono text-xs text-muted-foreground">{hits.length}</span>}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-96 overflow-y-auto p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {model &&
          hits.slice(0, 40).map((id) => {
            const n = model.nodes.get(id)!;
            return (
              <button
                key={id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  reveal(id);
                  setQ('');
                }}
              >
                <KindGlyph kind={n.kind} />
                <span className="truncate">{n.label}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{n.kind}</span>
              </button>
            );
          })}
      </PopoverContent>
    </Popover>
  );
}

export function Toolbar({ view }: { view: ViewResult | null }) {
  const st = useStore();
  const name = (st.generations.find((g) => g.id === st.activeId)?.label ?? 'graph').replace(/[^\w.-]+/g, '_');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <GraphSearch />
      <Separator orientation="vertical" className="h-5" />
      <ToggleGroup type="single" variant="outline" size="sm" onValueChange={(v) => v && st.setLevel(Number(v))} aria-label="Expansion level">
        {LEVELS.map((l, i) => (
          <ToggleGroupItem key={l} value={String(i)} className="h-8 px-2.5 text-xs">
            {l}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={st.layout} onValueChange={(v) => st.set({ layout: v as LayoutName })}>
        <SelectTrigger className="h-8 w-44 text-xs" aria-label="Layout">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LAYOUTS.map((l) => (
            <SelectItem key={l.id} value={l.id} className="text-xs">
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IconButton label="Run layout again" onClick={() => st.set({ layoutTick: st.layoutTick + 1 })}>
        <RefreshCw className="size-4" />
      </IconButton>
      <IconButton label="Fit everything" onClick={() => st.set({ fitTick: st.fitTick + 1 })}>
        <Expand className="size-4" />
      </IconButton>
      <Separator orientation="vertical" className="h-5" />
      <IconButton label="Back" onClick={st.back} disabled={!st.history.length}>
        <ArrowLeft className="size-4" />
      </IconButton>
      <IconButton label="Forward" onClick={st.forward} disabled={!st.future.length}>
        <ArrowRight className="size-4" />
      </IconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Download className="size-4" /> Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => exportPng(name)}>PNG, whole graph</DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportSvg(name)}>SVG</DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportJson(name)}>JSON, visible elements</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {view && (
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground" title="visible nodes · aggregated edges · relations represented">
          {view.nodes.length} nodes · {view.edges.length} edges · {view.stats.relationsShown} relations
        </span>
      )}
    </div>
  );
}

export function FocusBar() {
  const st = useStore();
  const f = st.focus;
  if (!f && !st.pathStart) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-3 py-2 text-sm">
      {f && (
        <>
          <Badge className="gap-1">Focus: {f.label ?? `${f.ids.length} nodes`}</Badge>
          {f.depth > 0 && (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Depth
                <Input type="number" min={1} max={6} value={f.depth} className="h-7 w-14" onChange={(e) => st.set({ focus: { ...f, depth: Math.max(1, Math.min(6, Number(e.target.value))) } })} />
              </label>
              <ToggleGroup type="single" variant="outline" size="sm" value={f.direction} onValueChange={(v) => v && st.set({ focus: { ...f, direction: v as 'in' | 'out' | 'both' } })}>
                <ToggleGroupItem value="in" className="h-7 text-xs">
                  Incoming
                </ToggleGroupItem>
                <ToggleGroupItem value="both" className="h-7 text-xs">
                  Both
                </ToggleGroupItem>
                <ToggleGroupItem value="out" className="h-7 text-xs">
                  Outgoing
                </ToggleGroupItem>
              </ToggleGroup>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Max nodes
                <Input type="number" min={20} max={5000} step={50} value={st.maxFocusNodes} className="h-7 w-20" onChange={(e) => st.set({ maxFocusNodes: Number(e.target.value) })} />
              </label>
            </>
          )}
          {f.kinds?.length ? <span className="text-xs text-muted-foreground">kinds: {f.kinds.join(', ')}</span> : null}
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1" onClick={() => st.setFocus(null)}>
            <X className="size-3.5" /> Exit focus
          </Button>
        </>
      )}
      {st.pathStart && (
        <Badge variant="outline" className="gap-2 border-amber-500/40 text-amber-400">
          Path: right-click the target node and choose “Path to here”
          <button className="underline" onClick={() => st.set({ pathStart: null })}>
            cancel
          </button>
        </Badge>
      )}
    </div>
  );
}
