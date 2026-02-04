/**
 * Tests for the exploit payload library
 */

import { describe, it, expect } from "vitest";
import {
  SQL_INJECTION_PAYLOADS,
  XSS_PAYLOADS,
  COMMAND_INJECTION_PAYLOADS,
  PATH_TRAVERSAL_PAYLOADS,
  SSRF_PAYLOADS,
  XXE_PAYLOADS,
  AUTH_BYPASS_PAYLOADS,
  IDOR_PAYLOADS,
  OPEN_REDIRECT_PAYLOADS,
  mutatePayload,
  getPayloadsForCategory,
  getPayloadsWithMutations,
  MUTATION_STRATEGIES,
} from "../../src/execution/payloads.js";

describe("Exploit Payload Library", () => {
  describe("SQL Injection Payloads", () => {
    it("has boolean blind payloads", () => {
      expect(SQL_INJECTION_PAYLOADS.boolean.length).toBeGreaterThan(5);
      expect(SQL_INJECTION_PAYLOADS.boolean).toContain("' OR '1'='1");
    });

    it("has UNION payloads", () => {
      expect(SQL_INJECTION_PAYLOADS.union.length).toBeGreaterThan(3);
      expect(SQL_INJECTION_PAYLOADS.union.some(p => p.includes("UNION"))).toBe(true);
    });

    it("has time-based payloads", () => {
      expect(SQL_INJECTION_PAYLOADS.time.length).toBeGreaterThan(2);
      expect(SQL_INJECTION_PAYLOADS.time.some(p => p.includes("SLEEP"))).toBe(true);
    });

    it("has NoSQL payloads", () => {
      expect(SQL_INJECTION_PAYLOADS.nosql.length).toBeGreaterThan(2);
      expect(SQL_INJECTION_PAYLOADS.nosql.some(p => p.includes("$gt"))).toBe(true);
    });
  });

  describe("XSS Payloads", () => {
    it("has script injection payloads", () => {
      expect(XSS_PAYLOADS.script.length).toBeGreaterThan(3);
      expect(XSS_PAYLOADS.script.some(p => p.includes("<script>"))).toBe(true);
    });

    it("has event handler payloads", () => {
      expect(XSS_PAYLOADS.event.length).toBeGreaterThan(3);
      expect(XSS_PAYLOADS.event.some(p => p.includes("onerror"))).toBe(true);
    });

    it("has filter bypass payloads", () => {
      expect(XSS_PAYLOADS.bypass.length).toBeGreaterThan(3);
    });
  });

  describe("Command Injection Payloads", () => {
    it("has multiple separator types", () => {
      expect(COMMAND_INJECTION_PAYLOADS.semicolon.length).toBeGreaterThan(0);
      expect(COMMAND_INJECTION_PAYLOADS.pipe.length).toBeGreaterThan(0);
      expect(COMMAND_INJECTION_PAYLOADS.substitution.length).toBeGreaterThan(0);
    });

    it("has Windows-specific payloads", () => {
      expect(COMMAND_INJECTION_PAYLOADS.windows.length).toBeGreaterThan(0);
      expect(COMMAND_INJECTION_PAYLOADS.windows.some(p => p.includes("dir"))).toBe(true);
    });
  });

  describe("Path Traversal Payloads", () => {
    it("has basic traversal payloads", () => {
      expect(PATH_TRAVERSAL_PAYLOADS.basic.length).toBeGreaterThan(3);
      expect(PATH_TRAVERSAL_PAYLOADS.basic.some(p => p.includes("../"))).toBe(true);
    });

    it("has encoded payloads", () => {
      expect(PATH_TRAVERSAL_PAYLOADS.urlEncoded.length).toBeGreaterThan(0);
      expect(PATH_TRAVERSAL_PAYLOADS.doubleEncoded.length).toBeGreaterThan(0);
    });
  });

  describe("SSRF Payloads", () => {
    it("has localhost variants", () => {
      expect(SSRF_PAYLOADS.localhost.length).toBeGreaterThan(5);
      expect(SSRF_PAYLOADS.localhost).toContain("http://127.0.0.1");
      expect(SSRF_PAYLOADS.localhost).toContain("http://[::1]");
    });

    it("has cloud metadata endpoints", () => {
      expect(SSRF_PAYLOADS.cloud.length).toBeGreaterThan(2);
      expect(SSRF_PAYLOADS.cloud.some(p => p.includes("169.254.169.254"))).toBe(true);
    });

    it("has protocol smuggling payloads", () => {
      expect(SSRF_PAYLOADS.protocols.length).toBeGreaterThan(0);
      expect(SSRF_PAYLOADS.protocols.some(p => p.includes("file://"))).toBe(true);
    });
  });

  describe("XXE Payloads", () => {
    it("has basic XXE payloads", () => {
      expect(XXE_PAYLOADS.basic.length).toBeGreaterThan(0);
      expect(XXE_PAYLOADS.basic.some(p => p.includes("<!ENTITY"))).toBe(true);
    });

    it("has blind XXE payloads", () => {
      expect(XXE_PAYLOADS.blind.length).toBeGreaterThan(0);
    });
  });

  describe("Auth Bypass Payloads", () => {
    it("has default credentials", () => {
      expect(AUTH_BYPASS_PAYLOADS.defaultCreds.length).toBeGreaterThan(3);
      expect(AUTH_BYPASS_PAYLOADS.defaultCreds.some(c => c.username === "admin")).toBe(true);
    });

    it("has JWT manipulation payloads", () => {
      expect(AUTH_BYPASS_PAYLOADS.jwt.length).toBeGreaterThan(0);
    });

    it("has header injection payloads", () => {
      expect(AUTH_BYPASS_PAYLOADS.headers.length).toBeGreaterThan(0);
    });
  });

  describe("IDOR Payloads", () => {
    it("has numeric ID payloads", () => {
      expect(IDOR_PAYLOADS.numeric).toContain("1");
      expect(IDOR_PAYLOADS.numeric).toContain("-1");
      expect(IDOR_PAYLOADS.numeric).toContain("9999999");
    });
  });

  describe("Open Redirect Payloads", () => {
    it("has basic redirect payloads", () => {
      expect(OPEN_REDIRECT_PAYLOADS.basic.length).toBeGreaterThan(0);
    });

    it("has bypass payloads", () => {
      expect(OPEN_REDIRECT_PAYLOADS.bypass.length).toBeGreaterThan(0);
      expect(OPEN_REDIRECT_PAYLOADS.bypass.some(p => p.includes("@"))).toBe(true);
    });
  });
});

describe("Payload Mutation", () => {
  it("generates multiple mutations", () => {
    const payload = "' OR '1'='1";
    const mutations = mutatePayload(payload, 5);
    
    expect(mutations.length).toBeGreaterThan(1);
    expect(mutations[0]).toBe(payload); // Original first
  });

  it("includes URL encoding mutation", () => {
    const payload = "<script>alert(1)</script>";
    const mutations = mutatePayload(payload, 5);
    
    expect(mutations.some(m => m.includes("%3C"))).toBe(true);
  });

  it("deduplicates mutations", () => {
    const payload = "test";
    const mutations = mutatePayload(payload, 5);
    
    const unique = new Set(mutations);
    expect(mutations.length).toBe(unique.size);
  });

  it("has multiple mutation strategies", () => {
    expect(MUTATION_STRATEGIES.length).toBeGreaterThan(5);
    expect(MUTATION_STRATEGIES.some(s => s.name === "url-encode")).toBe(true);
    expect(MUTATION_STRATEGIES.some(s => s.name === "double-url-encode")).toBe(true);
  });
});

describe("Payload Retrieval", () => {
  describe("getPayloadsForCategory", () => {
    it("returns SQL injection payloads", () => {
      const payloads = getPayloadsForCategory("sql-injection");
      expect(payloads.length).toBeGreaterThan(10);
    });

    it("returns XSS payloads", () => {
      const payloads = getPayloadsForCategory("xss");
      expect(payloads.length).toBeGreaterThan(10);
    });

    it("returns SSRF payloads", () => {
      const payloads = getPayloadsForCategory("ssrf");
      expect(payloads.length).toBeGreaterThan(10);
    });

    it("returns empty array for unknown category", () => {
      const payloads = getPayloadsForCategory("unknown-category");
      expect(payloads).toEqual([]);
    });
  });

  describe("getPayloadsWithMutations", () => {
    it("returns mutated payloads", () => {
      const payloads = getPayloadsWithMutations("sql-injection", 20);
      
      expect(payloads.length).toBeLessThanOrEqual(20);
      expect(payloads.length).toBeGreaterThan(5);
    });

    it("respects maxPayloads limit", () => {
      const payloads = getPayloadsWithMutations("xss", 5);
      
      expect(payloads.length).toBeLessThanOrEqual(5);
    });
  });
});
