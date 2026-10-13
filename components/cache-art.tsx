import { cacheParts, cacheHalo } from "../lib/cache-geometry";
import order from "../lib/cache-geometry-order.json";
export function CacheArt() {
  return (
    <g key="cache-static">
      <path className="iso-halo" d={cacheHalo} />
      {[...cacheParts]
        .sort(
          (a, b) =>
            ((order as Record<string, number>)[a.name] ?? a.key) -
            ((order as Record<string, number>)[b.name] ?? b.key),
        )
        .map((p) => (
          <g
            key={p.name}
            data-station={p.group.startsWith("drawer") ? "cache" : p.group}
            data-drawer={p.drawer}
            dangerouslySetInnerHTML={{ __html: p.markup }}
          />
        ))}
    </g>
  );
}
