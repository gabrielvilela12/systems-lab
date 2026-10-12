import { writeFileSync } from "node:fs";
import { concurrencyParts } from "../lib/concurrency-geometry.ts";
import { CP } from "../lib/concurrency-view.ts";
import * as A from "../components/iso/audit.mjs";
const r = A.recorder(CP, { ground: (shape) => shape.name.startsWith("foot-") });
for (const p of concurrencyParts) {
  const meta = { name: p.name, owner: p.group };
  const shape = p.plan
    ? A.slab(p.plan, p.z, p.h, meta, 5)
    : A.cylinder(...p.circle, p.z, p.h, meta);
  r.solid(shape);
  r.put({
    name: p.name,
    piece: p.group,
    move: p.move,
    svg: p.markup,
    shapes: [shape],
    key: p.key,
  });
}
const states = [];
for (const a of [0, 0.25, 0.5, 0.75, 1])
  for (const b of [0, 0.25, 0.5, 0.75, 1])
    states.push({ shares: { "worker-A": a, "worker-B": b } });
A.settle(r, CP, { states });
writeFileSync(
  "lib/concurrency-geometry-order.json",
  JSON.stringify(Object.fromEntries(r.items.map((p) => [p.name, p.key]))),
);
A.auditOrExit(r, CP, { argv: ["--audit"], frames: states, apart: true });
