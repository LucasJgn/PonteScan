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
 
    const currentYear = new Date().getFullYear();
    const prompt = `Tu es un assistant agricole expert en lecture de fiches d'élevage manuscrites. Analyse UNIQUEMENT cette photo spécifique d'une fiche hebdomadaire de production d'œufs (fiche Huttepain). N'utilise AUCUNE donnée provenant d'autres analyses précédentes — chaque photo est indépendante. La photo peut être prise dans n'importe quelle orientation (portrait, paysage, retournée) — adapte-toi et lis les données dans le bon sens.
 
INSTRUCTIONS CRITIQUES pour la lecture des chiffres :
- Les oeufs pondus par jour représentent environ 85 à 95% de l'effectif — base-toi sur l'effectif lu pour juger si une valeur est cohérente (ex: 14000 poules → ~12000-13000 oeufs/jour)
- Lis TOUS les chiffres jusqu'au dernier — ne tronque jamais un nombre (ex: 6060 et non 606, 6090 et non 609)
- Un tiret "—" ou "-" dans une cellule signifie 0 (zéro), pas un chiffre — c'est fréquent pour la mortalité
- Le numéro de semaine ("semaine_num") : calcule-le à partir de la date de fin (numéro de semaine ISO 8601 de l'année)
- Les consommations d'eau et d'aliment sont proportionnelles à l'effectif — base-toi sur l'effectif lu pour juger si une valeur est cohérente
 
RÈGLE ABSOLUE : si tu n'es pas certain à 100% d'une valeur (image floue, chiffre illisible, encre pâle), mets null. Il vaut mieux un champ vide qu'une valeur inventée — l'éleveur corrigera manuellement. Ne complète jamais un chiffre par déduction si tu ne le vois pas clairement.
 
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
 
Le tableau "jours" doit avoir exactement 7 entrées dans l'ordre chronologique de la fiche — la semaine peut commencer n'importe quel jour (lundi, mardi, etc.), lis les jours et dates tels qu'ils apparaissent sur la fiche de haut en bas.
Les dates sont au format YYYY-MM-DD. Sur la fiche les dates sont écrites en JJ/MM sans l'année — utilise l'année en cours (${currentYear}) pour compléter. Exemple : "16/03" devient "${currentYear}-03-16".
Retourne UNIQUEMENT le JSON, sans texte avant ou après.`;
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
