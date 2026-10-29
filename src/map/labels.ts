/** Fits an identifier in a circle: one line, else two lines split at a camelCase or dot boundary, else ellipsis. */
export function fitLabel(label: string, max: number, twoLines: boolean): string {
  if (label.length <= max) return label;
  if (twoLines && label.length <= max * 2) {
    let best = -1;
    for (let i = 1; i < label.length; i++) {
      const boundary = /[A-Z._(]/.test(label[i]) && /[a-z0-9)]/.test(label[i - 1]);
      if (boundary && i <= max && label.length - i <= max && (best < 0 || Math.abs(i - label.length / 2) < Math.abs(best - label.length / 2))) best = i;
    }
    if (best > 0) return `${label.slice(0, best)}\n${label.slice(best)}`;
  }
  if (twoLines) {
    const rest = label.slice(max);
    return `${label.slice(0, max)}\n${rest.length > max ? rest.slice(0, max - 1) + '…' : rest}`;
  }
  return label.slice(0, max - 1) + '…';
}
