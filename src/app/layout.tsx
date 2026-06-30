import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DachuanPro-CRM",
  description: "大川机床客户关系管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full antialiased bg-gray-50 text-gray-900">

      <Script id="crypto-randomuuid-polyfill" strategy="beforeInteractive">

        {`

          (function () {

            if (typeof window === "undefined") return;

            var c = window.crypto;

            if (!c || c.randomUUID) return;

            var makeId = function () {

              return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {

                var r = Math.random() * 16 | 0;

                var v = ch === "x" ? r : (r & 3 | 8);

                return v.toString(16);

              });

            };

            try {

              Object.defineProperty(c, "randomUUID", {

                value: makeId,

                configurable: true

              });

            } catch (e) {

              c.randomUUID = makeId;

            }

          })();

        `}

      </Script>


        {children}
      </body>
    </html>
  );
}
