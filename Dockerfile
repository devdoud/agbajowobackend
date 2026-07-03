# syntax=docker/dockerfile:1
# ─── Étape 1 : build ─────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# Cache npm persistant (BuildKit) + reprises réseau : résiste aux coupures ECONNRESET
# (chaque tentative réutilise les paquets déjà téléchargés).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build
# Élague les dépendances de dev (garde prod + prisma + client généré).
RUN npm prune --omit=dev

# ─── Étape 2 : runtime ───────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copie l'arbre déjà installé/généré (aucun téléchargement réseau ici).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3001
# L'entrypoint applique les migrations puis démarre l'API.
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
