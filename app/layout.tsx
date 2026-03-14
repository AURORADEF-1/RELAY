import type { Metadata } from "next";
import { NotificationProvider } from "@/components/notification-provider";
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
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}
