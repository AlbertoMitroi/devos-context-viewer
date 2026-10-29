// Cytoscape registration, stylesheet and layout presets.
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import elk from 'cytoscape-elk';
import svg from 'cytoscape-svg';
import type { LayoutName } from '../store';

let registered = false;
export function registerExtensions() {
  if (registered) return;
  cytoscape.use(fcose);
  cytoscape.use(elk);
  cytoscape.use(svg);
  registered = true;
}

export const stylesheet: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': 10,
      'font-family': 'Inter, system-ui, sans-serif',
      color: '#cbd5e1',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 3,
      'text-wrap': 'ellipsis',
      'text-max-width': '160px',
      'text-outline-color': '#0b0f17',
      'text-outline-width': 2,
      'background-color': 'data(color)',
      shape: 'data(shape)' as never,
      width: 'data(size)',
      height: 'data(size)',
      'border-width': 1,
      'border-color': '#0b0f17',
      'min-zoomed-font-size': 7,
    },
  },
  {
    selector: 'node[?collapsedGroup]',
    style: {
      'font-size': 12,
      'font-weight': 600,
      color: '#e2e8f0',
      'border-width': 2,
      'border-color': 'data(color)',
      'background-opacity': 0.35,
    },
  },
  {
    selector: 'node:parent',
    style: {
      shape: 'round-rectangle',
      'background-color': 'data(color)',
      'background-opacity': 0.06,
      'border-width': 1.5,
      'border-color': 'data(color)',
      'border-opacity': 0.7,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -4,
      'font-size': 11,
      'font-weight': 600,
      color: '#e2e8f0',
      padding: '14px',
      'min-zoomed-font-size': 4,
    } as never,
  },
  { selector: 'node[origin = "generated"]', style: { 'border-style': 'dashed', 'border-color': '#e2e8f0', 'border-width': 1.2 } },
  { selector: 'node[origin = "metadata"]', style: { 'background-opacity': 0.45, 'border-style': 'dotted', 'border-color': '#94a3b8', 'border-width': 1.2 } },
  { selector: 'node[?isFocus]', style: { 'border-width': 3, 'border-color': '#f8fafc', 'border-style': 'double' } },
  { selector: 'node.match', style: { 'underlay-color': '#fde047', 'underlay-opacity': 0.35, 'underlay-padding': 6 } as never },
  { selector: 'node.path', style: { 'border-width': 3, 'border-color': '#fde047' } },
  { selector: 'node.path-start', style: { 'border-width': 3, 'border-color': '#fb7185', 'border-style': 'solid' } },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#f8fafc', 'overlay-color': '#f8fafc', 'overlay-opacity': 0.12, 'overlay-padding': 4 },
  },
  {
    selector: 'edge',
    style: {
      width: 'data(width)',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier',
      opacity: 0.7,
      'font-size': 8,
      color: '#e2e8f0',
      'text-background-color': '#0b0f17',
      'text-background-opacity': 0.8,
      'text-background-padding': '1px',
      'text-rotation': 'autorotate',
      'min-zoomed-font-size': 6,
    },
  },
  { selector: 'edge[label]', style: { label: 'data(label)' } },
  { selector: 'edge.haystack', style: { 'curve-style': 'haystack', 'haystack-radius': 0.4 } as never },
  { selector: 'edge[weakest = "candidate"], edge[weakest = "ambiguous"], edge[weakest = "unresolved"]', style: { 'line-style': 'dashed' } },
  { selector: 'edge[kind = "possible_runtime_target"]', style: { 'line-style': 'dashed' } },
  { selector: 'edge[kind = "project_reference"], edge[kind = "package_reference"]', style: { 'target-arrow-shape': 'vee', 'line-style': 'solid' } },
  { selector: 'edge.path', style: { 'line-color': '#fde047', 'target-arrow-color': '#fde047', width: 4, opacity: 1, 'z-index': 99 } },
  { selector: 'edge:selected', style: { 'line-color': '#f8fafc', 'target-arrow-color': '#f8fafc', opacity: 1, width: 3 } },
  { selector: '.faded', style: { opacity: 0.1, 'text-opacity': 0.1 } },
  { selector: 'node.faded:parent', style: { opacity: 0.35 } },
  { selector: 'edge.hl', style: { opacity: 1, 'z-index': 50 } },
];

export function layoutOptions(name: LayoutName, nodeCount: number, randomize: boolean): cytoscape.LayoutOptions {
  const animate = nodeCount < 600;
  switch (name) {
    case 'fcose':
      return {
        name: 'fcose',
        quality: nodeCount > 1500 ? 'draft' : 'default',
        randomize,
        animate,
        animationDuration: 450,
        fit: true,
        padding: 30,
        nodeDimensionsIncludeLabels: true,
        packComponents: true,
        nodeRepulsion: () => (nodeCount < 150 ? 40000 : 8000),
        idealEdgeLength: () => (nodeCount < 150 ? 180 : 90),
        nodeSeparation: 90,
        edgeElasticity: () => 0.3,
        nestingFactor: 0.1,
        gravity: 0.3,
        gravityRangeCompound: 1.5,
        gravityCompound: 1.2,
        numIter: nodeCount > 2000 ? 1200 : 2500,
        tile: true,
        tilingPaddingVertical: 12,
        tilingPaddingHorizontal: 12,
      } as cytoscape.LayoutOptions;
    case 'elk-right':
    case 'elk-down':
      return {
        name: 'elk',
        fit: true,
        padding: 30,
        animate: false,
        nodeDimensionsIncludeLabels: true,
        elk: {
          algorithm: 'layered',
          'elk.direction': name === 'elk-right' ? 'RIGHT' : 'DOWN',
          'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
          'elk.layered.spacing.nodeNodeBetweenLayers': 70,
          'elk.spacing.nodeNode': 24,
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.edgeRouting': 'POLYLINE',
        },
      } as cytoscape.LayoutOptions;
    case 'concentric':
      return {
        name: 'concentric',
        fit: true,
        padding: 30,
        animate,
        minNodeSpacing: 12,
        concentric: (n: cytoscape.NodeSingular) => n.data('degree') ?? 0,
        levelWidth: () => 4,
      } as cytoscape.LayoutOptions;
    case 'breadthfirst':
      return { name: 'breadthfirst', fit: true, padding: 30, animate, directed: true, spacingFactor: 1.1 } as cytoscape.LayoutOptions;
    case 'grid':
      return { name: 'grid', fit: true, padding: 30, animate, avoidOverlap: true, nodeDimensionsIncludeLabels: true } as cytoscape.LayoutOptions;
    case 'circle':
      return { name: 'circle', fit: true, padding: 30, animate, avoidOverlap: true } as cytoscape.LayoutOptions;
  }
}

export const LAYOUTS: { id: LayoutName; label: string }[] = [
  { id: 'fcose', label: 'Forță (fCoSE)' },
  { id: 'elk-right', label: 'Straturi → (ELK)' },
  { id: 'elk-down', label: 'Straturi ↓ (ELK)' },
  { id: 'concentric', label: 'Concentric (grad)' },
  { id: 'breadthfirst', label: 'Arbore (BFS)' },
  { id: 'grid', label: 'Grilă' },
  { id: 'circle', label: 'Cerc' },
];
