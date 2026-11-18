
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import TopToolbar from "./components/toptoolbar";
import SelectToSpeak from "./components/select-to-speak";
import AIFarmerChatbot from "./components/aifarmerchatbot";
import { GreenhouseModeProvider } from "./components/GreenhouseModeProvider";

import "./globals.css";
import "./greenmind-full.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GreenMind Smart Agriculture",
  description:
    "AI-powered smart greenhouse monitoring, plant health tracking and irrigation management.",
  applicationName: "GreenMind Smart Agriculture",
  keywords: [
    "GreenMind",
    "Smart Agriculture",
    "Smart Greenhouse",
    "AI Plant Disease Detection",
    "Smart Irrigation",
    "IoT Agriculture",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen`}
      >
        <GreenhouseModeProvider>
          <TopToolbar />

          <SelectToSpeak />

          <main className="gm-site-content">
            {children}
          </main>

          <AIFarmerChatbot />
        </GreenhouseModeProvider>
      </body>
    </html>
  );
}
