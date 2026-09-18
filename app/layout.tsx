import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hazemate",
  description: "Your mate for clearer outdoor decisions in Singapore.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hazemate",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/mascot.svg",
    apple: "/mascot.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#eaf6ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
