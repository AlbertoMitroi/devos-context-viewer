import { Fragment } from 'react';
import { ChevronDown, Layers, PanelRight, Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { KindGlyph } from '@/components/kind-glyph';
import { useStore, type Tab } from '@/store';

const TITLES: Record<Tab, string> = { map: 'Map', graph: 'Neighbourhood', tables: 'Tables', overview: 'Summary', docs: 'Context & wiki' };

/** Where the map is: every level has a menu with its siblings, like an IDE path bar. */
function MapBreadcrumb() {
  const layout = useStore((s) => s.mapLayout);
  const path = useStore((s) => s.mapPath);
  const navigate = useStore((s) => s.navigate);
  if (!layout) return null;
  const siblingsOf = (i: number) => {
    const ids = i === 0 ? layout.roots : layout.nodes.get(path[i - 1])?.children ?? [];
    return [...ids].sort((a, b) => layout.nodes.get(a)!.label.localeCompare(layout.nodes.get(b)!.label));
  };
  const childrenOfLast = path.length ? layout.nodes.get(path[path.length - 1])?.children ?? [] : layout.roots;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          {path.length ? (
            <BreadcrumbLink asChild>
              <button onClick={() => navigate(null, { select: false })}>All projects</button>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>All projects</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {path.map((id, i) => {
          const n = layout.nodes.get(id);
          if (!n) return null;
          const last = i === path.length - 1;
          return (
            <Fragment key={id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <DropdownMenu>
                  <DropdownMenuTrigger className={`flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${last ? 'font-medium text-foreground' : ''}`}>
                    <KindGlyph kind={n.kind} />
                    <span className="max-w-48 truncate">{n.label}</span>
                    <ChevronDown className="size-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Siblings</DropdownMenuLabel>
                    {siblingsOf(i).map((sid) => {
                      const s = layout.nodes.get(sid)!;
                      return (
                        <DropdownMenuItem key={sid} onClick={() => navigate(sid)} className={sid === id ? 'bg-accent' : ''}>
                          <KindGlyph kind={s.kind} />
                          <span className="flex-1 truncate">{s.label}</span>
                          {s.size > 0 && <span className="font-mono text-xs text-muted-foreground">{s.size.toLocaleString('en-US')}</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
            </Fragment>
          );
        })}
        {childrenOfLast.length > 0 && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-md px-1.5 py-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Go inside">
                  <ChevronDown className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Inside</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[...childrenOfLast]
                    .sort((a, b) => layout.nodes.get(a)!.label.localeCompare(layout.nodes.get(b)!.label))
                    .map((cid) => {
                      const c = layout.nodes.get(cid)!;
                      return (
                        <DropdownMenuItem key={cid} onClick={() => navigate(cid)}>
                          <KindGlyph kind={c.kind} />
                          <span className="flex-1 truncate">{c.label}</span>
                          {c.size > 0 && <span className="font-mono text-xs text-muted-foreground">{c.size.toLocaleString('en-US')}</span>}
                        </DropdownMenuItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function SiteHeader() {
  const tab = useStore((s) => s.tab);
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const loading = useStore((s) => s.loading);
  const set = useStore((s) => s.set);
  const showsPanels = tab === 'map' || tab === 'graph';
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      {tab === 'map' && model ? <MapBreadcrumb /> : <h1 className="text-sm font-medium">{TITLES[tab]}</h1>}
      <div className="ml-auto flex items-center gap-2">
        {loading && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="size-3 animate-spin rounded-full border-2 border-muted border-t-foreground" aria-hidden />
            {loading}
          </span>
        )}
        <Button variant="outline" className="h-9 w-64 justify-start gap-2 text-muted-foreground" onClick={() => set({ paletteOpen: true })} disabled={!model}>
          <Search className="size-4" />
          <span className="flex-1 text-left">Search symbols…</span>
          <Kbd>⌘K</Kbd>
        </Button>
        {showsPanels && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="size-9" onClick={() => set({ layersOpen: true })} disabled={!model} aria-label="Layers and filters">
                  <Layers className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Layers and filters <Kbd>L</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={inspectorOpen && selection ? 'secondary' : 'outline'}
                  size="icon"
                  className="size-9"
                  onClick={() => set({ inspectorOpen: !inspectorOpen })}
                  aria-pressed={inspectorOpen}
                  aria-label="Details panel"
                >
                  <PanelRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Details panel <Kbd>I</Kbd>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}
