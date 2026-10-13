import { writeFileSync } from "node:fs";
import { cacheParts } from "../lib/cache-geometry.ts";
import { KP } from "../lib/cache-view.ts";
import * as A from "../components/iso/audit.mjs";
const r = A.recorder(KP, {
  ground: (shape) => shape.name.startsWith("cache-foot-"),
});
for (const p of cacheParts) {
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
const states = [{ shares: {} }];
for (let i = 0; i < 3; i++)
  for (const t of [0.25, 0.5, 0.75, 1])
    states.push({ shares: { [`drawer-${i}`]: t } });
A.settle(r, KP, { states });
writeFileSync(
  "lib/cache-geometry-order.json",
  JSON.stringify(Object.fromEntries(r.items.map((p) => [p.name, p.key]))),
);
A.auditOrExit(r, KP, { argv: ["--audit"], frames: states, apart: false });
