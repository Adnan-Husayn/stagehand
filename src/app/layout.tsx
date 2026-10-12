import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, DM_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Display face with the optical size axis, so large headlines get the fine hairlines.
const display = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-display",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

// Entrance animations only hide content once this class is set, so the page still shows without
// scripts. If the app bundle never starts, the page is revealed after a few seconds anyway.
const JS_FLAG = `(function(){var d=document.documentElement;d.classList.add("js");setTimeout(function(){d.classList.add("is-ready")},4000)})()`;

const TITLE = "Stagehand | Booking and promotion for independent venues";
const DESCRIPTION =
  "Stagehand uses Qloo taste data to shortlist touring artists for your city, then builds a promo plan with partners, ad audiences and draft emails.";

function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(host ? `https://${host}` : "http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Stagehand",
  openGraph: {
    type: "website",
    siteName: "Stagehand",
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
  themeColor: "#05070c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
