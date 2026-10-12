import { concurrencyParts, concurrencyHalo } from "../lib/concurrency-geometry";
import order from "../lib/concurrency-geometry-order.json";
export function ConcurrencyArt() {
  return (
    <g key="concurrency-static">
      <path className="iso-halo" d={concurrencyHalo} />
      {[...concurrencyParts]
        .sort(
          (a, b) =>
            ((order as Record<string, number>)[a.name] ?? a.key) -
            ((order as Record<string, number>)[b.name] ?? b.key),
        )
        .map((p) => (
          <g
            key={p.name}
            data-depth={(order as Record<string, number>)[p.name] ?? p.key}
            data-move={p.move ? p.group.replace("worker-", "") : undefined}
            data-role={p.role}
            data-index={p.index}
            dangerouslySetInnerHTML={{ __html: p.markup }}
          />
        ))}
    </g>
  );
}
