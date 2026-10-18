import type { CatalogComponent } from "@/types";
import { balancerFields, databaseFields, proxyFields, serverFields } from "../field";

/** Catégorie IA — modèles, vecteurs et pipelines d'inférence. */

const llm = serverFields({
  versions: [
    { value: "llm-8b", label: "LLM 8B (local)" },
    { value: "llm-70b", label: "LLM 70B (servé)" },
    { value: "api-managed", label: "API managée" },
  ],
  version: "api-managed",
  instances: 2,
  avgServiceMs: 900,
  serviceVariability: 0.4,
  maxConcurrencyPerInstance: 32,
  timeoutMs: 30000,
  errorRate: 0.01,
  cpuCoresPerInstance: 8,
  memoryGbPerInstance: 32,
  instancesHelp: "Réplicas de service d'inférence (GPU derrière).",
  avgHelp: "Temps de génération moyen selon le volume produit (les tokens se succèdent).",
});

const embeddingModel = serverFields({
  versions: [
    { value: "embed-300", label: "Encodeur 300d" },
    { value: "embed-1024", label: "Encodeur 1024d" },
  ],
  version: "embed-1024",
  instances: 2,
  avgServiceMs: 120,
  serviceVariability: 0.2,
  maxConcurrencyPerInstance: 64,
  timeoutMs: 5000,
  errorRate: 0.002,
  cpuCoresPerInstance: 4,
  memoryGbPerInstance: 16,
  avgHelp: "Encodage d'un texte moyen (~300 tokens) en vecteur.",
});

const vectorDatabase = databaseFields({
  versions: [
    { value: "vdb-2", label: "Base vectorielle v2" },
    { value: "vdb-1", label: "Base vectorielle v1" },
  ],
  version: "vdb-2",
  avgReadMs: 5,
  avgWriteMs: 20,
  maxConnections: 500,
  dataGb: 200,
  cpuCores: 16,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Recherche des plus proches voisins (ANN) : millisecondes à quelques dizaines.",
  writeHelp: "Insertion de vecteurs et reconstruction des index.",
});

const ragPipeline = proxyFields({
  capacityRps: 100,
  latencyMs: 1200,
  capacityHelp: "Questions complètes traitées par seconde (recherche + génération).",
  latencyHelp: "Latence de bout en bout : récupération, construction du contexte, génération.",
});

const inferenceServer = serverFields({
  versions: [
    { value: "vllm", label: "vLLM" },
    { value: "tensorrt", label: "TensorRT-LLM" },
    { value: "onnx", label: "Runtime ONNX" },
  ],
  version: "vllm",
  instances: 3,
  avgServiceMs: 60,
  serviceVariability: 0.3,
  maxConcurrencyPerInstance: 128,
  timeoutMs: 10000,
  errorRate: 0.001,
  cpuCoresPerInstance: 8,
  memoryGbPerInstance: 32,
  avgHelp: "Inférence batchée : la mise en commun des requêtes améliore fortement le débit.",
});

const modelRouter = balancerFields({
  layer: "l7",
  algorithm: "least-connections",
  instances: 2,
  capacityRps: 5000,
  latencyMs: 5,
  healthCheck: true,
});

const reranker = serverFields({
  versions: [
    { value: "rerank-v2", label: "Reranker v2" },
    { value: "rerank-v1", label: "Reranker v1" },
  ],
  version: "rerank-v2",
  instances: 2,
  avgServiceMs: 200,
  serviceVariability: 0.3,
  maxConcurrencyPerInstance: 32,
  timeoutMs: 10000,
  errorRate: 0.002,
  cpuCoresPerInstance: 4,
  memoryGbPerInstance: 16,
  avgHelp: "Rescore des meilleurs candidats récupérés (vingtaine de documents).",
});

const aiAgent = serverFields({
  versions: [
    { value: "agent-reasoning", label: "Agent raisonneur" },
    { value: "agent-tools", label: "Agent à outils" },
  ],
  version: "agent-tools",
  instances: 2,
  avgServiceMs: 1500,
  serviceVariability: 0.5,
  maxConcurrencyPerInstance: 16,
  timeoutMs: 60000,
  errorRate: 0.02,
  cpuCoresPerInstance: 4,
  memoryGbPerInstance: 8,
  avgHelp: "Une tâche d'agent = plusieurs étapes de raisonnement et d'appels d'outils.",
});

export const AI_COMPONENTS: CatalogComponent[] = [
  {
    id: "llm",
    name: "LLM",
    category: "ai",
    icon: "Brain",
    description:
      "Modèle de langage génératif : répond, résume, extrait — au prix d'une latence de génération.",
    ports: { inputs: 1, outputs: 1 },
    fields: llm.fields,
    defaults: llm.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["avgServiceMs", "maxConcurrencyPerInstance"],
    learning: {
      role: "Génération de texte à la demande : la brique de calcul la plus lente du système.",
      howItWorks:
        "Le modèle produit la réponse token par token : la latence se décompose en temps de premier token (prompt à traiter) puis débit de génération (tokens/s). Servir en batch (regrouper les requêtes) améliore fortement le débit GPU. La concurrence et le timeout sont critiques : une génération longue tient un slot jusqu'au bout ou expire.",
      pros: [
        "Réponses en langage naturel et raisonnement souple",
        "Un seul modèle couvre des dizaines de tâches",
      ],
      cons: [
        "Latence en centaines de ms à secondes : jamais dans le chemin critique ui",
        "Coût GPU élevé et imprévisible (volume généré)",
        "Hallucinations : fiabilité à encadrer par le design",
      ],
      useCases: ["Assistant client", "Résumé de documents", "Extraction structurée", "Copilote métier"],
      pitfalls: [
        "Appel bloquant dans la requête utilisateur : l'expérience se dégrade à chaque pic.",
        "Prompt et contexte non bornés : coût et latence explosent avec la taille d'entrée.",
      ],
      concepts: ["Token", "Time-to-first-token", "Batching", "Hallucination"],
    },
  },
  {
    id: "embedding-model",
    name: "Modèle d'embedding",
    category: "ai",
    icon: "Sparkles",
    description:
      "Encodeur transformant du texte en vecteur : la passerelle vers la recherche sémantique.",
    ports: { inputs: 1, outputs: 1 },
    fields: embeddingModel.fields,
    defaults: embeddingModel.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["avgServiceMs"],
    learning: {
      role: "Traduire le sens en nombres : similarité, recherche et classification vectorielles.",
      howItWorks:
        "Le modèle compresse un texte en un vecteur de dimension fixe : deux textes proches en sens ont des vecteurs proches (similarité cosinus). L'encodage est rapide (~100 ms) et se prête au batching. La qualité dépend du domaine : un encodeur général peut décevoir sur du jargon métier.",
      pros: [
        "Recherche sémantique : au-delà du mot-clé exact",
        "Encodage rapide et cachable (les documents changent peu)",
      ],
      cons: [
        "Qualité dépendante du domaine et de la langue",
        "Modèle changé = tous les vecteurs à recalculer",
      ],
      useCases: ["Recherche sémantique", "Déduplication", "Recommandation par contenu"],
      pitfalls: [
        "Mélanger les vecteurs de deux modèles dans le même index : similarités absurdes.",
        "Recalcul systématique d'embeddings pour des documents inchangés : coût inutile (cacher).",
      ],
      concepts: ["Vecteur", "Similarité cosinus", "Index ANN", "Dimension"],
    },
  },
  {
    id: "vector-database",
    name: "Base vectorielle",
    category: "ai",
    icon: "Boxes",
    description:
      "Index de vecteurs pour la recherche des plus proches voisins : le moteur de la recherche sémantique.",
    ports: { inputs: 1, outputs: 1 },
    fields: vectorDatabase.fields,
    defaults: vectorDatabase.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["avgReadMs"],
    learning: {
      role: "Stocker des vecteurs et retrouver les plus proches en millisecondes.",
      howItWorks:
        "Des index approximatifs (HNSW, IVF) organisent l'espace vectoriel pour qu'une requête n'explore qu'une fraction des vecteurs — c'est ce qui rend la recherche milliseconde même à des millions d'entrées. Les écritures (insertion + index) sont plus lentes et déclenchent des consolidations périodiques.",
      pros: [
        "Recherche par similarité en millisecondes à très grande échelle",
        "Filtres métadonnées combinables aux recherches vectorielles",
      ],
      cons: [
        "Résultats approximatifs (rappel < 100 %)",
        "Coût mémoire des index (HNSW notamment)",
      ],
      useCases: ["Recherche sémantique", "Recommandation", "Détection de doublons", "Mémoire d'agent"],
      pitfalls: [
        "Index reconstruit à chaque insert massif : écritures très coûteuses en flux continu.",
        "Espaces vectoriels hétérogènes (modèles différents) dans un index unique.",
      ],
      concepts: ["ANN", "HNSW", "Rappel", "Similarité"],
    },
  },
  {
    id: "rag-pipeline",
    name: "Pipeline RAG",
    category: "ai",
    icon: "Route",
    description:
      "Chaîne de recherche augmentée : récupérer les sources pertinentes puis générer ancré dessus.",
    ports: { inputs: 1, outputs: 1 },
    fields: ragPipeline.fields,
    defaults: ragPipeline.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Répondre avec les données de l'entreprise : le LLM cite au lieu d'inventer.",
      howItWorks:
        "La question est encodée en vecteur ; les documents les plus proches sont récupérés (base vectorielle), injectés dans le prompt comme contexte ; le LLM génère une réponse ancrée sur ces sources. La latence cumule chaque étape : encodage (~100 ms), recherche (~10 ms), génération (~1 s). Les caches de prompts et de questions fréquentes économisent la partie la plus chère.",
      pros: [
        "Réponses ancrées sur des données à jour et internes",
        "Sources citables : vérifiable par l'utilisateur",
      ],
      cons: [
        "Latence et coût : chaque question paie recherche + génération",
        "Qualité plafonnée par la qualité du découpage et de la récupération",
      ],
      useCases: ["Assistant sur documentation", "Support interne", "Recherche augmentée produit"],
      pitfalls: [
        "Documents découpés sans chevauchement : les réponses coupées au milieu du sens.",
        "Aucune évaluation systématique : on ne sait pas si la récupération trouve les bonnes sources.",
      ],
      concepts: ["RAG", "Chunking", "Contexte", "Ancrage"],
    },
  },
  {
    id: "inference-server",
    name: "Serveur d'inférence",
    category: "ai",
    icon: "ServerCog",
    description:
      "Service d'exécution de modèles optimisé : batching continu, mémoire partagée, haut débit.",
    ports: { inputs: 1, outputs: 1 },
    fields: inferenceServer.fields,
    defaults: inferenceServer.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["instances", "avgServiceMs"],
    learning: {
      role: "La fabrique de prédiction : servir des modèles à fort débit et latence stable.",
      howItWorks:
        "Le serveur regroupe les requêtes concurrentes en batchs dynamiques pour saturer le GPU ; la mémoire de clés-valeurs se partage entre séquences pour économiser la VRAM. Résultat : le débit par instance grimpe fortement par rapport à un traitement séquentiel. La concurrence admissible dépend de la mémoire plus que du CPU.",
      pros: [
        "Batching continu : très bon débit GPU",
        "Latence bornée par des files d'attente de requêtes",
      ],
      cons: [
        "VRAM limitante : les grands modèles bornent la concurrence",
        "À charge faible, le batching ne peut plus grouper : débit médiocre",
      ],
      useCases: ["Servage de LLM", "Classification en flux", "Vision en flux continu"],
      pitfalls: [
        "File d'attente d'inférence non bornée : la latence explose avant le rejet.",
        "Un seul gros modèle pour toutes les tâches : économiser en routant vers des petits modèles adaptés.",
      ],
      concepts: ["Batching continu", "VRAM", "Débit GPU", "File d'attente"],
    },
  },
  {
    id: "model-router",
    name: "Routeur de modèles",
    category: "ai",
    icon: "ArrowLeftRight",
    description:
      "Répartit les requêtes d'IA entre modèles et serveurs selon la tâche, la taille et la charge.",
    ports: { inputs: 1, outputs: 1 },
    fields: modelRouter.fields,
    defaults: modelRouter.defaults,
    maturity: "simulated",
    simRole: "balancer",
    subtitleFields: ["algorithm", "capacityRps"],
    learning: {
      role: "Aiguille d'IA : la bonne requête vers le bon modèle, en équilibrant la charge.",
      howItWorks:
        "Comme un répartiteur, il choisit la cible (petit modèle pour les tâches simples, grand pour les complexes) et équilibre les demandes entre serveurs selon leur charge réelle. Les health checks retirent les serveurs saturés ou morts. Le routage par capacité évite de payer un modèle 70B pour reformuler une phrase.",
      pros: [
        "Coût optimisé : la complexité de la tâche choisit le modèle",
        "Charge équilibrée entre serveurs d'inférence",
      ],
      cons: [
        "Politiques de routage à régler (complexité mal estimée = mauvais modèle)",
        "Un maillon de plus dans la latence",
      ],
      useCases: ["Flotte multi-modèles", "Priorité des requêtes payantes", "Bascuvement de modèle défaillant"],
      pitfalls: [
        "Routage uniquement round-robin : un serveur reçoit les grosses générations de tous les clients.",
        "Aucune observabilité par modèle : personne ne sait pourquoi la facture grimpe.",
      ],
      concepts: ["Least connections", "Routage par capacité", "Health check"],
    },
  },
  {
    id: "reranker",
    name: "Reranker",
    category: "ai",
    icon: "Star",
    description:
      "Modèle de re-scoring des meilleurs candidats : affine l'ordre final des résultats.",
    ports: { inputs: 1, outputs: 1 },
    fields: reranker.fields,
    defaults: reranker.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["avgServiceMs"],
    learning: {
      role: "Second étage de pertinence : trier finement ce que la recherche rapide a ramené.",
      howItWorks:
        "La première étape (recherche vectorielle) ramène 20-100 candidats en millisecondes ; le reranker évalue chaque paire (question, document) avec un modèle croisé plus précis mais plus lent. On garde le meilleur du deux mondes : rappel rapide, précision finale.",
      pros: [
        "Précision nettement supérieure au classement brut",
        "Compatible avec l'infrastructure de recherche existante",
      ],
      cons: [
        "Coût proportionnel aux candidats re-scannés",
        "Latence supplémentaire dans le chemin de réponse",
      ],
      useCases: ["Recherche produit", "RAG de qualité", "Systèmes de question-réponse"],
      pitfalls: [
        "Re-scanner des centaines de candidats : la latence du reranker dépasse celle de la recherche.",
        "Aucun plafond de candidats : coût erratique selon les requêtes.",
      ],
      concepts: ["Re-scoring", "Rappel/précision", "Modèle croisé"],
    },
  },
  {
    id: "ai-agent",
    name: "Agent IA",
    category: "ai",
    icon: "Bot",
    description:
      "Agent autonome multi-étapes : raisonne, appelle des outils, observe, recommence.",
    ports: { inputs: 1, outputs: 1 },
    fields: aiAgent.fields,
    defaults: aiAgent.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["avgServiceMs", "timeoutMs"],
    learning: {
      role: "Un travailleur logiciel : décompose une tâche, utilise des outils, boucle jusqu'au résultat.",
      howItWorks:
        "L'agent enchaîne des cycles : raisonner sur l'état, appeler un outil (recherche, API, base), observer le résultat, décider de la suite. Chaque cycle est un appel de LLM — une tâche en compte souvent trois à dix. D'où des latences de secondes à dizaines de secondes, des budgets de tokens, et l'exigence de bornes strictes (nombre de pas, temps total).",
      pros: [
        "Tâches complexes accomplies sans scénario figé",
        "Composition d'outils hétérogènes (webhook, SQL, files)",
      ],
      cons: [
        "Latence et coût multipliés par le nombre d'étapes",
        "Comportement non déterministe : surveillance et garde-fous obligatoires",
      ],
      useCases: ["Assistance technique autonome", "Enrichissement de données", "Orchestration de tâches"],
      pitfalls: [
        "Agent sans limite de pas : il boucle et consomme un budget sans fin.",
        "Outils avec effets non idempotents donnés à l'agent : le double appel devient une catastrophe.",
      ],
      concepts: ["Boucle raisonnement-action", "Outillage", "Garde-fous", "Budget de tokens"],
    },
  },
];
