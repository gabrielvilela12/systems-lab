import * as k from "../components/iso/iso-kit";
import {
  CP,
  CONCURRENCY_BASE,
  CARRIAGE_TRAVEL,
  concurrencyAt as at,
} from "./concurrency-view";
export type ConcurrencyPart = {
  name: string;
  plan?: k.Plan;
  circle?: [number, number, number];
  z: number;
  h: number;
  key: number;
  markup: string;
  group: string;
  move?: k.Point3;
  role?: string;
  index?: number;
};
export const concurrencyParts: ConcurrencyPart[] = [];
let sequence = 0;
function screws(p: k.Plan, z: number) {
  return (
    k.lineSvg(
      k
        .corners(p, 3)
        .map(([x, y]) => k.ring(x, y, 1.1, z, CP, 14))
        .join(""),
      { tone: "mid" },
    ) +
    k.dotsSvg(
      k.corners(p, 3).map(([x, y]) => at([x, y, z])),
      { size: 0.55, tone: "hi" },
    )
  );
}
function trim(p: k.Plan, z: number) {
  return k.lineSvg(k.planOutline(k.insetPlan(p, 2), z, CP), { tone: "lo" });
}
function slab(
  name: string,
  p: k.Plan,
  z: number,
  h: number,
  group = "base",
  details = "",
  extra: Partial<ConcurrencyPart> = {},
) {
  concurrencyParts.push({
    name: `${name}-${sequence++}`,
    plan: p,
    z,
    h,
    group,
    key: k.depthOf([p.x + p.w / 2, p.y + p.d / 2, z + h / 2], CP),
    markup: k.solidSvg(k.slabOf(p, z, h, CP, 5, Math.min(0.6, h / 3)), {
      tone: "mid",
      crease: "lo",
      inner: details,
    }),
    ...extra,
  });
}
function round(
  name: string,
  x: number,
  y: number,
  r: number,
  z: number,
  h: number,
) {
  concurrencyParts.push({
    name: `${name}-${sequence++}`,
    circle: [x, y, r],
    z,
    h,
    group: "base",
    key: k.depthOf([x, y, z + h / 2], CP),
    markup: k.solidSvg(k.cylinder(x, y, r, z, h, CP, 32, 0.3), {
      tone: "lo",
      crease: "lo",
    }),
  });
}
for (const [x, y] of k.corners(CONCURRENCY_BASE, 19)) {
  round("foot", x, y, 6, -22, 4);
  round("foot-neck", x, y, 4.6, -18, 6);
}
slab(
  "chassis",
  CONCURRENCY_BASE,
  -12,
  12,
  "base",
  trim(CONCURRENCY_BASE, 0) + screws(CONCURRENCY_BASE, 0),
);
const ruler = { x: -159, y: 81, w: 318, d: 6, r: 1 };
const ticks = k.topTicks(-155, 155, 5, 5, 81, 1, [2.5, 4], CP);
slab(
  "ruler",
  ruler,
  0,
  1,
  "base",
  k.lineSvg(ticks.minor, { tone: "lo" }) +
    k.lineSvg(ticks.major, { tone: "mid" }),
);
const cartridge = { x: -29, y: -67, w: 58, d: 132, r: 5 };
slab("register-plinth", cartridge, 0, 7, "register", screws(cartridge, 7));
slab(
  "register-case",
  k.insetPlan(cartridge, 3),
  7,
  11,
  "register",
  k.lineSvg(k.sideSeam(k.insetPlan(cartridge, 3), 12, CP, 5), { tone: "lo" }),
);
slab(
  "register-lid",
  k.insetPlan(cartridge, 2),
  18,
  3,
  "register",
  trim(k.insetPlan(cartridge, 2), 21) + screws(k.insetPlan(cartridge, 2), 21),
);
for (let i = 0; i < 4; i++) {
  const slot = { x: -22, y: -55 + i * 28, w: 44, d: 22, r: 2 };
  slab("card-seat", slot, 21, 2, "register", trim(slot, 23));
  slab(
    "record",
    { x: -18, y: slot.y + 3, w: 27, d: 16, r: 1 },
    23,
    2,
    "register",
    k.lineSvg(
      k.planOutline({ x: -15, y: slot.y + 6, w: 21, d: 2, r: 0.5 }, 25, CP),
      { tone: "lo" },
    ),
    { role: "record", index: i },
  );
  slab(
    "owner-lamp",
    { x: 13, y: slot.y + 5, w: 5, d: 12, r: 1 },
    23,
    2,
    "register",
    "",
    { role: "job", index: i },
  );
}
for (const [index, sign] of [-1, 1].entries()) {
  const id = index === 0 ? "A" : "B",
    group = `worker-${id}`;
  const mount = { x: sign < 0 ? -161 : 44, y: -38, w: 117, d: 76, r: 5 };
  slab("worker-plinth", mount, 0, 7, group, trim(mount, 7) + screws(mount, 7));
  const motor = { x: sign < 0 ? -157 : 133, y: -27, w: 24, d: 54, r: 3 };
  slab(
    "motor",
    motor,
    7,
    25,
    group,
    k.lineSvg(k.sideSeam(motor, 20, CP, 5), { tone: "lo" }),
  );
  slab(
    "motor-cap",
    k.insetPlan(motor, 1),
    32,
    3,
    group,
    screws(k.insetPlan(motor, 1), 35),
  );
  for (let i = 0; i < 3; i++)
    slab(
      "motor-vent",
      { x: motor.x + 5, y: -17 + i * 12, w: 14, d: 3, r: 0.8 },
      35,
      1,
      group,
    );
  const railX = sign < 0 ? -130 : 46;
  for (const y of [-22, 18]) {
    for (const x of [railX, railX + 78])
      slab(
        "rail-mount",
        { x, y: y - 2, w: 6, d: 8, r: 1 },
        7,
        5,
        group,
        screws({ x, y: y - 2, w: 6, d: 8, r: 1 }, 12),
      );
    slab(
      "linear-rail",
      { x: railX, y, w: 84, d: 4, r: 1 },
      12,
      4,
      group,
      trim({ x: railX, y, w: 84, d: 4, r: 1 }, 16),
    );
  }
  for (const x of [railX, railX + 80])
    slab("end-stop", { x, y: -15, w: 4, d: 30, r: 1 }, 7, 7, group);
  const home = sign < 0 ? -116 : 116;
  const extra = { move: [-sign * CARRIAGE_TRAVEL, 0, 0] as k.Point3 };
  for (const y of [-22, 18])
    slab(
      "slide-shoe",
      { x: home - 11, y, w: 22, d: 4, r: 0.8 },
      16,
      3,
      group,
      "",
      extra,
    );
  const head = { x: home - 13, y: -25, w: 26, d: 50, r: 3 };
  slab("reader-carriage", head, 19, 7, group, screws(head, 26), extra);
  slab(
    "reader-body",
    { x: home - 10, y: -18, w: 20, d: 36, r: 2 },
    26,
    18,
    group,
    k.lineSvg(
      k.sideSeam({ x: home - 10, y: -18, w: 20, d: 36, r: 2 }, 34, CP, 5),
      { tone: "lo" },
    ),
    extra,
  );
  const visor = { x: home - 7, y: -12, w: 14, d: 24, r: 1.5 };
  slab("reader-visor", visor, 44, 2, group, trim(visor, 46), extra);
  slab(
    "reader-lamp",
    { x: home - 3, y: -6, w: 6, d: 12, r: 1 },
    46,
    1,
    group,
    "",
    { ...extra, role: "worker", index },
  );
}
const meter = { x: -45, y: 69, w: 90, d: 10, r: 2 };
slab("counter-plinth", meter, 0, 3, "counter", screws(meter, 3));
const body = { x: -40, y: 69, w: 80, d: 10, r: 2 };
slab(
  "counter-case",
  body,
  3,
  9,
  "counter",
  k.lineSvg(k.sideSeam(body, 7, CP, 5), { tone: "lo" }),
);
slab("counter-bezel", { x: -37, y: 70, w: 74, d: 8, r: 1 }, 12, 1, "counter");
const [tx, ty] = at([-12, 72, 14]);
const u = k.axisVector(CP, [1, 0, 0]),
  v = k.axisVector(CP, [0, 1, 0]);
slab(
  "counter-screen",
  { x: -14, y: 70, w: 28, d: 8, r: 1 },
  13,
  1,
  "counter",
  k.faceTextSvg(`matrix(${u[0]} ${u[1]} ${v[0]} ${v[1]} ${tx} ${ty})`, "0", {
    size: 5,
    tone: "hi",
  }),
  { role: "counter" },
);
for (const x of [-32, -24, 21, 29])
  slab("counter-key", { x, y: 72, w: 5, d: 4, r: 0.7 }, 13, 1, "counter");
export const concurrencyHalo = k.haloOf(CONCURRENCY_BASE, -22, 11, CP);
