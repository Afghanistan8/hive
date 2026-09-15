import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ece8e0" }}>
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(circle, rgba(216,209,197,0.9) 58%, rgba(216,209,197,0) 72%)",
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 999,
              background: "radial-gradient(circle at 36% 30%, #ffc08a 0%, #f7843d 30%, #e4562a 64%, #b73a1c 100%)",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
