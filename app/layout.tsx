import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Recovery Lab — Prove the journey works",
  description: "An isolated laboratory for persistent reservation journeys, controlled faults, bounded agent recovery, and correlated evidence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body>
    </html>
  );
}
