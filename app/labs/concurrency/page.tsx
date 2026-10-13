import type { Metadata } from "next";
import { ConcurrencyLab } from "../../../components/concurrency-lab";
import { ConcurrencyArt } from "../../../components/concurrency-art";
import { ConcurrencyGuide } from "../../../components/concurrency-guide";
export const metadata: Metadata = {
  title: "Concorrência · Systems Lab",
  description:
    "PC e celular enviam pedidos simultâneos para uma conta de R$ 100. Explore fila de trabalho, saldo compartilhado, débito atômico e idempotência.",
};
export default function ConcurrencyPage() {
  return (
    <ConcurrencyLab
      art={<ConcurrencyArt key="con-art" />}
      guide={<ConcurrencyGuide key="con-guide" />}
    />
  );
}
