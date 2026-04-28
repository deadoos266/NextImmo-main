import { describe, it, expect } from "vitest"
import { generateIcs, googleCalendarUrl } from "./icsGenerator"

describe("generateIcs", () => {
  const event = {
    uid: "visite-123",
    title: "Visite — T2 Lyon",
    start: new Date("2026-05-15T14:00:00Z"),
    durationMinutes: 30,
    location: "12 rue de Lyon",
    description: "Visite confirmée via KeyMatch.",
    organizerEmail: "owner@example.com",
    attendeeEmails: ["candidat@example.com"],
  }

  it("genere un VCALENDAR/VEVENT bien forme", () => {
    const ics = generateIcs(event)
    expect(ics).toMatch(/^BEGIN:VCALENDAR/)
    expect(ics).toMatch(/END:VCALENDAR$/)
    expect(ics).toMatch(/VERSION:2\.0/)
    expect(ics).toMatch(/BEGIN:VEVENT/)
    expect(ics).toMatch(/END:VEVENT/)
  })

  it("inclut UID, DTSTART, DTEND, SUMMARY", () => {
    const ics = generateIcs(event)
    expect(ics).toMatch(/UID:visite-123@keymatch-immo\.fr/)
    expect(ics).toMatch(/DTSTART:20260515T140000Z/)
    expect(ics).toMatch(/DTEND:20260515T143000Z/)
    expect(ics).toMatch(/SUMMARY:Visite — T2 Lyon/)
  })

  it("inclut LOCATION et DESCRIPTION et ATTENDEE quand fournis", () => {
    const ics = generateIcs(event)
    expect(ics).toMatch(/LOCATION:12 rue de Lyon/)
    expect(ics).toMatch(/DESCRIPTION:Visite confirmée via KeyMatch\./)
    expect(ics).toMatch(/ATTENDEE;CN=candidat@example\.com:mailto:candidat@example\.com/)
    expect(ics).toMatch(/ORGANIZER:mailto:owner@example\.com/)
  })

  it("escape les caracteres ICS speciaux (virgule, point-virgule, retour ligne)", () => {
    const e = { ...event, title: "Visite, T2; étage 3\nlumineux", description: "" }
    const ics = generateIcs(e)
    expect(ics).toMatch(/SUMMARY:Visite\\, T2\\; étage 3\\nlumineux/)
  })

  it("default duration 30 min si non specifiee", () => {
    const e = { uid: "x", title: "X", start: new Date("2026-05-15T10:00:00Z") }
    const ics = generateIcs(e)
    expect(ics).toMatch(/DTSTART:20260515T100000Z/)
    expect(ics).toMatch(/DTEND:20260515T103000Z/)
  })

  it("CRLF entre lignes (RFC 5545)", () => {
    const ics = generateIcs(event)
    expect(ics).toContain("\r\n")
  })
})

describe("googleCalendarUrl", () => {
  it("genere un URL action=TEMPLATE avec dates encodees", () => {
    const url = googleCalendarUrl({
      uid: "x",
      title: "Test",
      start: new Date("2026-05-15T14:00:00Z"),
      durationMinutes: 60,
      location: "Paris",
    })
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/)
    expect(url).toMatch(/action=TEMPLATE/)
    expect(url).toMatch(/text=Test/)
    expect(url).toMatch(/dates=20260515T140000Z%2F20260515T150000Z/)
    expect(url).toMatch(/location=Paris/)
  })
})
