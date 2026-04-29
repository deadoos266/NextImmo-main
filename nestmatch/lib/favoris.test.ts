// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { getFavoris, isFavori, toggleFavori, setActiveFavorisEmail, setFavorisLocal, clearLocalFavoris } from "./favoris"

// jsdom env explicite : vitest.config.ts default "node" n'a pas window.localStorage.

describe("favoris — scope par user_email (V43)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActiveFavorisEmail(null)
  })

  it("anon : favoris ajoutés vont dans la clé anon", () => {
    setActiveFavorisEmail(null)
    toggleFavori(1)
    toggleFavori(2)
    expect(window.localStorage.getItem("nestmatch_favoris:anon")).toBe("[1,2]")
    expect(getFavoris()).toEqual([1, 2])
  })

  it("login user A : favoris écrits sous nestmatch_favoris:emailA", () => {
    setActiveFavorisEmail("alice@example.com")
    toggleFavori(10)
    toggleFavori(20)
    expect(window.localStorage.getItem("nestmatch_favoris:alice@example.com")).toBe("[10,20]")
    expect(getFavoris()).toEqual([10, 20])
  })

  it("switch user A → user B : User B ne voit PAS les favoris de User A (PRIVACY FIX)", () => {
    // User A login + ajoute fav 10
    setActiveFavorisEmail("alice@example.com")
    toggleFavori(10)
    toggleFavori(11)
    expect(getFavoris()).toEqual([10, 11])

    // User A logout puis User B login
    setActiveFavorisEmail("bob@example.com")
    expect(getFavoris()).toEqual([])           // ← cœur du fix V43
    expect(isFavori(10)).toBe(false)
    expect(isFavori(11)).toBe(false)

    // User B ajoute son propre fav 20
    toggleFavori(20)
    expect(getFavoris()).toEqual([20])

    // Re-login User A : retrouve ses favoris (cache local toujours là)
    setActiveFavorisEmail("alice@example.com")
    expect(getFavoris()).toEqual([10, 11])
  })

  it("legacy global key 'nestmatch_favoris' est purgé au setActiveFavorisEmail", () => {
    // Simule un cache pré-V43 (clé globale)
    window.localStorage.setItem("nestmatch_favoris", "[42,43]")
    setActiveFavorisEmail("alice@example.com")
    // La clé globale doit être nettoyée pour empêcher tout leak résiduel
    expect(window.localStorage.getItem("nestmatch_favoris")).toBeNull()
    // La clé scopée Alice est vide tant qu'elle n'a rien fav DB-syncé
    expect(getFavoris()).toEqual([])
  })

  it("toggleFavori : toggle on/off sur le même id", () => {
    setActiveFavorisEmail("alice@example.com")
    expect(toggleFavori(5)).toBe(true)
    expect(getFavoris()).toEqual([5])
    expect(toggleFavori(5)).toBe(false)
    expect(getFavoris()).toEqual([])
  })

  it("setFavorisLocal écrase le cache pour l'user actif", () => {
    setActiveFavorisEmail("alice@example.com")
    toggleFavori(1)
    toggleFavori(2)
    setFavorisLocal([100, 200, 300])
    expect(getFavoris()).toEqual([100, 200, 300])
  })

  it("setFavorisLocal déduplique les ids", () => {
    setActiveFavorisEmail("alice@example.com")
    setFavorisLocal([1, 1, 2, 2, 3])
    expect(getFavoris().sort()).toEqual([1, 2, 3])
  })

  it("clearLocalFavoris vide le cache pour l'user actif uniquement", () => {
    setActiveFavorisEmail("alice@example.com")
    toggleFavori(10)
    setActiveFavorisEmail("bob@example.com")
    toggleFavori(20)
    // Bob clear son cache
    clearLocalFavoris()
    expect(getFavoris()).toEqual([])
    // Alice toujours là
    setActiveFavorisEmail("alice@example.com")
    expect(getFavoris()).toEqual([10])
  })
})
