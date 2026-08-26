import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL("https://cursed-chest-raid.l2pro4u.chatgpt.site"),
  title: "Cursed Chest — Pirate Social Deduction",
  description: "Find the keys, expose the cursed crew, and discover what waits inside the chest.",
  manifest: "/manifest.webmanifest",
  applicationName: "Cursed Chest",
  appleWebApp: {
    capable: true,
    title: "Cursed Chest",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Cursed Chest",
    description: "Trust the crew. Find the keys. Fear what waits inside.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Cursed Chest pirate social deduction game" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cursed Chest",
    description: "Trust the crew. Find the keys. Fear what waits inside.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PwaRegister /></body></html>;
}
