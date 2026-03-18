import type { Metadata } from "next";
import { LegalTermsGate } from "@/components/legal-terms-gate";
import { NotificationProvider } from "@/components/notification-provider";
import { NotificationToasts } from "@/components/notification-toasts";
import { StartupSplash } from "@/components/startup-splash";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RELAY",
  description: "MLP Parts Request Workflow",
  applicationName: "RELAY",
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
              <LegalTermsGate />
              <NotificationToasts />
              {children}
            </NotificationProvider>
          </StartupSplash>
        </ThemeProvider>
      </body>
    </html>
  );
}
