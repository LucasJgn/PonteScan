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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans Vercel' });
    }

    const prompt = `Tu es un assistant agricole expert. Analyse cette photo d'une fiche hebdomadaire de production d'œufs (fiche Huttepain) et extrais TOUTES les données visibles.

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
    "pct_ponte": null,
    "conso_eau_ml_j_poule": null,
    "conso_aliment_g_j_poule": null,
    "pct_mortalite": null,
    "poids_oeufs_g": null,
    "pesee_poules_poids_kg": null,
    "pesee_poules_homogeneite_pct": null,
    "nb_oeufs_poule_depart": null
  },
  "observations": null
}

Le tableau "jours" doit avoir exactement 7 entrées (Lundi à Dimanche) dans l'ordre.
Les dates sont au format YYYY-MM-DD si visible.
Retourne UNIQUEMENT le JSON, sans texte avant ou après.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Gemini error ${response.status}: ${data.error?.message || JSON.stringify(data)}` 
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!text) {
      return res.status(500).json({ 
        error: 'Gemini n\'a pas retourné de texte',
        debug: JSON.stringify(data).substring(0, 500)
      });
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
