// Circle layers with shading, injected into deck.gl's ScatterplotLayer fragment shader (geometry.uv is the
// position inside the unit circle). Orbs are closed circles, regions are open ones, shadows sit beneath orbs.
import { ScatterplotLayer } from '@deck.gl/layers';
import type { Accessor } from '@deck.gl/core';

/** Shapes an orb can take inside its packed circle. Add DASHED for a dashed rim. */
export const SHAPE = { circle: 0, roundedSquare: 1, hexagon: 2, diamond: 3, octagon: 4 } as const;
export const DASHED = 10;

// Signed distance to each shape in unit space (negative inside), sized to touch the unit circle so the
// packing layout stays valid. Hexagon and octagon after Inigo Quilez's 2D distance functions.
const SHAPES_GLSL = /* glsl */ `
in float vShape;
float cv_roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float cv_hexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p.yx);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float cv_octagon(vec2 p, float r) {
  const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
  p = abs(p);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float cv_shape(vec2 p, float s) {
  if (s < 0.5) return length(p) - 1.0;
  if (s < 1.5) return cv_roundBox(p, vec2(0.79), 0.28);
  if (s < 2.5) return cv_hexagon(p, 0.80) - 0.06;
  if (s < 3.5) return cv_roundBox(vec2(p.x + p.y, p.y - p.x) * 0.70710678, vec2(0.66), 0.12);
  return cv_octagon(p, 0.88) - 0.05;
}
`;

// Shaped orbs redraw fill and rim from the shape's distance; circles keep deck.gl's own drawing. The picking
// pass keeps deck.gl's colour and only loses the pixels outside the shape, so clicks follow the outline.
const SHAPED_MAIN = /* glsl */ `
if (vShape > 0.5) {
  float cvDash = step(${DASHED - 0.5}, vShape);
  float cvD = cv_shape(unitPosition, mod(vShape, ${DASHED}.0));
  float cvAa = 1.5 / outerRadiusPixels;
  float cvInside = 1.0 - smoothstep(-cvAa, 0.0, cvD);
  if (cvInside <= 0.0) discard;
  if (picking.isActive < 0.5) {
    float cvRim = 1.0 - innerUnitRadius;
    float cvLine = stroked > 0.5 ? smoothstep(-cvRim - cvAa, -cvRim, cvD) : 0.0;
    float cvAngle = atan(unitPosition.y, unitPosition.x);
    cvLine *= mix(1.0, step(0.42, fract(cvAngle * outerRadiusPixels / 9.0)), cvDash);
    vec4 cvColor = filled ? mix(vFillColor, vLineColor, cvLine) : vec4(vLineColor.rgb, vLineColor.a * cvLine);
    cvColor.rgb *= 0.94 + 0.06 * clamp(-cvD * 2.0, 0.0, 1.0);
    cvColor.a *= cvInside;
    fragColor = cvColor;
  }
}
`;

type ShapeProps<D> = { getShape?: Accessor<D, number> };

/** Closed circle: flat fill with a barely visible radial falloff. Top-level orbs can take a shape. */
export class OrbLayer<D> extends ScatterplotLayer<D, ShapeProps<D>> {
  static layerName = 'OrbLayer';
  static defaultProps = { ...ScatterplotLayer.defaultProps, getShape: { type: 'accessor' as const, value: SHAPE.circle } };

  initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({ instanceShapes: { size: 1, accessor: 'getShape', defaultValue: SHAPE.circle } });
  }

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        'vs:#decl': 'in float instanceShapes;\nout float vShape;',
        'vs:#main-end': 'vShape = instanceShapes;',
        'fs:#decl': SHAPES_GLSL,
        'fs:DECKGL_FILTER_COLOR': `
          float d = length(geometry.uv);
          // Very soft radial falloff: flat, but not a sticker.
          color.rgb *= 0.94 + 0.06 * (1.0 - d * d);
        `,
        'fs:#main-end': SHAPED_MAIN,
      },
    };
  }
}

/** Open circle: a translucent region, darker in the middle and brighter towards its border. */
export class RegionLayer<D> extends ScatterplotLayer<D> {
  static layerName = 'RegionLayer';
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        'fs:DECKGL_FILTER_COLOR': `
          float d = length(geometry.uv);
          color.a *= 0.35 + 0.65 * smoothstep(0.35, 1.0, d);
        `,
      },
    };
  }
}
