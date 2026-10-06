import type { Metadata, Viewport } from "next";
import { AppRuntime } from "@/components/app-runtime";
import { NotificationProvider } from "@/components/notification-provider";
import { StartupSplash } from "@/components/startup-splash";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AssetCare+",
  description: "MLP Parts Request Workflow",
  applicationName: "AssetCare+",
  icons: {
    icon: [{ url: "/assetcare-plus-logo.png", type: "image/png" }],
    shortcut: "/assetcare-plus-logo.png",
    apple: "/assetcare-plus-logo.png",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ThemeProvider>
          <StartupSplash>
            <NotificationProvider>
              <AppRuntime>{children}</AppRuntime>
            </NotificationProvider>
          </StartupSplash>
        </ThemeProvider>
      </body>
    </html>
  );
}
