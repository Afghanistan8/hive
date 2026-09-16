import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Crypto activity",
  description: "Every Hive Daily market with its pools, results and settlement state.",
  openGraph: { title: "Crypto activity", description: "Every Hive Daily market with its pools, results and settlement state." },
  twitter: { title: "Crypto activity", description: "Every Hive Daily market with its pools, results and settlement state." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
