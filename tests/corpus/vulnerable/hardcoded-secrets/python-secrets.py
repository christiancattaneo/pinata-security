# Hardcoded Secrets
# Expected: hardcoded-secrets at lines 4, 5, 6, 7

API_KEY = "sk_FAKE_test_key_not_real_1234"  # Line 4: VULNERABLE
AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"  # Line 5: VULNERABLE
AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"  # Line 6: VULNERABLE
JWT_SECRET = "super-secret-jwt-signing-key-12345"  # Line 7: VULNERABLE

def get_api_key():
    return API_KEY
