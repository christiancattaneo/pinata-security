/**
 * TUI Dashboard Entry Point
 */

import React from "react";
import { render } from "ink";

import { App } from "./App.js";
import { loadScanResults } from "../results-cache.js";

export async function runDashboard(): Promise<void> {
  const projectRoot = process.cwd();

  // Start with loading state
  const { rerender, unmount, waitUntilExit } = render(
    <App results={null} loading={true} error={null} />
  );

  try {
    // Load cached results
    const result = await loadScanResults(projectRoot);

    if (!result.success) {
      rerender(<App results={null} loading={false} error={result.error.message} />);
    } else {
      const cached = result.data;
      rerender(
        <App
          results={{
            gaps: cached.gaps,
            targetDirectory: cached.targetDirectory,
            summary: {
              totalGaps: cached.gaps.length,
              criticalGaps: cached.gaps.filter((g) => g.severity === "critical").length,
              highGaps: cached.gaps.filter((g) => g.severity === "high").length,
              mediumGaps: cached.gaps.filter((g) => g.severity === "medium").length,
              lowGaps: cached.gaps.filter((g) => g.severity === "low").length,
              score: cached.score ?? 0,
              grade: cached.grade ?? "?",
            },
          }}
          loading={false}
          error={null}
        />
      );
    }

    await waitUntilExit();
  } catch (error) {
    rerender(
      <App
        results={null}
        loading={false}
        error={error instanceof Error ? error.message : "Unknown error"}
      />
    );
    await waitUntilExit();
  }
}

export { App } from "./App.js";
