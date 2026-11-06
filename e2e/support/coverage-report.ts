import { CoverageReport } from "monocart-coverage-reports";
import { coverageOptions } from "./coverage-options";

/**
 * Runs once after the suite: merges the coverage each test recorded and
 * prints a summary. Tests add their data as they finish (see ./test.ts), while
 * the server that serves the source maps is still running.
 */
export default async function globalTeardown() {
  if (process.env.E2E_NO_COVERAGE) return;
  await new CoverageReport(coverageOptions).generate();
}
