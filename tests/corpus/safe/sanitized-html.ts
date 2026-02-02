// Safe: Sanitized HTML output
// Expected: NO detections

import DOMPurify from 'dompurify';

export function renderSafeContent(html: string) {
  const sanitized = DOMPurify.sanitize(html);  // Safe: sanitized before use
  document.getElementById('content')!.innerHTML = sanitized;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}

export function renderText(text: string) {
  document.getElementById('message')!.textContent = text;  // Safe: textContent
}
