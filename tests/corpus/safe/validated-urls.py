# Safe: URL validation
# Expected: NO detections

import requests
from urllib.parse import urlparse

ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com']

def fetch_safe_url(url: str) -> bytes:
    parsed = urlparse(url)
    
    # Validate scheme and host
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("Invalid scheme")
    if parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("Host not allowed")
    
    response = requests.get(url, timeout=10)
    return response.content

def fetch_internal_api(endpoint: str):
    # Safe: using hardcoded base URL
    base_url = "https://api.internal.example.com"
    url = f"{base_url}/{endpoint}"
    return requests.get(url).json()
