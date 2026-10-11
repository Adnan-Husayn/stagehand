import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Source_Code_Pro } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
