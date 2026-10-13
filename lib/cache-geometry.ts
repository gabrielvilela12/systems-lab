import * as k from "../components/iso/iso-kit";
import { CACHE_BASE, KP, cacheAt as at, DRAWER_TRAVEL } from "./cache-view";
export type CachePart = {
  name: string;
  group: string;
  plan?: k.Plan;
  circle?: [number, number, number];
  z: number;
  h: number;
  key: number;
  markup: string;
  move?: k.Point3;
  drawer?: number;
};
export const cacheParts: CachePart[] = [];
function screw(p: k.Plan, z: number) {
  return (
    k.lineSvg(
      k
        .corners(p, 3)
        .map(([x, y]) => k.ring(x, y, 1, z, KP, 12))
        .join(""),
      { tone: "lo" },
    ) +
    k.dotsSvg(
      k.corners(p, 3).map(([x, y]) => at([x, y, z])),
      { size: 0.55, tone: "hi" },
    )
  );
}
function trim(p: k.Plan, z: number) {
  return k.lineSvg(k.planOutline(k.insetPlan(p, 2), z, KP), { tone: "lo" });
}
function slab(
  name: string,
  plan: k.Plan,
  z: number,
  h: number,
  group = "base",
  inner = "",
  extra: Partial<CachePart> = {},
) {
  cacheParts.push({
    name,
    plan,
    z,
    h,
    group,
    key: k.depthOf([plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], KP),
    markup: k.solidSvg(k.slabOf(plan, z, h, KP, 5, Math.min(0.6, h / 3)), {
      tone: "mid",
      crease: "lo",
      inner,
    }),
    ...extra,
  });
}
function round(
  name: string,
  x: number,
  y: number,
  radius: number,
  z: number,
  h: number,
  group = "base",
  inner = "",
) {
  cacheParts.push({
    name,
    circle: [x, y, radius],
    z,
    h,
    group,
    key: k.depthOf([x, y, z + h / 2], KP),
    markup: k.solidSvg(k.cylinder(x, y, radius, z, h, KP, 32, 0.3), {
      tone: "mid",
      crease: "lo",
      inner,
    }),
  });
}
for (const [i, [x, y]] of k.corners(CACHE_BASE, 20).entries()) {
  round(`cache-foot-${i}`, x, y, 6, -22, 4);
  round(`neck-${i}`, x, y, 4, -18, 6);
}
slab(
  "chassis",
  CACHE_BASE,
  -12,
  12,
  "base",
  trim(CACHE_BASE, 0) + screw(CACHE_BASE, 0),
);
const ruler = { x: -278, y: 82, w: 554, d: 4, r: 1 };
const ticks = k.topTicks(-274, 272, 8, 5, 82, 1, [2, 3.4], KP);
slab(
  "ruler",
  ruler,
  0,
  1,
  "base",
  k.lineSvg(ticks.minor, { tone: "lo" }) +
    k.lineSvg(ticks.major, { tone: "mid" }),
);
const stations = [
  [-281, 67, "client"],
  [-179, 72, "api"],
  [-76, 80, "cache"],
  [41, 82, "database"],
  [175, 90, "fill"],
] as const;
for (const [x, w, group] of stations) {
  const plan = { x, y: -40, w, d: 72, r: 4 };
  slab(`${group}-mount`, plan, 0, 7, group, screw(plan, 7));
}
// Monitor, pedestal and keyboard; the accent belongs to requests, not the metal.
slab("monitor-foot", { x: -260, y: -23, w: 24, d: 23, r: 2 }, 7, 4, "client");
slab("monitor-neck", { x: -253, y: -18, w: 9, d: 8, r: 1 }, 11, 14, "client");
const monitor = { x: -273, y: -25, w: 51, d: 12, r: 2 };
const screen = k.pathOf(
  [
    [-269, -13, 31],
    [-226, -13, 31],
    [-226, -13, 61],
    [-269, -13, 61],
  ].map((p) => at(p as k.Point3)),
  true,
);
slab(
  "monitor",
  monitor,
  25,
  43,
  "client",
  `<path class="cache-screen" d="${screen}"/>`,
);
slab("keyboard", { x: -272, y: 7, w: 50, d: 20, r: 2 }, 7, 3, "client");
for (let i = 0; i < 8; i++)
  slab(
    `key-${i}`,
    {
      x: -269 + (i % 4) * 11.2,
      y: 10 + Math.floor(i / 4) * 8,
      w: 9,
      d: 6,
      r: 0.6,
    },
    10,
    2,
    "client",
  );
// API server: a sealed rack with individual hot-swap modules.
slab(
  "api-chassis",
  { x: -173, y: -32, w: 60, d: 57, r: 3 },
  7,
  35,
  "api",
  k.lineSvg(k.sideSeam({ x: -173, y: -32, w: 60, d: 57, r: 3 }, 32, KP, 5), {
    tone: "faint",
  }),
);
slab(
  "api-lid",
  { x: -175, y: -34, w: 64, d: 61, r: 3 },
  42,
  3,
  "api",
  screw({ x: -175, y: -34, w: 64, d: 61, r: 3 }, 45),
);
for (let i = 0; i < 4; i++)
  slab(
    `api-module-${i}`,
    { x: -165, y: -28 + i * 12, w: 44, d: 9, r: 1 },
    45,
    3,
    "api",
    trim({ x: -165, y: -28 + i * 12, w: 44, d: 9, r: 1 }, 48),
  );
// Three genuinely hollow drawers on shelves. Their fronts and pulls slide together.
slab("cache-back", { x: -71, y: -34, w: 70, d: 4, r: 1 }, 7, 65, "cache");
for (const x of [-71, -5])
  slab(`cache-side-${x}`, { x, y: -30, w: 4, d: 58, r: 1 }, 7, 65, "cache");
slab(
  "cache-cap",
  { x: -71, y: -34, w: 70, d: 62, r: 2 },
  72,
  3,
  "cache",
  screw({ x: -71, y: -34, w: 70, d: 62, r: 2 }, 75),
);
for (let i = 0; i < 3; i++) {
  const z = 7 + i * 21;
  slab(`shelf-${i}`, { x: -67, y: -30, w: 62, d: 58, r: 0.5 }, z, 2, "cache");
  const extra = { move: [0, DRAWER_TRAVEL, 0] as k.Point3, drawer: i };
  slab(
    `drawer-floor-${i}`,
    { x: -66, y: -29, w: 60, d: 51, r: 0.6 },
    z + 2,
    2,
    `drawer-${i}`,
    trim({ x: -66, y: -29, w: 60, d: 51, r: 0.6 }, z + 4),
    extra,
  );
  slab(
    `drawer-front-${i}`,
    { x: -66, y: 20, w: 60, d: 2, r: 0.6 },
    z + 4,
    11,
    `drawer-${i}`,
    `<g class="cache-slot-light" data-cache-slot="${i}">${k.dotsSvg([at([-57, 22, z + 10])], { size: 1.4, tone: "hi" })}</g>`,
    extra,
  );
  slab(
    `drawer-pull-${i}`,
    { x: -46, y: 22, w: 20, d: 4, r: 0.7 },
    z + 7,
    3,
    `drawer-${i}`,
    "",
    extra,
  );
}
// Persistent storage: disks, spacer collars and engraved concentric tracks.
round("database-foot", 82, -3, 29, 7, 5, "database");
for (let i = 0; i < 3; i++) {
  const z = 12 + i * 14;
  round(`db-collar-${i}`, 82, -3, 22, z, 3, "database");
  round(
    `db-disc-${i}`,
    82,
    -3,
    28,
    z + 3,
    11,
    "database",
    k.lineSvg(
      [
        k.sideArc(82, -3, 28, z + 8, KP, 32),
        k.ring(82, -3, 24, z + 14, KP, 48),
      ].join(""),
      { tone: "lo" },
    ),
  );
}
round(
  "db-top",
  82,
  -3,
  28,
  54,
  2,
  "database",
  k.lineSvg(k.ring(82, -3, 23, 56, KP, 48), { tone: "lo" }) +
    k.dotsSvg(
      [[82, -3, 56]].map((p) => at(p as k.Point3)),
      { size: 1, tone: "hi" },
    ),
);
// A write station mirrors the same cache, not a second database or cache instance.
slab(
  "fill-bed",
  { x: 185, y: -30, w: 70, d: 53, r: 3 },
  7,
  5,
  "fill",
  screw({ x: 185, y: -30, w: 70, d: 53, r: 3 }, 12),
);
for (let i = 0; i < 3; i++) {
  const p = { x: 193, y: -24 + i * 14, w: 54, d: 11, r: 1 };
  slab(
    `fill-cartridge-${i}`,
    p,
    12,
    6,
    "fill",
    trim(p, 18) +
      `<g class="cache-slot-light" data-cache-slot="${i}">${k.dotsSvg([at([242, -20 + i * 14, 18])], { size: 1.4, tone: "hi" })}</g>`,
  );
}
// All work travels right along the front track. Only response packets travel left.
for (const y of [44, 71]) {
  for (const [i, x] of [-278, -110, 80, 255].entries())
    slab(
      `support-${y}-${i}`,
      { x, y: y - 6, w: 10, d: 12, r: 1 },
      0,
      6,
      "track",
    );
  slab(`track-${y}`, { x: -282, y: y - 7, w: 552, d: 14, r: 1 }, 6, 3, "track");
  for (const [i, x] of [-282, -180, -74, 41, 175].entries())
    slab(
      `guide-${y}-${i}`,
      { x, y: y - 7, w: [102, 106, 115, 134, 95][i], d: 1.5, r: 0.3 },
      9,
      2,
      "track",
    );
}
export const cacheHalo = k.haloOf(CACHE_BASE, -22, 12, KP);
