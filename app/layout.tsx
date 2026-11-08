import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SiteSight AI · Evidence into confidence",
  description: "Construction progress and PPE inspection review workspace",
  icons: { icon: "/logo.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
