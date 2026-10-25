import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velho Intelligence",
  description: "Evidence-backed company research for Velho Applied Intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
