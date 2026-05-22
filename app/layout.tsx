import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC 311 Quick-File",
  description:
    "Describe a problem in plain language and get the right NYC 311 complaint form, a paste-ready submission, and answers from the official 311 knowledge base.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
