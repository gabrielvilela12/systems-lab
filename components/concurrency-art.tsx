import { concurrencyParts, concurrencyHalo } from "../lib/concurrency-geometry";
import order from "../lib/concurrency-geometry-order.json";
import { CONCURRENCY_WIDTH, CONCURRENCY_HEIGHT } from "../lib/concurrency-view";
export function ConcurrencyArt() {
  return (
    <g key="concurrency-static">
      <defs>
        <mask
          id="con-packet-occlusion"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={CONCURRENCY_WIDTH}
          height={CONCURRENCY_HEIGHT}
        >
          <rect
            width={CONCURRENCY_WIDTH}
            height={CONCURRENCY_HEIGHT}
            fill="white"
          />
          {concurrencyParts
            .filter((p) => p.group !== "base" && p.group !== "transport")
            .map((p) => (
              <path
                key={p.name}
                fill="black"
                data-move={p.move ? p.group.replace("worker-", "") : undefined}
                d={p.markup.match(/class="iso-fill" d="([^"]+)"/)?.[1]}
              />
            ))}
        </mask>
      </defs>
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
            data-station={p.group}
            data-inspectable={
              p.group !== "base" && p.group !== "transport" ? "true" : undefined
            }
            data-index={p.index}
            dangerouslySetInnerHTML={{ __html: p.markup }}
          />
        ))}
    </g>
  );
}
