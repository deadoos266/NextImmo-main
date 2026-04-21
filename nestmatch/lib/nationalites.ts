/**
 * Liste des nationalités (adjectif de pays) en français — ISO 3166-1.
 *
 * Source : Office québécois de la langue française + liste officielle
 * des pays reconnus par l'ONU. "Française" est conservée en tête comme
 * valeur par défaut statistiquement dominante dans un contexte locatif FR.
 *
 * Utilisé par /dossier pour remplacer l'ancien Select fermé (France/UE/Hors UE)
 * — la loi n° 2002-73 du 17 janvier 2002 interdit toute discrimination à la
 * location fondée sur l'origine ou la nationalité.
 */

export const NATIONALITES: readonly string[] = [
  "Française",
  "Afghane",
  "Albanaise",
  "Algérienne",
  "Allemande",
  "Américaine",
  "Andorrane",
  "Angolaise",
  "Antiguaise-et-barbudienne",
  "Argentine",
  "Arménienne",
  "Australienne",
  "Autrichienne",
  "Azerbaïdjanaise",
  "Bahaméenne",
  "Bahreïnienne",
  "Bangladaise",
  "Barbadienne",
  "Bélizienne",
  "Belge",
  "Béninoise",
  "Bhoutanaise",
  "Biélorusse",
  "Birmane",
  "Bissaoguinéenne",
  "Bolivienne",
  "Bosnienne",
  "Botswanaise",
  "Brésilienne",
  "Brunéienne",
  "Bulgare",
  "Burkinabée",
  "Burundaise",
  "Cambodgienne",
  "Camerounaise",
  "Canadienne",
  "Cap-verdienne",
  "Centrafricaine",
  "Chilienne",
  "Chinoise",
  "Chypriote",
  "Colombienne",
  "Comorienne",
  "Congolaise (Brazzaville)",
  "Congolaise (RDC)",
  "Costaricaine",
  "Croate",
  "Cubaine",
  "Danoise",
  "Djiboutienne",
  "Dominicaine",
  "Dominiquaise",
  "Égyptienne",
  "Émirienne",
  "Équatorienne",
  "Érythréenne",
  "Espagnole",
  "Estonienne",
  "Eswatinienne",
  "Éthiopienne",
  "Fidjienne",
  "Finlandaise",
  "Gabonaise",
  "Gambienne",
  "Géorgienne",
  "Ghanéenne",
  "Grecque",
  "Grenadienne",
  "Guatémaltèque",
  "Guinéenne",
  "Guinéenne équatoriale",
  "Guyanienne",
  "Haïtienne",
  "Hondurienne",
  "Hongroise",
  "Indienne",
  "Indonésienne",
  "Irakienne",
  "Iranienne",
  "Irlandaise",
  "Islandaise",
  "Israélienne",
  "Italienne",
  "Ivoirienne",
  "Jamaïcaine",
  "Japonaise",
  "Jordanienne",
  "Kazakhstanaise",
  "Kényane",
  "Kirghize",
  "Kiribatienne",
  "Kittitienne-et-névicienne",
  "Kosovare",
  "Koweïtienne",
  "Laotienne",
  "Lesothane",
  "Lettone",
  "Libanaise",
  "Libérienne",
  "Libyenne",
  "Liechtensteinoise",
  "Lituanienne",
  "Luxembourgeoise",
  "Macédonienne",
  "Malaisienne",
  "Malawienne",
  "Maldivienne",
  "Malgache",
  "Malienne",
  "Maltaise",
  "Marocaine",
  "Marshallaise",
  "Mauricienne",
  "Mauritanienne",
  "Mexicaine",
  "Micronésienne",
  "Moldave",
  "Monégasque",
  "Mongole",
  "Monténégrine",
  "Mozambicaine",
  "Namibienne",
  "Nauruane",
  "Néerlandaise",
  "Néozélandaise",
  "Népalaise",
  "Nicaraguayenne",
  "Nigériane",
  "Nigérienne",
  "Nord-coréenne",
  "Norvégienne",
  "Omanaise",
  "Ougandaise",
  "Ouzbèke",
  "Pakistanaise",
  "Palaosienne",
  "Palestinienne",
  "Panaméenne",
  "Papouasienne",
  "Paraguayenne",
  "Péruvienne",
  "Philippine",
  "Polonaise",
  "Portugaise",
  "Qatarienne",
  "Roumaine",
  "Britannique",
  "Russe",
  "Rwandaise",
  "Saint-lucienne",
  "Saint-marinaise",
  "Saint-vincentaise-et-grenadine",
  "Salomonaise",
  "Salvadorienne",
  "Samoane",
  "Santoméenne",
  "Saoudienne",
  "Sénégalaise",
  "Serbe",
  "Seychelloise",
  "Sierraléonaise",
  "Singapourienne",
  "Slovaque",
  "Slovène",
  "Somalienne",
  "Soudanaise",
  "Sri-lankaise",
  "Sud-africaine",
  "Sud-coréenne",
  "Sud-soudanaise",
  "Suédoise",
  "Suisse",
  "Surinamaise",
  "Syrienne",
  "Tadjike",
  "Taïwanaise",
  "Tanzanienne",
  "Tchadienne",
  "Tchèque",
  "Thaïlandaise",
  "Timoraise",
  "Togolaise",
  "Tonguienne",
  "Trinidadienne",
  "Tunisienne",
  "Turkmène",
  "Turque",
  "Tuvaluane",
  "Ukrainienne",
  "Uruguayenne",
  "Vanuatuane",
  "Vaticane",
  "Vénézuélienne",
  "Vietnamienne",
  "Yéménite",
  "Zambienne",
  "Zimbabwéenne",
  "Apatride",
]

/**
 * Normalise pour comparaison (supprime accents, lowercase, trim).
 * Utilisé par l'Autocomplete pour matcher "française" avec "Française".
 */
export function normalizeNationalite(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Filtre la liste par préfixe ou sous-chaîne (accent-insensible).
 * Tri : Française d'abord si match, puis alphabétique Intl.Collator("fr").
 */
const collator = new Intl.Collator("fr", { sensitivity: "base" })

export function filterNationalites(query: string, limit = 100): string[] {
  const q = normalizeNationalite(query)
  if (!q) return [...NATIONALITES].slice(0, limit)
  const matches = NATIONALITES.filter(n => normalizeNationalite(n).includes(q))
  matches.sort((a, b) => {
    // Française toujours en tête si elle matche
    if (a === "Française") return -1
    if (b === "Française") return 1
    // Priorité aux entrées qui commencent par le query
    const aStarts = normalizeNationalite(a).startsWith(q)
    const bStarts = normalizeNationalite(b).startsWith(q)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    return collator.compare(a, b)
  })
  return matches.slice(0, limit)
}
