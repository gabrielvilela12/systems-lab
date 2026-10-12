import type { Metadata } from "next";
import "../components/iso/iso.css";
import "./globals.css";
import "./hub.css";
export const metadata: Metadata = {
  title: "Systems Lab · Hub de estudos de backend",
  description:
    "Laboratórios interativos para estudar HTTP, RabbitMQ e os fundamentos de sistemas backend.",
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
