// Circle layers with shading, injected into deck.gl's ScatterplotLayer fragment shader (geometry.uv is the
// position inside the unit circle). Orbs are closed circles, regions are open ones, shadows sit beneath orbs.
import { ScatterplotLayer } from '@deck.gl/layers';

/** Closed circle: soft sphere lit from the top left, with a thin rim light. */
export class OrbLayer<D> extends ScatterplotLayer<D> {
  static layerName = 'OrbLayer';
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        'fs:DECKGL_FILTER_COLOR': `
          float d = length(geometry.uv);
          float body = sqrt(max(0.0, 1.0 - d * d));
          vec2 lightPos = vec2(-0.38, -0.42);
          float spec = pow(max(0.0, 1.0 - length(geometry.uv - lightPos) * 1.15), 3.0);
          vec3 base = color.rgb;
          vec3 c = base * (0.62 + 0.38 * body);
          c += vec3(1.0) * spec * 0.16;
          float rim = smoothstep(0.86, 0.99, d);
          c = mix(c, min(vec3(1.0), base * 1.35 + 0.06), rim * 0.55);
          color.rgb = c;
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

/** Soft contact shadow: opaque in the middle, fading out towards the rim. */
export class ShadowLayer<D> extends ScatterplotLayer<D> {
  static layerName = 'ShadowLayer';
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        'fs:DECKGL_FILTER_COLOR': `
          float d = length(geometry.uv);
          color.a *= 1.0 - smoothstep(0.72, 1.0, d);
        `,
      },
    };
  }
}
