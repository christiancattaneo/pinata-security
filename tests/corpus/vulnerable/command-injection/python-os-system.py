# Command Injection via os.system
# Expected: command-injection at lines 7, 12

import os
import subprocess

def run_script(script_name: str):
    os.system(f"./scripts/{script_name}.sh")  # Line 7: VULNERABLE

def list_files(directory: str):
    result = os.popen("ls " + directory)  # Line 12: VULNERABLE
    return result.read()

def ping_host(host: str):
    subprocess.call(f"ping -c 4 {host}", shell=True)  # Line 17: VULNERABLE
