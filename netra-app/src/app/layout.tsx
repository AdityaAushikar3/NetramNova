import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AuthGuard } from "../components/AuthGuard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetramNova - Clinical DR Screening Workstation",
  description: "AI-powered offline-first Diabetic Retinopathy screening workstation for rural India PHCs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-on_surface selection:bg-primary/30 selection:text-primary overflow-x-hidden">
        <div className="ambient-glow-wrapper">
          <div className="glow-blob glow-blob-1"></div>
          <div className="glow-blob glow-blob-2"></div>
          <div className="glow-blob glow-blob-3"></div>
        </div>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}

