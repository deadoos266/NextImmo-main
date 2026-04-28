import { describe, it, expect } from "vitest"
import { pointInPolygon } from "./geo"

describe("V26.1 pointInPolygon — ray-casting", () => {
  // Carré simple : Paris approx [48.85, 2.34] - [48.87, 2.36]
  const square = [
    { lat: 48.85, lng: 2.34 },
    { lat: 48.87, lng: 2.34 },
    { lat: 48.87, lng: 2.36 },
    { lat: 48.85, lng: 2.36 },
  ]

  it("point inside square → true", () => {
    expect(pointInPolygon({ lat: 48.86, lng: 2.35 }, square)).toBe(true)
  })

  it("point outside (north) → false", () => {
    expect(pointInPolygon({ lat: 48.90, lng: 2.35 }, square)).toBe(false)
  })

  it("point outside (south) → false", () => {
    expect(pointInPolygon({ lat: 48.80, lng: 2.35 }, square)).toBe(false)
  })

  it("point outside (east) → false", () => {
    expect(pointInPolygon({ lat: 48.86, lng: 2.40 }, square)).toBe(false)
  })

  it("polygon with < 3 vertices → false (defensive)", () => {
    expect(pointInPolygon({ lat: 48.86, lng: 2.35 }, [])).toBe(false)
    expect(pointInPolygon({ lat: 48.86, lng: 2.35 }, [{ lat: 48.86, lng: 2.35 }])).toBe(false)
    expect(pointInPolygon({ lat: 48.86, lng: 2.35 }, [
      { lat: 48.86, lng: 2.35 }, { lat: 48.87, lng: 2.36 },
    ])).toBe(false)
  })

  it("polygone concave (en L) → testes points dedans/dehors", () => {
    // L shape :
    // (0,0) → (10,0) → (10,5) → (5,5) → (5,10) → (0,10) → close
    const lShape: { lat: number; lng: number }[] = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
      { lat: 10, lng: 5 },
      { lat: 5, lng: 5 },
      { lat: 5, lng: 10 },
      { lat: 0, lng: 10 },
    ]
    expect(pointInPolygon({ lat: 2, lng: 2 }, lShape)).toBe(true)
    expect(pointInPolygon({ lat: 7, lng: 2 }, lShape)).toBe(true)
    expect(pointInPolygon({ lat: 2, lng: 7 }, lShape)).toBe(true)
    // Trou du L (creux) :
    expect(pointInPolygon({ lat: 7, lng: 7 }, lShape)).toBe(false)
  })
})
