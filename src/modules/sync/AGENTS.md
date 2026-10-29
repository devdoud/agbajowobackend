# Synchronisation hors ligne

## Overview

L'app des agents terrain travaille hors ligne puis synchronise avec ce module. `push` applique un lot de changements créés sur le terrain ; `pull` renvoie tout ce qui a changé côté serveur depuis un curseur.

## Key files

| File | Owns |
|---|---|
| `sync.service.ts` | Logique push (application par entité, conflits) et pull (lecture par curseur) |
| `dto/push.dto.ts` | Schéma Zod du lot poussé (membres, contrats, versements, avances, retraits) |
| `sync.controller.ts` | Routes push et pull |

## Conventions

- Le push réutilise les services métier (`MembresService`, `ContratsService`, `CollecteService`, `AvancesService`, `RetraitsService`) : ne pas dupliquer leurs règles ici.
- Ordre d'application fixe, par dépendance : membres, puis contrats, versements, avances, retraits.
- Une entité refusée ne fait pas échouer le lot : elle va dans `conflicts` (`{ entity, id, reason }`), les autres sont appliquées. La réponse renvoie aussi le curseur courant `serverSeq`.
- Les identifiants sont des UUID générés par le client ; les écritures sont idempotentes, donc un même lot poussé deux fois ne crée pas de doublon.
- Le pull filtre `server_seq > since`, trié par ordre croissant, borné par `limit`, et applique la portée par rôle (un `AGENT` ne reçoit que ses données).

## Gotchas

- `server_seq` vient de la séquence Postgres partagée `sync_seq` (valeur par défaut en base, définie en SQL dans une migration). Toute nouvelle table synchronisée doit reprendre ce default, sinon le pull ne la voit pas.
- Contrats en dernier écrit gagnant, avec un verrou d'intégrité : dès qu'un contrat a un versement, une avance ou un retrait, ses paramètres financiers (groupe, mise, date) ne peuvent plus changer. Un push identique (resynchro) reste accepté.
- `codeMembre` (« ⟨agent⟩-⟨seq⟩ ») est fourni par le client hors ligne et unique en base ; `numeroMembre` est attribué par le serveur.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
