import { HttpLab } from "../../../components/http-lab";
import { HttpArt } from "../../../components/http-art";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "HTTP · Systems Lab",
  description:
    "Explore métodos HTTP, status, headers, payload, latência e timeout em uma máquina interativa.",
};
export default function HttpPage() {
  return <HttpLab art={<HttpArt key="http-art" />} />;
}
