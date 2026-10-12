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
const ruler = { x: -279, y: 113, w: 558, d: 6, r: 1 };
const ticks = k.topTicks(-275, 275, 5, 5, 113, 1, [2.5, 4], CP);
slab(
  "ruler",
  ruler,
  0,
  1,
  "base",
  k.lineSvg(ticks.minor, { tone: "lo" }) +
    k.lineSvg(ticks.major, { tone: "mid" }),
);
// Supported transport channels: laid out between equipment ports, on the chassis.
const lanes = [
  [-241, -67, 69, 6],
  [-175, -61, 6, 49],
  [-235, 56, 40, 6],
  [-137, 21, 66, 6],
  [-9, 21, 49, 6],
  [34, -66, 6, 87],
  [34, 27, 6, 41],
  [40, -66, 33, 6],
  [40, 62, 33, 6],
  [143, -66, 94, 6],
  [231, -60, 6, 48],
  [143, 62, 94, 6],
  [231, 43, 6, 19],
];
for (const [i, [x, y, w, d]] of lanes.entries()) {
  const p = { x, y, w, d, r: 0.7 };
  slab(
    "transport-channel",
    p,
    0,
    3,
    "transport",
    k.lineSvg(k.planOutline(k.insetPlan(p, 0.8), 3, CP), { tone: "lo" }),
  );
  const sides =
    w > d
      ? [
          { x, y, w, d: 1, r: 0.3 },
          { x, y: y + d - 1, w, d: 1, r: 0.3 },
        ]
      : [
          { x, y, w: 1, d, r: 0.3 },
          { x: x + w - 1, y, w: 1, d, r: 0.3 },
        ];
  for (const side of sides) slab("channel-guide", side, 3, 1, "transport");
}
// A phone on a charging cradle: one of two clients of the same API.
const phone = { x: -281, y: -90, w: 40, d: 59, r: 5 };
slab("phone-cradle", phone, 0, 5, "app", screws(phone, 5));
slab("phone-body", { x: -276, y: -83, w: 30, d: 42, r: 4 }, 5, 7, "app");
slab(
  "phone-glass",
  { x: -273, y: -79, w: 24, d: 32, r: 2 },
  12,
  1,
  "app",
  trim({ x: -273, y: -79, w: 24, d: 32, r: 2 }, 13),
  { role: "client-screen", index: 0 },
);
slab("phone-button", { x: -265, y: -45, w: 8, d: 2, r: 1 }, 12, 1, "app");
slab("phone-lens", { x: -263, y: -81, w: 4, d: 1, r: 0.4 }, 12, 1, "app");
// A web terminal with a real upright screen and separate keyboard keys.
const web = { x: -281, y: 33, w: 46, d: 49, r: 4 };
slab("terminal-base", web, 0, 4, "front", screws(web, 4));
slab(
  "terminal-deck",
  k.insetPlan(web, 2),
  4,
  5,
  "front",
  trim(k.insetPlan(web, 2), 9),
);
slab("monitor-foot", { x: -271, y: 35, w: 24, d: 12, r: 2 }, 9, 3, "front");
slab("monitor-neck", { x: -264, y: 37, w: 10, d: 6, r: 1 }, 12, 9, "front");
slab("monitor-case", { x: -274, y: 33, w: 34, d: 7, r: 1 }, 21, 23, "front");
slab(
  "monitor-window",
  { x: -270, y: 40, w: 26, d: 1, r: 0.2 },
  25,
  15,
  "front",
  "",
  { role: "client-screen", index: 1 },
);
for (let y = 0; y < 2; y++)
  for (let x = 0; x < 3; x++)
    slab(
      "keyboard-key",
      { x: -273 + x * 10, y: 57 + y * 9, w: 7, d: 6, r: 0.7 },
      9,
      1,
      "front",
    );
// API rack: request validation, persistence and response, not the background worker.
const api = { x: -195, y: -12, w: 58, d: 82, r: 4 };
slab("api-plinth", api, 0, 6, "api", screws(api, 6));
const rack = { x: -192, y: -9, w: 52, d: 76, r: 3 };
slab(
  "api-rack",
  rack,
  6,
  49,
  "api",
  k.lineSvg(k.sideSeam(rack, 31, CP, 5), { tone: "lo" }),
);
slab("api-cover", rack, 55, 3, "api", trim(rack, 58) + screws(rack, 58));
for (let i = 0; i < 3; i++) {
  slab(
    "api-server-blade",
    { x: -187, y: 67, w: 42, d: 2, r: 0.6 },
    14 + i * 12,
    8,
    "api",
  );
  slab(
    "api-blade-led",
    { x: -148, y: 69, w: 2, d: 1, r: 0.1 },
    17 + i * 12,
    2,
    "api",
  );
}
for (let i = 0; i < 4; i++)
  slab(
    "api-vent",
    { x: -184, y: 1 + i * 15, w: 36, d: 3, r: 0.5 },
    58,
    1,
    "api",
  );
slab(
  "api-status-lamp",
  { x: -170, y: 48, w: 8, d: 7, r: 1 },
  58,
  1,
  "api",
  "",
  { role: "api" },
);
// Database: durable records stay in their slots while read copies travel to workers.
const bank = { x: -71, y: -30, w: 62, d: 104, r: 4 };
slab("register-plinth", bank, 0, 6, "register", screws(bank, 6));
slab(
  "register-case",
  k.insetPlan(bank, 2),
  6,
  15,
  "register",
  k.lineSvg(k.sideSeam(k.insetPlan(bank, 2), 13, CP, 5), { tone: "lo" }),
);
slab(
  "register-lid",
  bank,
  21,
  3,
  "register",
  trim(bank, 24) + screws(bank, 24),
);
for (let i = 0; i < 4; i++) {
  const slot = { x: -65, y: -19 + i * 21, w: 50, d: 17, r: 2 };
  slab("card-seat", slot, 24, 2, "register", trim(slot, 26));
  slab(
    "record",
    { x: -61, y: slot.y + 3, w: 31, d: 11, r: 1 },
    26,
    2,
    "register",
    trim({ x: -61, y: slot.y + 3, w: 31, d: 11, r: 1 }, 28),
    { role: "record", index: i },
  );
  slab(
    "owner-lamp",
    { x: -24, y: slot.y + 4, w: 5, d: 9, r: 1 },
    26,
    2,
    "register",
    "",
    { role: "job", index: i },
  );
}
// Independent background workers, each with its own reader on a supported rail.
for (const [index, y] of [-63, 65].entries()) {
  const group = `worker-${index === 0 ? "A" : "B"}`;
  const mount = { x: 73, y: y - 26, w: 70, d: 52, r: 4 };
  slab("worker-plinth", mount, 0, 6, group, trim(mount, 6) + screws(mount, 6));
  const motor = { x: 77, y: y - 22, w: 17, d: 44, r: 2 };
  slab(
    "worker-motor",
    motor,
    6,
    20,
    group,
    k.lineSvg(k.sideSeam(motor, 16, CP, 5), { tone: "lo" }),
  );
  slab("worker-motor-cover", motor, 26, 3, group, screws(motor, 29));
  for (let i = 0; i < 3; i++)
    slab(
      "motor-fin",
      { x: 80, y: y - 15 + i * 12, w: 11, d: 3, r: 0.5 },
      29,
      1,
      group,
    );
  for (const ry of [y - 16, y + 16])
    slab("linear-rail", { x: 97, y: ry, w: 42, d: 4, r: 0.7 }, 6, 4, group);
  for (const x of [95, 139])
    slab("end-stop", { x, y: y - 10, w: 2, d: 24, r: 0.6 }, 6, 5, group);
  const extra = { move: [CARRIAGE_TRAVEL, 0, 0] as k.Point3 };
  for (const ry of [y - 16, y + 16])
    slab(
      "slide-shoe",
      { x: 98, y: ry, w: 14, d: 4, r: 0.5 },
      10,
      2,
      group,
      "",
      extra,
    );
  const head = { x: 96, y: y - 20, w: 18, d: 40, r: 2 };
  slab("reader-carriage", head, 12, 3, group, screws(head, 15), extra);
  const body = { x: 99, y: y - 13, w: 12, d: 26, r: 1 };
  slab(
    "reader-body",
    body,
    15,
    16,
    group,
    k.lineSvg(k.sideSeam(body, 24, CP, 5), { tone: "lo" }),
    extra,
  );
  slab("reader-cap", body, 31, 2, group, trim(body, 33), extra);
  slab(
    "reader-lamp",
    { x: 102, y: y - 5, w: 6, d: 10, r: 1 },
    33,
    1,
    group,
    "",
    { ...extra, role: "worker", index },
  );
}
// A separate effect station: the actual charge and its receipt counter.
const effect = { x: 208, y: -12, w: 52, d: 55, r: 4 };
slab("effect-plinth", effect, 0, 6, "counter", screws(effect, 6));
slab(
  "effect-case",
  k.insetPlan(effect, 3),
  6,
  32,
  "counter",
  k.lineSvg(k.sideSeam(k.insetPlan(effect, 3), 24, CP, 5), { tone: "lo" }),
);
slab(
  "effect-cover",
  k.insetPlan(effect, 2),
  38,
  3,
  "counter",
  trim(k.insetPlan(effect, 2), 41) + screws(k.insetPlan(effect, 2), 41),
);
slab(
  "effect-actuator",
  { x: 218, y: 0, w: 32, d: 27, r: 3 },
  41,
  11,
  "counter",
);
slab(
  "effect-light",
  { x: 229, y: 7, w: 10, d: 12, r: 1 },
  52,
  1,
  "counter",
  "",
  { role: "effect" },
);
const receipt = { x: 177, y: 89, w: 83, d: 12, r: 2 };
slab("receipt-plinth", receipt, 0, 3, "counter", screws(receipt, 3));
slab("receipt-counter", k.insetPlan(receipt, 2), 3, 8, "counter");
const screen = { x: 203, y: 92, w: 28, d: 7, r: 0.7 };
const [tx, ty] = at([205, 93, 12]);
const u = k.axisVector(CP, [1, 0, 0]),
  v = k.axisVector(CP, [0, 1, 0]);
slab(
  "counter-screen",
  screen,
  11,
  1,
  "counter",
  k.faceTextSvg(`matrix(${u[0]} ${u[1]} ${v[0]} ${v[1]} ${tx} ${ty})`, "0", {
    size: 5,
    tone: "hi",
  }),
  { role: "counter" },
);
for (const x of [184, 193, 237, 246])
  slab("counter-key", { x, y: 94, w: 5, d: 4, r: 0.5 }, 11, 1, "counter");
export const concurrencyHalo = k.haloOf(CONCURRENCY_BASE, -22, 11, CP);
