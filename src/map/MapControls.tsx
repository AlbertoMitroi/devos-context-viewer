import { Expand, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function Control({ label, shortcut, onClick, children }: { label: string; shortcut: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {label} <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function MapControls({ onZoomIn, onZoomOut, onFit }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  return (
    <div
      className="absolute right-4 top-4 z-10 flex flex-col items-center rounded-lg border bg-background/80 p-1 shadow-lg backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <Control label="Zoom in" shortcut="+" onClick={onZoomIn}>
        <Plus className="size-4" />
      </Control>
      <Control label="Zoom out" shortcut="−" onClick={onZoomOut}>
        <Minus className="size-4" />
      </Control>
      <Separator className="my-1 w-6" />
      <Control label="Show all projects" shortcut="F" onClick={onFit}>
        <Expand className="size-4" />
      </Control>
    </div>
  );
}
