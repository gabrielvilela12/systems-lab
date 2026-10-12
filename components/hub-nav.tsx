import Link from "next/link";
import { Boxes, ArrowUpRight } from "lucide-react";
export function HubNav({
  active = "home",
}: {
  active?: "home" | "http" | "rabbitmq";
}) {
  return (
    <header className="hub-nav">
      <Link href="/" className="hub-brand" aria-label="Systems Lab · início">
        <span>
          <Boxes size={23} />
        </span>
        <strong>
          systems<span> / lab</span>
        </strong>
      </Link>
      <nav aria-label="Laboratórios">
        <Link href="/" aria-current={active === "home" ? "page" : undefined}>
          Visão geral
        </Link>
        <Link
          href="/labs/http"
          aria-current={active === "http" ? "page" : undefined}
        >
          HTTP
        </Link>
        <Link
          href="/labs/rabbitmq"
          aria-current={active === "rabbitmq" ? "page" : undefined}
        >
          RabbitMQ
        </Link>
      </nav>
      <span className="hub-nav-note">
        <i /> APRENDER EXPLORANDO <ArrowUpRight size={13} />
      </span>
    </header>
  );
}
