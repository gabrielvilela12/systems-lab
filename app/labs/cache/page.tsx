import type { Metadata } from "next";
import { CacheLab } from "../../../components/cache-lab";
import { CacheArt } from "../../../components/cache-art";
import { CacheGuide } from "../../../components/cache-guide";
export const metadata: Metadata = {
  title: "Cache · Systems Lab",
  description:
    "Explore cache-aside, hit, miss, TTL, invalidação, LRU e pedidos simultâneos em uma bancada isométrica interativa.",
};
export default function CachePage() {
  return (
    <CacheLab
      art={<CacheArt key="cache-art" />}
      guide={<CacheGuide key="cache-guide" />}
    />
  );
}
