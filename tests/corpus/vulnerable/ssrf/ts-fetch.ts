// SSRF via user-controlled URL
// Expected: ssrf at lines 5, 11

export async function fetchData(url: string) {
  const response = await fetch(url);  // Line 5: VULNERABLE
  return response.json();
}

export async function proxyRequest(targetUrl: string) {
  const data = await fetch(targetUrl, {  // Line 11: VULNERABLE
    headers: { 'X-Forwarded-For': 'internal' }
  });
  return data.text();
}
