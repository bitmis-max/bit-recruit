import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@leenguyen/react-flip-clock-countdown/dist/index.css";
import "./globals.css";
import { PublicNavbar } from "../components/navigation/PublicNavbar";
import { PublicFooter } from "../components/navigation/PublicFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tuyển thành viên CLB BIT",
  description: "Cổng thông tin tuyển thành viên Câu lạc bộ BIT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PublicNavbar />
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
