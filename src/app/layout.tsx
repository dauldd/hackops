import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notebook | Next.js + SQLite",
  description: "A simple notebook powered by Next.js and SQLite.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
