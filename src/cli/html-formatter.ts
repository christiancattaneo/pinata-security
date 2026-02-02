/**
 * HTML output formatter for standalone reports.
 *
 * Generates a self-contained HTML file with embedded CSS/JS
 * that can be viewed in any browser.
 */

import type { ScanResult, Gap } from "../core/scanner/types.js";

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get severity badge class
 */
function getSeverityClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "severity-critical";
    case "high":
      return "severity-high";
    case "medium":
      return "severity-medium";
    case "low":
      return "severity-low";
    default:
      return "severity-low";
  }
}

/**
 * Get domain badge class
 */
function getDomainClass(domain: string): string {
  switch (domain) {
    case "security":
      return "domain-security";
    case "data":
      return "domain-data";
    case "concurrency":
      return "domain-concurrency";
    case "input":
      return "domain-input";
    default:
      return "domain-other";
  }
}

/**
 * Generate gaps table rows
 */
function generateGapsTable(gaps: Gap[]): string {
  if (gaps.length === 0) {
    return '<tr><td colspan="6" class="no-results">No gaps detected</td></tr>';
  }

  return gaps
    .map(
      (gap) => `
    <tr class="gap-row" data-severity="${gap.severity}" data-domain="${gap.domain}">
      <td>
        <span class="badge ${getSeverityClass(gap.severity)}">${gap.severity}</span>
      </td>
      <td>
        <span class="badge ${getDomainClass(gap.domain)}">${gap.domain}</span>
      </td>
      <td>
        <strong>${escapeHtml(gap.categoryName)}</strong>
        <br>
        <small class="category-id">${gap.categoryId}</small>
      </td>
      <td>
        <code class="file-path">${escapeHtml(gap.filePath)}</code>
        <br>
        <small>Line ${gap.lineStart}${gap.lineEnd && gap.lineEnd !== gap.lineStart ? `-${gap.lineEnd}` : ""}</small>
      </td>
      <td>
        <span class="confidence confidence-${gap.confidence}">${gap.confidence}</span>
      </td>
      <td>
        ${gap.codeSnippet ? `<pre class="code-snippet"><code>${escapeHtml(gap.codeSnippet)}</code></pre>` : "-"}
      </td>
    </tr>
  `
    )
    .join("");
}

/**
 * Generate summary statistics
 */
function generateSummary(result: ScanResult): string {
  const bySeverity = result.summary.bySeverity ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const byDomain = result.summary.byDomain ?? {};

  return `
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Total Gaps</h3>
        <div class="stat-value">${result.summary.totalGaps}</div>
      </div>
      <div class="summary-card">
        <h3>Pinata Score</h3>
        <div class="stat-value score-${result.score.overall >= 80 ? "good" : result.score.overall >= 60 ? "moderate" : "poor"}">${result.score.overall}</div>
        <small>out of 100</small>
      </div>
      <div class="summary-card">
        <h3>Files Scanned</h3>
        <div class="stat-value">${result.fileStats.totalFiles}</div>
        <small>${result.fileStats.filesWithGaps} with gaps</small>
      </div>
      <div class="summary-card">
        <h3>Duration</h3>
        <div class="stat-value">${(result.durationMs / 1000).toFixed(2)}s</div>
      </div>
    </div>
    
    <div class="charts-row">
      <div class="chart-card">
        <h3>By Severity</h3>
        <div class="bar-chart">
          ${bySeverity.critical > 0 ? `<div class="bar critical" style="width: ${Math.min(100, (bySeverity.critical / result.summary.totalGaps) * 100)}%"><span>Critical: ${bySeverity.critical}</span></div>` : ""}
          ${bySeverity.high > 0 ? `<div class="bar high" style="width: ${Math.min(100, (bySeverity.high / result.summary.totalGaps) * 100)}%"><span>High: ${bySeverity.high}</span></div>` : ""}
          ${bySeverity.medium > 0 ? `<div class="bar medium" style="width: ${Math.min(100, (bySeverity.medium / result.summary.totalGaps) * 100)}%"><span>Medium: ${bySeverity.medium}</span></div>` : ""}
          ${bySeverity.low > 0 ? `<div class="bar low" style="width: ${Math.min(100, (bySeverity.low / result.summary.totalGaps) * 100)}%"><span>Low: ${bySeverity.low}</span></div>` : ""}
        </div>
      </div>
      <div class="chart-card">
        <h3>By Domain</h3>
        <div class="domain-list">
          ${Object.entries(byDomain)
            .sort((a, b) => b[1] - a[1])
            .map(([domain, count]) => `<div class="domain-item"><span class="badge ${getDomainClass(domain)}">${domain}</span>: ${count}</div>`)
            .join("")}
        </div>
      </div>
    </div>
  `;
}

/**
 * Format scan results as standalone HTML
 */
export function formatHtml(result: ScanResult): string {
  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinata Scan Report</title>
  <style>
    :root {
      --color-bg: #0d1117;
      --color-surface: #161b22;
      --color-border: #30363d;
      --color-text: #c9d1d9;
      --color-text-muted: #8b949e;
      --color-critical: #f85149;
      --color-high: #db6d28;
      --color-medium: #d29922;
      --color-low: #3fb950;
      --color-security: #f85149;
      --color-data: #58a6ff;
      --color-concurrency: #bc8cff;
      --color-input: #d29922;
      --color-other: #8b949e;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1400px; margin: 0 auto; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--color-border);
    }
    
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.25rem; margin-bottom: 1rem; color: var(--color-text); }
    h3 { font-size: 1rem; color: var(--color-text-muted); margin-bottom: 0.5rem; }
    
    .meta { color: var(--color-text-muted); font-size: 0.875rem; }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 1rem;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--color-text);
    }
    
    .stat-value.score-good { color: var(--color-low); }
    .stat-value.score-moderate { color: var(--color-medium); }
    .stat-value.score-poor { color: var(--color-critical); }
    
    .charts-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .chart-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 1rem;
    }
    
    .bar-chart { display: flex; flex-direction: column; gap: 0.5rem; }
    .bar {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      min-width: 100px;
    }
    .bar.critical { background: var(--color-critical); }
    .bar.high { background: var(--color-high); }
    .bar.medium { background: var(--color-medium); }
    .bar.low { background: var(--color-low); }
    
    .domain-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .domain-item { display: flex; align-items: center; gap: 0.5rem; }
    
    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    
    .filter-group { display: flex; align-items: center; gap: 0.5rem; }
    .filter-group label { color: var(--color-text-muted); font-size: 0.875rem; }
    .filter-group select {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      padding: 0.5rem;
      border-radius: 4px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--color-surface);
      border-radius: 6px;
      overflow: hidden;
    }
    
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
    }
    
    th {
      background: var(--color-bg);
      font-weight: 600;
      color: var(--color-text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .severity-critical { background: var(--color-critical); color: white; }
    .severity-high { background: var(--color-high); color: white; }
    .severity-medium { background: var(--color-medium); color: black; }
    .severity-low { background: var(--color-low); color: black; }
    
    .domain-security { background: rgba(248, 81, 73, 0.2); color: var(--color-security); }
    .domain-data { background: rgba(88, 166, 255, 0.2); color: var(--color-data); }
    .domain-concurrency { background: rgba(188, 140, 255, 0.2); color: var(--color-concurrency); }
    .domain-input { background: rgba(210, 153, 34, 0.2); color: var(--color-input); }
    .domain-other { background: rgba(139, 148, 158, 0.2); color: var(--color-other); }
    
    .confidence { font-size: 0.75rem; }
    .confidence-high { color: var(--color-low); }
    .confidence-medium { color: var(--color-medium); }
    .confidence-low { color: var(--color-text-muted); }
    
    .file-path { font-size: 0.875rem; }
    .category-id { color: var(--color-text-muted); }
    
    .code-snippet {
      background: var(--color-bg);
      padding: 0.5rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.75rem;
      max-width: 300px;
    }
    
    .code-snippet code {
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    .no-results {
      text-align: center;
      color: var(--color-text-muted);
      padding: 2rem;
    }
    
    footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
      text-align: center;
      color: var(--color-text-muted);
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Pinata Scan Report</h1>
      <div class="meta">Generated: ${generatedAt}</div>
    </header>
    
    <section id="summary">
      <h2>Summary</h2>
      ${generateSummary(result)}
    </section>
    
    <section id="gaps">
      <h2>Detected Gaps</h2>
      
      <div class="filters">
        <div class="filter-group">
          <label for="severity-filter">Severity:</label>
          <select id="severity-filter" onchange="filterTable()">
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="domain-filter">Domain:</label>
          <select id="domain-filter" onchange="filterTable()">
            <option value="">All</option>
            <option value="security">Security</option>
            <option value="data">Data</option>
            <option value="concurrency">Concurrency</option>
            <option value="input">Input</option>
          </select>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Domain</th>
            <th>Category</th>
            <th>Location</th>
            <th>Confidence</th>
            <th>Code</th>
          </tr>
        </thead>
        <tbody id="gaps-table">
          ${generateGapsTable(result.gaps)}
        </tbody>
      </table>
    </section>
    
    <footer>
      Generated by Pinata v${result.version ?? "0.1.0"}
    </footer>
  </div>
  
  <script>
    function filterTable() {
      const severityFilter = document.getElementById('severity-filter').value;
      const domainFilter = document.getElementById('domain-filter').value;
      const rows = document.querySelectorAll('.gap-row');
      
      rows.forEach(row => {
        const severity = row.dataset.severity;
        const domain = row.dataset.domain;
        
        const matchesSeverity = !severityFilter || severity === severityFilter;
        const matchesDomain = !domainFilter || domain === domainFilter;
        
        row.style.display = matchesSeverity && matchesDomain ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
}
