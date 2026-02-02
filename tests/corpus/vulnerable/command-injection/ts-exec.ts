// Command Injection via exec
// Expected: command-injection at lines 6, 12

import { exec, execSync } from 'child_process';

export function runCommand(cmd: string) {
  exec('ls ' + cmd, (err, stdout) => console.log(stdout));  // Line 6: VULNERABLE
}

export function getFileInfo(filename: string): string {
  const result = execSync(`file ${filename}`);  // Line 12: VULNERABLE
  return result.toString();
}
