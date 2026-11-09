import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "@leenguyen/react-flip-clock-countdown/dist/index.css";
import "./globals.css";
import { PublicNavbar } from "../components/navigation/PublicNavbar";
import { PublicFooter } from "../components/navigation/PublicFooter";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PublicNavbar />
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
