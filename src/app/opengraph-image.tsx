import { ImageResponse } from "next/og";

export const alt = "Stagehand: booking and promotion for independent venues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#ffffff";
const INK = "#111111";
const INK_3 = "#6e6e6e";
const RULE = "#d6d6d6";
const MARK = "#ffe600";

const LINEUP = [
  { rank: "1", width: 320 },
  { rank: "2", width: 200 },
  { rank: "3", width: 250 },
  { rank: "4", width: 110 },
];

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
          padding: "64px 72px",
          backgroundColor: PAPER,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <rect width="64" height="64" fill={MARK} />
            <path d="M11 13h42v10H11zM11 27h29v10H11zM11 41h17v10H11z" fill={INK} />
          </svg>
          <div style={{ fontSize: 52, letterSpacing: -1.5 }}>Stagehand</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 64 }}>
          <div style={{ display: "flex", width: 620, fontSize: 64, lineHeight: 1.08, letterSpacing: -2 }}>
            Shortlist artists for your venue, then plan the promotion.
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 430, borderTop: `4px solid ${INK}` }}>
            {LINEUP.map((row) => (
              <div
                key={row.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  height: 62,
                  borderBottom: `2px solid ${RULE}`,
                }}
              >
                <div style={{ display: "flex", width: 28, fontSize: 28, color: INK_3 }}>{row.rank}</div>
                <div
                  style={{
                    display: "flex",
                    height: row.rank === "1" ? 26 : 18,
                    width: row.width,
                    backgroundColor: row.rank === "1" ? MARK : INK,
                    border: row.rank === "1" ? `2px solid ${INK}` : "none",
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
            borderTop: `2px solid ${INK}`,
            fontSize: 28,
            color: INK_3,
          }}
        >
          <div>Booking and promotion for independent venues</div>
          <div>Taste data from Qloo</div>
        </div>
      </div>
    ),
    size,
  );
}
