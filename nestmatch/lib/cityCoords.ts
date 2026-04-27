export const CITY_COORDS: Record<string, [number, number]> = {
  "paris": [48.8566, 2.3522],
  "lyon": [45.7578, 4.8320],
  "marseille": [43.2965, 5.3698],
  "toulouse": [43.6047, 1.4442],
  "nice": [43.7102, 7.2620],
  "nantes": [47.2184, -1.5536],
  "bordeaux": [44.8378, -0.5792],
  "strasbourg": [48.5734, 7.7521],
  "lille": [50.6292, 3.0573],
  "montpellier": [43.6108, 3.8767],
  "rennes": [48.1147, -1.6794],
  "grenoble": [45.1885, 5.7245],
  "toulon": [43.1242, 5.9280],
  "saint-etienne": [45.4397, 4.3872],
  "dijon": [47.3220, 5.0415],
  "angers": [47.4784, -0.5632],
  "brest": [48.3904, -4.4860],
  "nimes": [43.8367, 4.3601],
  "le havre": [49.4938, 0.1079],
  "reims": [49.2583, 4.0317],
  "saint-denis": [48.9362, 2.3574],
  "clermont-ferrand": [45.7772, 3.0870],
  "tours": [47.3941, 0.6848],
  "amiens": [49.8941, 2.2957],
  "limoges": [45.8336, 1.2611],
  "annecy": [45.8992, 6.1294],
  "perpignan": [42.6976, 2.8954],
  "metz": [49.1193, 6.1757],
  "besancon": [47.2378, 6.0241],
  "caen": [49.1829, -0.3707],
  "orleans": [47.9029, 1.9039],
  "rouen": [49.4432, 1.0993],
  "boulogne-billancourt": [48.8352, 2.2408],
  "mulhouse": [47.7508, 7.3359],
  "pau": [43.2951, -0.3708],
  "ajaccio": [41.9192, 8.7386],
  "versailles": [48.8014, 2.1301],
  "argenteuil": [48.9472, 2.2467],
  "montreuil": [48.8638, 2.4491],
  "aix-en-provence": [43.5297, 5.4474],
  "cannes": [43.5513, 7.0128],
  "antibes": [43.5804, 7.1282],
  "bayonne": [43.4929, -1.4748],
  "biarritz": [43.4832, -1.5586],
  "la rochelle": [46.1603, -1.1511],
  "poitiers": [46.5802, 0.3404],
  "troyes": [48.2973, 4.0744],
  "nancy": [48.6921, 6.1844],
  "colmar": [48.0794, 7.3590],
  "chartres": [48.4469, 1.4880],
  "dunkerque": [51.0343, 2.3768],
  // Bretagne — ajout batch 28
  "vannes": [47.6587, -2.7603],
  "lorient": [47.7482, -3.3702],
  "quimper": [48.0000, -4.1000],
  "saint-malo": [48.6490, -2.0257],
  "saint-brieuc": [48.5136, -2.7651],
  "lanester": [47.7611, -3.3333],
  "concarneau": [47.8722, -3.9183],
  // Pays de la Loire
  "saint-nazaire": [47.2734, -2.2138],
  "la roche-sur-yon": [46.6706, -1.4268],
  "cholet": [47.0606, -0.8786],
  "saumur": [47.2601, -0.0742],
  // Normandie
  "cherbourg-en-cotentin": [49.6337, -1.6220],
  "lisieux": [49.1457, 0.2262],
  "evreux": [49.0241, 1.1508],
  // Hauts-de-France
  "tourcoing": [50.7229, 3.1613],
  "roubaix": [50.6916, 3.1740],
  "villeneuve-d'ascq": [50.6181, 3.1378],
  "calais": [50.9513, 1.8587],
  "saint-quentin": [49.8479, 3.2876],
  // Occitanie / PACA
  "beziers": [43.3442, 3.2158],
  "narbonne": [43.1839, 3.0043],
  "avignon": [43.9493, 4.8055],
  "arles": [43.6768, 4.6302],
  "hyeres": [43.1205, 6.1288],
  "frejus": [43.4330, 6.7370],
  "la seyne-sur-mer": [43.1012, 5.8808],
  // Rhône / Alpes / Centre
  "villeurbanne": [45.7667, 4.8800],
  "venissieux": [45.6973, 4.8869],
  "chambery": [45.5646, 5.9178],
  "valence": [44.9334, 4.8924],
  "bourg-en-bresse": [46.2044, 5.2275],
  "bourges": [47.0810, 2.3988],
  "blois": [47.5861, 1.3359],
  // Nouvelle-Aquitaine
  "niort": [46.3239, -0.4628],
  "angouleme": [45.6484, 0.1563],
  // Île-de-France (banlieue)
  "nanterre": [48.8924, 2.2069],
  "creteil": [48.7904, 2.4551],
  "courbevoie": [48.8977, 2.2553],
  "colombes": [48.9226, 2.2544],
  "asnieres-sur-seine": [48.9162, 2.2884],
  "rueil-malmaison": [48.8780, 2.1830],
  "aubervilliers": [48.9146, 2.3823],
  "issy-les-moulineaux": [48.8245, 2.2730],
  "levallois-perret": [48.8939, 2.2857],
  "meaux": [48.9604, 2.8782],
  "melun": [48.5393, 2.6604],
}

export function getCityCoords(ville: string): [number, number] | null {
  if (!ville) return null
  const key = ville.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  // Try direct match
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    if (normalizedCity === key || key.includes(normalizedCity) || normalizedCity.includes(key)) {
      return coords
    }
  }
  return null
}

// Liste triée des noms de villes en capitales propres (pour affichage UI)
// Ex: "paris" -> "Paris", "saint-etienne" -> "Saint-Etienne"
function toTitleCase(s: string): string {
  return s.split(/([\s-])/).map(part =>
    part.match(/^[\s-]$/) ? part : part.charAt(0).toUpperCase() + part.slice(1)
  ).join("")
}

export const CITY_NAMES: string[] = Object.keys(CITY_COORDS)
  .map(toTitleCase)
  .sort((a, b) => a.localeCompare(b, "fr"))

export function normalizeCityName(name: string): string {
  return toTitleCase(name.toLowerCase().trim())
}

/**
 * Clé de lookup ville normalisée : lowercase, trim, accents retirés.
 * Utilisée pour comparer / indexer des villes sans faux négatifs type
 * "Saint-Étienne" vs "Saint-Etienne". Ne pas utiliser pour l'affichage UI.
 */
export function normalizeCityKey(name: string): string {
  return name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Distance haversine en km entre 2 points lat/lng. Sphere terrestre ~6371 km.
 * Utilise pour findNearbyCities (recherche 0 resultat -> suggestions).
 */
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Retourne jusqu'a `limit` villes proches geographiquement de `ville`,
 * triees par distance croissante, en excluant la ville elle-meme.
 * Si la ville n'est pas dans CITY_COORDS, retourne [].
 *
 * Utilise sur l'empty state /annonces (0 resultat avec ville filtree) :
 * "Aucun resultat a Lyon - essayez Villeurbanne (4 km), Vaulx-en-Velin
 * (8 km), Caluire-et-Cuire (5 km)".
 */
export function findNearbyCities(ville: string, limit = 5): Array<{ name: string; distanceKm: number }> {
  const sourceCoords = getCityCoords(ville)
  if (!sourceCoords) return []
  const sourceKey = normalizeCityKey(ville)
  const distances: Array<{ key: string; distanceKm: number }> = []
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalizeCityKey(key) === sourceKey) continue
    distances.push({ key, distanceKm: haversineKm(sourceCoords, coords) })
  }
  distances.sort((a, b) => a.distanceKm - b.distanceKm)
  return distances.slice(0, limit).map(d => ({
    name: toTitleCase(d.key),
    distanceKm: Math.round(d.distanceKm),
  }))
}
