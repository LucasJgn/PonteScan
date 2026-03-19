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
 
    const prompt = `Tu es un assistant agricole expert en lecture de fiches d'élevage manuscrites. Analyse cette photo d'une fiche hebdomadaire de production d'œufs (fiche Huttepain).
 
INSTRUCTIONS CRITIQUES pour la lecture des chiffres :
- Les nombres de ponte sont généralement entre 5000 et 7000 œufs par jour pour un troupeau de 6500 poules
- Lis TOUS les chiffres jusqu'au dernier — ne tronque jamais un nombre (ex: 6060 et non 606, 6090 et non 609)
- Le numéro de semaine ("semaine_num") : calcule-le à partir de la date de fin (numéro de semaine ISO 8601 de l'année)
- Les consommations d'eau sont entre 1000 et 2000 L/jour, d'aliment entre 500 et 1000 kg/jour
- La mortalité est généralement entre 0 et 20 par jour
 
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
Les dates sont au format YYYY-MM-DD. Sur la fiche les dates sont écrites en JJ/MM sans l'année — utilise l'année en cours (2026) pour compléter. Exemple : "16/03" devient "2026-03-16".
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
