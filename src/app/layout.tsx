import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stagehand | Booking and promotion for independent venues",
  description:
    "An agent that uses Qloo's taste graph to shortlist touring artists for your city and build a cross-domain promo plan.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-ink-100 antialiased">{children}</body>
    </html>
  );
}
