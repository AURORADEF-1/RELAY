import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RELAY — Aurora Systems",
    short_name: "RELAY",
    description: "Parts requests, job updates and collection alerts for MLP fitters.",
    start_url: "/requests",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#071221",
    icons: [
      {
        src: "/aurora-logo.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
