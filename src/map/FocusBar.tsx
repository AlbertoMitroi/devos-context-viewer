import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { KindGlyph } from '@/components/kind-glyph';
import type { MapNode } from '@/model/mapLayout';
import { useStore } from '@/store';

/** Shows that the map is in focus mode, which direction is drawn, and how to leave it. */
export function FocusBar({ node, connected }: { node: MapNode; connected: number }) {
  const direction = useStore((s) => s.mapFocusDirection);
  const set = useStore((s) => s.set);
  return (
    <div
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover/95 py-1 pl-3 pr-1 text-xs shadow-lg backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <span className="text-subtle-foreground">Connections of</span>
      <KindGlyph kind={node.kind} />
      <span className="max-w-48 truncate font-medium">{node.label}</span>
      <span className="font-mono text-subtle-foreground">{connected}</span>
      <ToggleGroup type="single" size="sm" value={direction} onValueChange={(v) => v && set({ mapFocusDirection: v as 'out' | 'in' | 'both' })} className="ml-1">
        <ToggleGroupItem value="out" className="h-6 rounded-full px-2.5 text-xs">
          Uses
        </ToggleGroupItem>
        <ToggleGroupItem value="both" className="h-6 rounded-full px-2.5 text-xs">
          Both
        </ToggleGroupItem>
        <ToggleGroupItem value="in" className="h-6 rounded-full px-2.5 text-xs">
          Used by
        </ToggleGroupItem>
      </ToggleGroup>
      <Button variant="ghost" size="icon" className="size-6 rounded-full" onClick={() => set({ selection: null })} aria-label="Leave focus (Esc)" title="Leave focus (Esc)">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
