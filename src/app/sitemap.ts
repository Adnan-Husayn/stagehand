import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://stagehand-venues.vercel.app/", changeFrequency: "monthly", priority: 1 }];
}
