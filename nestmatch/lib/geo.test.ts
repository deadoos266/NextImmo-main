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

import { expandPolygon } from "./geo"

describe("V27.2 expandPolygon — radial buffer depuis centroide", () => {
  const square = [
    { lat: 48.85, lng: 2.34 },
    { lat: 48.86, lng: 2.34 },
    { lat: 48.86, lng: 2.35 },
    { lat: 48.85, lng: 2.35 },
  ]

  it("buffer 0m → polygone identique", () => {
    expect(expandPolygon(square, 0)).toEqual(square)
  })

  it("buffer < 3 vertices → identique", () => {
    expect(expandPolygon([], 100)).toEqual([])
    expect(expandPolygon([{ lat: 1, lng: 1 }], 100)).toEqual([{ lat: 1, lng: 1 }])
  })

  it("buffer 200m → vertices plus loin du centroide", () => {
    const expanded = expandPolygon(square, 200)
    expect(expanded.length).toBe(4)
    const cLat = (48.85 + 48.86) / 2
    const cLng = (2.34 + 2.35) / 2
    for (let i = 0; i < square.length; i++) {
      const distOrig = Math.hypot(square[i].lng - cLng, square[i].lat - cLat)
      const distNew = Math.hypot(expanded[i].lng - cLng, expanded[i].lat - cLat)
      expect(distNew).toBeGreaterThan(distOrig)
    }
  })

  it("point hors original mais dans expanded 300m", () => {
    const justOutside = { lat: 48.8605, lng: 2.345 }
    expect(pointInPolygon(justOutside, square)).toBe(false)
    expect(pointInPolygon(justOutside, expandPolygon(square, 300))).toBe(true)
  })
})
