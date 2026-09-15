import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Hive Markets — prediction markets settled by GenLayer consensus";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(join(process.cwd(), "app/_fonts/Geist-SemiBold.ttf"));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const font = await loadFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          backgroundColor: "#ece8e0",
          backgroundImage:
            "radial-gradient(ellipse 60% 45% at 18% 25%, #f7f5f0 0%, rgba(247,245,240,0) 70%)," +
            "radial-gradient(ellipse 55% 40% at 82% 78%, #f6f3ee 0%, rgba(246,243,238,0) 70%)," +
            "radial-gradient(ellipse 40% 30% at 70% 20%, #dcd5c9 0%, rgba(220,213,201,0) 70%)," +
            "radial-gradient(ellipse 45% 35% at 25% 80%, #ddd6ca 0%, rgba(221,214,202,0) 70%)",
          fontFamily: font ? "Geist" : "sans-serif",
          color: "#161514",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 520,
            width: 160,
            height: 160,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(216,209,197,0.95) 55%, rgba(216,209,197,0) 72%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: 999,
              background: "radial-gradient(circle at 36% 30%, #ffc08a 0%, #f7843d 30%, #e4562a 64%, #b73a1c 100%)",
              boxShadow: "0 0 40px rgba(238,106,44,0.35)",
            }}
          />
        </div>
        <div style={{ fontSize: 168, fontWeight: 600, letterSpacing: -10, lineHeight: 1, marginTop: 150 }}>Hive Markets</div>
        <div style={{ fontSize: 26, marginTop: 58, color: "#2a2724", textAlign: "center", maxWidth: 760, lineHeight: 1.35 }}>
          Prediction markets settled by GenLayer consensus — only when two public sources agree
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Geist", data: font, weight: 600, style: "normal" }] : undefined },
  );
}
