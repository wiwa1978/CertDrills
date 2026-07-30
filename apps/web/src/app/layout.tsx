import type { ReactNode } from "react";
import { Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body className={`${outfit.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
