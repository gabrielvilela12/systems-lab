import * as k from "../components/iso/iso-kit";
export const HTTP_WIDTH = 960,
  HTTP_HEIGHT = 520;
export const HTTP_BASE = { x: -195, y: -95, w: 390, d: 190, r: 10 };
export const HP = k.fitProjection(
  [...k.boxCorners(HTTP_BASE, -24, 0), [-151, 25, 72], [140, -30, 80]],
  HTTP_WIDTH,
  HTTP_HEIGHT,
  { pad: 40, azimuth: 58, elevation: 32 },
);
export const httpAt = (p: k.Point3) => k.iso(p, HP);
export const httpPacket = k.solidSvg(
  k.slabOf({ x: -6, y: -5, w: 12, d: 10, r: 1 }, 0, 7, HP, 4, 0.5),
  { tone: "hi", lit: true, crease: "mid" },
);
export function httpPacketPosition(x: number, y: number, z = 13) {
  const [a, b] = k.axisVector(HP, [x, y, z]);
  return `translate(${a} ${b})`;
}
