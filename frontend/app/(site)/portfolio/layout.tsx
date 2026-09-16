import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A wallet's Hive positions, claimable payouts and transaction links.",
  openGraph: { title: "Portfolio", description: "A wallet's Hive positions, claimable payouts and transaction links." },
  twitter: { title: "Portfolio", description: "A wallet's Hive positions, claimable payouts and transaction links." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
