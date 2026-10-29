// Perceptual palette: OKLCH with fixed lightness and chroma, so project colours read as one family
// and labels keep the same contrast on every circle.

export type RGB = [number, number, number];

/** OKLCH (L 0..1, C, h degrees) to gamma-encoded sRGB 0..255, clipped to gamut. */
export function oklch(l: number, c: number, h: number): RGB {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(g * 255);
  }) as RGB;
}

const GOLDEN = 137.508;

/** Colour of the i-th project. Alternating lightness separates neighbours that land on similar hues. */
export function projectColor(i: number): RGB {
  return oklch(i % 2 ? 0.66 : 0.72, 0.115, (250 + i * GOLDEN) % 360);
}

/** Symbol kinds in the IDE convention, in the same perceptual family. */
const KIND_HUE: Record<string, number> = {
  namespace: 260,
  class: 245,
  record: 215,
  struct: 195,
  interface: 175,
  enum: 75,
  enum_member: 85,
  delegate: 340,
  type: 245,
  method: 300,
  constructor: 285,
  property: 145,
  field: 40,
  constant: 55,
  event: 20,
  operator: 270,
};

export function kindColor(kind: string): RGB {
  const h = KIND_HUE[kind];
  return h === undefined ? oklch(0.7, 0.03, 260) : oklch(0.74, 0.13, h);
}

/** Relation kinds in the same perceptual family; structural and derived kinds stay neutral. */
const RELATION: Record<string, [number, number]> = {
  references: [250, 0.05],
  calls_declared_target: [155, 0.13],
  possible_runtime_target: [185, 0.12],
  implements: [300, 0.13],
  inherits: [275, 0.12],
  overrides: [330, 0.12],
  'di.registers': [350, 0.12],
  'di.consumes': [15, 0.12],
  consumes_contract: [75, 0.13],
  configured_route: [95, 0.12],
  possible_communication: [50, 0.13],
  project_reference: [260, 0.02],
  package_reference: [260, 0.02],
  contains: [260, 0.015],
  declares: [260, 0.015],
};

export function relationColor(kind: string): RGB {
  const v = RELATION[kind];
  if (v) return oklch(0.74, v[1], v[0]);
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) | 0;
  return oklch(0.74, 0.1, Math.abs(h) % 360);
}

const NEUTRAL_KINDS: Record<string, number> = { project: 0.86, package: 0.62, group: 0.55, pkgnamespace: 0.6 };

export function symbolColor(kind: string): RGB {
  const l = NEUTRAL_KINDS[kind];
  return l !== undefined ? oklch(l, 0.01, 260) : kindColor(kind);
}

export const KIND_GLYPH: Record<string, string> = {
  namespace: 'N',
  class: 'C',
  record: 'R',
  struct: 'S',
  interface: 'I',
  enum: 'E',
  enum_member: 'e',
  delegate: 'D',
  type: 'T',
  method: 'M',
  constructor: 'M',
  property: 'P',
  field: 'F',
  constant: 'K',
  event: 'V',
  operator: 'O',
  project: 'P',
  package: 'K',
};

export const rgbCss = ([r, g, b]: RGB, a = 1) => (a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`);

function luminance([r, g, b]: RGB) {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
