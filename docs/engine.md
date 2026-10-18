# Le moteur de simulation SystemLab

Version : `1.0.0` — `src/engine/` (TypeScript pur, sans React, testable isolément).

## Philosophie

Un moteur **hybride** : une passe analytique rapide pour les estimations
(onglet Performance avant simulation), et une **simulation événementielle
discrète** pour les résultats. Chaque métrique affichée découle d'un calcul —
aucune valeur décorative. Les hypothèses du modèle sont listées avec chaque
résultat et rappelées ici.

## API publique (`src/engine/index.ts`)

```ts
runSimulation(arch: ArchitectureData, opts?: RunOptions): Promise<SimulationResult>
estimateArchitecture(arch: ArchitectureData): NodeEstimate[]   // mode analytique
analyzeGraph(arch: ArchitectureData): GraphAnalysis            // validation du graphe
ENGINE_VERSION = "1.0.0"
```

`RunOptions` : `onProgress(phase, progress)` (5 phases), `signal`
(AbortSignal → `AbortError`), `sliceMs` (tranche de temps réel par itération,
16 ms par défaut ; `await setTimeout(0)` entre tranches — l'UI reste fluide et
interruptible).

## Ordonnancement

- **File d'événements** : tas binaire ordonné par `(temps, séquence)` — ordre
  total déterministe, aucune boucle infinie possible.
- **Horloge virtuelle** : `ctx.now` avance événement par événement jusqu'à
  `durationSec`.
- **Reproductibilité** : tout l'aléa passe par un PRNG seedé (mulberry32 +
  gaussienne Box-Muller, `rng.ts`). À seed et paramètres identiques →
  résultats strictement identiques (vérifié). `Date.now()` n'entre que dans
  `startedAt`/`computeMs`.

## Échantillonnage

`rps × durée > 100 000` ⇒ `samplingRate = 100 000 / (rps × durée)`. On simule
une fraction des requêtes ; **compteurs et volumes** sont remis à l'échelle
(× 1/samplingRate) ; **latences et files** restent des observations par
requête (hypothèse documentée). Le résultat affiche `requestsSimulated`,
`samplingRate` et un badge « échantillonnage N % ».

## Cycle de vie d'une requête

```
générateur (Poisson, profil de trafic)
  → [réseau: scenario.networkLatencyMs + edge.networkLatencyMs]
  → nœud (rôle) — service, files, slots
      → routage aval (cache → base → réplica → file…)
      → nœud terminal (base, stockage, hit de cache, file)
  → remontée de la pile de frames (relâche slots/connexions,
    verdicts intermédiaires, timeouts amont)
  → latence bout-en-bout = réseau aller + Σ attentes + Σ services
    + MÊME réseau en retour
```

- **Pile de frames** : chaque nœud relais pousse une frame ; le nœud terminal
  reçoit le verdict final. Un comptage unique par nœud (endVisit/compteur) —
  le déroulement LIFO libère exactement ce qui a été réservé.
- **Protection anti-cycle** : `MAX_HOPS = 10` au-delà → erreur « boucle
  détectée » + diagnostic.

## Modèles par rôle (`handlers.ts`)

| Rôle | Modèle |
|---|---|
| `generator` | Poisson λ(t) = rps × profil(t) × sampling × poids ; répartition entre générateurs |
| `cdn` | hit (proba `cacheHitRatio`, lectures) → `hitLatencyMs`, succès terminal ; miss → origine |
| `balancer` | santé (healthCheck) → choix round-robin / least-connections / ip-hash ; capacité × instances ; toutes cibles mortes → 502 |
| `rate-limiter` | token bucket (`limit`/`burst`) → rejet 429 immédiat sans toucher l'aval |
| `server` | slots = instances × concurrence ; service lognormal (avg × exp(variabilité × g)) borné [0,2× ; 5×] ; file FIFO cap 500 → 503 ; `errorRate` → 500 ; timeout sous-arbre → 504 ; routage : cache direct (lectures) / base (écritures, write-around) / file (202) |
| `cache` | hit/miss tiré à l'arrivée ; miss → fetch-through vers SA base aval |
| `database` | sémaphore `maxConnections` (attente > 1 s → « connexions épuisées ») ; lecture `avgReadMs` (× 0,6 si cache interne) / écriture `avgWriteMs` |
| `replica` | lectures uniquement, capacité × instances, `replicationLagMs` documenté |
| `queue` | profondeur ≤ `maxDepth`, +2 ms si persistance ; workers aval dépilement selon disponibilité |
| `worker` | `avgProcessingMs` lognormal (var 0,3) ; erreurs async (la requête émettrice est déjà servie 202) ; écriture aval bornée en profondeur |
| `circuit-breaker` | fenêtre glissante par cible (`minRequestsToTrip`, `errorThreshold`) → OPEN `cooldownMs` (échec immédiat, aval épargné) → HALF-OPEN (`halfOpenProbes`) → CLOSED |
| `proxy`/`storage` | latence + capacité (rejet 503) |
| `pass-through`/visuel | 1 ms, capacité illimitée — **jamais présentés comme simulés** |

## Pannes (`failures.ts`)

`outage` : indisponible sur [start, start+durée] (erreurs immédiates), récupération
progressive sur `recoverySec`. `degradation` : service × 1/(1−sévérité),
capacité × (1−sévérité). Les conséquences **émergent** : erreurs amont,
circuit breakers qui s'ouvrent, Load Balancers avec health checks qui basculent
(vérifié : dispo 66,7 % → 99,8 % avec failover), files qui s'accumulent.

## Métriques (`metrics.ts`)

- **Séries** : buckets `clamp(durée, 12, 60)` — débit (entré/traité/rejeté),
  latence (moyenne + p95 par bucket), erreurs, files et utilisation
  (5 nœuds les plus chargés, instantanés aux frontières).
- **Percentiles** p50/p95/p99 : tri des échantillons réels de latence —
  jamais une moyenne multipliée arbitrairement.
- **Utilisation** : rôles à slots → aire pondérée `Σ busy / (slots × temps)` ;
  rôles à débit → arrivées / capacité ; **générateurs → 0** (une source de
  trafic n'est pas une ressource saturable) ; files → profondeur / maxDepth.
- **Goulot** : nœud non-générateur à l'utilisation maximale (tie-break file max).

## Coûts (`cost.ts`)

Ordres de grandeur cloud 2025 (±30 %) : serveurs 45 $/instance, serverless
0,20 $/1 M req, base 120 $ + 0,10 $/Go, cache 15 $/Go, LB 25 $ + 0,008 $/Go
transité, CDN 0,01 $/Go, file 2 $/partition. Transfert réel Go/mois =
`rps × 2 628 468 s × taille Ko / (1024 × 1024)`.

## Diagnostics (`diagnostics.ts`)

13+ règles à seuils explicites, contenu pédagogique, solutions **adaptées au
rôle et au mix lecture/écriture** (jamais de « réplicas de lecture » prescrits
à un flux d'écritures dominant) : saturation critique (≥ 0,95) / élevée
(≥ 0,8), file instable, SPOF (instances = 1 sur chemin critique), cache peu
efficace (< 50 % de hit), épuisement de connexions, cascade de timeouts
(p95 aval > timeout amont), composant isolé (hors observabilité — déconnectés
par nature), rejets du rate limiter, circuit breaker ouvert, lag de file,
goulot principal, disponibilité < 99 %, cycles/clampés/composants visuels (info).

## Limites documentées (extrait des hypothèses affichées)

1. Files FIFO uniques par nœud (pas de priorités ni pools par instance).
2. Latence retour = latence aller (réseau symétrique).
3. Write-around par défaut (pas d'invalidation ni TTL simulés).
4. Disponibilité = 1 − taux d'erreur observé (ni MTBF/MTTR réels).
5. Latences et files non remises à l'échelle sous échantillonnage
   (observations par requête).
6. Composants « visuels » : neutres (aucun effet).
