# Task ID: 9-a — Agent full-stack-developer (backend)

> Work record partagé. Les agents suivants peuvent consulter ce fichier et le worklog.md
> (section « Task ID: 9-a ») pour le contexte backend.

## Scope (fichiers touchés)

- prisma/schema.prisma, src/lib/db.ts, src/lib/validation.ts, src/lib/format.ts
- src/app/api/architectures/route.ts, [id]/route.ts, [id]/duplicate/route.ts
- src/app/api/simulations/route.ts, [id]/route.ts
- src/app/api/health/route.ts
- backfill-tmp.ts (CRÉÉ puis SUPPRIMÉ après exécution)
- src/engine/index.ts : AUCUNE modification nécessaire (ENGINE_VERSION déjà ré-exporté)

## Correctifs appliqués

1. **Bug renommage annulé** (GET /api/architectures/[id]) : le spread du JSON `data` écrasait
   name/description des colonnes SQL. Le spread est désormais EN PREMIER, les colonnes gagnent.
   Preuve avant/après : PATCH name "Nouveau nom" → GET renvoyait "Test roundtrip 9a" (stale JSON)
   avec l'ancien ordre, "Nouveau nom" avec le correctif.
2. **Schéma Prisma dénormalisé** : Architecture.nodeCount Int @default(0) ;
   SimulationRecord + servedRps/p95Ms/errorRate/availability/costPerMonthUsd Float @default(0) ;
   index composite @@index([architectureId, createdAt]) (index existants conservés). db:push OK.
3. **Backfill one-shot** (bun backfill-tmp.ts, script ensuite supprimé) : 1 architecture
   (nodeCount=12), 3 simulations (résumés non nuls), 0 échec.
4. **POST /api/architectures** : nodeCount écrit au create ; réponse EXACTEMENT comme avant
   (nodeCount déjà présent dans la réponse d'origine). **PATCH [id]** : nodeCount recalculé si
   data fourni. **duplicate** : nodeCount recopié.
5. **GET /api/architectures** : select SANS `data`, nodeCount lu en colonne ; query params
   optionnels take (borné 500) / skip ; défaut = tout renvoyer (inchangé).
6. **GET /api/simulations** : select SANS `result` (ni scenario, non renvoyé) ; overall construit
   depuis les colonnes ; param offset (default 0) → skip ; limite inchangée ; forme de réponse
   strictement identique.
7. **POST /api/simulations** : result validé structurellement (overall avec les 5 nombres finis,
   .passthrough() aux deux niveaux, borne 2 Mo conservée) ; les 5 valeurs écrites en colonnes.
8. **Garde 413** (content-length > 3 Mo) avant req.json() sur POST/PATCH architectures + POST simulations.
9. **validation.ts** : architectureDataSchema .refine(< 512 Ko, "Architecture trop volumineuse") ;
   clés de config bornées z.record(z.string().max(40), …) (plus longue clé du catalogue : 25).
10. **P2025 → 404** dans les catch PATCH/DELETE architectures/[id] et DELETE simulations/[id].
11. **health réel** : db.$queryRaw`SELECT 1` (503 si KO) + version = ENGINE_VERSION importé de @/engine.
12. **db.ts** : log query en dev / error en production (singleton conservé).
13. **format.ts shortId** : crypto.randomUUID().replace(/-/g,"").slice(0,8) (signature/préfixes inchangés).

## Vérifications

- lint 0 erreur ; tsc 0 erreur dans src/ (reste uniquement probe-engine-tmp.ts à la racine =
  fichier temporaire de l'agent engine PARALLÈLE + erreurs préexistantes examples/skills).
- Roundtrip curl complet : POST arch → PATCH rename → GET name correct (avant/après documenté) ;
  liste sans champ data, nodeCount exact ; POST sim → GET liste overall exact (490.5/187.4/0.012/
  0.9973/431.25) ; DELETE inexistant → 404 ; content-length énorme → 413 (3 routes) ;
  health → {"status":"ok","service":"systemlab","version":"1.0.0"}.
- Données de test supprimées (retour à l'état initial : 1 arch, 3 sims) ; dev.log propre.

## NOTE IMPORTANTE pour les agents suivants (redémarrage du serveur dev)

Un processus démarré dans une invocation Bash est TUÉ à la fin de l'invocation (même avec
nohup/setsid tant qu'il reste descendant du shell). Pour un redémarrage durable du serveur dev :
```bash
cd /home/z/my-project && ( setsid nohup bun run dev >/dev/null 2>&1 </dev/null & ); sleep 12
```
— la sous-invocation qui se termine immédiatement rend le processus orphelin (PPID=1) AVANT le
nettoyage arborescent du harness ; il survit alors aux invocations suivantes. Après `db:push`,
le redémarrage reste OBLIGATOIRE (client Prisma régénéré à recharger).
