import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My Picks",
  description: "Every prediction a wallet made on Hive Match, with results and anything claimable.",
  openGraph: { title: "My Picks", description: "Every prediction a wallet made on Hive Match, with results and anything claimable." },
  twitter: { title: "My Picks", description: "Every prediction a wallet made on Hive Match, with results and anything claimable." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
