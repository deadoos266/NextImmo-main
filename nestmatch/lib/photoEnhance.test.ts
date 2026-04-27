import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { applyPhotoEnhance, shouldEnhance } from "./photoEnhance"
import { sanitizeImage } from "./imageSanitize"

/**
 * On genere un buffer de test minimal pour ne pas dependre de fixtures
 * binaires : 200x200 pixels en JPEG, gris 128/128/128 plat (cas pire pour
 * normalize qui devrait l'etirer en noir->blanc).
 */
async function makeTestJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  }).jpeg({ quality: 90 }).toBuffer()
}

describe("applyPhotoEnhance", () => {
  it("retourne une instance Sharp chainable (meme reference)", async () => {
    const input = await makeTestJpeg()
    const pipeline = sharp(input)
    const result = applyPhotoEnhance(pipeline)
    // Le pipeline retourne une instance Sharp utilisable apres .toBuffer()
    const buf = await result.jpeg({ quality: 80 }).toBuffer()
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(0)
    // Magic bytes JPEG : 0xFF 0xD8 ... 0xFF 0xD9
    expect(buf[0]).toBe(0xff)
    expect(buf[1]).toBe(0xd8)
  })

  it("modifie le rendu d'une image plate (normalize etire l'histogramme)", async () => {
    const input = await makeTestJpeg()
    // Sans enhance : image plate gris 128 reste plate
    const plain = await sharp(input).jpeg({ quality: 90 }).toBuffer()
    // Avec enhance : normalize tire les valeurs en pleine plage
    const enhanced = await applyPhotoEnhance(sharp(input)).jpeg({ quality: 90 }).toBuffer()
    // Les buffers ne sont pas identiques — l'enhance a touche les pixels
    expect(enhanced.equals(plain)).toBe(false)
  })
})

describe("shouldEnhance", () => {
  it("retourne true par defaut (decision deferred au toggle UI)", () => {
    expect(shouldEnhance()).toBe(true)
    expect(shouldEnhance({ width: 800, height: 600, format: "jpeg" })).toBe(true)
  })
})

describe("sanitizeImage avec enhance: true", () => {
  it("produit un JPEG valide quand enhance=true", async () => {
    const input = await makeTestJpeg()
    const result = await sanitizeImage(input, { format: "jpeg", quality: 85, enhance: true })
    expect(result.mime).toBe("image/jpeg")
    expect(result.bytes.length).toBeGreaterThan(0)
    expect(result.bytes[0]).toBe(0xff)
    expect(result.bytes[1]).toBe(0xd8)
    expect(result.width).toBeLessThanOrEqual(2000)
    expect(result.height).toBeLessThanOrEqual(2000)
  })

  it("produit un buffer different selon enhance true vs false", async () => {
    const input = await makeTestJpeg()
    const plain = await sanitizeImage(input, { format: "jpeg", quality: 85, enhance: false })
    const enhanced = await sanitizeImage(input, { format: "jpeg", quality: 85, enhance: true })
    expect(enhanced.bytes.equals(plain.bytes)).toBe(false)
  })

  it("respecte enhance=false par defaut (compat ascendante)", async () => {
    const input = await makeTestJpeg()
    const noOption = await sanitizeImage(input, { format: "jpeg", quality: 85 })
    const explicitFalse = await sanitizeImage(input, { format: "jpeg", quality: 85, enhance: false })
    // Memes options doivent produire le meme buffer (pas de timestamp/random)
    expect(noOption.bytes.equals(explicitFalse.bytes)).toBe(true)
  })
})
