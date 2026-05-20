import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCode = Source_Code_Pro({
  variable: "--font-source-code",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Health Dashboard",
  description: "Suivi santé & performance personnel",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#061b31",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${sourceCode.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-[var(--color-body)] dark:bg-[#0d1520] dark:text-white/70">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
