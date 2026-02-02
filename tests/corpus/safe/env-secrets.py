# Safe: Secrets from environment
# Expected: NO detections

import os

API_KEY = os.environ.get('API_KEY')  # Safe: from environment
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')  # Safe: from environment
JWT_SECRET = os.environ['JWT_SECRET']  # Safe: from environment

def get_config():
    return {
        'api_key': API_KEY,
        'db_password': os.environ.get('DB_PASSWORD'),
    }
