import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tracking the Game",
    short_name: "TTG",
    description: "Fast football stat entry and reporting with offline-safe game sessions.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2eadc",
    theme_color: "#13221b",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        src: "/maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}

