/**
 * SystemLab — diagnostics pédagogiques construits après la simulation.
 *
 * Règles (≥ 12) : saturation critique/avertissement, file instable, SPOF,
 * cache inefficace, épuisement de connexions, cascade de timeouts, composant
 * isolé, rejets de rate limiter, circuit breaker ouvert, lag de file, goulot
 * principal, disponibilité insuffisante, cycles/boucles, clampages,
 * composants visuels neutres.
 *
 * Les solutions sont adaptées au rôle ET au mix lecture/écriture observé :
 * on ne recommande JAMAIS des réplicas de lecture pour un flux d'écritures
 * dominant (les réplicas ne rejouent que les lectures).
 */
import type {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticSolution,
  NodeMetrics,
  OverallMetrics,
  ScenarioConfig,
  SimRole,
} from "@/types";
import type { GraphAnalysis } from "./graph";
import type { NodeRuntime } from "./runtime";
import type { NodeExtra } from "./metrics";
import { formatMs, formatNumber, formatPercent, formatRps } from "@/lib/format";

/* ============================================================
 * Entrées
 * ============================================================ */

export interface DiagnosticsInput {
  runtimes: NodeRuntime[];
  nodes: NodeMetrics[];
  extras: Map<string, NodeExtra>;
  overall: OverallMetrics;
  graph: GraphAnalysis;
  scenario: ScenarioConfig;
  scale: number;
  loopKilled: number;
  /** Messages de clampage (nœuds tronqués, durée/rps ajustés…). */
  clamps: string[];
}

/* ============================================================
 * Outillage
 * ============================================================ */

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

interface Ctx {
  input: DiagnosticsInput;
  byId: Map<string, { rt: NodeRuntime; nm: NodeMetrics; ex: NodeExtra }>;
}

function pct(n: number, digits = 1): string {
  return formatPercent(n, digits);
}

function mixReadShare(c: Ctx, nodeId: string): number {
  const ex = c.input.extras.get(nodeId);
  if (!ex) return c.input.scenario.readRatio;
  const total = ex.readArrivals + ex.writeArrivals;
  if (total <= 0) return c.input.scenario.readRatio;
  return ex.readArrivals / total;
}

function sol(label: string, how: string, conditions: string, tradeoffs: string): DiagnosticSolution {
  return { label, how, conditions, tradeoffs };
}

/* ============================================================
 * Solutions par rôle (adaptées au mix lecture/écriture)
 * ============================================================ */

function capacitySolutions(c: Ctx, rt: NodeRuntime, mix: number): DiagnosticSolution[] {
  const readsDominant = mix >= 0.5;
  const out: DiagnosticSolution[] = [];
  switch (rt.role) {
    case "server":
      out.push(
        sol(
          "Ajouter des instances",
          `Passer de ${rt.rc.instances} à ${rt.rc.instances * 2} instances identiques derrière le répartiteur : la capacité par rôle croît linéairement.`,
          "Le temps de traitement moyen est déjà raisonnable et le composant est stateless.",
          "Coût proportionnel ; la charge aval (base, cache) augmente d'autant — vérifiez qu'elle suit.",
        ),
        sol(
          "Optimiser le temps de traitement",
          "Profiler le code (requêtes N+1, sérialisation, CPU) pour réduire avgServiceMs : c'est le seul levier qui améliore latence ET débit simultanément.",
          "Le profilage révèle des goulots applicatifs (CPU, I/O, allocations).",
          "Effort d'ingénierie ; gains plafonnés par les dépendances aval.",
        ),
      );
      if (readsDominant) {
        out.push(
          sol(
            "Mettre en cache les lectures",
            "Intercaler un cache (Redis) entre les serveurs et la base pour les lectures répétées — le flux observé est à " +
              pct(mix) +
              " de lectures.",
            "Forte réutilisation des mêmes lectures (sessions, catalogue, référence).",
            "Incohérences possibles (TTL/invalidation) ; mémoire supplémentaire ; n'accélère pas les écritures.",
          ),
        );
      } else {
        out.push(
          sol(
            "Extraire les écritures vers une file",
            "Publier les écritures dans une file et les traiter par des workers asynchrones : le serveur répond 202 immédiatement — le flux observé est à " +
              pct(1 - mix) +
              " d'écritures.",
            "Les écritures n'exigent pas une réponse synchrone à l'utilisateur.",
            "Cohérence à terme (eventual consistency) ; complexité opérationnelle ; supervision des files et retries.",
          ),
        );
      }
      break;
    case "database": {
      out.push(
        sol(
          "Augmenter le pool de connexions",
          `Passer maxConnections de ${rt.rc.maxConnections} à ${Math.round(rt.rc.maxConnections * 1.5)} : capacité ≈ connexions / temps moyen.`,
          "Le temps moyen par requête est sain et l'attente vient du pool.",
          "Chaque connexion consomme mémoire + un process côté SGBD ; au-delà d'un point, le CPU et les verrous deviennent limitants.",
        ),
        sol(
          "Réduire le temps par requête",
          "Optimiser les requêtes (index, plans d'exécution, requêtes N+1) : agit sur avgReadMs/avgWriteMs, donc directement sur la capacité.",
          "Le pool n'est pas saturé mais chaque requête est lente.",
          "Nécessite du profilage (EXPLAIN, slow query log) ; maintenance des index.",
        ),
      );
      if (readsDominant) {
        out.push(
          sol(
            "Décharger les lectures (cache + réplicas)",
            "Ajouter un cache applicatif pour les lectures chaudes et, au-delà, des réplicas de lecture — le flux arrivant est à " +
              pct(mix) +
              " de lectures, donc dimensionnable horizontalement.",
            "Flux dominant en lectures avec réutilisation (la clé : le taux de hit).",
            "Délai de réplication (lectures légèrement périmées) ; coût par réplica ; l'application doit router lectures/écritures.",
          ),
        );
      } else {
        out.push(
          sol(
            "Lisser et répartir les écritures",
            "Le flux est à " +
              pct(1 - mix) +
              " d'écritures : ajouter des réplicas de lecture n'y changerait rien. lisser par une file tampon, réduire fsync par batch, partitionner/sharder les tables chaudes.",
            "Écritures dominantes et besoin de tenir le débit.",
            "Sharding = complexité applicative forte ; batching retarde la durabilité ; la file introduit de l'asynchrone.",
          ),
        );
      }
      break;
    }
    case "replica":
      out.push(
        sol(
          "Ajouter des réplicas",
          `Passer de ${rt.rc.instances} à ${rt.rc.instances + 1} réplicas de lecture : les lectures se répartissent entre copies.`,
          "Flux de lectures croissant (ce composant ne sert jamais les écritures).",
          "Coût par réplica ; délai de réplication ; attention : si le flux global est dominé par les écritures, c'est la primaire qu'il faut soulager, pas les réplicas.",
        ),
      );
      break;
    case "cache":
      out.push(
        sol(
          "Monter la mémoire (working set)",
          `Passer de ${rt.rc.memoryGb} à ${rt.rc.memoryGb * 2} Go : un working set plus large retient les clés chaudes et augmente le taux de hit.`,
          "Le taux de hit est limité par les évictions (clés expulsées avant leur réutilisation).",
          "Coût mémoire (le Go de RAM est cher) ; à taille égale, préférez améliorer la réutilisation.",
        ),
        sol(
          "Augmenter les connexions",
          `maxConnections ${rt.rc.maxConnections} → ${Math.round(rt.rc.maxConnections * 1.5)} si l'attente vient du pool de connexions.`,
          "Les clients attendent une connexion (file d'attente côté cache).",
          "Chaque connexion consomme un peu de mémoire et de CPU (context switching).",
        ),
      );
      break;
    case "balancer":
    case "cdn":
    case "proxy":
    case "storage":
      out.push(
        sol(
          "Augmenter la capacité",
          `capacityRps ${formatRps(rt.rc.capacityRps)} → ${formatRps(rt.rc.capacityRps * 2)}${
            rt.role === "balancer" ? " (ou le nombre d'instances du répartiteur)" : ""
          }.`,
          "Le rejet vient du dépassement de capacité en débit, pas des cibles aval.",
          "Coût du service géré ; vérifier que l'aval absorbe le débit supplémentaire.",
        ),
      );
      break;
    case "queue":
      out.push(
        sol(
          "Renforcer les workers aval",
          "Ajouter des consommateurs : le débit d'une file est celui de ses workers (instances × concurrence / temps de traitement).",
          "La profondeur de file grandit alors que les workers sont saturés.",
          "La dépendance aval (base…) doit absorber le débit des workers supplémentaires.",
        ),
        sol(
          "Ajouter des partitions",
          `partitions ${rt.rc.partitions} → ${rt.rc.partitions * 2} : répartit le stockage et le débit d'ingestion.`,
          "Le producteur est bridé par l'ingestion de la file elle-même.",
          "Rééquilibrage des consommateurs ; clés de partition à choisir soigneusement.",
        ),
      );
      break;
    case "worker":
      out.push(
        sol(
          "Ajouter des instances de worker",
          `instances ${rt.rc.instances} → ${rt.rc.instances * 2} : le débit de traitement croît linéairement.`,
          "Les messages s'accumulent en amont et les workers sont saturés.",
          "Coût proportionnel ; la dépendance aval (base) reçoit le double de débit.",
        ),
        sol(
          "Réduire avgProcessingMs",
          "Optimiser le traitement (batch, I/O, algorithmique) : temps par message plus court ⇒ débit plus grand sans instance.",
          "Le temps de traitement contient des phases optimisables (I/O séquentielles, batches).",
          "Effort de développement ; certains traitements ne sont pas compressibles.",
        ),
      );
      break;
    default:
      out.push(
        sol(
          "Renforcer ce composant",
          "Augmenter sa capacité nominale ou le nombre d'instances.",
          "Le composant est le facteur limitant du chemin.",
          "Coût ; vérifier l'aval avant d'augmenter le débit amont.",
        ),
      );
  }
  return out;
}

/* ============================================================
 * Règles de diagnostic
 * ============================================================ */

type Rule = (c: Ctx) => Diagnostic[];

function mk(
  id: string,
  severity: DiagnosticSeverity,
  title: string,
  nodeId: string | undefined,
  nodeLabel: string | undefined,
  evidence: { label: string; value: string }[],
  cause: string,
  explanation: string,
  solutions: DiagnosticSolution[],
): Diagnostic {
  // Identifiant garanti unique : suffixé par le nœud concerné le cas échéant.
  const d: Diagnostic = {
    id: nodeId ? `${id}--${nodeId}` : id,
    severity,
    title,
    evidence,
    cause,
    explanation,
    solutions,
  };
  if (nodeId) d.nodeId = nodeId;
  if (nodeLabel) d.nodeLabel = nodeLabel;
  return d;
}

/** R1/R2 — saturation (≥ 0,95 critique, ≥ 0,8 avertissement). */
const ruleSaturation: Rule = (c) => {
  const out: Diagnostic[] = [];
  const entries = [...c.byId.values()]
    .filter((e) => e.rt.role !== "generator" && e.nm.arrivals > 0)
    .sort((a, b) => b.nm.utilization - a.nm.utilization || a.rt.id.localeCompare(b.rt.id));
  for (const e of entries) {
    const util = e.nm.utilization;
    if (util < 0.8) continue;
    const severity: DiagnosticSeverity = util >= 0.95 ? "critical" : "warning";
    const mix = mixReadShare(c, e.rt.id);
    out.push(
      mk(
        util >= 0.95 ? "saturation-critique" : "saturation-elevee",
        severity,
        util >= 0.95 ? "Saturation critique" : "Saturation élevée",
        e.rt.id,
        e.rt.label,
        [
          { label: "Utilisation moyenne", value: pct(util) },
          { label: "Utilisation maximale", value: pct(e.nm.utilizationMax) },
          { label: "Capacité théorique", value: formatRps(e.nm.capacityRps) },
          { label: "Débit traité", value: formatRps(e.nm.throughputRps) },
          { label: "Attente p95", value: formatMs(e.nm.p95WaitMs) },
        ],
        `Le composant fonctionne à ${pct(util)} de sa capacité (${formatRps(
          e.nm.throughputRps,
        )} traités pour ${formatRps(e.nm.capacityRps)} théoriques) : chaque requête arrive à trouver les ressources occupées.`,
        `La loi de Little (L = λ × W) impose un choix : au-delà de ~80 % d'utilisation, l'attente moyenne croît de façon hyperbolique — doubler la charge résiduelle double peu le débit mais démultiplie la latence. Un composant saturé n'est pas seulement lent : il rejette (files pleines) et propage l'attente à toute la chaîne amont, qui finit elle-même par saturer. Les solutions ci-dessous sont ordonnées par rapport efficacité/coût pour ce rôle et ce mix (${pct(
          mix,
        )} de lectures).`,
        capacitySolutions(c, e.rt, mix),
      ),
    );
  }
  return out.slice(0, 4); // éviter le spam : les 4 plus saturés
};

/** R3 — file instable (ρ ≥ 1). */
const ruleUnstableQueue: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.role === "generator" || e.nm.arrivals <= 0) continue;
    if (e.nm.utilization < 1 && e.rt.role !== "queue") continue;
    if (e.rt.role === "queue") {
      // files : instabilité = profondeur qui ne se vide pas
      if (e.ex.queueDepthEnd <= 0 || e.nm.maxQueueLength <= 0) continue;
      if (e.ex.queueDepthEnd < Math.max(5, e.ex.queueDepthMax * 0.25)) continue;
    } else if (e.nm.utilization < 1) {
      continue;
    }
    const mix = mixReadShare(c, e.rt.id);
    out.push(
      mk(
        "file-instable",
        "critical",
        "File d'attente instable (ρ ≥ 1)",
        e.rt.id,
        e.rt.label,
        [
          { label: "Utilisation moyenne", value: pct(e.nm.utilization) },
          { label: "File moyenne", value: `${formatNumber(Math.round(e.nm.avgQueueLength))} requêtes` },
          { label: "File maximale", value: `${formatNumber(Math.round(e.nm.maxQueueLength))} requêtes` },
          { label: "Débit traité", value: formatRps(e.nm.throughputRps) },
        ],
        `Le taux d'arrivée dépasse la capacité de service : la file s'allonge sans limite pendant la simulation (${formatNumber(
          Math.round(e.nm.avgQueueLength),
        )} requêtes en moyenne, ${formatNumber(Math.round(e.nm.maxQueueLength))} au pic).`,
        "Une file est stable si et seulement si ρ = λ / µ < 1. À ρ ≥ 1, chaque seconde ajoute (λ − µ) requêtes : la latence croît linéairement avec le temps et le système ne rattrape jamais, même pendant les creux. Aucun buffering ne sauve un système sous-dimensionné — la file décale le problème (et la douleur) au lieu de le résoudre.",
        capacitySolutions(c, e.rt, mix).concat([
          sol(
            "Limiter le débit entrant",
            "Placer un rate limiter ou une file tampon bornée en amont : dégrader explicitement (429/503) vaut mieux que laisser la latence exploser pour tout le monde.",
            "Le pic de charge est temporaire et le client sait réessayer.",
            "Rejets visibles pour l'utilisateur ; à documenter dans le contrat de service (SLA).",
          ),
        ]),
      ),
    );
  }
  return out.slice(0, 3);
};

/** R4 — point de défaillance unique. */
const ruleSpof: Rule = (c) => {
  const out: Diagnostic[] = [];
  const trafficRoles: ReadonlySet<SimRole> = new Set(["server", "balancer", "worker", "replica"]);
  for (const e of c.byId.values()) {
    if (e.nm.arrivals <= 0) continue;
    if (trafficRoles.has(e.rt.role) && e.rt.rc.instances <= 1) {
      out.push(
        mk(
          "spof",
          "warning",
          "Point de défaillance unique (1 instance)",
          e.rt.id,
          e.rt.label,
          [
            { label: "Instances", value: "1" },
            { label: "Rôle", value: e.rt.label },
            { label: "Débit traité", value: formatRps(e.nm.throughputRps) },
          ],
          "Ce composant traite du trafic avec une seule instance : sa panne interrompt tout le chemin qui passe par lui.",
          "La haute disponibilité se construit par redondance : N+1 instances derrière un répartiteur avec health checks. Une instance unique cumule les modes de défaillance (panne machine, déploiement, mise à jour) — le « zéro downtime » exige au moins deux copies actives.",
          [
            sol(
              "Passer à 2 instances",
              "Dupliquer le composant et répartir la charge (round-robin ou least-connections) entre les copies.",
              "Le composant est stateless ou son état est partagé (base, cache).",
              "Coût ×2 ; l'état local (sessions en mémoire) doit être externalisé.",
            ),
            sol(
              "Activer les health checks",
              "Configurer le répartiteur amont pour écarter automatiquement les cibles en panne et basculer le trafic.",
              "Il existe déjà un répartiteur en amont.",
              "Un délai de détection (intervalle des sondes) pendant lequel les requêtes échouent quand même.",
            ),
          ],
        ),
      );
    }
    // base primaire sans réplica connecté
    if (e.rt.role === "database") {
      const hasReplica = c.input.runtimes.some((r) => r.role === "replica");
      if (!hasReplica) {
        out.push(
          mk(
            "spof-base",
            "warning",
            "Base primaire sans redondance",
            e.rt.id,
            e.rt.label,
            [
              { label: "Réplicas de lecture", value: "0" },
              { label: "Politique de réplication", value: e.rt.rc.replicationPolicy },
            ],
            "La base de données est la source de vérité et n'a aucun réplica/standby simulé : une panne y est définitive (perte de service, restauration longue).",
            "Une base primaire unique concentre à la fois le flux d'écritures (non dimensionnable par réplicas) et le risque de disponibilité. Un standby (même asynchrone) permet un failover en minutes ; les sauvegardes PITR bornent la perte de données. À ne pas confondre : un standby de disponibilité n'accélère pas les écritures.",
            [
              sol(
                "Ajouter un standby de failover",
                "Répliquer la base (streaming asynchrone) vers un nœud standby prêt à être promu.",
                "Le SLO de disponibilité exige un RTO de l'ordre de la minute.",
                "Coût d'un nœud complet ; le failover asynchrone peut perdre les dernières transactions (RPO > 0).",
              ),
              sol(
                "Sauvegardes + PITR",
                "Sauvegardes régulières + WAL archivé pour restaurer à un instant donné.",
                "Toute architecture, avec ou sans standby.",
                "RTO en heures ; à tester (une sauvegarde non testée n'existe pas).",
              ),
            ],
          ),
        );
      }
    }
  }
  return out.slice(0, 4);
};

/** R5 — cache inefficace. */
const ruleCacheHit: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if ((e.rt.role !== "cache" && e.rt.role !== "cdn") || e.nm.arrivals < 20) continue;
    const hitRate = e.nm.cacheHitRate;
    if (hitRate === undefined || hitRate >= 0.5) continue;
    out.push(
      mk(
        "cache-hit-faible",
        "warning",
        "Cache inefficace (taux de hit faible)",
        e.rt.id,
        e.rt.label,
        [
          { label: "Taux de hit", value: pct(hitRate) },
          { label: "Requêtes servies du cache", value: formatNumber(Math.round(e.nm.cacheHits ?? 0)) },
          { label: "Lectures reçues", value: formatNumber(Math.round(e.ex.readArrivals * (c.input.scale > 0 ? 1 / c.input.scale : 1))) },
        ],
        `Seules ${pct(hitRate)} des lectures sont servies par le cache : la majorité du trafic traverse quand même vers l'origine.`,
        "Un cache n'est rentable que si les lectures se répètent (localité). En dessous de ~50 % de hit, il coûte de la mémoire et de la latence (look-up + transfert vers l'origine) sans décharger l'origine. Les causes typiques : working set trop grand pour la mémoire, TTL trop court, clés trop fines (cardinalité), ou données peu réutilisées par nature.",
        [
          sol(
            "Vérifier le working set",
            "Comparer la taille des données chaudes à la mémoire allouée ; l'augmenter si les évictions sont fréquentes.",
            "Les métriques d'éviction montrent des clés chaudes expulsées.",
            "Coût mémoire : le Go de RAM est le poste le plus cher du cache.",
          ),
          sol(
            "Ajuster TTL et granularité",
            "Allonger les TTL des données stables et regrouper les clés trop fines (batch) pour augmenter la réutilisation.",
            "Le hit rate chute juste après chaque expiration.",
            "TTL long = données plus périmées ; invalider explicitement lors des écritures devient nécessaire.",
          ),
          sol(
            "Retirer le cache si non pertinent",
            "Si les lectures ne se répètent pas par nature, le cache est un coût inutile : le supprimer simplifie l'architecture.",
            "Flux de lectures quasi unique (analyses, exports, long tail).",
            "Supprime une couche de latence et d'incohérence ; l'origine doit tenir le débit complet.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R6 — épuisement des connexions. */
const ruleConnExhausted: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.ex.connExhaustedErrors <= 0) continue;
    const share = e.nm.arrivals > 0 ? e.ex.connExhaustedErrors / e.nm.arrivals : 0;
    out.push(
      mk(
        "connexions-epuisees",
        share > 0.02 ? "critical" : "warning",
        "Connexions à la base épuisées",
        e.rt.id,
        e.rt.label,
        [
          { label: "Requêtes en erreur d'attente", value: formatNumber(Math.round(e.ex.connExhaustedErrors)) },
          { label: "Part des arrivées", value: pct(share) },
          { label: "Connexions max", value: formatNumber(e.rt.rc.maxConnections) },
          { label: "Attente p95", value: formatMs(e.nm.p95WaitMs) },
        ],
        `${formatNumber(Math.round(e.ex.connExhaustedErrors))} requêtes ont attendu plus de 1 s une connexion et ont échoué : le pool (${formatNumber(
          e.rt.rc.maxConnections,
        )}) est saturé.`,
        "Une base n'accepte qu'un nombre fini de connexions simultanées (mémoire + process par connexion). Au-delà, les clients font la file ; côté applicatif, un délai d'attente (pool timeout) transforme l'attente en erreur. Le remède universel est le pooler applicatif : quelques dizaines de connexions bien utilisées suffisent à saturer une base — en ouvrir 10 000 aggrave tout (context switching, verrous).",
        [
          sol(
            "Pool de connexions côté application",
            "Placer un pooler (type PgBouncer / HikariCP) : il multiplexe des milliers de requêtes clientes sur un pool borné de connexions réelles.",
            "Le nombre de clients applicatifs × leurs connexions dépasse largement la capacité réelle de la base.",
            "Un réglage à surveiller (taille du pool, timeout) ; le mode transaction limite les connexions longues (LISTEN, CURSOR).",
          ),
          sol(
            "Réduire le temps par requête",
            "Requêtes plus courtes = connexions rendues plus vite = débit plus grand à pool égal (agir sur les index et les requêtes N+1).",
            "Le temps moyen par requête est optimisable.",
            "Effort de développement et de profilage.",
          ),
          sol(
            "Décharger les lectures",
            "Cache applicatif en amont : moins de lectures atteignent la base, donc moins de connexions nécessaires.",
            "Flux dominant en lectures avec réutilisation.",
            "Taux de hit à vérifier ; incohérences possibles.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R7 — cascade de timeouts. */
const ruleTimeoutCascade: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.role !== "server" || e.ex.downstreamP95Ms <= 0) continue;
    if (e.ex.downstreamP95Ms <= e.rt.rc.timeoutMs) continue;
    out.push(
      mk(
        "cascade-timeouts",
        "critical",
        "Cascade de timeouts",
        e.rt.id,
        e.rt.label,
        [
          { label: "p95 du sous-arbre aval", value: formatMs(e.ex.downstreamP95Ms) },
          { label: "Timeout configuré", value: formatMs(e.rt.rc.timeoutMs) },
          { label: "Timeouts observés", value: formatNumber(Math.round(e.nm.timeouts)) },
        ],
        `Le temps de réponse du sous-arbre aval (${formatMs(
          e.ex.downstreamP95Ms,
        )} en p95) dépasse le timeout de ce serveur (${formatMs(e.rt.rc.timeoutMs)}) : les requêtes amont abandonnent avant la réponse.`,
        "Chaque étage d'une chaîne synchrone possède son timeout. Quand le temps réel d'un étage aval dépasse le timeout de l'étage amont, l'amont abandonne — mais l'aval continue à travailler pour rien : la charge reste, la réponse part à la poubelle. C'est la pire des cascades : le système consomme sa capacité pour produire des échecs. La règle d'or : le timeout amont doit englober le p95 aval + une marge, et chaque saut doit avoir un budget de latence explicite.",
        [
          sol(
            "Aligner les budgets de latence",
            "Remonter le timeout amont au-dessus du p95 aval + marge (règle : timeout_amont > p95 aval × 1,5), ou réduire le p95 aval.",
            "Le p95 aval est légitime (traitement réel) et l'amont peut attendre plus longtemps.",
            "Un timeout long retient les ressources amont (slots, connexions) plus longtemps — la saturation se déplace.",
          ),
          sol(
            "Accélérer l'aval",
            "Cache, capacité supplémentaire ou requêtes optimisées sur le sous-arbre lent — traiter la cause plutôt que le symptôme.",
            "Le p95 aval est anormalement élevé (saturation, requêtes lentes).",
            "Coût/effort variable selon le goulot réel identifié.",
          ),
          sol(
            "Découpler en asynchrone",
            "Répondre immédiatement (202 + file) et livrer le résultat plus tard : le chemin synchrone ne porte plus le traitement long.",
            "Le client tolère une réponse différée (notification, polling).",
            "Complexité (files, workers, suivi des échecs) ; cohérence à terme.",
          ),
        ],
      ),
    );
  }
  return out.slice(0, 3);
};

/** R8 — composant isolé. */
const ruleIsolated: Rule = (c) => {
  const out: Diagnostic[] = [];
  const isolated = new Set(c.input.graph.isolatedNodeIds);
  for (const rt of c.input.runtimes) {
    if (!isolated.has(rt.id)) continue;
    if (rt.category === "observability") continue; // hors périmètre (déconnectée par nature)
    out.push(
      mk(
        "composant-isole",
        "info",
        "Composant isolé",
        rt.id,
        rt.label,
        [{ label: "Connexions", value: "0 entrante / 0 sortante" }],
        `« ${rt.label} » n'est relié à aucun autre composant : il ne reçoit ni n'émet de trafic.`,
        "Un nœud isolé ne participe ni à la simulation ni à l'architecture réelle. C'est souvent un oubli de câblage (l'utilisateur pensait l'avoir connecté) ou un vestige d'une itération de design. Les composants d'observabilité (monitoring, tracing) sont tolérés : ils écoutent sans perturber le flux.",
        [
          sol(
            "Connecter le composant",
            "Tracer une arête depuis le composant qui l'alimente (ou vers celui qu'il dessert) pour l'insérer dans le chemin de trafic.",
            "Le composant doit participer au flux.",
            "Vérifier le sens du câblage et le protocole de l'arête.",
          ),
          sol(
            "Supprimer le nœud",
            "Retirer le composant du graphe pour alléger la lecture (il n'a aucun effet simulé).",
            "Le composant est un vestige ou une note visuelle.",
            "Action purement cosmétique — aucune métrique ne changera.",
          ),
        ],
      ),
    );
  }
  return out.slice(0, 3);
};

/** R9 — rejets du rate limiter. */
const ruleRateLimit: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.role !== "rate-limiter" || e.nm.arrivals <= 0) continue;
    const rejectShare = e.nm.rejected / e.nm.arrivals;
    if (rejectShare <= 0.05) continue;
    out.push(
      mk(
        "rate-limiter-rejets",
        rejectShare > 0.3 ? "critical" : "warning",
        "Rate limiter trop restrictif",
        e.rt.id,
        e.rt.label,
        [
          { label: "Part des requêtes rejetées (429)", value: pct(rejectShare) },
          { label: "Limite", value: formatRps(e.rt.rc.limit) },
          { label: "Rafale", value: formatNumber(e.rt.rc.burst) },
          { label: "Trafic offert", value: formatRps(e.nm.arrivals / (c.input.scenario.durationSec || 1)) },
        ],
        `${pct(rejectShare)} du trafic est rejeté en 429 avant même d'atteindre l'aval : la limite (${formatRps(
          e.rt.rc.limit,
        )}) est sous le trafic offert.`,
        "Un rate limiter protège l'aval contre la surcharge — c'est un garde-fou volontaire, pas un bug. Mais réglé trop bas, il devient le goulot lui-même : les clients légitimes sont rejetés alors que l'aval avait de la marge. La limite doit couvrir le trafic de pointe légitime × une marge, et ne se déclencher que pour absorber les excès (pics, abus).",
        [
          sol(
            "Calibrer la limite sur le trafic légitime",
            `Monter la limite vers ${formatRps(e.rt.rc.limit * 2)} (et la rafale en proportion) si l'aval a la capacité correspondante.`,
            "Le trafic rejeté est légitime et l'aval dispose de marge.",
            "Moins de protection contre les pics abusifs ; l'aval doit vraiment tenir le débit.",
          ),
          sol(
            "Différencier par client",
            "Limiter par utilisateur/IP/clé API plutôt qu'en global : les gros consommateurs sont plafonnés sans pénaliser les autres.",
            "Quelques clients dominent le trafic.",
            "Complexité (identification, compteurs distribués) ; équité à surveiller.",
          ),
          sol(
            "Protéger en amont",
            "Cache/CDN en amont pour absorber la charge répétée : le limiter ne voit plus que le trafic utile.",
            "Une part importante du trafic rejeté est cacheable.",
            "Nouveaux composants à gérer ; cohérence du cache.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R10 — circuit breaker ouvert. */
const ruleCircuitOpen: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.role !== "circuit-breaker" || e.ex.cbOpenCount <= 0) continue;
    out.push(
      mk(
        "circuit-ouvert",
        "warning",
        "Circuit breaker ouvert",
        e.rt.id,
        e.rt.label,
        [
          { label: "Ouvertures", value: formatNumber(e.ex.cbOpenCount) },
          { label: "Dernière ouverture", value: e.ex.cbLastOpenAtSec === null ? "—" : `t = ${formatNumber(e.ex.cbLastOpenAtSec)} s` },
          { label: "Seuil d'erreur", value: pct(e.rt.rc.errorThreshold) },
          { label: "Cooldown", value: formatMs(e.rt.rc.cooldownMs) },
        ],
        `Le circuit s'est ouvert ${formatNumber(
          e.ex.cbOpenCount,
        )} fois : la dépendance aval renvoyait au moins ${pct(e.rt.rc.errorThreshold)} d'erreurs.`,
        "Le circuit breaker sacrifie quelques requêtes (échec immédiat pendant l'ouverture) pour en sauver beaucoup : appeler une dépendance mourante gaspille des threads, des connexions et du temps. Ouvert = échec rapide ; après le cooldown, des sondes (half-open) testent la récupération avant de rouvrir le circuit. Si le breaker s'ouvre souvent, le vrai problème est la santé de la dépendance aval, pas le breaker.",
        [
          sol(
            "Corriger la dépendance aval",
            "Traiter la cause des erreurs en aval (capacité, panne, bugs) — le breaker n'est que le symptème visible.",
            "Les erreurs aval persistent entre les ouvertures.",
            "Selon la cause racine (voir les diagnostics du composant aval).",
          ),
          sol(
            "Prévoir une réponse dégradée",
            "Servir un fallback (cache périmé, valeur par défaut, file d'attente) quand le circuit est ouvert plutôt qu'une erreur brute.",
            "Une réponse partielle vaut mieux qu'aucune réponse pour l'expérience utilisateur.",
            "Données périmées affichées ; à borner dans le temps.",
          ),
          sol(
            "Ajuster seuil et cooldown",
            `Seuil ${pct(e.rt.rc.errorThreshold)}, cooldown ${formatMs(
              e.rt.rc.cooldownMs,
            )} : les resserrer réagit plus vite mais multiplie les faux positifs sur les pics brefs.`,
            "Ouvertures trop fréquentes ou trop rares par rapport à la dynamique observée.",
            "Réglage empirique : trop sensible = instabilité, trop laxiste = lenteur à isoler.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R11 — lag de file. */
const ruleQueueLag: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.role !== "queue" || e.nm.arrivals <= 0) continue;
    const end = e.ex.queueDepthEnd;
    const max = e.ex.queueDepthMax;
    if (end < 5 && max < 50) continue;
    out.push(
      mk(
        "lag-file",
        end >= 5 ? "warning" : "info",
        end >= 5 ? "Lag de file en fin de simulation" : "File fortement sollicitée",
        e.rt.id,
        e.rt.label,
        [
          { label: "Profondeur en fin de simulation", value: formatNumber(Math.round(end)) },
          { label: "Profondeur maximale", value: formatNumber(Math.round(max)) },
          { label: "Profondeur moyenne", value: formatNumber(Math.round(e.nm.avgQueueLength)) },
          { label: "Profondeur max configurée", value: formatNumber(e.rt.rc.maxDepth) },
        ],
        end >= 5
          ? `La file contient encore ${formatNumber(
              Math.round(end),
            )} messages non consommés à la fin : les workers ne suivent pas le rythme des producteurs.`
          : `La file a culminé à ${formatNumber(
              Math.round(max),
            )} messages en attente avant de se vider : les workers sont juste à la limite.`,
        "Le lag d'une file est l'écart entre le débit produit et le débit consommé. Un lag résiduel en fin de simulation signifie que le système n'est PAS en régime permanent : la latence réelle de bout en bout (vue du message) continue de croître avec le temps. Différence clé avec une file stable : ici le client a déjà été servi (202) — c'est la fraîcheur des données qui se dégrade, pas la disponibilité.",
        [
          sol(
            "Ajouter des workers",
            "Augmenter le nombre de consommateurs jusqu'à dépasser légèrement le débit de pointe des producteurs.",
            "Le lag persiste et les workers sont saturés (utilisation ≈ 1).",
            "Coût des instances ; la dépendance aval des workers (base) reçoit plus de débit.",
          ),
          sol(
            "Accélérer le traitement",
            "Batch, parallélisme interne, optimisation du code du worker : réduire avgProcessingMs augmente le débit à instances égales.",
            "Le temps de traitement contient des phases I/O séquentielles batchables.",
            "Complexité ; le batching retarde la prise en compte des messages.",
          ),
          sol(
            "Lisser les producteurs",
            "Étaler les pics côté production (joindre la file plus tôt/tard) ou dimensionner sur le pic et accepter un coût de veille.",
            "Le lag apparaît par pics puis se résorbe.",
            "Courbe de charge imposée par le métier — pas toujours négociable.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R12 — goulot principal. */
const ruleBottleneck: Rule = (c) => {
  const overall = c.input.overall;
  if (!overall.bottleneckNodeId) return [];
  const e = c.byId.get(overall.bottleneckNodeId);
  if (!e) return [];
  const util = e.nm.utilization;
  const sev: DiagnosticSeverity = util >= 0.7 ? "warning" : "info";
  return [
    mk(
      "goulot",
      sev,
      "Goulot d'étranglement principal",
      e.rt.id,
      e.rt.label,
      [
        { label: "Utilisation moyenne", value: pct(util) },
        { label: "Utilisation maximale", value: pct(e.nm.utilizationMax) },
        { label: "Capacité théorique", value: formatRps(e.nm.capacityRps) },
        { label: "Débit traité", value: formatRps(e.nm.throughputRps) },
        { label: "File maximale", value: `${formatNumber(Math.round(e.nm.maxQueueLength))} requêtes` },
      ],
      `« ${e.rt.label} » est le composant le plus utilisé du graphe (${pct(
        util,
      )} en moyenne) : c'est lui qui limite le débit global de l'architecture.`,
      "La théorie des contraintes s'applique aux systèmes distribués : le débit d'une chaîne est celui de son maillon le plus lent. Renforcer un autre composant ne change rien (voire aggrave le goulot). D'abord mesurer — le simulateur le fait pour vous — puis renforcer LE goulot, et réitérer : le goulot se déplace.",
      capacitySolutions(c, e.rt, mixReadShare(c, e.rt.id)).concat([
        sol(
          "Réitérer la mesure après renfort",
          "Après avoir renforcé ce composant, relancer la simulation : le goulot se déplace souvent vers la dépendance aval.",
          "Toute action de dimensionnement.",
          "Un renfort isolé peut saturer l'étage suivant (la charge ne disparaît pas, elle se déplace).",
        ),
      ]),
    ),
  ];
};

/** R13 — disponibilité insuffisante. */
const ruleAvailability: Rule = (c) => {
  const overall = c.input.overall;
  if (overall.availability >= 0.99) return [];
  const sev: DiagnosticSeverity = overall.availability < 0.9 ? "critical" : "warning";
  const failures = (c.input.scenario.failure ? [c.input.scenario.failure] : []).filter(Boolean);
  const failureEv = failures
    .map((f) => `${f.nodeId} (${f.kind}, ${f.durationSec} s à partir de t=${f.startSec} s)`)
    .join(" ; ");
  return [
    mk(
      "disponibilite-faible",
      sev,
      "Disponibilité insuffisante",
      undefined,
      undefined,
      [
        { label: "Disponibilité observée", value: pct(overall.availability, 2) },
        { label: "Taux d'erreur", value: pct(overall.errorRate) },
        { label: "Requêtes en erreur", value: formatNumber(Math.round(overall.errorRequests)) },
        ...(failureEv ? [{ label: "Panne injectée", value: failureEv }] : []),
      ],
      `Seules ${pct(overall.availability, 2)} des requêtes aboutissent sans erreur — l'objectif usuel « deux neuf » (99 %) n'est pas tenu.`,
      "La disponibilité d'une chaîne synchrone est le produit des disponibilités de ses maillons : 10 composants à 99,9 % plafonnent déjà la chaîne à ~99 %. Les pannes injectées ici l'illustrent : sans redondance, chaque seconde d'indisponibilité d'un maillon unique devient une seconde d'indisponibilité globale. Les remèdes sont connus : redondance (N+1), bascule automatique (health checks), dégradation contrôlée (circuit breakers, fallbacks) et rét limité avec backoff.",
      [
        sol(
          "Redonder les maillons critiques",
          "Identifier le chemin critique (sans redondance) et dupliquer ses composants avec bascule automatique.",
          "Un composant unique porte tout le trafic et sa panne coupe le service.",
          "Coût ×2 sur les maillons redondés ; la bascule a un délai de détection.",
        ),
        sol(
          "Dégrader plutôt qu'échouer",
          "Circuit breakers + fallbacks (cache périmé, réponse partielle) : le service reste joignable, dégradé, pendant la panne.",
          "Une réponse partielle a de la valeur pour l'utilisateur.",
          "Cohérence affaiblie temporairement ; il faut borner la durée du mode dégradé.",
        ),
        sol(
          "Isoler les dépendances non critiques",
          "Sortir du chemin synchrone les dépendances non indispensables (analytics, notifications) via des files.",
          "Des dépendances périphériques échouent et entraînent les requêtes principales.",
          "Asynchronisme ; supervision des files pour ne pas créer de trous noirs silencieux.",
        ),
      ],
    ),
  ];
};

/** R14 — clampages (info). */
const ruleClamps: Rule = (c) => {
  return c.input.clamps.map((msg) =>
    mk(
      "clamp",
      "info",
      "Paramètre ajusté par le moteur",
      undefined,
      undefined,
      [{ label: "Ajustement", value: msg }],
      "Le moteur a clampé un paramètre hors bornes pour garantir une simulation exécutable et lisible.",
      "Les bornes protègent à la fois la lisibilité des résultats (séries temporelles, p95) et le temps de calcul : au-delà de 60 nœuds, 600 s ou 200 000 req/s, la simulation perd son intérêt pédagogique au prix d'un coût de calcul croissant. La valeur simulée est la valeur clampée.",
      [
        sol(
          "Ajuster le scénario",
          "Ramener le paramètre dans les bornes affichées pour retrouver la valeur exacte visée.",
          "La valeur cible dépasse une borne documentée.",
          "Au-delà des bornes, découper le problème (profils, échantillonnage, sous-graphes).",
        ),
      ],
    ),
  );
};

/** R15 — cycles / boucles. */
const ruleCycles: Rule = (c) => {
  const out: Diagnostic[] = [];
  if (c.input.loopKilled > 0) {
    out.push(
      mk(
        "boucle-detectee",
        "warning",
        "Requêtes coupées (boucle)",
        undefined,
        undefined,
        [{ label: "Requêtes interrompues", value: formatNumber(c.input.loopKilled) }],
        `${formatNumber(
          c.input.loopKilled,
        )} requêtes ont dépassé la profondeur maximale (10 sauts) et ont été coupées avec l'erreur « Boucle détectée ».`,
        "Un cycle dans le graphe (A → B → A) ferait tourner une requête indéfiniment : le moteur coupe au-delà de 10 sauts. La présence de boucles dans le graphe est presque toujours une erreur de conception — sauf motifs volontaires (retry, feedback) qui doivent être modélisés autrement (file, compteur).",
        [
          sol(
            "Retirer l'arête de retour",
            "Identifier l'arête qui referme le cycle (le chemin d'une requête doit être acyclique).",
            "Le cycle n'est pas un motif volontaire.",
            "Vérifier le sens de chaque arête du cycle dans l'éditeur.",
          ),
          sol(
            "Modéliser le retour par une file",
            "Si le retour est légitime (pipeline multi-étapes), passer par une file : le worker relit un NOUVEAU message au lieu de faire boucler la requête.",
            "Le cycle exprime un enchaînement volontaire de traitements.",
            "Asynchrone : le résultat n'est plus dans la réponse synchrone initiale.",
          ),
        ],
      ),
    );
  } else if (c.input.graph.cycles.length > 0) {
    const labels = c.input.graph.cycles
      .slice(0, 3)
      .map((cyc) => cyc.map((id) => c.input.runtimes.find((r) => r.id === id)?.label ?? id).join(" → "))
      .join(" ; ");
    out.push(
      mk(
        "cycle",
        "info",
        "Cycle détecté dans le graphe",
        undefined,
        undefined,
        [
          { label: "Cycles", value: formatNumber(c.input.graph.cycles.length) },
          { label: "Chemins", value: labels },
        ],
        "Le graphe contient un cycle : les requêtes qui l'empruntent seront coupées par la limite de profondeur.",
        "Un cycle ne provoque ici aucune boucle infinie (coupe à 10 sauts), mais traduit souvent un câblage involontaire. La protection est silencieuse tant qu'aucun trafic n'emprunte le cycle.",
        [
          sol(
            "Inspecter le cycle",
            "Suivre le chemin affiché dans l'éditeur et retirer l'arête qui referme la boucle.",
            "Aucun motif de retour volontaire n'est voulu.",
            "Vérifier chaque arête impliquée avant de supprimer.",
          ),
        ],
      ),
    );
  }
  return out;
};

/** R16 — composants visuels neutres. */
const ruleVisual: Rule = (c) => {
  const out: Diagnostic[] = [];
  for (const e of c.byId.values()) {
    if (e.rt.maturity !== "visual" || e.nm.arrivals <= 0) continue;
    out.push(
      mk(
        "visuel-neutre",
        "info",
        "Composant visuel simulé en pass-through",
        e.rt.id,
        e.rt.label,
        [
          { label: "Maturité", value: "visuel" },
          { label: "Latence injectée", value: "1 ms" },
          { label: "Capacité", value: "illimitée" },
        ],
        `« ${e.rt.label} » est un composant pédagogique/visuel : il est traversé sans effet (1 ms, capacité illimitée).`,
        "Certains composants du catalogue (décisionnels, organisationnels) n'ont pas de comportement simulable. Pour ne pas bloquer le câblage, le moteur les rend neutres : ils apparaissent dans les métriques de passage mais n'influencent ni latence, ni capacité, ni erreurs. Toute conclusion de dimensionnement doit ignorer ces nœuds.",
        [
          sol(
            "Considérer les métriques sans ce nœud",
            "Les résultats de ce composant reflètent le trafic qui le traverse, pas son propre comportement.",
            "Analyse des résultats.",
            "Aucun — information de lecture.",
          ),
        ],
      ),
    );
  }
  return out.slice(0, 4);
};

/** R17 — latence p95 élevée. */
const ruleLatency: Rule = (c) => {
  const overall = c.input.overall;
  if (overall.p95Ms < 1000 || overall.p95Ms <= 0) return [];
  return [
    mk(
      "latence-elevee",
      overall.p95Ms > 3000 ? "critical" : "warning",
      "Latence p95 élevée",
      undefined,
      undefined,
      [
        { label: "p50", value: formatMs(overall.p50Ms) },
        { label: "p95", value: formatMs(overall.p95Ms) },
        { label: "p99", value: formatMs(overall.p99Ms) },
        { label: "Moyenne", value: formatMs(overall.latencyAvgMs) },
      ],
      `La moitié des requêtes les plus lentes dépasse ${formatMs(
        overall.p95Ms,
      )} : l'expérience utilisateur se dégrade précisément pour les cas complexes.`,
      "Les percentiles hauts (p95/p99) capturent la queue de distribution : files d'attente, reprises, contenus froids. Un système peut être rapide en médiane (p50) et insupportable en p95. Deux leviers : réduire la profondeur de la chaîne synchrone (chaque saut ajoute sa latence et sa variance) et attaquer les goulots qui allongent la queue.",
      [
        sol(
          "Attaquer le goulot identifié",
          "Le diagnostic « goulot » pointe le composant qui allonge le plus l'attente : le renforcer réduit d'abord la queue.",
          "Un goulot clairement identifié par la simulation.",
          "Coût du renfort ; effet à re-mesurer.",
        ),
        sol(
          "Réduire la profondeur du chemin",
          "Rapprocher les données des serveurs (cache), paralléliser les appels indépendants, supprimer les sauts inutiles.",
          "La chaîne synchrone compte beaucoup de sauts successifs.",
          "Architecture à revoir ; paralléliser multiplie la charge instantanée sur les dépendances.",
        ),
      ],
    ),
  ];
};

/* ============================================================
 * Construction
 * ============================================================ */

const MAX_DIAGNOSTICS = 12;

export function buildDiagnostics(input: DiagnosticsInput): Diagnostic[] {
  const byId = new Map<string, { rt: NodeRuntime; nm: NodeMetrics; ex: NodeExtra }>();
  for (const rt of input.runtimes) {
    const nm = input.nodes.find((n) => n.nodeId === rt.id);
    if (!nm) continue;
    const ex =
      input.extras.get(rt.id) ??
      ({
        nodeId: rt.id,
        downstreamP95Ms: 0,
        cbOpenCount: 0,
        cbLastOpenAtSec: null,
        connExhaustedErrors: 0,
        readArrivals: 0,
        writeArrivals: 0,
        queueDepthEnd: 0,
        queueDepthMax: 0,
      } as NodeExtra);
    byId.set(rt.id, { rt, nm, ex });
  }
  const c: Ctx = { input, byId };

  const rules: Rule[] = [
    ruleSaturation,
    ruleUnstableQueue,
    ruleConnExhausted,
    ruleTimeoutCascade,
    ruleAvailability,
    ruleRateLimit,
    ruleSpof,
    ruleCacheHit,
    ruleCircuitOpen,
    ruleQueueLag,
    ruleBottleneck,
    ruleLatency,
    ruleIsolated,
    ruleCycles,
    ruleVisual,
    ruleClamps,
  ];

  const all: Diagnostic[] = [];
  for (const rule of rules) {
    all.push(...rule(c));
  }
  // tri par gravité, ordre de règle stable à gravité égale
  all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return all.slice(0, MAX_DIAGNOSTICS);
}
