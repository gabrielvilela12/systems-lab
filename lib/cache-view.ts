import * as k from "../components/iso/iso-kit";
import type { CacheRequest } from "./cache-model";
export const CACHE_WIDTH = 1200,
  CACHE_HEIGHT = 510;
export const CACHE_BASE = { x: -305, y: -92, w: 610, d: 184, r: 10 };
export const KP = k.fitProjection(
  [...k.boxCorners(CACHE_BASE, -22, 0), [-252, -25, 72], [-37, -18, 80]],
  CACHE_WIDTH,
  CACHE_HEIGHT,
  { pad: 40, azimuth: 63, elevation: 32 },
);
export const cacheAt = (point: k.Point3) => k.iso(point, KP);
export const DRAWER_TRAVEL = 9;
export const cacheStations = [
  { id: "client", title: "01 · Cliente", hint: "PC / celular", x: -248 },
  { id: "api", title: "02 · API", hint: "Orquestra as chamadas", x: -142 },
  { id: "cache", title: "03 · Cache / GET", hint: "Procura a cópia", x: -36 },
  {
    id: "database",
    title: "04 · Banco / SELECT",
    hint: "API lê a fonte",
    x: 82,
  },
  { id: "fill", title: "05 · Cache / SET", hint: "API guarda a cópia", x: 220 },
];
export const cachePacket = k.solidSvg(
  k.slabOf({ x: -5, y: -4, w: 10, d: 8, r: 1 }, 0, 5, KP, 4, 0.4),
  { tone: "hi", lit: true },
);
export function cachePacketTransform(
  r: CacheRequest,
  now: number,
  still = false,
) {
  const raw = still
    ? 0.5
    : Math.max(0, Math.min(1, (now - r.stageAt) / (r.due - r.stageAt || 1)));
  const t = Math.pow(raw, 1 + ((r.id - 1) % 6) * 0.5);
  const eased = t * t * (3 - 2 * t);
  let x = -248,
    y = 44;
  if (r.phase === "outbound") x += 106 * eased;
  if (r.phase === "lookup") x = -142 + 106 * eased;
  if (r.phase === "db") x = -36 + 118 * eased;
  if (r.phase === "fill") x = 82 + 138 * eased;
  if (r.phase === "waiting") {
    x = -27 + (r.id % 4) * 8;
    y = 52;
  }
  if (r.phase === "return") {
    const from = r.source === "cache" ? -36 : 220;
    if (t < 0.15) {
      const turn = t / 0.15;
      x = from;
      y = 44 + 27 * turn * turn * (3 - 2 * turn);
    } else {
      const back = (t - 0.15) / 0.85;
      x = from + (-248 - from) * back * back * (3 - 2 * back);
      y = 71;
    }
  }
  const offset = k.axisVector(KP, [x, y, 9]);
  return `translate(${offset[0]} ${offset[1]})`;
}
