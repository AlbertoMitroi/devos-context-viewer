// Shared handle to the live Cytoscape instance, for export and toolbar actions.
import type cytoscape from 'cytoscape';
import type { ViewResult } from '../model/graphView';

export const graphRef: { cy: cytoscape.Core | null; view: ViewResult | null } = { cy: null, view: null };

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportPng(name: string) {
  const cy = graphRef.cy;
  if (!cy) return;
  const blob = cy.png({ output: 'blob', full: true, scale: 2, bg: '#0b0f17' }) as unknown as Blob;
  download(`${name}.png`, blob);
}

export function exportSvg(name: string) {
  const cy = graphRef.cy as (cytoscape.Core & { svg?: (o: object) => string }) | null;
  if (!cy?.svg) return;
  download(`${name}.svg`, new Blob([cy.svg({ full: true, bg: '#0b0f17' })], { type: 'image/svg+xml' }));
}

export function exportJson(name: string) {
  const v = graphRef.view;
  if (!v) return;
  download(`${name}.json`, new Blob([JSON.stringify({ nodes: v.nodes, edges: v.edges.map(({ edgeIdx, ...e }) => e) }, null, 2)], { type: 'application/json' }));
}
