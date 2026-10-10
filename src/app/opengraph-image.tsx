import { ImageResponse } from "next/og";

export const alt = "Stagehand: booking and promotion for independent venues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0b0907";
const PAPER = "#f1e8d6";
const SIGNAL = "#ee4231";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: INK,
          backgroundImage: "radial-gradient(circle at 78% -10%, rgba(255, 204, 138, 0.22), rgba(11, 9, 7, 0) 60%)",
          color: PAPER,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 64 64">
            <path d="M15 29V15h14" fill="none" stroke={SIGNAL} strokeWidth="7" strokeLinecap="square" />
            <path d="M49 35v14H35" fill="none" stroke={SIGNAL} strokeWidth="7" strokeLinecap="square" />
            <circle cx="32" cy="32" r="6.5" fill={PAPER} />
          </svg>
          <div style={{ fontSize: 30, letterSpacing: 8, color: "#aba28f" }}>TASTE DATA FROM QLOO</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 168, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>STAGEHAND</div>
          <div style={{ display: "flex", marginTop: 28, height: 8, width: 220, backgroundColor: SIGNAL }} />
          <div style={{ marginTop: 32, fontSize: 44, lineHeight: 1.25, color: "#d3c9b4" }}>
            Booking and promotion for independent venues
          </div>
        </div>
      </div>
    ),
    size,
  );
}
