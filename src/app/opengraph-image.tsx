import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Stagehand: shortlist artists for your venue, then plan the promotion.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROOM = "#05070c";
const TEXT = "#f4f1ea";
const KEY = "#ffb44a";
const MUTED = "#9aa3b5";

function font(file: string) {
  return readFile(path.join(process.cwd(), "assets", "fonts", file));
}

export default async function OpengraphImage() {
  const [regular, italic, mono] = await Promise.all([
    font("BodoniModa-Regular.woff"),
    font("BodoniModa-Italic.woff"),
    font("DMMono-Medium.woff"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: ROOM,
          backgroundImage:
            "radial-gradient(ellipse 760px 520px at 100% 0%, rgba(255,180,74,0.2), rgba(255,180,74,0) 70%)",
          color: TEXT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: KEY,
              boxShadow: "0 0 28px 6px rgba(255,180,74,0.65)",
              marginRight: 20,
            }}
          />
          <div style={{ display: "flex", fontFamily: "Bodoni", fontStyle: "italic", fontSize: 44 }}>Stagehand</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Bodoni",
            fontSize: 92,
            lineHeight: 1.06,
            letterSpacing: -2,
          }}
        >
          <div style={{ display: "flex" }}>Shortlist artists</div>
          <div style={{ display: "flex" }}>for your venue,</div>
          <div style={{ display: "flex", color: KEY, fontStyle: "italic" }}>then plan the promotion.</div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "DM Mono",
            fontSize: 22,
            letterSpacing: 3,
            color: MUTED,
          }}
        >
          QLOO TASTE DATA / BOOKING AND PROMOTION AGENT
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bodoni", data: regular, style: "normal", weight: 400 },
        { name: "Bodoni", data: italic, style: "italic", weight: 400 },
        { name: "DM Mono", data: mono, style: "normal", weight: 500 },
      ],
    },
  );
}
