#!/bin/sh
# Point d'entrée du conteneur API : applique les migrations en attente puis démarre.
set -e

echo "→ Application des migrations Prisma..."
npx prisma migrate deploy

echo "→ Démarrage de l'API..."
exec node dist/main.js
