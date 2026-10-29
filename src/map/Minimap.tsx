import { useEffect, useRef } from 'react';
import { MAP_EXTENT, type MapLayout } from '../model/mapLayout';
import { rgbCss, type RGB } from '../theme/palette';
import type { Cam } from './camera';

const SIZE = 148;

/** Overview of all projects with the current viewport; click or drag to move there. */
export function Minimap({ layout, colors, cam, size, onJump }: { layout: MapLayout; colors: Map<string, RGB>; cam: Cam; size: { width: number; height: number }; onJump: (x: number, y: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const k = SIZE / (MAP_EXTENT * 1.04);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, SIZE, SIZE);
    for (const id of layout.roots) {
      const n = layout.nodes.get(id)!;
      const col = colors.get(id) ?? [120, 130, 150];
      g.beginPath();
      g.arc(SIZE / 2 + n.x * k, SIZE / 2 + n.y * k, Math.max(1, n.r * k), 0, Math.PI * 2);
      g.fillStyle = rgbCss(col, 0.55);
      g.fill();
    }
  }, [layout, colors, k]);

  const scale = Math.pow(2, cam.zoom);
  const w = (size.width / scale) * k;
  const h = (size.height / scale) * k;
  const left = SIZE / 2 + cam.x * k - w / 2;
  const top = SIZE / 2 + cam.y * k - h / 2;
  const visible = w < SIZE * 0.95 || h < SIZE * 0.95;

  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump((e.clientX - r.left - SIZE / 2) / k, (e.clientY - r.top - SIZE / 2) / k);
  };

  return (
    <div
      className="absolute bottom-4 left-4 z-10 cursor-crosshair overflow-hidden rounded-lg border bg-background/80 shadow-lg backdrop-blur"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.buttons) jump(e);
      }}
      onPointerUp={(e) => e.stopPropagation()}
      role="img"
      aria-label="Minimap of all projects; click to move the view"
    >
      <canvas ref={canvas} className="block" style={{ width: SIZE, height: SIZE }} />
      {visible && <div className="pointer-events-none absolute rounded-sm border-[1.5px] border-sky-300 bg-sky-300/10" style={{ left, top, width: Math.max(4, w), height: Math.max(4, h) }} />}
    </div>
  );
}
