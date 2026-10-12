import * as k from "../components/iso/iso-kit";
export const CONCURRENCY_WIDTH = 900,
  CONCURRENCY_HEIGHT = 470;
export const CONCURRENCY_BASE = { x: -180, y: -96, w: 360, d: 192, r: 9 };
export const CP = k.fitProjection(
  [...k.boxCorners(CONCURRENCY_BASE, -22, 0), [-145, -40, 54], [145, 35, 54]],
  CONCURRENCY_WIDTH,
  CONCURRENCY_HEIGHT,
  { pad: 48, azimuth: 52, elevation: 35 },
);
export const concurrencyAt = (p: k.Point3) => k.iso(p, CP);
export const CARRIAGE_TRAVEL = 49;
