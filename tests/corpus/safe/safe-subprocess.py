# Safe: Subprocess with argument lists
# Expected: NO detections

import subprocess
import shlex

def run_ls(directory: str):
    # Safe: using list arguments, not shell=True
    result = subprocess.run(['ls', '-la', directory], capture_output=True, text=True)
    return result.stdout

def ping_host(host: str):
    # Safe: using list arguments
    result = subprocess.run(['ping', '-c', '4', host], capture_output=True)
    return result.returncode == 0

def run_with_shlex(cmd: str):
    # Safe: properly escaped
    args = shlex.split(cmd)
    subprocess.run(args)
