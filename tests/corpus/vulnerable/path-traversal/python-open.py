# Path Traversal via unsanitized file paths
# Expected: path-traversal at lines 5, 11

def read_config(filename: str) -> str:
    with open("/etc/app/" + filename, "r") as f:  # Line 5: VULNERABLE
        return f.read()

def read_upload(user_file: str) -> bytes:
    path = f"/uploads/{user_file}"
    with open(path, "rb") as f:  # Line 11: VULNERABLE
        return f.read()

def write_log(logname: str, content: str):
    with open("/var/log/app/" + logname, "w") as f:  # Line 16: VULNERABLE
        f.write(content)
