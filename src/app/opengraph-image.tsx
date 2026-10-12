import { ImageResponse } from "next/og";

export const alt = "Stagehand: booking and promotion for independent venues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROOM = "#05070c";
const PANEL = "#0b0f17";
const TEXT = "#f1f4fa";
const SOFT = "#b3bdcf";
const HAIR = "rgba(169, 204, 255, 0.28)";
const KEY = "#ffb44a";
const KEY_INK = "#1b1204";
const WARM = "#ffd08c";
const BEAM = "rgba(169, 204, 255, 0.1)";

const LINEUP = [
  { rank: "1", width: 300 },
  { rank: "2", width: 210 },
  { rank: "3", width: 250 },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: ROOM,
          color: TEXT,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -120, left: 180, width: 220, height: 900, backgroundColor: BEAM, transform: "rotate(-14deg)" }} />
        <div style={{ position: "absolute", top: -120, left: 620, width: 180, height: 900, backgroundColor: BEAM, transform: "rotate(10deg)" }} />
        <div style={{ position: "absolute", top: -120, left: 1000, width: 240, height: 900, backgroundColor: BEAM, transform: "rotate(22deg)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, backgroundColor: KEY, boxShadow: "0 0 36px 8px rgba(255, 180, 74, 0.7)" }} />
          <div style={{ display: "flex", fontSize: 52, letterSpacing: -1.5 }}>Stagehand</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 64 }}>
          <div style={{ display: "flex", flexWrap: "wrap", width: 640, fontSize: 64, lineHeight: 1.08, letterSpacing: -2 }}>
            <span style={{ marginRight: 16 }}>Shortlist artists for your venue,</span>
            <span style={{ color: WARM }}>then plan the promotion.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 400, gap: 14 }}>
            {LINEUP.map((row) => (
              <div
                key={row.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  height: 84,
                  padding: "0 24px",
                  borderRadius: 8,
                  backgroundColor: row.rank === "1" ? "#2e2414" : PANEL,
                  border: `2px solid ${row.rank === "1" ? KEY : HAIR}`,
                }}
              >
                <div style={{ display: "flex", width: 28, fontSize: 40, color: row.rank === "1" ? KEY : SOFT }}>{row.rank}</div>
                <div
                  style={{
                    display: "flex",
                    height: row.rank === "1" ? 22 : 14,
                    width: row.width - 120,
                    borderRadius: 11,
                    backgroundColor: row.rank === "1" ? KEY : "#3a465c",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 22,
            borderTop: `2px solid ${HAIR}`,
            fontSize: 28,
            color: SOFT,
          }}
        >
          <div>Booking and promotion for independent venues</div>
          <div style={{ display: "flex", color: KEY_INK, backgroundColor: KEY, padding: "2px 16px", borderRadius: 20 }}>Taste data from Qloo</div>
        </div>
      </div>
    ),
    size,
  );
}
