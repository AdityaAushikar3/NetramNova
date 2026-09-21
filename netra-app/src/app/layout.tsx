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
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900 selection:bg-blue-600/30 selection:text-blue-900 overflow-x-hidden">
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}

