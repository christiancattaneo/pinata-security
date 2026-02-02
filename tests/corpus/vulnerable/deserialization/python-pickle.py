# Insecure Deserialization via pickle
# Expected: deserialization at lines 6, 12

import pickle
import yaml

def load_session(data: bytes):
    return pickle.loads(data)  # Line 6: VULNERABLE

def load_config(yaml_content: str):
    return yaml.load(yaml_content, Loader=yaml.Loader)  # Line 12: VULNERABLE (unsafe loader)

def load_cache(path: str):
    with open(path, 'rb') as f:
        return pickle.load(f)  # Line 17: VULNERABLE
