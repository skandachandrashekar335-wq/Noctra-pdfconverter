import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";

/**
 * Self-hosted fonts (no external font CDN at runtime).
 *
 * Clash Display — headline / display typography   (Fontshare, free licence)
 * Satoshi        — body, navigation, labels        (Fontshare, free licence)
 * Instrument Serif Italic — single-word editorial emphasis (OFL)
 */
const clashDisplay = localFont({
  src: [
    { path: "./fonts/clash-display-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/clash-display-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/clash-display-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/clash-display-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-clash",
  display: "swap",
  adjustFontFallback: false,
});

const satoshi = localFont({
  src: [
    { path: "./fonts/satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  adjustFontFallback: false,
});

const editorialSerif = localFont({
  src: "./fonts/instrument-serif-italic.ttf",
  weight: "400",
  style: "italic",
  variable: "--font-editorial-serif",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Noctra — Dark Mode for Your Study Documents",
  description:
    "Transform bright study PDFs, Word documents and PowerPoints into comfortable dark-mode versions. Upload, convert, download — instantly.",
  keywords: ["dark mode", "PDF", "DOCX", "PPTX", "study", "document converter"],
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "Noctra — Dark Mode for Your Study Documents",
    description:
      "Your documents were never designed for dark mode. Noctra was.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${clashDisplay.variable} ${satoshi.variable} ${editorialSerif.variable}`}
    >
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
