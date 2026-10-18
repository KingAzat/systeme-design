# SystemLab

**Laboratoire interactif d'apprentissage et de simulation du System Design.**
Construisez des architectures au glisser-déposer, simulez la charge, identifiez les goulots d'étranglement, comparez vos solutions — et comprenez vraiment pourquoi.

![Stack](https://img.shields.io/badge/Next.js%2016-App%20Router-4F46E5) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6) ![React Flow](https://img.shields.io/badge/React%20Flow-12-FF6E16)

## Démarrage

```bash
bun install          # dépendances
bun run db:push      # crée/synchronise la base SQLite (db/custom.db)
bun run dev          # serveur de développement → http://localhost:3000
bun run lint         # qualité de code (ESLint — 0 erreur, 0 warning)
```

> Aucune variable d'environnement n'est nécessaire au-delà de `DATABASE_URL`
> (déjà configurée pour SQLite). Tout fonctionne en local, sans service distant.

## Ce que vous pouvez faire

1. **Construire** — 130 composants en 18 catégories (clients, réseau, compute,
   SQL, NoSQL, cache, messagerie, stockage, recherche, sécurité, résilience,
   observabilité, architecture distribuée, traitements différés, IA, services
   métier, infrastructure). Glisser-déposer, relier, regrouper par zones,
   configurer chaque composant.
2. **Simuler** — moteur hybride : estimation analytique instantanée (onglet
   Performance) et simulation événementielle discrète (arrivées poissonniennes,
   files FIFO, concurrence par slots, connexions base, hit/miss de cache,
   répartition L4/L7, token bucket, circuit breaker, pannes injectées).
3. **Diagnostiquer** — 13+ règles explicites (saturation, files instables,
   SPOF, cache peu efficace, épuisement de connexions, cascades de timeouts,
   lag de files…) avec métriques justificatives, causes, explications
   pédagogiques et solutions argumentées (conditions + compromis).
4. **Comparer** — archivez vos simulations, confrontez deux versions A/B
   (11 métriques, deltas orientés, graphiques, résumé automatique des compromis).
5. **Apprendre** — 23 cours progressifs (débutant → avancé) avec quiz corrigés
   et 15 exercices pratiques évalués sur vos métriques simulées.

## Architecture de l'application

```
src/
  app/            page unique (SPA) + routes API (architectures, simulations)
  components/     éditeur (canvas React Flow), résultats, comparaison,
                  historique, modèles, apprentissage, paramètres, landing
  engine/         moteur de simulation PUR (sans React) — voir docs/engine.md
  data/           catalogue (130 composants), 11 modèles, 23 cours
  stores/         Zustand : app (navigation), éditeur, simulation, bibliothèque
  lib/            persistance (façade API), validation Zod, icônes, formatage
  types/          contrat de types partagé
prisma/           Architecture + SimulationRecord (SQLite)
```

**Vue d'ensemble du produit** : `/` est une application mono-route — les
« pages » (dashboard, éditeur, résultats, comparaison, modèles, apprentissage,
historique, paramètres) sont des vues basculées côté client via Zustand.

## Documentation

- [`docs/engine.md`](docs/engine.md) — le moteur de simulation : modèle,
  formules, hypothèses, limites documentées honnêtement.
- Le panneau « Hypothèses » affiché avec chaque résultat de simulation.

## Limites connues (honnêteté oblige)

- **Composants « visuels »** (observabilité, patterns distribués, protocoles…) :
  pass-through neutre — leur badge l'indique clairement, ils ne prétendent
  jamais être simulés.
- **Échantillonnage** : au-delà de 100 000 requêtes simulées, une fraction du
  trafic est réellement jouée ; les volumes sont remis à l'échelle.
- **Coûts** : ordres de grandeur (±30 %), à lire comme des comparatifs.
- **Pas de code de test automatisé** dans cet environnement (vérification
  manuelle navigateur E2E réalisée à la place — parcours complet validé).
- Session locale unique (pas d'authentification — l'interface de stockage est
  prête pour une migration ultérieure).
