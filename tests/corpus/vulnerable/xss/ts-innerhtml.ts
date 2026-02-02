// XSS via innerHTML
// Expected: xss at lines 5, 11

export function renderContent(content: string) {
  document.getElementById('content')!.innerHTML = content;  // Line 5: VULNERABLE
}

export function updateMessage(msg: string) {
  const el = document.querySelector('.message');
  if (el) {
    el.innerHTML = msg;  // Line 11: VULNERABLE
  }
}
