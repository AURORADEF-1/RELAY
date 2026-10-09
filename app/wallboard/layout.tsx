import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AssetCare+ Wallboard",
};

export default function WallboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
