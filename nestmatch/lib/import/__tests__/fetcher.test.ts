import { describe, it, expect } from "vitest"
import { fetchUrl, ImportFetchError } from "../fetcher"

describe("import/fetcher SSRF + validation", () => {
  it("refuse URL invalide", async () => {
    await expect(fetchUrl("not-a-url")).rejects.toThrow(ImportFetchError)
    await expect(fetchUrl("not-a-url")).rejects.toMatchObject({ code: "INVALID_URL" })
  })

  it("refuse protocole non HTTP", async () => {
    await expect(fetchUrl("ftp://example.com")).rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL" })
    await expect(fetchUrl("file:///etc/passwd")).rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL" })
  })

  it("refuse localhost", async () => {
    await expect(fetchUrl("http://localhost/")).rejects.toMatchObject({ code: "BLOCKED_HOST" })
    await expect(fetchUrl("http://127.0.0.1/")).rejects.toMatchObject({ code: "BLOCKED_HOST" })
  })

  it("refuse IPs privées", async () => {
    await expect(fetchUrl("http://10.0.0.1/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
    await expect(fetchUrl("http://192.168.1.1/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
    await expect(fetchUrl("http://172.16.0.1/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
  })

  it("refuse AWS metadata", async () => {
    await expect(fetchUrl("http://169.254.169.254/")).rejects.toMatchObject({ code: "BLOCKED_HOST" })
  })

  it("refuse .local TLD", async () => {
    await expect(fetchUrl("http://server.local/")).rejects.toMatchObject({ code: "BLOCKED_TLD" })
  })

  it("refuse .internal TLD", async () => {
    await expect(fetchUrl("http://kube.internal/")).rejects.toMatchObject({ code: "BLOCKED_TLD" })
  })

  it("refuse 0.0.0.0", async () => {
    await expect(fetchUrl("http://0.0.0.0/")).rejects.toMatchObject({ code: "BLOCKED_HOST" })
  })

  it("refuse 0.x.x.x", async () => {
    await expect(fetchUrl("http://0.1.2.3/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
  })

  it("refuse IPv6 localhost [::1]", async () => {
    // Node URL parser strip les crochets → hostname = "::1"
    await expect(fetchUrl("http://[::1]/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
  })

  it("refuse IPv6 link-local fe80::", async () => {
    await expect(fetchUrl("http://[fe80::1]/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
  })

  it("refuse IPv6 unique-local fc00::", async () => {
    await expect(fetchUrl("http://[fc00::1]/")).rejects.toMatchObject({ code: "PRIVATE_IP" })
  })
})

describe("import/fetcher redirect SSRF guard", () => {
  it("refuse une redirection vers IP privée", async () => {
    // Mock global fetch pour simuler un 302 Location: http://10.0.0.5
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(null, {
      status: 302,
      headers: { location: "http://10.0.0.5/admin" },
    })) as typeof fetch

    try {
      await expect(fetchUrl("https://example.com/redir")).rejects.toMatchObject({ code: "PRIVATE_IP" })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("refuse une redirection vers AWS metadata", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    })) as typeof fetch

    try {
      // 169.254.169.254 est listé dans BLOCKED_HOSTS (en plus d'être PRIVATE_IP),
      // c'est lui qui matche en premier dans assertSafeHost.
      await expect(fetchUrl("https://example.com/redir")).rejects.toMatchObject({ code: "BLOCKED_HOST" })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("refuse une redirection vers protocole file://", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(null, {
      status: 302,
      headers: { location: "file:///etc/passwd" },
    })) as typeof fetch

    try {
      await expect(fetchUrl("https://example.com/redir")).rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL" })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("refuse plus de 3 redirections", async () => {
    const originalFetch = globalThis.fetch
    let hop = 0
    globalThis.fetch = (async () => {
      hop++
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/hop${hop}` },
      })
    }) as typeof fetch

    try {
      await expect(fetchUrl("https://example.com/start")).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
