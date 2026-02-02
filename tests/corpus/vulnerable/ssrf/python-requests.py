# SSRF via user-controlled URL
# Expected: ssrf at lines 7, 13

import requests
from flask import Flask, request

def fetch_url(url: str):
    response = requests.get(url)  # Line 7: VULNERABLE (no URL validation)
    return response.text

@app.route('/proxy')
def proxy():
    target = request.args.get('url')
    return requests.get(target).content  # Line 13: VULNERABLE
