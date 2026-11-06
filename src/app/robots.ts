import type { MetadataRoute } from "next";

/** A private demo: nothing here should be crawled or indexed. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
