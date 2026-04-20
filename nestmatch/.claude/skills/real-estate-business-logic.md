# Skill: KeyMatch Business Logic

## Actors & roles

| Actor | Detection | Access |
|-------|-----------|--------|
| Locataire | `!proprietaireActive` | Annonces, profil, dossier, visites (proposer), messages, carnet (voir + signaler) |
| Propriétaire | `proprietaireActive` | Mes biens, ajouter annonce, visites (confirmer), messages, carnet (gérer) |
| Admin | `isAdmin` (localStorage + code) | Dashboard admin `/admin` |

`proprietaireActive` = `is_proprietaire` flag dans profils OU au moins 1 annonce publiée.

## Visit lifecycle

```
Locataire → propose (statut: "proposée")
Proprio   → confirme (statut: "confirmée") ou refuse (statut: "annulée")
Proprio   → marque effectuée (statut: "effectuée")
```

Both sides can initiate from messages. Both sides can cancel/refuse a "proposée" visit.

**Badge rules**
- Proprio : badge = nb de visites `statut = "proposée"` → visites en attente
- Locataire : badge = nb de visites `statut = "confirmée"` futures → à venir

## Message flow

```
Locataire sees annonce → clicks "Contacter" → ContactButton creates thread
thread = messages between (locataire_email, proprietaire_email) linked to annonce_id
```

Special message types:
- `[DOSSIER_CARD]{json}` → dossier locataire card (parsed in DossierCard component)
- Regular text → plain chat bubble

Conversation key: `[email1, email2].sort().join("|")`

## Carnet d'entretien — shared maintenance log

```
Entry created by proprio:     locataire_email = null
Entry reported by locataire:  locataire_email = reporter's email
```

- Proprio sees all entries for their properties + tenant reports (yellow badge)
- Locataire sees entries for properties where they have confirmed visits
- Both can add/update/delete their own entries

## Matching score display

```typescript
// Always display as:
Math.round(score / 10) + "%"   // e.g. 850 → "85%"

// Labels
score >= 900 → "Excellent"
score >= 750 → "Très bon"
score >= 600 → "Bon"
score >= 400 → "Moyen"
score < 400  → "Faible"
```

## Dossier locataire completeness score

Calculated in messages (envoyerDossier) and dossier page:
- nom: +15
- situation_pro: +15
- revenus_mensuels: +20
- dossier_docs keys (identite, bulletins, avis_imposition, contrat, rib): +10 each (50 total)
- Max: 100

## Key IDs and email links

```
annonce.id          → visites.annonce_id, carnet_entretien.annonce_id, messages.annonce_id
annonce.proprietaire_email → visites.proprietaire_email, carnet_entretien.proprietaire_email
visite.locataire_email     → carnet_entretien.locataire_email (for shared access)
```

## Date handling gotcha

Supabase returns `date` columns as `"YYYY-MM-DD"` strings.
Always append `T12:00:00` before creating a Date object to avoid timezone shifts:
```typescript
new Date(dateString + "T12:00:00").toLocaleDateString("fr-FR", { ... })
```
