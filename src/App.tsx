import { useEffect } from 'react';
import { FolderOpen, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { CommandMenu } from '@/components/command-menu';
import { LayersSheet } from '@/components/layers-sheet';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { Inspector } from '@/components/Inspector';
import { Tables } from '@/components/Tables';
import { Overview } from '@/components/Overview';
import { Docs } from '@/components/Docs';
import { FocusBar, Toolbar } from '@/components/Toolbar';
import { useStore } from './store';
import { useView } from './graph/useView';
import { GraphCanvas } from './graph/GraphCanvas';
import { MapView } from './map/MapView';

const isTyping = () => {
  const tag = (document.activeElement?.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement | null)?.isContentEditable;
};

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.set({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey || st.paletteOpen || st.layersOpen || st.shortcutsOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        st.set({ paletteOpen: true });
      } else if (e.key === '?') st.set({ shortcutsOpen: true });
      else if (e.key === 'm') st.set({ tab: 'map' });
      else if (e.key === 'l') st.set({ layersOpen: true });
      else if (st.tab === 'graph') {
        // Neighbourhood graph shortcuts; the map handles its own.
        const sel = st.selection?.type === 'node' ? st.selection.id : null;
        const node = sel ? st.model?.nodes.get(sel) : null;
        if (e.key === 'Escape') st.set({ selection: null, pathStart: null });
        else if (e.key === 'i') st.set({ inspectorOpen: !st.inspectorOpen });
        else if (e.key === 'f' && node) st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label });
        else if (e.key === 'e' && node) st.toggleExpanded(node.id);
        else if (e.key === 'h' && node) st.hide(node.id);
        else if (e.key === 'z') st.set({ fitTick: st.fitTick + 1 });
        else if (e.key === 'Backspace' && st.focus) st.back();
        else if (e.key >= '1' && e.key <= '4') st.setLevel(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Browser Back and Forward replay map navigation recorded in the URL hash. */
function useHistorySync() {
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const st = useStore.getState();
      const g = p.get('g');
      if (g && g !== st.activeId) {
        st.openGeneration(g);
        return;
      }
      const n = p.get('n');
      st.navigate(n, { push: false, select: !!n });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

/** Errors from loading and actions surface as toasts. */
function useErrorToasts() {
  const error = useStore((s) => s.error);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!error) return;
    toast.error(error);
    set({ error: null });
  }, [error, set]);
}

/** Canvas on the left, details on the right, resizable. */
function WithInspector({ children }: { children: React.ReactNode }) {
  const open = useStore((s) => s.inspectorOpen);
  return (
    <ResizablePanelGroup direction="horizontal" autoSaveId="context-viewer:inspector" className="min-h-0 flex-1">
      <ResizablePanel id="canvas" order={1} minSize={40}>
        <div className="relative flex h-full flex-col">{children}</div>
      </ResizablePanel>
      {open && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="inspector" order={2} defaultSize={28} minSize={20} maxSize={50}>
            <Inspector />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

function EmptyState() {
  const addLocal = useStore((s) => s.addLocalFolder);
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <MapIcon className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">No generation open</h2>
          <p className="text-sm text-muted-foreground">
            Add a generation path to <code className="rounded bg-muted px-1 font-mono text-xs">viewer.config.json</code>, or open a generation folder from this computer.
          </p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <label>
            <FolderOpen className="size-4" /> Open folder…
            <input
              type="file"
              hidden
              // @ts-expect-error non-standard directory picker attribute
              webkitdirectory=""
              multiple
              onChange={(e) => e.target.files && addLocal(e.target.files)}
            />
          </label>
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <Skeleton className="absolute size-72 -translate-x-24 -translate-y-10 rounded-full" />
      <Skeleton className="absolute size-44 translate-x-44 translate-y-16 rounded-full" />
      <Skeleton className="absolute size-28 -translate-x-16 translate-y-48 rounded-full" />
      <Skeleton className="absolute size-20 -translate-y-44 translate-x-40 rounded-full" />
    </div>
  );
}

export function App() {
  const st = useStore();
  const view = useView();
  useKeyboard();
  useHistorySync();
  useErrorToasts();

  useEffect(() => {
    st.refreshGenerations().then(() => {
      const p = new URLSearchParams(location.hash.slice(1));
      const gens = useStore.getState().generations;
      const wanted = p.get('g');
      const target = gens.find((g) => g.id === wanted) ?? gens[0];
      if (target)
        useStore
          .getState()
          .openGeneration(target.id)
          .then(() => {
            const n = p.get('n');
            if (n && target.id === wanted) useStore.getState().navigate(n, { push: false });
          });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tooBig = view && st.tab === 'graph' && view.nodes.length > 3000;

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <SiteHeader />
          {!st.model && (st.loading ? <LoadingState /> : <EmptyState />)}
          {st.model && st.tab === 'map' && (
            <WithInspector>
              <MapView />
            </WithInspector>
          )}
          {st.model && st.tab === 'graph' && (
            <WithInspector>
              <Toolbar view={view} />
              <FocusBar />
              {!st.focus && (
                <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                  Pick a symbol on the Map, then choose Neighbourhood, Callers or Callees. Right-click nodes here for more.
                </p>
              )}
              {tooBig && <p className="border-b px-4 py-2 text-xs text-amber-400">{view!.nodes.length} visible nodes: the layout may take a while. Collapse, filter or use Focus.</p>}
              {view?.stats.focusTruncated && <p className="border-b px-4 py-2 text-xs text-amber-400">Focus truncated at {st.maxFocusNodes} nodes; raise the limit or narrow the relation kinds.</p>}
              <GraphCanvas view={view} />
            </WithInspector>
          )}
          {st.model && st.tab === 'tables' && <Tables />}
          {st.model && st.tab === 'overview' && <Overview />}
          {st.model && st.tab === 'docs' && <Docs />}
        </SidebarInset>
      </SidebarProvider>
      <CommandMenu />
      <LayersSheet />
      <ShortcutsDialog />
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  );
}
