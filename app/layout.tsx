import type { Metadata } from "next";
import "../components/iso/iso.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "RabbitMQ · The Message Machine",
  description:
    "An interactive mechanical exploration of RabbitMQ: publishing, routing, queues, acknowledgements and retries.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
