import type { Metadata } from "next";
import { ConcurrencyLab } from "../../../components/concurrency-lab";
import { ConcurrencyArt } from "../../../components/concurrency-art";
import { ConcurrencyGuide } from "../../../components/concurrency-guide";
export const metadata: Metadata = {
  title: "Concorrência · Systems Lab",
  description:
    "Dois workers disputam pedidos pendentes. Explore condição de corrida, reserva atômica e idempotência em uma bancada interativa.",
};
export default function ConcurrencyPage() {
  return (
    <ConcurrencyLab
      art={<ConcurrencyArt key="con-art" />}
      guide={<ConcurrencyGuide key="con-guide" />}
    />
  );
}
