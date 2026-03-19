export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  try {
    const { imageBase64, mimeType } = req.body;
 
    if (!imageBase64) {
      return res.status(400).json({ error: 'Pas de photo reçue (imageBase64 manquant)' });
    }
 
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Clé ANTHROPIC_API_KEY manquante dans Vercel' });
    }
 
    const prompt = `Tu es un assistant agricole expert en lecture de fiches d'élevage manuscrites. Analyse cette photo d'une fiche hebdomadaire de production d'oeufs (fiche Huttepain).
 
INSTRUCTIONS CRITIQUES pour la lecture des chiffres :
- Commence par lire l'effectif début de semaine — il conditionne l'ordre de grandeur de toutes les autres valeurs
- Les oeufs pondus par jour représentent environ 85 à 95% de l'effectif (ex: 6500 poules → ~6000 oeufs/jour, 40000 poules → ~37000 oeufs/jour)
- Lis TOUS les chiffres jusqu'au dernier — ne tronque jamais un nombre (ex: 6060 et non 606, 37500 et non 375)
- Si un chiffre semble coupé par le bord de la cellule, complète-le en cohérence avec l'effectif lu
- Le programme lumineux est une plage horaire du type "5h - 21h" (heure d'allumage - heure d'extinction), les heures sont entre 0h et 23h
- Le numéro de semaine ("semaine_num") : calcule-le à partir de la date de fin (numéro de semaine ISO 8601 de l'année)
- Les dates écrites en JJ/MM sans année : utilise 2026 comme année (ex: "16/03" devient "2026-03-16")
 
Retourne UNIQUEMENT un JSON valide avec cette structure exacte (mets null pour les valeurs illisibles) :
 
{
  "semaine_num": null,
  "semaines_age": null,
  "date_debut": null,
  "date_fin": null,
  "effectif_debut": null,
  "effectif_fin": null,
  "programme_lumineux": null,
  "livraison_aliment_T": null,
  "tours_chaine": null,
  "jours": [
    {
      "jour": "Lundi",
      "date": null,
      "ponte_classes": null,
      "ponte_declasses": null,
      "ponte_total": null,
      "mortalite": null,
      "eau_L": null,
      "aliment_kg": null,
      "temp_min": null,
      "temp_max": null
    }
  ],
  "resultats": {
    "poids_oeufs_g": null,
    "pesee_poules_poids_kg": null,
    "pesee_poules_homogeneite_pct": null
  },
  "observations": null
}
 
Le tableau "jours" doit avoir exactement 7 entrées (Lundi à Dimanche) dans l'ordre.
Retourne UNIQUEMENT le JSON, sans texte avant ou après.`;
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Anthropic error ${response.status}: ${data.error?.message || JSON.stringify(data)}`
      });
    }
 
    const text = data.content?.map(b => b.text || '').join('') || '';
 
    if (!text) {
      return res.status(500).json({ error: 'Pas de réponse textuelle reçue' });
    }
 
    return res.status(200).json({ text });
 
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
 
