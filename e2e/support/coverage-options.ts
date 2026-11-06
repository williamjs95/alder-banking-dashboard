import { join } from "node:path";
import type { CoverageReportOptions } from "monocart-coverage-reports";

/**
 * Coverage of the application's own client code, measured in the browser.
 * Framework chunks and the vendored shadcn/ui primitives are left out.
 */
export const coverageOptions: CoverageReportOptions = {
  name: "Alder end-to-end coverage",
  outputDir: join(process.cwd(), "coverage", "e2e"),
  reports: ["console-summary", "v8", "json-summary"],
  entryFilter: (entry) => entry.url.includes("/_next/static/chunks/"),
  sourceFilter: (sourcePath) =>
    sourcePath.includes("src/") &&
    !sourcePath.includes("node_modules") &&
    !sourcePath.includes("src/components/ui/"),
};
