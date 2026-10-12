import type { Metadata } from "next";
import { ConnectionsLab } from "../../../components/connections-lab";
import { HttpArt } from "../../../components/http-art";
export const metadata: Metadata = {
  title: "Conexões · Systems Lab",
  description:
    "Entenda como um clique no frontend vira uma requisição no backend. Compare HTTP, polling, SSE, WebSocket e webhook.",
};
export default function ConnectionsPage() {
  return <ConnectionsLab art={<HttpArt key="connection-art" />} />;
}
