# Safe: YAML with safe loader
# Expected: NO detections

import yaml
import json

def load_config(yaml_content: str):
    # Safe: using safe_load
    return yaml.safe_load(yaml_content)

def load_from_file(path: str):
    with open(path, 'r') as f:
        return yaml.safe_load(f)  # Safe

def parse_json(content: str):
    return json.loads(content)  # Safe: JSON parsing
