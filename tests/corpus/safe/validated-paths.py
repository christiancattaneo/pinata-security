# Safe: Validated file paths
# Expected: NO detections

import os
from pathlib import Path

UPLOAD_DIR = Path('/uploads')

def read_upload(filename: str) -> bytes:
    # Safe: path validation
    safe_name = os.path.basename(filename)
    path = UPLOAD_DIR / safe_name
    
    # Verify path is within allowed directory
    if not path.resolve().is_relative_to(UPLOAD_DIR.resolve()):
        raise ValueError("Invalid path")
    
    return path.read_bytes()

def save_file(filename: str, data: bytes):
    # Safe: using secure_filename equivalent
    safe_name = "".join(c for c in filename if c.isalnum() or c in '.-_')
    path = UPLOAD_DIR / safe_name
    path.write_bytes(data)
