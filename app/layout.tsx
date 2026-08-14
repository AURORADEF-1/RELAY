import type { Metadata, Viewport } from "next";
<<<<<<< HEAD
import { AppRuntime } from "@/components/app-runtime";
=======
import { LegalTermsGate } from "@/components/legal-terms-gate";
import { DymoPrintStation } from "@/components/dymo-print-station";
import { GlobalTicketChat } from "@/components/global-ticket-chat";
>>>>>>> 93624dc (Make ticket chat global and responsive)
import { NotificationProvider } from "@/components/notification-provider";
import { StartupSplash } from "@/components/startup-splash";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RELAY",
  description: "MLP Parts Request Workflow",
  applicationName: "RELAY",
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
    <html lang="en">
      <body>
        <ThemeProvider>
          <StartupSplash>
            <NotificationProvider>
<<<<<<< HEAD
              <AppRuntime>{children}</AppRuntime>
=======
              <LegalTermsGate />
              <NotificationToasts />
              <DymoPrintStation />
              <GlobalTicketChat />
              {children}
>>>>>>> 93624dc (Make ticket chat global and responsive)
            </NotificationProvider>
          </StartupSplash>
        </ThemeProvider>
      </body>
    </html>
  );
}
