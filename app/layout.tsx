import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Meedo Waterworks Alubijid – Billing System",
  description: "Official web and billing app of Meedo Waterworks Alubijid. Manage water accounts, bills, and payments efficiently for the local community in the Philippines.",
  icons: {
    icon: "https://meedo-alubijid-waterworks.com/meedo-logo-removebg.png",
    shortcut: "https://meedo-alubijid-waterworks.com/meedo-logo-removebg.png",
    apple: "https://meedo-alubijid-waterworks.com/meedo-logo-removebg.png",
  },
  openGraph: {
    title: "Meedo Waterworks Alubijid – Billing & Web App PH",
    description: "Official web and billing app of Meedo Waterworks Alubijid. Manage water accounts, bills, and payments efficiently for the local community in the Philippines.",
    url: "https://meedo-alubijid-waterworks.com",
    siteName: "Meedo Waterworks Alubijid",
    images: [
      {
        url: "https://meedo-alubijid-waterworks.com/meedo-logo-removebg.png",
        width: 800,
        height: 600,
        alt: "Meedo Waterworks Logo",
      },
    ],
    locale: "en_PH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meedo Waterworks Alubijid – Billing System",
    description: "Official web and billing app of Meedo Waterworks Alubijid. Manage water accounts, bills, and payments efficiently for the local community in the Philippines.",
    images: ["https://meedo-alubijid-waterworks.com/meedo-logo-removebg.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-dvh overflow-hidden bg-gray-50 text-foreground dark:bg-background">
        {children}
      </body>
    </html>
  );
}