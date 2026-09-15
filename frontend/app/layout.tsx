import type { Metadata, Viewport } from "next";
import "@genlayer/transaction-kit-react/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "HIVE — prediction markets settled by GenLayer consensus",
  description:
    "Pari-mutuel football markets for Europe's top five leagues and daily UP/DOWN crypto markets, settled by Intelligent Contracts that only finalize when two public sources agree.",
  manifest: "/site.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#9B6AF6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-grow px-4 pb-16 pt-28 md:px-6 md:pt-24">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
            <footer className="border-t border-white/10 py-4 text-center text-xs text-muted-foreground">
              HIVE runs entirely on GenLayer Studio Next · no backend, no admin keys · markets settle only on 2-of-2 source agreement
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
