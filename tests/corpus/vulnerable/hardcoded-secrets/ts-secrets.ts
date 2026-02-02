// Hardcoded Secrets
// Expected: hardcoded-secrets at lines 4, 5, 6

const STRIPE_KEY = "sk_FAKE_test";  // Line 4: VULNERABLE
const PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";  // Line 5: VULNERABLE
const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";  // Line 6: VULNERABLE

export function getConfig() {
  return {
    stripeKey: STRIPE_KEY,
    jwtToken: JWT_TOKEN,
  };
}
