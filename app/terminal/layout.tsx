import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RELAY Front Counter Terminal",
};

export default function TerminalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
