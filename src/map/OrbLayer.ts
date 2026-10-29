// Circle layers with shading, injected into deck.gl's ScatterplotLayer fragment shader (geometry.uv is the
// position inside the unit circle). Orbs are closed circles, regions are open ones, shadows sit beneath orbs.
import { ScatterplotLayer } from '@deck.gl/layers';

/** Closed circle: flat fill with a barely visible radial falloff. */
export class OrbLayer<D> extends ScatterplotLayer<D> {
  static layerName = 'OrbLayer';
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        'fs:DECKGL_FILTER_COLOR': `
          float d = length(geometry.uv);
          // Very soft radial falloff: flat, but not a sticker.
          color.rgb *= 0.94 + 0.06 * (1.0 - d * d);
        `,
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
