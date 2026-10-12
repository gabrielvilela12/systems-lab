import * as k from "../components/iso/iso-kit";
export const WIDTH = 960,
  HEIGHT = 570;
export const BASE = { x: -222, y: -130, w: 458, d: 275, r: 12 };
export const P = k.fitProjection(
  [...k.boxCorners(BASE, -22, 0), [-195, 25, 82], [174, -100, 65]],
  WIDTH,
  HEIGHT,
  { pad: 42, azimuth: 58, elevation: 33 },
);
export const at = (point: k.Point3) => k.iso(point, P);
export const consumerY = [-92, -32, 28];
export const cartridge = k.solidSvg(
  k.slabOf({ x: -4, y: -4, w: 8, d: 8, r: 1 }, 0, 5, P, 4, 0.5),
  { tone: "hi", lit: true, crease: "mid" },
);
export function interpolate(points: k.Point3[], fraction: number): k.Point3 {
  const t = Math.max(0, Math.min(0.99999, fraction)) * (points.length - 1);
  const i = Math.floor(t);
  const a = points[i],
    b = points[i + 1];
  const f = t - i;
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}
