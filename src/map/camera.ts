// Map camera: smooth zoom towards the cursor, drag pan with momentum, and "smooth zoom" fly-to (van Wijk and Nuij,
// via d3-interpolate interpolateZoom). Every user input interrupts a running flight.
import { interpolateZoom } from 'd3-interpolate';

export interface Cam {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

const MIN_ZOOM = -7;
const MAX_ZOOM = 9;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Camera {
  cam: Cam = { x: 0, y: 0, zoom: -3 };
  size: Size = { width: 1000, height: 800 };
  private goalZoom: number | null = null;
  private anchor: { wx: number; wy: number; px: number; py: number } | null = null;
  private velocity: { x: number; y: number } | null = null;
  private flight: { interp: (t: number) => [number, number, number]; start: number; duration: number } | null = null;
  private raf = 0;
  private last = 0;

  constructor(private onChange: (cam: Cam) => void) {}

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  /** Jump without animation. */
  set(cam: Cam) {
    this.stop();
    this.cam = { ...cam, zoom: clampZoom(cam.zoom) };
    this.onChange(this.cam);
  }

  stop() {
    this.flight = null;
    this.goalZoom = null;
    this.anchor = null;
    this.velocity = null;
  }

  get flying() {
    return this.flight !== null;
  }

  /** World coordinates under a screen point (relative to the canvas). */
  toWorld(px: number, py: number, cam = this.cam) {
    const s = Math.pow(2, cam.zoom);
    return { x: cam.x + (px - this.size.width / 2) / s, y: cam.y + (py - this.size.height / 2) / s };
  }

  /** Wheel zoom: accumulates a goal zoom and eases towards it, keeping the point under the cursor fixed. */
  zoomAt(px: number, py: number, deltaZoom: number) {
    this.flight = null;
    this.velocity = null;
    const w = this.toWorld(px, py);
    this.anchor = { wx: w.x, wy: w.y, px, py };
    this.goalZoom = clampZoom((this.goalZoom ?? this.cam.zoom) + deltaZoom);
    this.loop();
  }

  /** Drag pan in screen pixels, applied immediately. */
  panBy(dx: number, dy: number) {
    this.flight = null;
    this.goalZoom = null;
    this.anchor = null;
    const s = Math.pow(2, this.cam.zoom);
    this.cam = { ...this.cam, x: this.cam.x - dx / s, y: this.cam.y - dy / s };
    this.onChange(this.cam);
  }

  /** Release after a drag: keep gliding with the last pointer velocity (pixels per millisecond). */
  release(vx: number, vy: number) {
    if (Math.hypot(vx, vy) < 0.05 || prefersReducedMotion()) return;
    this.velocity = { x: vx, y: vy };
    this.loop();
  }

  flyTo(target: Cam, opts: { maxDuration?: number } = {}) {
    this.stop();
    const goal = { ...target, zoom: clampZoom(target.zoom) };
    if (prefersReducedMotion()) {
      this.set(goal);
      return;
    }
    const w0 = this.size.width / Math.pow(2, this.cam.zoom);
    const w1 = this.size.width / Math.pow(2, goal.zoom);
    const interp = interpolateZoom([this.cam.x, this.cam.y, w0], [goal.x, goal.y, w1]);
    const duration = Math.min(opts.maxDuration ?? 1400, Math.max(350, interp.duration * 0.8));
    this.flight = { interp, start: performance.now(), duration };
    this.loop();
  }

  private loop() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      this.raf = 0;
      const dt = Math.min(64, now - this.last);
      this.last = now;
      let active = false;
      if (this.flight) {
        const t = Math.min(1, (now - this.flight.start) / this.flight.duration);
        const [x, y, w] = this.flight.interp(easeInOut(t));
        this.cam = { x, y, zoom: Math.log2(this.size.width / w) };
        if (t >= 1) this.flight = null;
        else active = true;
      } else {
        if (this.goalZoom !== null && this.anchor) {
          const k = 1 - Math.exp(-dt / 70);
          const zoom = this.cam.zoom + (this.goalZoom - this.cam.zoom) * k;
          const s = Math.pow(2, zoom);
          const a = this.anchor;
          this.cam = { zoom, x: a.wx - (a.px - this.size.width / 2) / s, y: a.wy - (a.py - this.size.height / 2) / s };
          if (Math.abs(this.goalZoom - zoom) < 0.001) {
            this.goalZoom = null;
            this.anchor = null;
          } else active = true;
        }
        if (this.velocity) {
          const s = Math.pow(2, this.cam.zoom);
          this.cam = { ...this.cam, x: this.cam.x - (this.velocity.x * dt) / s, y: this.cam.y - (this.velocity.y * dt) / s };
          const decay = Math.exp(-dt / 160);
          this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
          if (Math.hypot(this.velocity.x, this.velocity.y) < 0.01) this.velocity = null;
          else active = true;
        }
      }
      this.onChange(this.cam);
      if (active) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** Converts a wheel event into a zoom delta (log2 units). Pinch on trackpads arrives as ctrl+wheel. */
export function wheelZoomDelta(e: WheelEvent): number {
  const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 600 : 1;
  const dy = e.deltaY * lines;
  const k = e.ctrlKey ? 0.012 : 0.0025;
  return Math.max(-0.75, Math.min(0.75, -dy * k));
}
