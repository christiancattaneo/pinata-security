/**
 * Vulnerable Test App
 * 
 * Intentionally vulnerable Express server for testing Pinata's
 * dynamic execution (Layer 5). DO NOT deploy this.
 */

import express from "express";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory "database"
const users = [
  { id: 1, username: "admin", password: "admin123", role: "admin" },
  { id: 2, username: "user", password: "user123", role: "user" },
  { id: 3, username: "guest", password: "guest123", role: "guest" },
];

// =============================================================================
// SQL INJECTION - String concatenation in query
// =============================================================================
app.get("/api/users/:id", (req, res) => {
  const userId = req.params.id;
  
  // VULNERABLE: String interpolation in SQL
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  
  // Simulate SQL execution (in real app this would hit a DB)
  // This simulates the vulnerability by evaluating the "query"
  try {
    // Check for injection patterns
    if (userId.includes("OR") || userId.includes("UNION") || userId.includes("--")) {
      // Injection detected - return all users (simulating successful attack)
      res.json({ query, results: users });
    } else {
      const id = parseInt(userId, 10);
      const user = users.find((u) => u.id === id);
      res.json({ query, results: user ? [user] : [] });
    }
  } catch (err) {
    res.status(500).json({ error: "Query failed" });
  }
});

// Boolean blind injection endpoint
app.get("/api/users/check/:id", (req, res) => {
  const userId = req.params.id;
  
  // VULNERABLE: Evaluates conditions in the "query"
  // Check for false condition first (more specific)
  if (userId.includes("'1'='2'")) {
    res.json({ exists: false, count: 0 });
  } else if (userId.includes("'1'='1'")) {
    res.json({ exists: true, count: users.length });
  } else {
    const id = parseInt(userId, 10);
    const exists = users.some((u) => u.id === id);
    res.json({ exists, count: exists ? 1 : 0 });
  }
});

// =============================================================================
// XSS - Reflected Cross-Site Scripting
// =============================================================================
app.get("/search", (req, res) => {
  const query = req.query.q as string || "";
  
  // VULNERABLE: User input directly in HTML without escaping
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Search Results</title></head>
    <body>
      <h1>Search Results for: ${query}</h1>
      <p>No results found.</p>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Stored XSS via comments
const comments: string[] = [];

app.post("/api/comments", (req, res) => {
  const { comment } = req.body;
  
  // VULNERABLE: Storing unsanitized input
  comments.push(comment);
  res.json({ success: true, id: comments.length });
});

app.get("/api/comments", (req, res) => {
  // VULNERABLE: Returning unsanitized HTML
  res.json({ comments });
});

// =============================================================================
// COMMAND INJECTION - Shell command execution
// =============================================================================
import { exec } from "child_process";

app.get("/api/ping", (req, res) => {
  const host = req.query.host as string || "localhost";
  
  // VULNERABLE: User input directly in exec() template literal
  // This pattern is detected by Pinata's ts-child-process-exec pattern
  const cmd = `ping -c 1 ${host}`;
  
  // Simulate execution (don't actually run for safety)
  // In a real app this would be: exec(cmd, (err, stdout) => ...)
  const isInjected = host.includes(";") || host.includes("|") || host.includes("`") || host.includes("$(");
  
  if (isInjected) {
    res.json({ 
      command: cmd, 
      output: "COMMAND INJECTION SUCCESSFUL",
      injected: true 
    });
  } else {
    res.json({ 
      command: cmd, 
      output: `PING ${host}: 1 packets transmitted, 1 received`,
      injected: false 
    });
  }
});

// =============================================================================
// PATH TRAVERSAL - Directory traversal
// =============================================================================
app.get("/api/files/:filename", (req, res) => {
  const filename = req.params.filename;
  
  // VULNERABLE: No path normalization or validation
  const filePath = `/uploads/${filename}`;
  
  // Check for traversal attempt
  if (filename.includes("..")) {
    res.json({
      path: filePath,
      traversal: true,
      content: "SENSITIVE FILE CONTENT: /etc/passwd",
    });
  } else {
    res.json({
      path: filePath,
      traversal: false,
      content: `Contents of ${filename}`,
    });
  }
});

// =============================================================================
// Server startup
// =============================================================================
const PORT = process.env.PORT || 3001;

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`Vulnerable test server running on port ${PORT}`);
  });
}

export { app };
