import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Open a market",
  description: "Open a Hive Daily UP/DOWN market for any supported token and GMT+1 day — permissionlessly.",
  openGraph: { title: "Open a market", description: "Open a Hive Daily UP/DOWN market for any supported token and GMT+1 day — permissionlessly." },
  twitter: { title: "Open a market", description: "Open a Hive Daily UP/DOWN market for any supported token and GMT+1 day — permissionlessly." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
