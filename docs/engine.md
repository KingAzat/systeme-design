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
- **Drain de fin de fenêtre** : après la boucle principale (coupe à
  `durationMs`), une phase de drain **résout les requêtes en vol** — services
  en cours, routages intermédiaires, files non vides — pour que `inFlight`
  retombe à 0 et que l'invariant « arrivées ≈ traités + rejets + erreurs »
  soit tenu (vérifié sur les 17 modèles : résidu client = 0). Garde-fous :
  (a) les événements de génération au-delà de `durationMs` sont ignorés (aucune
  nouvelle arrivée externe) ; (b) cap de temps virtuel à 1,5 × durée — les
  événements au-delà sont abandonnés ; (c) cap de temps réel de 1 500 ms pour
  toute la phase ; un balayage final des files couvre les drains internes
  coupés par leur tranche coopérative. Les requêtes client non soldées malgré
  le drain (`cutInFlight`) donnent une hypothèse « N requêtes encore en vol à
  la fin de la fenêtre ont été tronquées », et la règle « lag de file »
  n'utilise alors plus la profondeur résiduelle finale (non fiable) — seuls
  les signaux fondés sur le max et les séries restent. Les aires
  (utilisation/files) sont intégrées jusqu'à la fenêtre seulement : le drain
  résout, il ne rallonge pas la fenêtre simulée.
- **Reproductibilité** : tout l'aléa passe par un PRNG seedé (mulberry32 +
  gaussienne Box-Muller, `rng.ts`). À seed et paramètres identiques →
  résultats strictement identiques (vérifié). `Date.now()` n'entre que dans
  `startedAt`/`computeMs` — à l'exception près de la soupape des drains
  internes (voir ci-dessous), qui ne se déclenche que sur des graphes
  pathologiques. `onProgress` est protégé par try/catch : un callback
  défaillant n'interrompt jamais la simulation.

## Échantillonnage et budget de fan-out

`rps × durée > 100 000` ⇒ `samplingRate = 100 000 / (rps × durée)`. On simule
une fraction des requêtes ; **compteurs et volumes** sont remis à l'échelle
(× 1/samplingRate) ; **latences et files** restent des observations par
requête (hypothèse documentée). Le résultat affiche `requestsSimulated`,
`samplingRate` et un badge « échantillonnage N % ».

L'échantillonnage ne borne que les **arrivées externes**. Les **clones internes**
du fan-out (proxy « persister + publier », fetch-through de cache, effets de
bord des workers, clones de circuit breaker) multiplient chaque requête par le
nombre de sorties à chaque étage — un graphe adverse de proxys en cascade peut
générer des dizaines de millions d'événements et geler le navigateur. Le moteur
applique donc un **budget global de création** :

- `MAX_TOTAL_REQUESTS = 1 200 000` requêtes créées au total (externes + clones +
  messages + effets de bord) — valeur `max(1 200 000, 2,5 × maximum observé sur
  les 17 modèles)` ; le maximum mesuré est 214 766 (WhatsApp) → 1 200 000 ;
- au-delà, les **clones additionnels ne sont pas créés** (compteur de drops) :
  le chemin principal de chaque requête continue toujours (1re sortie du
  fan-out, requête primaire du breaker, verdict déjà rendu d'un worker) ;
- un clamp pédagogique « fan-out tronqué : N clones abandonnés » est émis dans
  les diagnostics, et l'hypothèse « Budget de fan-out » est listée avec les
  résultats. Vérifié : un graphe adverse (3 étages de proxys à 10 sorties)
  termine en ~1,1 s avec 294 761 clones abandonnés au lieu d'exploser.

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
- **Routage mono-cible (hypothèse)** : un serveur (ou un worker) relié à N
  caches / N bases / N files n'envoie chaque requête que vers le **PREMIER**
  d'entre eux — `caches[0]`, `databases[0]`, `queues[0]` selon le mix
  lecture/écriture (`serverRouteTarget`). Pas de répartition entre cibles
  multiples d'un même rôle, ni de parallélisation des appels aval : seuls les
  proxys / pass-through / CDN / rate-limiters font un vrai fan-out (clones
  internes fire-and-forget). Pour répartir, on passe par un Load Balancer.
- **Erreurs applicatives (hypothèse)** : le taux d'erreur effectif d'un serveur
  est la **somme** du taux du composant et du taux de base du scénario
  (`errorRate + baseErrorRate`, plafonné à 100 %) — les deux sources
  s'additionnent, elles ne se composent pas multiplicativement.
- **Files FIFO O(1)** : défilement par indice de tête (`fifoHead`) avec
  compaction amortie (si la tête dépasse 512 ET la moitié du tableau, le
  préfixe consommé est retiré d'un coup) — remplace les `Array.shift()` O(n²)
  des files profondes ; l'ordre FIFO est strictement préservé (une arrivée ne
  saute jamais une attente plus ancienne).
- **Cibles de routage précalculées** : listes aval par rôle (serveurs), cibles
  du balancer et latences d'arête sont calculées une fois à l'initialisation
  (l'ordre des arêtes est préservé → déterminisme inchangé) ; la santé des
  cibles du balancer reste évaluée dynamiquement (les pannes évoluent).
- **Drains internes coopératifs** : `tryDrainFifo` et `handleDispatch`
  vérifient le temps écoulé toutes les 256 itérations et rendent la main au-delà
  de 16 ms — le reste est redéclenché au prochain événement (kick) ou soldé
  par le drain de fin. Exception documentée à la reproductibilité : sur un
  graphe pathologique, cette soupape dépend du temps réel.

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
| `queue` | profondeur ≤ `maxDepth` (bornes 1–10 000, clamp avec diagnostic si configuré hors bornes ; défauts de catalogue hors bornes normalisés silencieusement), +2 ms si persistance ; workers aval dépilement selon disponibilité |
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
- **Agrégation une seule passe** : `utilizationSeries` est calculé une fois
  par nœud (réutilisé pour les métriques ET le top-5 des séries) et les
  recherches id → runtime passent par une `Map` construite une fois.

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
Le « lag de file » distingue la profondeur résiduelle finale (signal fort :
les workers ne suivent pas) de la simple sollicitation maximale (info) ; si des
requêtes ont été tronquées à la coupe (`cutInFlight`), seule la variante fondée
sur le max peut se déclencher.

## Limites documentées (extrait des hypothèses affichées)

1. Files FIFO uniques par nœud (pas de priorités ni pools par instance).
2. Latence retour = latence aller (réseau symétrique).
3. Write-around par défaut (pas d'invalidation ni TTL simulés).
4. Disponibilité = 1 − taux d'erreur observé (ni MTBF/MTTR réels).
5. Latences et files non remises à l'échelle sous échantillonnage
   (observations par requête).
6. Composants « visuels » : neutres (aucun effet).
7. Budget de fan-out : 1 200 000 requêtes créées au total, clones abandonnés
   au-delà (chemin principal préservé, clamp « fan-out tronqué »).
8. Routage mono-cible : un serveur n'envoie que vers le premier cache / la
   première base / la première file de chaque rôle.
9. Erreurs serveur = `errorRate` composant + `baseErrorRate` scénario
   (addition, plafonnée à 100 %).
10. Bornes moteur : `maxDepth` et `maxConnections` ∈ [1, 10 000] (les défauts
    de catalogue au-delà — ex. Kafka 1 000 000 — sont normalisés
    silencieusement ; une valeur configurée hors bornes produit un clamp).
