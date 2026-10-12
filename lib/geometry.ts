import * as k from "../components/iso/iso-kit";
import { P, BASE, at } from "./view";
export { P, WIDTH, HEIGHT, at } from "./view";
export type Part = {
  name: string;
  paths: k.SolidPaths;
  markup: string;
  plan?: k.Plan;
  circle?: [number, number, number];
  z: number;
  h: number;
  key: number;
  group: string;
};
export const parts: Part[] = [];
let sequence = 0;
function slab(
  name: string,
  plan: k.Plan,
  z: number,
  h: number,
  tone: k.Tone = "mid",
  group = "base",
  details = "",
) {
  const paths = k.slabOf(plan, z, h, P, 5, Math.min(0.6, h / 3));
  parts.push({
    name: `${name}-${sequence++}`,
    paths,
    markup: k.solidSvg(paths, { tone, crease: "lo", inner: details }),
    plan,
    z,
    h,
    key: k.depthOf([plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], P),
    group,
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
  details = "",
) {
  const paths = k.cylinder(x, y, r, z, h, P, 40, 0.35);
  parts.push({
    name: `${name}-${sequence++}`,
    paths,
    markup: k.solidSvg(paths, { tone: "mid", crease: "lo", inner: details }),
    circle: [x, y, r],
    z,
    h,
    key: k.depthOf([x, y, z + h / 2], P),
    group,
  });
}
function screws(plan: k.Plan, z: number) {
  return (
    k.dotsSvg(
      k.corners(plan, 4).map(([x, y]) => at([x, y, z])),
      { size: 1, tone: "hi" },
    ) +
    k.lineSvg(
      k
        .corners(plan, 4)
        .map(([x, y]) => k.ring(x, y, 1.25, z, P, 12))
        .join(""),
      { tone: "lo" },
    )
  );
}
function outlined(plan: k.Plan, z: number) {
  return k.lineSvg(k.planOutline(k.insetPlan(plan, 3), z, P), { tone: "lo" });
}
// World layout and physical parts are authored before projection. Every module
// has feet, a mounting plate, fasteners, and an open working mechanism.
for (const [x, y] of k.corners(BASE, 22)) {
  cylinder("foot-flange", x, y, 8, -22, 3);
  cylinder("rubber-foot", x, y, 6, -19, 7);
}
slab(
  "chassis",
  BASE,
  -12,
  12,
  "lo",
  "base",
  outlined(BASE, 0) + screws(BASE, 0),
);
const ruler = { x: -195, y: 130, w: 393, d: 6, r: 1 };
const ticks = k.topTicks(-192, 195, 5, 5, 130, 1, [2, 4], P);
slab(
  "calibration-rail",
  ruler,
  0,
  1,
  "lo",
  "base",
  k.lineSvg(k.lineOnTop([-195, 134], [198, 134], 1, P), { tone: "lo" }) +
    k.lineSvg(ticks.minor, { tone: "lo" }) +
    k.lineSvg(ticks.major, { tone: "mid" }),
);
// Back-panel instrumentation occupies the machine's otherwise empty chassis.
const panel = { x: -144, y: -113, w: 145, d: 65, r: 4 };
slab(
  "instrument-pedestal",
  panel,
  0,
  10,
  "lo",
  "instruments",
  screws(panel, 10),
);
slab("instrument-face", k.insetPlan(panel, 2), 10, 2, "mid", "instruments");
const gaugeTicks = k.radialTicks(-107, -78, 17, 30, 5, 16, [2, 4], P);
cylinder(
  "queue-depth-gauge",
  -107,
  -78,
  20,
  12,
  4,
  "instruments",
  k.lineSvg([13, 15, 17].map((r) => k.ring(-107, -78, r, 16, P, 60)).join(""), {
    tone: "lo",
  }) +
    k.lineSvg(gaugeTicks.minor, { tone: "lo" }) +
    k.lineSvg(gaugeTicks.major, { tone: "mid" }),
);
cylinder("gauge-pivot", -107, -78, 1.2, 16, 1, "instruments");
for (const x of [-64, -34]) {
  cylinder("selector-base", x, -78, 11, 12, 3, "instruments");
  cylinder(
    "selector-knob",
    x,
    -78,
    8,
    15,
    7,
    "instruments",
    k.lineSvg(k.knurl(x, -78, 8, 15, 22, 36, P, 0), { tone: "lo" }),
  );
}
for (let i = 0; i < 3; i++)
  slab(
    "panel-vent",
    { x: -74 + i * 13, y: -107, w: 9, d: 3, r: 1 },
    12,
    0.5,
    "lo",
    "instruments",
  );
for (let i = 0; i < 4; i++)
  cylinder("status-lamp", -10, -101 + i * 12, 2.3, 12, 1.5, "instruments");
const serial = { x: -126, y: -56, w: 90, d: 5, r: 0.5 };
slab(
  "engraved-nameplate",
  serial,
  12,
  0.5,
  "lo",
  "instruments",
  k.faceTextSvg(k.topMatrix([-122, -54], 12.5, P), "AMQP 0-9-1", {
    size: 3,
    tone: "mid",
  }),
);
// Producer: a stamping feeder with an upper magazine and a reciprocating head.
const producer = { x: -203, y: 3, w: 51, d: 57, r: 4 };
slab("producer-plinth", producer, 0, 7, "mid", "producer", screws(producer, 7));
slab(
  "feeder-body",
  { x: -198, y: 8, w: 41, d: 47, r: 3 },
  7,
  15,
  "mid",
  "producer",
);
for (const x of [-194, -164])
  for (const y of [10, 48]) {
    cylinder("magazine-post", x, y, 2, 22, 45, "producer");
    cylinder("post-cap", x, y, 3, 67, 2, "producer");
  }
slab(
  "magazine-back",
  { x: -194, y: 12, w: 32, d: 3, r: 0.5 },
  22,
  42,
  "mid",
  "producer",
);
for (let i = 0; i < 7; i++)
  slab(
    "blank-cartridge",
    { x: -189, y: 18, w: 23, d: 25, r: 1 },
    22 + i * 3.3,
    3.3,
    "hi",
    "producer",
    outlined({ x: -189, y: 18, w: 23, d: 25, r: 1 }, 25.3 + i * 3.3),
  );
slab(
  "press-crossbeam",
  { x: -198, y: 7, w: 41, d: 49, r: 2 },
  69,
  5,
  "mid",
  "producer",
  screws({ x: -198, y: 7, w: 41, d: 49, r: 2 }, 74),
);
cylinder(
  "feed-motor",
  -178,
  32,
  10,
  74,
  6,
  "producer",
  k.lineSvg(k.knurl(-178, 32, 10, 74, 80, 30, P, 0), { tone: "lo" }),
);
// Conveyor beds connect flush to the feeder and routing table.
function belt(
  name: string,
  x: number,
  y: number,
  w: number,
  d: number,
  group: string,
) {
  const plan = { x, y, w, d, r: 1 };
  slab(`${name}-mount`, plan, 0, 13, "lo", group);
  slab(`${name}-bed`, plan, 13, 7, "mid", group);
  for (let xx = x + 3; xx < x + w; xx += 5)
    slab(
      `${name}-tread`,
      { x: xx, y: y + 2, w: 1.2, d: d - 4, r: 0.2 },
      20,
      0.6,
      "lo",
      group,
    );
  for (const yy of [y, y + d - 2])
    slab(`${name}-guide`, { x, y: yy, w, d: 2, r: 0.5 }, 20, 2.5, "mid", group);
}
belt("feed", -152, 21, 54, 22, "producer");
// Exchange: a geared distribution turntable, with an actual gate and detents.
const exchange = { x: -98, y: 5, w: 58, d: 57, r: 4 };
slab("exchange-mount", exchange, 0, 7, "mid", "exchange", screws(exchange, 7));
cylinder("exchange-bearing", -69, 32, 24, 7, 10, "exchange");
cylinder(
  "routing-wheel",
  -69,
  32,
  22,
  17,
  5,
  "exchange",
  k.lineSvg(k.ring(-69, 32, 20, 22, P, 60), { tone: "lo" }) +
    k.lineSvg(k.radialTicks(-69, 32, 20, 28, 7, 22, [2, 4], P).minor, {
      tone: "lo",
    }),
);
cylinder("rotor-hub", -69, 32, 7, 22, 8, "exchange");
for (const x of [-98, -44]) {
  slab(
    "gate-mount",
    { x, y: 27, w: 4, d: 10, r: 0.5 },
    7,
    33,
    "mid",
    "exchange",
  );
  slab(
    "gate-cap",
    { x: x - 1, y: 25, w: 6, d: 14, r: 1 },
    40,
    3,
    "hi",
    "exchange",
  );
}
// Queue: a long cartridge accumulator, with brackets and a front sight ruler.
belt("queue", -40, 21, 139, 22, "queue");
for (const x of [-35, 90]) {
  slab(
    "queue-support",
    { x, y: 12, w: 4, d: 7, r: 0.5 },
    0,
    44,
    "mid",
    "queue",
  );
  slab(
    "queue-bridge",
    { x: x - 1, y: 12, w: 6, d: 37, r: 0.5 },
    44,
    3,
    "mid",
    "queue",
  );
  slab(
    "queue-front-leg",
    { x, y: 43, w: 4, d: 6, r: 0.5 },
    0,
    44,
    "mid",
    "queue",
  );
}
const scale = { x: -28, y: 46, w: 110, d: 5, r: 0.5 };
const qt = k.topTicks(-26, 80, 4, 5, 46, 2, [2, 4], P);
slab(
  "queue-ruler",
  scale,
  0,
  2,
  "lo",
  "queue",
  k.lineSvg(qt.minor, { tone: "lo" }) + k.lineSvg(qt.major, { tone: "mid" }),
);
// Three serial processing benches; consumer buffers sit on their own racks.
const consumerY = [-92, -32, 28];
consumerY.forEach((y, i) => {
  const plan = { x: 145, y: y - 13, w: 55, d: 41, r: 3 };
  slab("consumer-foot", plan, 0, 6, "mid", `consumer-${i}`, screws(plan, 6));
  slab(
    "consumer-chamber",
    { x: 157, y: y - 9, w: 38, d: 33, r: 2 },
    6,
    21,
    "mid",
    `consumer-${i}`,
  );
  slab(
    "processor-top",
    { x: 157, y: y - 9, w: 38, d: 33, r: 2 },
    27,
    3,
    "mid",
    `consumer-${i}`,
    outlined({ x: 157, y: y - 9, w: 38, d: 33, r: 2 }, 30),
  );
  for (const x of [161, 188])
    cylinder("actuator-pillar", x, y + 15, 2.5, 30, 21, `consumer-${i}`);
  slab(
    "actuator-crosshead",
    { x: 157, y: y + 11, w: 38, d: 8, r: 1 },
    51,
    4,
    "hi",
    `consumer-${i}`,
    screws({ x: 157, y: y + 11, w: 38, d: 8, r: 1 }, 55),
  );
  for (let j = 0; j < 5; j++)
    slab(
      "cooling-fin",
      { x: 160 + j * 6, y: y - 7, w: 2, d: 14, r: 0.3 },
      30,
      5,
      "mid",
      `consumer-${i}`,
    );
  cylinder(
    "capacity-knob",
    190,
    y + 18,
    3.4,
    55,
    4,
    `consumer-${i}`,
    k.lineSvg(k.knurl(190, y + 18, 3.4, 55, 59, 20, P, 0), { tone: "lo" }),
  );
  belt(`buffer-${i}`, 117, y - 6, 28, 12, `consumer-${i}`);
});
// A branching delivery manifold: individually supported belts and open forks.
belt("dispatch", 99, -98, 18, 138, "queue");
// Retry route runs down the front edge and rejoins at the queue entrance.
belt("return", -48, 79, 184, 12, "retry");
slab(
  "return-riser",
  { x: -40, y: 43, w: 4, d: 36, r: 1 },
  0,
  20,
  "mid",
  "retry",
);
slab(
  "return-outlet",
  { x: 128, y: 41, w: 8, d: 38, r: 1 },
  0,
  20,
  "mid",
  "retry",
);
// Dead-letter drawer is an open machined tray. Cartridges remain inspectable.
const dead = { x: 18, y: 101, w: 97, d: 24, r: 2 };
slab("dead-drawer-floor", dead, 0, 5, "lo", "dead");
for (const y of [101, 122])
  slab("drawer-side", { x: 18, y, w: 97, d: 3, r: 0.5 }, 5, 8, "mid", "dead");
for (const x of [18, 112])
  slab("drawer-end", { x, y: 104, w: 3, d: 18, r: 0.5 }, 5, 8, "mid", "dead");
slab(
  "drawer-handle",
  { x: 54, y: 125, w: 24, d: 5, r: 1 },
  0,
  5,
  "hi",
  "dead",
  screws({ x: 54, y: 125, w: 24, d: 5, r: 1 }, 5),
);
export const halo = k.haloOf(BASE, -22, 14, P);
