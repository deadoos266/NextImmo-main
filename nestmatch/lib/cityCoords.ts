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
