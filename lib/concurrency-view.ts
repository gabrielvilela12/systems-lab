import * as k from "../components/iso/iso-kit";
export const CONCURRENCY_WIDTH = 1200,
  CONCURRENCY_HEIGHT = 620;
export const CONCURRENCY_BASE = { x: -300, y: -133, w: 600, d: 266, r: 9 };
export const CP = k.fitProjection(
  [...k.boxCorners(CONCURRENCY_BASE, -22, 0), [-175, 30, 85], [245, 15, 64]],
  CONCURRENCY_WIDTH,
  CONCURRENCY_HEIGHT,
  { pad: 44, azimuth: 54, elevation: 38 },
);
export const concurrencyAt = (p: k.Point3) => k.iso(p, CP);
export const CARRIAGE_TRAVEL = 22;
export const stationAnchors = [
  {
    id: "app",
    title: "01 · Celular / app",
    hint: "Envia a solicitação",
    at: concurrencyAt([-263, -64, 19]),
  },
  {
    id: "front",
    title: "02 · Frontend web",
    hint: "Envia a solicitação",
    at: concurrencyAt([-263, 43, 47]),
  },
  {
    id: "api",
    title: "03 · API",
    hint: "Valida e salva",
    at: concurrencyAt([-172, 23, 48]),
  },
  {
    id: "register",
    title: "04 · Banco",
    hint: "Guarda os pendentes",
    at: concurrencyAt([-39, 25, 26]),
  },
  {
    id: "worker-A",
    title: "05 · Worker A",
    hint: "Busca e processa",
    at: concurrencyAt([100, -63, 34]),
  },
  {
    id: "worker-B",
    title: "06 · Worker B",
    hint: "Disputa as pendências",
    at: concurrencyAt([100, 65, 34]),
  },
  {
    id: "counter",
    title: "07 · Processamento",
    hint: "Aplica a cobrança",
    at: concurrencyAt([233, 15, 50]),
  },
];
export const requestRoutes = {
  app: [
    [-241, -64, 8],
    [-172, -64, 8],
    [-172, -12, 8],
  ],
  front: [
    [-235, 59, 8],
    [-195, 59, 8],
  ],
  save: [
    [-137, 24, 8],
    [-71, 24, 8],
  ],
  a: [
    [-9, 24, 8],
    [37, 24, 8],
    [37, -63, 8],
    [73, -63, 8],
  ],
  b: [
    [-9, 24, 8],
    [37, 24, 8],
    [37, 65, 8],
    [73, 65, 8],
  ],
  effectA: [
    [143, -63, 8],
    [234, -63, 8],
    [234, -12, 8],
  ],
  effectB: [
    [143, 65, 8],
    [234, 65, 8],
    [234, 43, 8],
  ],
} satisfies Record<string, k.Point3[]>;
export function routePosition(
  points: k.Point3[],
  progress: number,
  reverse = false,
) {
  const p = Math.max(0, Math.min(1, reverse ? 1 - progress : progress));
  const lengths = points
    .slice(1)
    .map((b, i) => Math.hypot(...b.map((v, j) => v - points[i][j])));
  let distance = p * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = distance / lengths[i];
      return points[i].map(
        (v, j) => v + (points[i + 1][j] - v) * t,
      ) as k.Point3;
    }
    distance -= lengths[i];
  }
  return points[0];
}
export const flowPacket = k.solidSvg(
  k.slabOf({ x: -3, y: -2, w: 6, d: 4, r: 0.6 }, 0, 3, CP, 4, 0.3),
  { tone: "hi", lit: true, crease: "lo" },
);
