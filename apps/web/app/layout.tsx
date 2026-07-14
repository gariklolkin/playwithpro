import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayWithPro — Where amateurs and pros play together",
  description:
    "Upload your game footage, book a video session with a verified pro, and get personal feedback — in your language.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col bg-bg text-text">
        {children}
      </body>
    </html>
  );
}
