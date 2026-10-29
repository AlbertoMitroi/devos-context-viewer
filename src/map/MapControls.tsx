import { ArrowsOutSimple, Info, Minus, Plus } from '@phosphor-icons/react';

export function MapControls({ onZoomIn, onZoomOut, onFit, infoOpen, onToggleInfo }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; infoOpen: boolean; onToggleInfo: () => void }) {
  return (
    <div className="map-controls panel" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
        <Plus size={16} />
      </button>
      <button className="icon-btn" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
        <Minus size={16} />
      </button>
      <div className="divider" />
      <button className="icon-btn" onClick={onFit} aria-label="Show all projects" title="Show all (F)">
        <ArrowsOutSimple size={16} />
      </button>
      <div className="divider" />
      <button className={`icon-btn ${infoOpen ? 'on' : ''}`} onClick={onToggleInfo} aria-label="Toggle details panel" aria-pressed={infoOpen} title="Details panel (I)">
        <Info size={16} />
      </button>
    </div>
  );
}
