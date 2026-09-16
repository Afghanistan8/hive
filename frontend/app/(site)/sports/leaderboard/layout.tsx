import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Top predictors",
  description: "Ranked from every position on-chain: correct picks, accuracy and net GEN, plus the AI Call's own record.",
  openGraph: { title: "Top predictors", description: "Ranked from every position on-chain: correct picks, accuracy and net GEN, plus the AI Call's own record." },
  twitter: { title: "Top predictors", description: "Ranked from every position on-chain: correct picks, accuracy and net GEN, plus the AI Call's own record." },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
