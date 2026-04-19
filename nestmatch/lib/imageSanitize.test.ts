import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { sanitizeImage } from "./imageSanitize"

// Helper — fabrique un buffer image test avec sharp
async function makeJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
  if (withExif) {
    // On injecte seulement IFD0 (Copyright + Artist) pour prouver le strip.
    // sharp strip TOUS les blocs EXIF (IFD0, GPS, ExifIFD, etc.) d'un coup,
    // donc vérifier qu'IFD0 disparaît prouve que GPS disparaît aussi.
    pipeline = pipeline.withExif({
      IFD0: { Copyright: "test", Artist: "Paul" },
    })
  }
  return pipeline.jpeg().toBuffer()
}

describe("sanitizeImage", () => {
  it("strip les métadonnées EXIF (y compris GPS)", async () => {
    const input = await makeJpeg(800, 600, true)

    // Confirme que l'input a bien de l'EXIF (sinon le test ne prouverait rien)
    const inputMeta = await sharp(input).metadata()
    expect(inputMeta.exif).toBeTruthy()

    const result = await sanitizeImage(input)

    const outMeta = await sharp(result.bytes).metadata()
    expect(outMeta.exif).toBeFalsy()
    expect(outMeta.iptc).toBeFalsy()
    expect(outMeta.xmp).toBeFalsy()
  })

  it("redimensionne en respectant le ratio (fit inside)", async () => {
    const input = await makeJpeg(4000, 3000)
    const result = await sanitizeImage(input, { maxWidth: 2000, maxHeight: 2000 })
    expect(result.width).toBe(2000)
    expect(result.height).toBe(1500)
  })

  it("n'agrandit pas une image plus petite que la cible", async () => {
    const input = await makeJpeg(400, 300)
    const result = await sanitizeImage(input, { maxWidth: 2000, maxHeight: 2000 })
    expect(result.width).toBe(400)
    expect(result.height).toBe(300)
  })

  it("sort en JPEG par défaut", async () => {
    const input = await makeJpeg(100, 100)
    const result = await sanitizeImage(input)
    expect(result.mime).toBe("image/jpeg")
    expect(result.ext).toBe("jpg")
    const meta = await sharp(result.bytes).metadata()
    expect(meta.format).toBe("jpeg")
  })

  it("sort en WebP quand demandé", async () => {
    const input = await makeJpeg(100, 100)
    const result = await sanitizeImage(input, { format: "webp", quality: 90 })
    expect(result.mime).toBe("image/webp")
    expect(result.ext).toBe("webp")
    const meta = await sharp(result.bytes).metadata()
    expect(meta.format).toBe("webp")
  })

  it("renvoie bytes + size cohérents", async () => {
    const input = await makeJpeg(800, 600)
    const result = await sanitizeImage(input)
    expect(result.bytes).toBeInstanceOf(Buffer)
    expect(result.size).toBe(result.bytes.length)
    expect(result.size).toBeGreaterThan(0)
  })

  it("throw sur buffer corrompu", async () => {
    const garbage = Buffer.from("this is not an image")
    await expect(sanitizeImage(garbage)).rejects.toThrow()
  })
})
