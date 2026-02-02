/**
 * Pinata TUI Dashboard
 *
 * Interactive terminal interface for viewing scan results.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";

import type { Gap } from "../../core/scanner/types.js";

interface CachedResults {
  gaps: Gap[];
  targetDirectory: string;
  summary: {
    totalGaps: number;
    criticalGaps: number;
    highGaps: number;
    mediumGaps: number;
    lowGaps: number;
    score: number;
    grade: string;
  };
}

interface AppProps {
  results: CachedResults | null;
  loading: boolean;
  error: string | null;
}

type ViewMode = "list" | "detail";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "red",
  high: "yellow",
  medium: "blue",
  low: "gray",
};

export function App({ results, loading, error }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [scrollOffset, setScrollOffset] = useState(0);

  const gaps = results?.gaps ?? [];
  const maxVisible = 15;

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (viewMode === "list") {
      if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, gaps.length - 1);
          if (next >= scrollOffset + maxVisible) {
            setScrollOffset(next - maxVisible + 1);
          }
          return next;
        });
      } else if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          if (next < scrollOffset) {
            setScrollOffset(next);
          }
          return next;
        });
      } else if (key.return || input === "l") {
        setViewMode("detail");
      }
    } else if (viewMode === "detail") {
      if (key.escape || input === "h" || input === "q") {
        setViewMode("list");
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(prev + 1, gaps.length - 1));
      } else if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          {" "}Loading scan results...
        </Text>
      </Box>
    );
  }

  if (error !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Run `pinata analyze` first to scan for gaps.</Text>
        <Text color="gray" dimColor>Press q to exit</Text>
      </Box>
    );
  }

  if (results === null || gaps.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">No gaps found!</Text>
        <Text color="gray">Your codebase looks clean.</Text>
        <Text color="gray" dimColor>Press q to exit</Text>
      </Box>
    );
  }

  const selectedGap = gaps[selectedIndex];

  if (viewMode === "detail" && selectedGap !== undefined) {
    return <DetailView gap={selectedGap} index={selectedIndex} total={gaps.length} />;
  }

  return (
    <ListView
      results={results}
      gaps={gaps}
      selectedIndex={selectedIndex}
      scrollOffset={scrollOffset}
      maxVisible={maxVisible}
    />
  );
}

interface ListViewProps {
  results: CachedResults;
  gaps: Gap[];
  selectedIndex: number;
  scrollOffset: number;
  maxVisible: number;
}

function ListView({
  results,
  gaps,
  selectedIndex,
  scrollOffset,
  maxVisible,
}: ListViewProps): React.ReactElement {
  const visibleGaps = gaps.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Pinata Dashboard</Text>
        <Text color="gray"> - {results.targetDirectory}</Text>
      </Box>

      {/* Summary */}
      <Box marginBottom={1} flexDirection="row" gap={2}>
        <Text>
          Score: <Text color={getGradeColor(results.summary.grade)} bold>{results.summary.grade}</Text>
          {" "}({results.summary.score})
        </Text>
        <Text color="gray">|</Text>
        <Text>
          <Text color="red">{results.summary.criticalGaps} critical</Text>
          {" "}
          <Text color="yellow">{results.summary.highGaps} high</Text>
          {" "}
          <Text color="blue">{results.summary.mediumGaps} medium</Text>
          {" "}
          <Text color="gray">{results.summary.lowGaps} low</Text>
        </Text>
      </Box>

      {/* Gap list */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        <Box paddingX={1} borderBottom borderColor="gray">
          <Box width={4}><Text color="gray">#</Text></Box>
          <Box width={12}><Text color="gray">Severity</Text></Box>
          <Box width={24}><Text color="gray">Category</Text></Box>
          <Box><Text color="gray">Location</Text></Box>
        </Box>

        {visibleGaps.map((gap, i) => {
          const actualIndex = scrollOffset + i;
          const isSelected = actualIndex === selectedIndex;
          const color = SEVERITY_COLORS[gap.severity] ?? "white";

          return (
            <Box
              key={`${gap.filePath}:${gap.lineStart}:${gap.categoryId}`}
              paddingX={1}
              backgroundColor={isSelected ? "blue" : undefined}
            >
              <Box width={4}>
                <Text color={isSelected ? "white" : "gray"}>{actualIndex + 1}</Text>
              </Box>
              <Box width={12}>
                <Text color={isSelected ? "white" : color}>{gap.severity}</Text>
              </Box>
              <Box width={24}>
                <Text color={isSelected ? "white" : "cyan"}>
                  {gap.categoryId.slice(0, 22)}
                </Text>
              </Box>
              <Box>
                <Text color={isSelected ? "white" : "gray"}>
                  {formatPath(gap.filePath)}:{gap.lineStart}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {gaps.length > maxVisible && (
        <Box marginTop={1}>
          <Text color="gray">
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, gaps.length)} of {gaps.length}
          </Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          j/k: navigate | Enter/l: details | q: quit
        </Text>
      </Box>
    </Box>
  );
}

interface DetailViewProps {
  gap: Gap;
  index: number;
  total: number;
}

function DetailView({ gap, index, total }: DetailViewProps): React.ReactElement {
  const color = SEVERITY_COLORS[gap.severity] ?? "white";

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
        <Text bold color="cyan">{gap.categoryName}</Text>
        <Text color="gray">{index + 1}/{total}</Text>
      </Box>

      {/* Metadata */}
      <Box marginBottom={1} flexDirection="column">
        <Text>
          <Text color="gray">Severity: </Text>
          <Text color={color} bold>{gap.severity}</Text>
          <Text color="gray"> | Confidence: </Text>
          <Text>{gap.confidence}</Text>
          <Text color="gray"> | Priority: </Text>
          <Text>{gap.priority}</Text>
        </Text>
        <Text>
          <Text color="gray">File: </Text>
          <Text color="cyan">{gap.filePath}</Text>
        </Text>
        <Text>
          <Text color="gray">Line: </Text>
          <Text>{gap.lineStart}</Text>
          {gap.lineEnd !== gap.lineStart && (
            <Text>-{gap.lineEnd}</Text>
          )}
        </Text>
        <Text>
          <Text color="gray">Pattern: </Text>
          <Text>{gap.patternId}</Text>
          <Text color="gray"> ({gap.patternType})</Text>
        </Text>
      </Box>

      {/* Code snippet */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text color="gray" dimColor>Code:</Text>
        <Text>{gap.codeSnippet}</Text>
      </Box>

      {/* Explanation placeholder */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray" dimColor>Explanation:</Text>
        <Text>
          This pattern detects potential {gap.categoryName.toLowerCase()} vulnerabilities.
          Review the code to ensure proper input validation and sanitization.
        </Text>
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          j/k: prev/next | h/Esc: back to list | q: quit
        </Text>
      </Box>
    </Box>
  );
}

function formatPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case "A": return "green";
    case "B": return "cyan";
    case "C": return "yellow";
    case "D": return "red";
    case "F": return "red";
    default: return "white";
  }
}

export default App;
