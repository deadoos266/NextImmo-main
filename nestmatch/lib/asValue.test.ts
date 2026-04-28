import { describe, it, expect } from "vitest"
import { asNumber, asBool, asString, asArray, asInt } from "./asValue"

describe("asNumber", () => {
  it("number bien forme passe through", () => {
    expect(asNumber(123)).toBe(123)
    expect(asNumber(0)).toBe(0)
    expect(asNumber(-1.5)).toBe(-1.5)
  })
  it("string numerique parse", () => {
    expect(asNumber("123")).toBe(123)
    expect(asNumber("123.45")).toBe(123.45)
    expect(asNumber("  42  ")).toBe(42)
  })
  it("string format europeen 1 234,56 → 1234.56", () => {
    expect(asNumber("1 234")).toBe(1234)
    expect(asNumber("1 234,56")).toBe(1234.56)
    expect(asNumber("1,234.56")).toBe(1234.56)
  })
  it("null / undefined / vide / non-num → fallback", () => {
    expect(asNumber(null)).toBe(undefined)
    expect(asNumber(undefined)).toBe(undefined)
    expect(asNumber("")).toBe(undefined)
    expect(asNumber("abc")).toBe(undefined)
    expect(asNumber("abc", 0)).toBe(0)
  })
  it("boolean → fallback (bool != number)", () => {
    expect(asNumber(true)).toBe(undefined)
    expect(asNumber(false, 0)).toBe(0)
  })
  it("NaN / Infinity → fallback", () => {
    expect(asNumber(NaN)).toBe(undefined)
    expect(asNumber(Infinity)).toBe(undefined)
  })
})

describe("asBool", () => {
  it("boolean nu", () => {
    expect(asBool(true)).toBe(true)
    expect(asBool(false)).toBe(false)
  })
  it("string true/false/oui/non/yes/no/1/0", () => {
    expect(asBool("true")).toBe(true)
    expect(asBool("false")).toBe(false)
    expect(asBool("OUI")).toBe(true)
    expect(asBool("Non")).toBe(false)
    expect(asBool("yes")).toBe(true)
    expect(asBool("no")).toBe(false)
    expect(asBool("1")).toBe(true)
    expect(asBool("0")).toBe(false)
    expect(asBool("t")).toBe(true)
    expect(asBool("f")).toBe(false)
  })
  it("number 1/0 → bool", () => {
    expect(asBool(1)).toBe(true)
    expect(asBool(0)).toBe(false)
    expect(asBool(2)).toBe(null)
  })
  it("null / undefined / autres strings → null", () => {
    expect(asBool(null)).toBe(null)
    expect(asBool(undefined)).toBe(null)
    expect(asBool("")).toBe(null)
    expect(asBool("maybe")).toBe(null)
    expect(asBool({})).toBe(null)
  })
})

describe("asString", () => {
  it("string non-vide trim", () => {
    expect(asString("hello")).toBe("hello")
    expect(asString("  hi  ")).toBe("hi")
  })
  it("vide / whitespace-only → undefined", () => {
    expect(asString("")).toBe(undefined)
    expect(asString("   ")).toBe(undefined)
    expect(asString(null)).toBe(undefined)
    expect(asString(undefined)).toBe(undefined)
  })
  it("number / bool → cast en string", () => {
    expect(asString(123)).toBe("123")
    expect(asString(true)).toBe("true")
  })
})

describe("asArray", () => {
  it("array natif passe through", () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3])
    expect(asArray([])).toEqual([])
  })
  it("string CSV", () => {
    expect(asArray("a,b,c")).toEqual(["a", "b", "c"])
    expect(asArray("a, b , c")).toEqual(["a", "b", "c"])
    expect(asArray("a,,b,")).toEqual(["a", "b"])
  })
  it("string JSON array", () => {
    expect(asArray('["a","b","c"]')).toEqual(["a", "b", "c"])
    expect(asArray("[1,2,3]")).toEqual([1, 2, 3])
  })
  it("invalide / null / undefined → []", () => {
    expect(asArray(null)).toEqual([])
    expect(asArray(undefined)).toEqual([])
    expect(asArray("")).toEqual([])
    expect(asArray("[notjson")).toEqual([])
    expect(asArray(42)).toEqual([])
  })
})

describe("asInt", () => {
  it("integer parse", () => {
    expect(asInt("42")).toBe(42)
    expect(asInt(42)).toBe(42)
    expect(asInt("42.7")).toBe(42)  // floor
  })
  it("invalid → fallback", () => {
    expect(asInt(null)).toBe(undefined)
    expect(asInt("abc")).toBe(undefined)
    expect(asInt("abc", 0)).toBe(0)
  })
})
