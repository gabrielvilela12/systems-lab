import { parts, halo, WIDTH, HEIGHT } from "../lib/geometry";
import order from "../lib/geometry-order.json";
export function MachineArt() {
  return (
    <g key="static-machine">
      <path className="iso-halo" d={halo} />
      {[...parts]
        .sort(
          (a, b) =>
            (order as Record<string, number>)[a.name] -
            (order as Record<string, number>)[b.name],
        )
        .map((p) => (
          <g
            key={p.name}
            data-assembly={p.group}
            dangerouslySetInnerHTML={{ __html: p.markup }}
          />
        ))}
    </g>
  );
}
export const viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
