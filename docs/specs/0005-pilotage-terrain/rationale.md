# 0005. Pilotage terrain : raisonnement

## Context

Après sa première intégration avec l'API en ligne (2026-10-30), l'équipe front a listé ce qui manquait côté backend. Deux points sont déjà corrigés (CORS et pull des mouvements des contrats d'un agent). Restent quatre manques, chacun avec un contournement coûteux côté front : le pilotage déduit l'activité d'un agent de « aucun encaissement reçu aujourd'hui », un téléphone mal réglé perd des encaissements, les doublons ne sont cherchés que chez les membres de l'agent, et la courbe de 14 jours est calculée sur toute la base téléchargée.

## Options considered

### Horloge des téléphones

1. **Correction par lot avec `horlogeClient` (retenue).** Le téléphone envoie son heure au moment du push ; l'écart avec le serveur corrige toutes les dates du lot, puis les bornes du spec 0003 s'appliquent normalement. Simple, une seule valeur par lot, et l'écart est gardé sur le mouvement pour rester visible.
2. **Élargir la tolérance du futur** (par exemple 24 h). Rejeté : une date fausse resterait fausse, et un encaissement daté de demain sortirait du rapport du jour (spec 0002, AC-8).
3. **Ignorer la date du téléphone et prendre l'heure de réception.** Rejeté : un mouvement fait hors ligne la veille compterait dans le mauvais jour (spec 0003, AC-7).
4. **Envoyer, pour chaque mouvement, l'heure du téléphone à sa création et à son envoi.** Plus précis si l'horloge change entre les deux, mais demande un champ par mouvement et une logique plus lourde côté app, pour un cas rare.

Seuil : la correction ne s'applique qu'au-delà de 15 minutes, la tolérance du futur du spec 0003. En deçà, les dates passent déjà les bornes, et on évite de toucher aux dates des téléphones bien réglés (avec un écart de quelques secondes dû au réseau).

### Dernière synchro

Une colonne sur `agents`, mise à jour au début du push et du pull. Une table d'historique des synchros a été écartée : le pilotage n'a besoin que de la dernière, et une colonne suffit à `GET /agents` sans jointure.

### Doublons entre agents

Le besoin oppose deux choses : détecter un doublon chez un autre agent, et ne pas lui ouvrir les fiches de ses collègues (règle de portée du projet). La réponse ne donne donc à un AGENT que le numéro de membre et l'agent qui le suit, de quoi en parler avec le superviseur. Une réponse booléenne seule a été écartée : l'agent ne saurait pas à qui s'adresser. La normalisation (chiffres seuls, indicatif 229 retiré) évite qu'un même numéro saisi `+229 97…` et `97…` passe pour deux numéros.

### Courbe des jours

Une agrégation SQL par jour du Bénin, plutôt qu'un chargement des mouvements en mémoire : la quantité renvoyée ne dépend que du nombre de jours (90 au plus). Le jour est calculé avec le même décalage fixe que `jourBenin`, pour que la courbe et le rapport de caisse rangent un mouvement dans le même jour. Les montants sont des nombres, comme les autres routes du tableau de bord.
