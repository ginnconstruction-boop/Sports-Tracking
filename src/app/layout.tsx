import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracking the Game",
  description: "Tablet-first football stat tracking built around a rebuildable play log.",
  applicationName: "Tracking the Game"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
