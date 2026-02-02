/**
 * Pinata VS Code Extension
 *
 * Provides inline security analysis with squiggle underlining,
 * hover explanations, and quick fix suggestions.
 */

import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Diagnostic collection for Pinata findings
let diagnosticCollection: vscode.DiagnosticCollection;

// Gap cache for current workspace
interface Gap {
  categoryId: string;
  categoryName: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  codeSnippet: string;
  patternId: string;
}

let gapCache: Map<string, Gap[]> = new Map();

export function activate(context: vscode.ExtensionContext): void {
  console.log("Pinata extension activating...");

  // Create diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection("pinata");
  context.subscriptions.push(diagnosticCollection);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("pinata.scan", () => scanWorkspace()),
    vscode.commands.registerCommand("pinata.scanFile", () => scanCurrentFile()),
    vscode.commands.registerCommand("pinata.explain", explainGap)
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ["python", "typescript", "javascript", "typescriptreact", "javascriptreact"],
      { provideHover }
    )
  );

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ["python", "typescript", "javascript", "typescriptreact", "javascriptreact"],
      { provideCodeActions },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Watch for file saves if enabled
  const config = vscode.workspace.getConfiguration("pinata");
  if (config.get<boolean>("enableOnSave")) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(onDocumentSave)
    );
  }

  // Initial scan on activation
  vscode.window.showInformationMessage("Pinata: Security analysis ready. Run 'Pinata: Scan Workspace' to start.");
}

export function deactivate(): void {
  diagnosticCollection.clear();
}

/**
 * Scan the entire workspace
 */
async function scanWorkspace(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }

  const folder = workspaceFolders[0];
  if (!folder) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Pinata: Scanning workspace...",
      cancellable: false,
    },
    async () => {
      try {
        const { stdout } = await execAsync(`npx pinata analyze "${folder.uri.fsPath}" --output json --quiet`, {
          maxBuffer: 50 * 1024 * 1024,
        });

        const result = JSON.parse(stdout);
        updateDiagnostics(result.gaps ?? []);
        
        const gapCount = result.gaps?.length ?? 0;
        vscode.window.showInformationMessage(
          `Pinata: Found ${gapCount} gap${gapCount === 1 ? "" : "s"}`
        );
      } catch (error) {
        console.error("Pinata scan error:", error);
        vscode.window.showErrorMessage(
          `Pinata scan failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  );
}

/**
 * Scan the current file only
 */
async function scanCurrentFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No file open");
    return;
  }

  const filePath = editor.document.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Pinata: Scanning file...",
      cancellable: false,
    },
    async () => {
      try {
        const { stdout } = await execAsync(`npx pinata analyze "${filePath}" --output json --quiet`);

        const result = JSON.parse(stdout);
        const fileGaps = (result.gaps ?? []).filter((g: Gap) => g.filePath === filePath);
        
        // Update diagnostics for this file only
        updateFileDiagnostics(editor.document.uri, fileGaps);
        
        vscode.window.showInformationMessage(
          `Pinata: Found ${fileGaps.length} gap${fileGaps.length === 1 ? "" : "s"} in this file`
        );
      } catch (error) {
        console.error("Pinata scan error:", error);
        vscode.window.showErrorMessage(
          `Pinata scan failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  );
}

/**
 * Update diagnostics for all files
 */
function updateDiagnostics(gaps: Gap[]): void {
  diagnosticCollection.clear();
  gapCache.clear();

  // Group gaps by file
  const gapsByFile = new Map<string, Gap[]>();
  for (const gap of gaps) {
    const existing = gapsByFile.get(gap.filePath) ?? [];
    existing.push(gap);
    gapsByFile.set(gap.filePath, existing);
  }

  // Create diagnostics for each file
  for (const [filePath, fileGaps] of gapsByFile) {
    const uri = vscode.Uri.file(filePath);
    const diagnostics = fileGaps.map(gapToDiagnostic);
    diagnosticCollection.set(uri, diagnostics);
    gapCache.set(filePath, fileGaps);
  }
}

/**
 * Update diagnostics for a single file
 */
function updateFileDiagnostics(uri: vscode.Uri, gaps: Gap[]): void {
  const diagnostics = gaps.map(gapToDiagnostic);
  diagnosticCollection.set(uri, diagnostics);
  gapCache.set(uri.fsPath, gaps);
}

/**
 * Convert a gap to a VS Code diagnostic
 */
function gapToDiagnostic(gap: Gap): vscode.Diagnostic {
  const range = new vscode.Range(
    gap.lineStart - 1, // VS Code is 0-indexed
    gap.columnStart,
    gap.lineEnd - 1,
    gap.columnEnd
  );

  const severity = severityToDiagnosticSeverity(gap.severity);

  const diagnostic = new vscode.Diagnostic(
    range,
    `[Pinata] ${gap.categoryName}: ${gap.codeSnippet.slice(0, 50)}...`,
    severity
  );

  diagnostic.source = "pinata";
  diagnostic.code = gap.categoryId;

  return diagnostic;
}

/**
 * Map gap severity to VS Code diagnostic severity
 */
function severityToDiagnosticSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case "critical":
    case "high":
      return vscode.DiagnosticSeverity.Error;
    case "medium":
      return vscode.DiagnosticSeverity.Warning;
    case "low":
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

/**
 * Provide hover information for gaps
 */
function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | undefined {
  const gaps = gapCache.get(document.uri.fsPath);
  if (!gaps) return undefined;

  const gap = gaps.find((g) => {
    const range = new vscode.Range(g.lineStart - 1, g.columnStart, g.lineEnd - 1, g.columnEnd);
    return range.contains(position);
  });

  if (!gap) return undefined;

  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`## ${gap.categoryName}\n\n`);
  markdown.appendMarkdown(`**Severity:** ${gap.severity}\n\n`);
  markdown.appendMarkdown(`**Confidence:** ${gap.confidence}\n\n`);
  markdown.appendMarkdown(`**Pattern:** ${gap.patternId}\n\n`);
  markdown.appendMarkdown(`---\n\n`);
  markdown.appendMarkdown(`*Run "Pinata: Explain This Gap" for detailed explanation*`);

  return new vscode.Hover(markdown);
}

/**
 * Provide code actions (quick fixes) for gaps
 */
function provideCodeActions(
  document: vscode.TextDocument,
  range: vscode.Range
): vscode.CodeAction[] {
  const gaps = gapCache.get(document.uri.fsPath);
  if (!gaps) return [];

  const gap = gaps.find((g) => {
    const gapRange = new vscode.Range(g.lineStart - 1, g.columnStart, g.lineEnd - 1, g.columnEnd);
    return gapRange.intersection(range);
  });

  if (!gap) return [];

  const actions: vscode.CodeAction[] = [];

  // Explain action
  const explainAction = new vscode.CodeAction(
    "Explain this vulnerability",
    vscode.CodeActionKind.QuickFix
  );
  explainAction.command = {
    command: "pinata.explain",
    title: "Explain",
    arguments: [gap],
  };
  actions.push(explainAction);

  // Suppress action (adds comment)
  const suppressAction = new vscode.CodeAction(
    "Suppress this warning",
    vscode.CodeActionKind.QuickFix
  );
  suppressAction.edit = new vscode.WorkspaceEdit();
  suppressAction.edit.insert(
    document.uri,
    new vscode.Position(gap.lineStart - 1, 0),
    `# pinata-ignore: ${gap.categoryId}\n`
  );
  actions.push(suppressAction);

  return actions;
}

/**
 * Explain a gap using AI
 */
async function explainGap(gap?: Gap): Promise<void> {
  if (!gap) {
    vscode.window.showWarningMessage("No gap selected");
    return;
  }

  const config = vscode.workspace.getConfiguration("pinata");
  const useAI = config.get<boolean>("aiExplanations");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Pinata: Getting explanation...",
      cancellable: false,
    },
    async () => {
      // For now, show a simple explanation
      // In full implementation, this would call the AI service
      const panel = vscode.window.createWebviewPanel(
        "pinataExplanation",
        `Pinata: ${gap.categoryName}`,
        vscode.ViewColumn.Beside,
        {}
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            h1 { color: var(--vscode-editor-foreground); }
            .severity { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .critical { background: #ff4444; color: white; }
            .high { background: #ffaa00; color: black; }
            .medium { background: #4488ff; color: white; }
            .low { background: #666666; color: white; }
            code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; }
            pre { background: var(--vscode-textCodeBlock-background); padding: 12px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>${gap.categoryName}</h1>
          <p><span class="severity ${gap.severity}">${gap.severity.toUpperCase()}</span></p>
          
          <h2>Location</h2>
          <p><code>${gap.filePath}:${gap.lineStart}</code></p>
          
          <h2>Code</h2>
          <pre>${escapeHtml(gap.codeSnippet)}</pre>
          
          <h2>Pattern</h2>
          <p><code>${gap.patternId}</code></p>
          
          <h2>Explanation</h2>
          <p>This code pattern may introduce a ${gap.categoryName.toLowerCase()} vulnerability. 
          Review the code to ensure proper input validation and sanitization.</p>
          
          <h2>Remediation</h2>
          <p>Apply appropriate security controls for this type of vulnerability. 
          Run <code>pinata explain --ai</code> for AI-powered detailed remediation steps.</p>
        </body>
        </html>
      `;
    }
  );
}

/**
 * Handle document save event
 */
function onDocumentSave(document: vscode.TextDocument): void {
  const supportedLanguages = ["python", "typescript", "javascript", "typescriptreact", "javascriptreact"];
  if (supportedLanguages.includes(document.languageId)) {
    vscode.commands.executeCommand("pinata.scanFile");
  }
}

/**
 * Escape HTML for webview
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
