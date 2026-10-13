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

const SITE_URL = "https://stagehand-venues.vercel.app";
const TITLE = "Stagehand: artist shortlists and promo plans for venues";
const DESCRIPTION =
  "Shortlist artists for your venue from Qloo taste data, then get a promotion plan with partners, ad audiences and draft emails.";
const IMAGE_ALT = "Stagehand: shortlist artists for your venue, then plan the promotion.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Stagehand",
  authors: [{ name: "Adnan Husayn" }],
  keywords: ["independent venues", "artist booking", "venue promotion", "Qloo", "taste data", "live music"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Stagehand",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: IMAGE_ALT, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/twitter-image", width: 1200, height: 630, alt: IMAGE_ALT }],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
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
