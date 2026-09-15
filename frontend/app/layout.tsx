import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "@genlayer/transaction-kit-react/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { LiquidBackground } from "@/components/hive/LiquidBackground";
import { SoundToggle } from "@/components/hive/SoundToggle";
import { PageShell } from "@/components/hive/PageShell";

const hiveFont = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hive",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const TITLE = "Hive Markets — prediction markets settled by consensus";
const DESCRIPTION =
  "Football and crypto prediction markets on GenLayer that settle only when two public sources agree. No oracle key, no admin, no backend.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Hive Markets" },
  description: DESCRIPTION,
  applicationName: "Hive Markets",
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Hive Markets",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#ECE8E0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hiveFont.variable}>
      <body>
        <LiquidBackground />
        <Providers>
          <Navbar />
          <PageShell>{children}</PageShell>
          <SoundToggle />
        </Providers>
      </body>
    </html>
  );
}
