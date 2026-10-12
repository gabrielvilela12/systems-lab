import * as k from "../components/iso/iso-kit";
import { HTTP_BASE, HP, httpAt } from "./http-view";
export type HttpPart = {
  name: string;
  plan?: k.Plan;
  circle?: [number, number, number];
  z: number;
  h: number;
  key: number;
  markup: string;
  group: string;
};
export const httpParts: HttpPart[] = [];
let sequence = 0;
function slab(
  name: string,
  plan: k.Plan,
  z: number,
  h: number,
  tone: k.Tone = "mid",
  group = "base",
  inner = "",
) {
  const paths = k.slabOf(plan, z, h, HP, 5, Math.min(0.7, h / 3));
  httpParts.push({
    name: `${name}-${sequence++}`,
    plan,
    z,
    h,
    group,
    key: k.depthOf([plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], HP),
    markup: k.solidSvg(paths, { tone, crease: "lo", inner }),
  });
}
function cylinder(
  name: string,
  x: number,
  y: number,
  r: number,
  z: number,
  h: number,
  group = "base",
  inner = "",
) {
  httpParts.push({
    name: `${name}-${sequence++}`,
    circle: [x, y, r],
    z,
    h,
    group,
    key: k.depthOf([x, y, z + h / 2], HP),
    markup: k.solidSvg(k.cylinder(x, y, r, z, h, HP, 32, 0.2), {
      tone: "mid",
      crease: "lo",
      inner,
    }),
  });
}
function screws(p: k.Plan, z: number) {
  return (
    k.dotsSvg(
      k.corners(p, 3).map(([x, y]) => httpAt([x, y, z])),
      { size: 0.8, tone: "hi" },
    ) +
    k.lineSvg(
      k
        .corners(p, 3)
        .map(([x, y]) => k.ring(x, y, 1.1, z, HP, 12))
        .join(""),
      { tone: "lo" },
    )
  );
}
function groove(p: k.Plan, z: number) {
  return k.lineSvg(k.planOutline(k.insetPlan(p, 3), z, HP), { tone: "lo" });
}
function wallText(x: number, y: number, z: number, text: string, size = 3.5) {
  const [a, b] = httpAt([x, y, z]);
  const u = k.axisVector(HP, [1, 0, 0]),
    v = k.axisVector(HP, [0, 0, -1]);
  return k.faceTextSvg(
    `matrix(${u[0]} ${u[1]} ${v[0]} ${v[1]} ${a} ${b})`,
    text,
    { size, tone: "hi" },
  );
}
function wallBox(x: number, y: number, z: number, w: number, h: number) {
  return k.pathOf(
    [
      [x, y, z],
      [x + w, y, z],
      [x + w, y, z + h],
      [x, y, z + h],
    ].map((p) => httpAt(p as k.Point3)),
    true,
  );
}
function topText(x: number, y: number, z: number, text: string) {
  const [a, b] = httpAt([x, y, z]);
  const u = k.axisVector(HP, [1, 0, 0]),
    v = k.axisVector(HP, [0, 1, 0]);
  return k.faceTextSvg(
    `matrix(${u[0]} ${u[1]} ${v[0]} ${v[1]} ${a} ${b})`,
    text,
    { size: 3, tone: "hi" },
  );
}
for (const [x, y] of k.corners(HTTP_BASE, 20)) {
  cylinder("http-foot", x, y, 7, -24, 4);
  cylinder("foot-neck", x, y, 5, -20, 8);
}
slab(
  "chassis",
  HTTP_BASE,
  -12,
  12,
  "lo",
  "base",
  groove(HTTP_BASE, 0) + screws(HTTP_BASE, 0),
);
const strip = { x: -171, y: 79, w: 342, d: 6, r: 1 };
const ticks = k.topTicks(-168, 168, 5, 5, 79, 1, [2, 4], HP);
slab(
  "measurement-rail",
  strip,
  0,
  1,
  "lo",
  "base",
  k.lineSvg(ticks.minor, { tone: "lo" }) +
    k.lineSvg(ticks.major, { tone: "mid" }) +
    k.lineSvg(k.lineOnTop([-171, 83], [171, 83], 1, HP), { tone: "lo" }),
);
// A workstation with a supported vertical display, individual keys and ports.
const desk = { x: -181, y: -35, w: 77, d: 91, r: 4 };
slab("client-plinth", desk, 0, 8, "lo", "client", screws(desk, 8));
slab(
  "client-case",
  k.insetPlan(desk, 3),
  8,
  7,
  "mid",
  "client",
  groove(k.insetPlan(desk, 3), 15),
);
slab(
  "monitor-foot",
  { x: -156, y: -17, w: 28, d: 24, r: 2 },
  15,
  3,
  "lo",
  "client",
);
slab(
  "monitor-neck",
  { x: -147, y: -13, w: 10, d: 8, r: 1 },
  18,
  13,
  "mid",
  "client",
);
const monitor = { x: -172, y: -19, w: 60, d: 12, r: 2 };
const screen = wallBox(-167, -7, 36, 50, 28);
slab(
  "monitor-frame",
  monitor,
  31,
  40,
  "mid",
  "client",
  `<path class="http-screen" d="${screen}"/>` +
    wallText(-164, -7, 58, "CLIENT", 4) +
    wallText(-164, -7, 49, "HTTP /1.1", 3) +
    wallText(-164, -7, 41, "> request_", 2.5),
);
slab(
  "keyboard-bed",
  { x: -171, y: 19, w: 57, d: 24, r: 2 },
  15,
  2,
  "lo",
  "client",
);
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 10; col++)
    slab(
      "key",
      { x: -168 + col * 5.1, y: 22 + row * 6, w: 4, d: 4.5, r: 0.5 },
      17,
      1.8,
      "mid",
      "client",
    );
slab(
  "spacebar",
  { x: -156, y: 40, w: 27, d: 2, r: 0.4 },
  17,
  1.8,
  "mid",
  "client",
);
for (let i = 0; i < 5; i++)
  slab(
    "client-vent",
    { x: -110, y: -19 + i * 6, w: 3, d: 3, r: 0.5 },
    15,
    1,
    "lo",
    "client",
  );
// Two physical transport tracks: request outward, response inward.
for (const y of [-3, 24]) {
  for (const x of [-94, -35, 29, 89])
    slab(
      "track-support",
      { x, y: y - 3, w: 7, d: 17, r: 1 },
      0,
      7,
      "lo",
      "network",
    );
  slab(
    "track-bed",
    { x: -101, y: y - 4, w: 205, d: 19, r: 2 },
    7,
    3,
    "lo",
    "network",
  );
  for (let i = 0; i < 29; i++)
    slab(
      "track-tread",
      { x: -98 + i * 6.9, y: y - 2, w: 4.8, d: 15, r: 0.5 },
      10,
      1,
      "mid",
      "network",
    );
  for (const side of [-4, 13])
    slab(
      "track-guide",
      { x: -101, y: y + side, w: 205, d: 2, r: 0.5 },
      10,
      2,
      "mid",
      "network",
    );
}
// A timer instrument controls latency and observes server work, beside tracks.
const instrument = { x: -54, y: -83, w: 101, d: 52, r: 4 };
slab(
  "instrument-mount",
  instrument,
  0,
  8,
  "lo",
  "network",
  screws(instrument, 8),
);
slab("instrument-panel", k.insetPlan(instrument, 2), 8, 2, "mid", "network");
const dialTicks = k.radialTicks(-28, -56, 17, 30, 5, 14, [2, 4], HP);
cylinder(
  "latency-dial",
  -28,
  -56,
  20,
  10,
  4,
  "network",
  k.lineSvg(dialTicks.minor, { tone: "lo" }) +
    k.lineSvg(dialTicks.major, { tone: "hi" }) +
    k.lineSvg(k.ring(-28, -56, 17, 14, HP, 60), { tone: "lo" }) +
    k.lineSvg(k.ring(-28, -56, 13, 14, HP, 48), { tone: "lo" }),
);
for (const x of [8, 28]) {
  cylinder(
    "network-knob",
    x,
    -61,
    7,
    10,
    8,
    "network",
    k.lineSvg(k.knurl(x, -61, 7, 10, 18, 24, HP, 0), { tone: "lo" }),
  );
}
slab(
  "network-nameplate",
  { x: 1, y: -46, w: 35, d: 9, r: 1 },
  10,
  1,
  "lo",
  "network",
  topText(3, -39, 11, "NETWORK"),
);
// A rack of three supported processing drawers with cards and cooling fins.
const rack = { x: 105, y: -35, w: 77, d: 91, r: 3 };
slab("server-plinth", rack, 0, 8, "lo", "server", screws(rack, 8));
for (const [x, y] of k.corners(rack, 5))
  slab(
    "rack-post",
    { x: x - 2, y: y - 2, w: 4, d: 4, r: 0.5 },
    8,
    66,
    "mid",
    "server",
  );
for (let bay = 0; bay < 3; bay++) {
  const z = 12 + bay * 19,
    p = { x: 113, y: -27, w: 61, d: 74, r: 2 };
  for (const [x, y] of k.corners(p, 3))
    slab(
      "shelf-mount",
      { x: x - 1.5, y: y - 1.5, w: 3, d: 3, r: 0.4 },
      bay === 0 ? 8 : z - 9,
      bay === 0 ? 4 : 9,
      "lo",
      "server",
    );
  slab(
    "server-drawer",
    p,
    z,
    10,
    "mid",
    "server",
    k.lineSvg(k.sideSeam(p, z + 7, HP, 5), { tone: "lo" }) +
      wallText(
        117,
        47,
        z + 6,
        bay === 2 ? "HTTP SERVER" : `WORKER 0${bay + 1}`,
        3,
      ),
  );
  slab(
    "processor-board",
    { x: 120, y: -17, w: 47, d: 47, r: 1 },
    z + 10,
    1,
    "lo",
    "server",
  );
  slab(
    "cpu-chip",
    { x: 130, y: -5, w: 18, d: 18, r: 1 },
    z + 11,
    2,
    "hi",
    "server",
  );
  for (let fin = 0; fin < 7; fin++)
    slab(
      "cooling-fin",
      { x: 131 + fin * 2.3, y: -4, w: 0.9, d: 16, r: 0.2 },
      z + 13,
      2,
      "mid",
      "server",
    );
  for (let i = 0; i < 4; i++)
    slab(
      "memory-bank",
      { x: 153, y: -11 + i * 9, w: 9, d: 6, r: 0.5 },
      z + 11,
      2,
      "mid",
      "server",
    );
  slab(
    "drawer-handle",
    { x: 132, y: 47, w: 23, d: 3, r: 0.5 },
    z + 2,
    3,
    "lo",
    "server",
  );
}
slab(
  "rack-lid",
  { x: 105, y: -35, w: 77, d: 91, r: 3 },
  74,
  3,
  "mid",
  "server",
  groove(rack, 77) + screws(rack, 77),
);
for (let i = 0; i < 10; i++)
  slab(
    "lid-vent",
    { x: 119 + i * 4.7, y: -14, w: 2, d: 29, r: 0.5 },
    77,
    1,
    "lo",
    "server",
  );
export const httpHalo = k.haloOf(HTTP_BASE, -24, 12, HP);
