import { writeFileSync } from "node:fs";
import { parts, P } from "../lib/geometry.ts";
import * as A from "../components/iso/audit.mjs";
const recorder = A.recorder(P, {
  ground: (shape) => shape.name.startsWith("foot-flange"),
});
for (const part of parts) {
  const meta = { name: part.name, owner: part.group };
  const shape = part.plan
    ? A.slab(part.plan, part.z, part.h, meta, 5)
    : A.cylinder(...part.circle, part.z, part.h, meta);
  recorder.solid(shape);
  recorder.put({
    name: part.name,
    piece: part.group,
    svg: part.markup,
    shapes: [shape],
    key: part.key,
  });
}
A.settle(recorder, P);
writeFileSync(
  "lib/geometry-order.json",
  JSON.stringify(
    Object.fromEntries(recorder.items.map((p) => [p.name, p.key])),
  ),
);
A.auditOrExit(recorder, P, { argv: ["--audit"] });
