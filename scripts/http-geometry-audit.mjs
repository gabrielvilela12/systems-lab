import { writeFileSync } from "node:fs";
import { httpParts } from "../lib/http-geometry.ts";
import { HP } from "../lib/http-view.ts";
import * as A from "../components/iso/audit.mjs";
const r = A.recorder(HP, {
  ground: (shape) => shape.name.startsWith("http-foot"),
});
for (const p of httpParts) {
  const meta = { name: p.name, owner: p.group };
  const shape = p.plan
    ? A.slab(p.plan, p.z, p.h, meta, 5)
    : A.cylinder(...p.circle, p.z, p.h, meta);
  r.solid(shape);
  r.put({
    name: p.name,
    piece: p.group,
    svg: p.markup,
    shapes: [shape],
    key: p.key,
  });
}
A.settle(r, HP);
writeFileSync(
  "lib/http-geometry-order.json",
  JSON.stringify(Object.fromEntries(r.items.map((p) => [p.name, p.key]))),
);
A.auditOrExit(r, HP, { argv: ["--audit"] });
