import { httpParts, httpHalo } from "../lib/http-geometry";
import order from "../lib/http-geometry-order.json";
export function HttpArt() {
  return (
    <g key="http-static">
      <path className="iso-halo" d={httpHalo} />
      {[...httpParts]
        .sort(
          (a, b) =>
            ((order as Record<string, number>)[a.name] ?? a.key) -
            ((order as Record<string, number>)[b.name] ?? b.key),
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
