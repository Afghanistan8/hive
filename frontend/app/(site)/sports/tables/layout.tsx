import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "League tables",
  description: "Live standings for Europe's top five leagues, next to the open HIVE fixtures.",
  openGraph: { title: "League tables", description: "Live standings for Europe's top five leagues, next to the open HIVE fixtures." },
  twitter: { title: "League tables", description: "Live standings for Europe's top five leagues, next to the open HIVE fixtures." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
