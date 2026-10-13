import type { Metadata } from "next";
import "../components/iso/iso.css";
import "./globals.css";
import "./hub.css";
import "./connections.css";
import "./connection-guide.css";
import "./concurrency.css";
import "./cache.css";
export const metadata: Metadata = {
  title: "Systems Lab · Hub de estudos de backend",
  description:
    "Laboratórios interativos para estudar conexões, HTTP, RabbitMQ, concorrência e cache em sistemas backend.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
