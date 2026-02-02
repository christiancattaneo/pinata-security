# XSS via Flask render_template_string
# Expected: xss at line 9

from flask import Flask, request, render_template_string

app = Flask(__name__)

@app.route('/render')
def render_page():
    content = request.args.get('content', '')
    return render_template_string(content)  # Line 9: VULNERABLE

@app.route('/greeting')
def greeting():
    name = request.args.get('name', 'Guest')
    return render_template_string(f"<h1>Hello {name}</h1>")  # Line 15: VULNERABLE
