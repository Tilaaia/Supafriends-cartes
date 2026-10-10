# SupaFriends · Cartes – Serveur de démarrage

Ce petit serveur permet de mettre ton jeu en ligne avec :
- Comptes joueuses
- Collection sauvegardée sur le serveur
- Boosters, recyclage, poudre qui fonctionnent
- Les features multi-joueuses (marché, duels, mail) désactivées pour l’instant (elles ne cassent rien)

## Déploiement sur Render.com (recommandé, gratuit pour commencer)

1. Va sur [https://render.com](https://render.com) et crée un compte (gratuit).
2. Clique sur **New +** → **Web Service**.
3. Choisis **Build and deploy from a Git repository** (ou "Public Git repository" si tu n’as pas GitHub).
   - Si tu n’as pas de repo GitHub, tu peux zipper ce dossier et utiliser l’option "Deploy from a public Git repo" après avoir mis les fichiers sur GitHub, ou utiliser Railway / un autre service.
4. Une fois le repo connecté :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node
5. Dans les variables d’environnement, ajoute :
   - `SESSION_SECRET` = une longue chaîne aléatoire (ex: `monSuperSecret123!`)
6. Clique sur **Create Web Service**.

Render te donnera une URL du type `https://supafriends-cartes.onrender.com`.

## Notes importantes

- La base de données SQLite est dans un fichier. Sur le plan gratuit de Render, le disque est **éphémère** (les données peuvent disparaître si le service redémarre). Pour une version durable, on passera plus tard à Postgres (gratuit aussi sur Render).
- Le tirage des cartes est pour l’instant très basique (liste d’exemple). On pourra le remplacer par la vraie liste de cartes et les vrais taux de drop plus tard.
- Une fois en ligne, ouvre l’URL, crée un compte, et teste un booster.

## Prochaines étapes possibles

- Remplacer `SAMPLE_CARDS` dans `server.js` par la vraie liste de tes Supas.
- Ajouter les vrais taux de rareté / pity.
- Activer progressivement le marché et les duels.
- Passer sur Postgres pour que les données ne se perdent pas.

Dis-moi si tu veux que j’ajuste quelque chose avant que tu déploies.
