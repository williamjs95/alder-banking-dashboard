import { CoverageReport } from "monocart-coverage-reports";
import { coverageOptions } from "./coverage-options";

/** Runs once before the suite: discards coverage left over from an earlier run. */
export default async function globalSetup() {
  if (process.env.E2E_NO_COVERAGE) return;
  await new CoverageReport(coverageOptions).cleanCache();
}
