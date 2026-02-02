// Path Traversal via unsanitized paths
// Expected: path-traversal at lines 6, 12

import { readFileSync, writeFileSync } from 'fs';

export function loadTemplate(name: string): string {
  return readFileSync('/templates/' + name, 'utf8');  // Line 6: VULNERABLE
}

export function saveUserData(userId: string, data: string) {
  const path = `./data/users/${userId}.json`;
  writeFileSync(path, data);  // Line 12: VULNERABLE
}
