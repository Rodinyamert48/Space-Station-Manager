export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const round = (v: number, decimals = 0): number => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

/** Compact number formatting for HUD values: 950, 1.2k, 34.5k, 1.25M. */
export function formatCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}k`;
  if (abs >= 100 || Number.isInteger(v)) return `${sign}${Math.round(abs)}`;
  return `${sign}${abs.toFixed(1)}`;
}

export function formatRate(v: number): string {
  if (Math.abs(v) < 0.05) return '±0';
  const s = Math.abs(v) >= 10 ? Math.round(Math.abs(v)).toString() : Math.abs(v).toFixed(1);
  return `${v > 0 ? '+' : '-'}${s}`;
}

export function formatInt(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}
