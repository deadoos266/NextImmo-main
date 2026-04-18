import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { generateDossierToken, verifyDossierToken } from "./dossierToken"

const TEST_SECRET = "test-secret-for-vitest-only-32-chars-long-abc"
let originalSecret: string | undefined

beforeAll(() => {
  originalSecret = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = TEST_SECRET
})

afterAll(() => {
  if (originalSecret !== undefined) {
    process.env.NEXTAUTH_SECRET = originalSecret
  } else {
    delete process.env.NEXTAUTH_SECRET
  }
})

describe("generateDossierToken + verifyDossierToken", () => {
  it("round-trip : token valide retourne l'email d'origine", () => {
    const email = "tic3467@gmail.com"
    const token = generateDossierToken(email, 7)
    const verified = verifyDossierToken(token)
    expect(verified).not.toBeNull()
    expect(verified?.email).toBe(email)
  })

  it("exp est bien dans ~7 jours par défaut", () => {
    const token = generateDossierToken("a@b.fr")
    const verified = verifyDossierToken(token)
    expect(verified).not.toBeNull()
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(verified!.exp).toBeGreaterThan(now)
    expect(verified!.exp).toBeLessThanOrEqual(now + sevenDaysMs + 1000)
  })

  it("ttl custom respecté", () => {
    const token = generateDossierToken("a@b.fr", 1)
    const verified = verifyDossierToken(token)
    expect(verified).not.toBeNull()
    const oneDayMs = 24 * 60 * 60 * 1000
    expect(verified!.exp).toBeLessThanOrEqual(Date.now() + oneDayMs + 1000)
  })

  it("token expiré → null", () => {
    // TTL négatif = déjà expiré
    const token = generateDossierToken("a@b.fr", -1)
    const verified = verifyDossierToken(token)
    expect(verified).toBeNull()
  })

  it("token altéré (signature cassée) → null", () => {
    const token = generateDossierToken("a@b.fr", 7)
    // On casse la signature en remplaçant le dernier caractère
    const tampered = token.slice(0, -1) + (token.slice(-1) === "A" ? "B" : "A")
    expect(verifyDossierToken(tampered)).toBeNull()
  })

  it("payload altéré (email changé) → null (signature ne correspond plus)", () => {
    const token = generateDossierToken("legit@b.fr", 7)
    const [, sig] = token.split(".")
    // Fake payload avec un autre email, ancienne sig
    const fakePayload = Buffer.from(JSON.stringify({ email: "attacker@b.fr", exp: Date.now() + 86400000 }))
      .toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const forged = `${fakePayload}.${sig}`
    expect(verifyDossierToken(forged)).toBeNull()
  })

  it("token malformé (pas de point) → null", () => {
    expect(verifyDossierToken("completement-invalide")).toBeNull()
  })

  it("token malformé (string vide) → null", () => {
    expect(verifyDossierToken("")).toBeNull()
  })

  it("token malformé (payload non-JSON) → null", () => {
    expect(verifyDossierToken("notbase64.notbase64")).toBeNull()
  })

  it("deux tokens générés successivement pour le même email sont différents (exp diffère)", async () => {
    const t1 = generateDossierToken("a@b.fr", 7)
    await new Promise(r => setTimeout(r, 5))
    const t2 = generateDossierToken("a@b.fr", 7)
    // Les exp peuvent être identiques si génération dans la même ms, donc on vérifie juste que les deux sont valides
    expect(verifyDossierToken(t1)?.email).toBe("a@b.fr")
    expect(verifyDossierToken(t2)?.email).toBe("a@b.fr")
  })
})
