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
 
La photo peut être prise dans n'importe quelle orientation (portrait, paysage, pivotée de 90°) — identifie la bonne orientation et lis les données dans le bon sens.
La fiche peut avoir des variantes de mise en page selon l'éleveur (avec ou sans colonne RATIO, ordre des colonnes légèrement différent) — adapte-toi à la structure visible.
 
INSTRUCTIONS CRITIQUES :
- Commence par lire l'effectif début de semaine — il conditionne l'ordre de grandeur de toutes les valeurs
- Les oeufs pondus par jour = environ 85 à 95% de l'effectif (ex: 14000 poules → ~12000-13000 oeufs/jour)
- Lis TOUS les chiffres jusqu'au dernier chiffre — ne tronque jamais (ex: 12450 et non 1245, 86450 et non 8645)
- Le programme lumineux est une plage horaire "Xh - Yh", heures entre 0 et 23
- Numéro de semaine : calcule-le en ISO 8601 à partir de la date de fin
- Dates en JJ/MM sans année : utilise 2026 (ex: "06/03" → "2026-03-06")
 
REGLE ABSOLUE : si tu n'es pas certain à 100% d'une valeur (flou, encre pâle, chiffre ambigu), mets null. Un champ vide vaut mieux qu'une valeur inventée.
 
Retourne UNIQUEMENT un JSON valide avec cette structure (null pour les valeurs illisibles) :
 
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
