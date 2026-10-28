import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import { WalletProvider } from "@/lib/wallet";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { themeScript } from "@/components/site/theme-toggle";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Zoza — The AI Token Launch Agent on Robinhood Chain",
    template: "%s — Zoza",
  },
  description:
    "Say the word, it’s on-chain. Zoza turns a name and a ticker into a live token on Robinhood Chain — no code, no gatekeepers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <WalletProvider>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}
