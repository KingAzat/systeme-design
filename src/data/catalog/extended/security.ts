import type { CatalogComponent } from "@/types";
import { f, proxyFields, visualFields } from "../field";

/** Catégorie sécurité — identité, accès et protection des données. */

const authentification = proxyFields({
  capacityRps: 8000,
  latencyMs: 12,
  maxConnections: 10000,
  latencyHelp: "Vérification du mot de passe (dérivation coûteuse) ou du jeton (vérification rapide).",
});

const oauth2 = proxyFields({
  capacityRps: 5000,
  latencyMs: 25,
  maxConnections: 8000,
  latencyHelp: "Échange de code contre jeton, incluant la vérification du client.",
});

const oidc = proxyFields({
  capacityRps: 5000,
  latencyMs: 30,
  maxConnections: 8000,
});

const iam = proxyFields({
  capacityRps: 6000,
  latencyMs: 20,
  maxConnections: 10000,
  latencyHelp: "Évaluation des politiques d'accès par requête (cache des décisions conseillé).",
});

const gestionSessions = proxyFields({
  capacityRps: 10000,
  latencyMs: 3,
  maxConnections: 20000,
});

const chiffrement = proxyFields({
  capacityRps: 3000,
  latencyMs: 8,
  maxConnections: 5000,
  latencyHelp: "Appel au service de clés (enveloppe) et chiffrement de la charge.",
});

const gestionSecrets = visualFields([
  f.num("rotationDays", "Rotation des secrets (jours)", 90, "general", {
    min: 1, max: 3650, step: 1,
    help: "Cadence informative de renouvellement (informatif).",
  }),
  f.sel("backend", "Backend", [
    { value: "cloud", label: "Secrets manager cloud" },
    { value: "vault", label: "Coffre autonome" },
    { value: "file", label: "Fichier chiffré" },
  ], "cloud", "capacity"),
]);

const auditLogs = visualFields([
  f.num("retentionDays", "Rétention (jours)", 365, "general", {
    min: 1, max: 3650, step: 1,
  }),
  f.bool("immutable", "Journal inaltérable", true, "advanced", {
    help: "Écriture seule, aucune modification ni suppression (informatif).",
  }),
]);

export const SECURITY_COMPONENTS: CatalogComponent[] = [
  {
    id: "authentification",
    name: "Authentification",
    category: "security",
    icon: "Lock",
    description:
      "Vérifie l'identité des appelants : mots de passe dérivés, jetons, multi-facteurs.",
    ports: { inputs: 1, outputs: 1 },
    fields: authentification.fields,
    defaults: authentification.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Contrôle d'identité : qui exactement adresse cette requête ?",
      howItWorks:
        "Deux chemins aux coûts très différents : vérifier un mot de passe exige une dérivation coûteuse (bcrypt/argon2, ~100 ms), tandis que vérifier un jeton signé est quasi instantané. D'où le modèle dominant : authentification rare, session/jeton ensuite. La capacité du service d'auth est vitale : personne ne passe si elle tombe.",
      pros: [
        "Vérification par jeton quasi gratuite",
        "Point unique pour appliquer multi-facteurs et blocages",
      ],
      cons: [
        "La dérivation de mot de passe coûte cher (par conception)",
        "Service critique : sa panne verrouille tout le système",
      ],
      useCases: ["Connexion utilisateur", "API privées", "Fédération d'identité"],
      pitfalls: [
        "Dérivation trop rapide (MD5/SHA simples) : les mots de passe deviennent cassables.",
        "Aucune limite de tentatives : attaque par dictionnaire à débit maximal.",
      ],
      concepts: ["bcrypt/argon2", "JWT", "MFA", "Brute force"],
    },
  },
  {
    id: "oauth-2",
    name: "OAuth 2.0",
    category: "security",
    icon: "KeyRound",
    description:
      "Délégation d'accès par jetons : un utilisateur autorise une application sans lui donner son mot de passe.",
    ports: { inputs: 1, outputs: 1 },
    fields: oauth2.fields,
    defaults: oauth2.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Cadre de délégation : accès limité à une application tierce, sans partage d'identifiants.",
      howItWorks:
        "L'application est redirigée vers le serveur d'autorisation ; l'utilisateur approuve ; l'application échange un code contre un jeton d'accès à durée de vie courte, éventuellement accompagné d'un refresh token. Chaque appel présente le jeton : pas de mot de passe en circulation.",
      pros: [
        "Aucun mot de passe partagé avec des applications tierces",
        "Portée (scopes) fine : lecture seule, un seul service…",
        "Révocation immédiate des jetons",
      ],
      cons: [
        "Flux nombreux et subtils : erreurs d'implémentation fréquentes",
        "Jetons porteurs : volés = utilisés, jusqu'à expiration",
      ],
      useCases: ["Connexion via Google/GitHub", "API partenaires", "Applications mobiles"],
      pitfalls: [
        "Redirect URI non validée strictement : vol de code d'autorisation.",
        "Jeton d'accès à vie longue : prévoir refresh court et révocation.",
      ],
      concepts: ["Access token", "Refresh token", "Scopes", "Authorization code"],
    },
  },
  {
    id: "openid-connect",
    name: "OpenID Connect",
    category: "security",
    icon: "Fingerprint",
    description:
      "Couche d'identité au-dessus d'OAuth 2.0 : authentification normalisée et profil utilisateur.",
    ports: { inputs: 1, outputs: 1 },
    fields: oidc.fields,
    defaults: oidc.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Authentification standardisée : « qui est cet utilisateur », prouvé par un jeton d'identité.",
      howItWorks:
        "OIDC ajoute à OAuth 2.0 un jeton d'identité (ID token, JWT signé) et des points de terminaison userinfo/discovery. Un fournisseur d'identité unique (Keycloak, Auth0, Google) sert toutes les applications : authentification unique et déconnexion centralisée.",
      pros: [
        "Authentification unique (SSO) pour toutes les applications",
        "Contrat standard : pas d'authentification maison à maintenir",
      ],
      cons: [
        "Fournisseur d'identité critique : sa panne ferme toutes les portes",
        "Vérification de signature à faire correctement (algorithmes, audiences)",
      ],
      useCases: ["SSO entreprise", "Applications B2B", "Fédération de partenaires"],
      pitfalls: [
        "Signature du jeton non vérifiée : n'importe qui forge des identités.",
        "Audience (aud) non contrôlée : un jeton émis pour l'app A est accepté par l'app B.",
      ],
      concepts: ["ID token", "Discovery", "SSO", "JWT signé"],
    },
  },
  {
    id: "iam",
    name: "IAM",
    category: "security",
    icon: "ShieldCheck",
    description:
      "Gestion des identités et des accès : rôles, politiques et moindre privilège.",
    ports: { inputs: 1, outputs: 1 },
    fields: iam.fields,
    defaults: iam.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Qui a le droit de faire quoi : autorisation centralisée et auditée.",
      howItWorks:
        "Les décisions d'accès sont évaluées par des politiques (rôles, attributs, ressources) souvent exprimées déclarativement. Les décisions fréquentes sont mises en cache pour ne pas plier la latence. La revue périodique des droits reste humaine : l'IAM ne devine pas les droits devenus inutiles.",
      pros: [
        "Moindre privilège appliqué de façon homogène",
        "Piste d'audit : chaque refus et accord est traçable",
      ],
      cons: [
        "Politiques complexes à écrire (et à relire)",
        "Évaluation dans le chemin critique : latence à maîtriser par cache",
      ],
      useCases: ["Accès cloud (IAM AWS/GCP)", "Autorisation applicative", "Conformité"],
      pitfalls: [
        "Rôle surpuissant « pour débloquer » : le moindre privilège meurt ce jour-là.",
        "Politiques documentées nulle part : personne ne sait pourquoi cet accès existe.",
      ],
      concepts: ["Moindre privilège", "RBAC/ABAC", "Politique", "Audit"],
    },
  },
  {
    id: "gestion-secrets",
    name: "Gestion des secrets",
    category: "security",
    icon: "Vault",
    description:
      "Coffres de secrets : clés, mots de passe et certificats stockés et diffusés contrôlément.",
    ports: { inputs: 1, outputs: 1 },
    fields: gestionSecrets.fields,
    defaults: gestionSecrets.defaults,
    maturity: "visual",
    subtitleFields: ["rotationDays"],
    learning: {
      role: "Évite les secrets en clair : ils vivent dans un coffre et sortent sur présentation de droits.",
      howItWorks:
        "Les secrets sont chiffrés au repos, diffusés aux applications authentifiées (identité de machine) et journalisés. La rotation périodique limite la fenêtre d'exploitation d'un secret volé ; les moteurs dynamiques vont jusqu'à créer des identités à durée de vie courte.",
      pros: [
        "Zéro secret en clair dans le code ou les images",
        "Rotation et révocation centralisées",
      ],
      cons: [
        "Le coffre devient critique : pannes d'accès aux secrets = pannes applicatives",
        "Habitudes à outiller (injection au démarrage, renouvellement)",
      ],
      useCases: ["Clés de base", "Certificats TLS", "Identifiants de services externes"],
      pitfalls: [
        "Secrets versionnés dans Git : même « supprimés », ils restent dans l'historique.",
        "Fichier .env partagé entre environnements : la prod dans le poste du développeur.",
      ],
      concepts: ["Coffre", "Rotation", "Identité de machine", "Chiffrement au repos"],
    },
  },
  {
    id: "gestion-sessions",
    name: "Gestion des sessions",
    category: "security",
    icon: "Repeat",
    description:
      "État des utilisateurs connectés : identifiants de session, expiration, invalidation.",
    ports: { inputs: 1, outputs: 1 },
    fields: gestionSessions.fields,
    defaults: gestionSessions.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Raccourci entre l'identité vérifiée une fois et les mille requêtes suivantes.",
      howItWorks:
        "Après authentification, le serveur émet un identifiant opaque stocké côté client (cookie) et référence l'état de session — soit en mémoire locale (cookie signé/JWT), soit dans un magasin partagé (Redis) pour révocation immédiate et multi-instances.",
      pros: [
        "Magasin partagé : révocation instantanée et vue cohérente entre instances",
        "Sessions opaques : rien d'exploitable côté client",
      ],
      cons: [
        "Magasin de sessions : dépendance et charge supplémentaires",
        "Vitesse d'expiration : ergonomie contre sécurité",
      ],
      useCases: ["Applications web classiques", "Back-offices", "Parcours de paiement"],
      pitfalls: [
        "Sessions en mémoire locale + load balancer sans affinité : déconnexions aléatoires.",
        "Expiration à jamais : les jetons volés servent indéfiniment.",
      ],
      concepts: ["Cookie", "Session opaque", "Révocation", "Expiration"],
    },
  },
  {
    id: "service-chiffrement",
    name: "Service de chiffrement",
    category: "security",
    icon: "FileLock",
    description:
      "Chiffrement des données par enveloppe : clés gérées par un service dédié (KMS).",
    ports: { inputs: 1, outputs: 1 },
    fields: chiffrement.fields,
    defaults: chiffrement.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Protège les données sensibles au repos et en transit, sans exposer les clés aux applications.",
      howItWorks:
        "Le service garde les clés maîtresses dans du matériel dédié (HSM) ; les applications demandent une clé de données (enveloppe) pour chiffrer localement de gros volumes. Chaque appel au service coûte quelques millisecondes : les clés sont mises en cache et seules les opérations rares (rotation, nouvelles données) y retournent.",
      pros: [
        "Clés jamais manipulées par l'application",
        "Rotation et journalisation des usages centralisées",
      ],
      cons: [
        "Appel réseau dans le chemin critique si mal mis en cache",
        "Service critique : sans les clés, aucune donnée n'est lisible",
      ],
      useCases: ["Chiffrement de colonnes sensibles", "Chiffrement de sauvegardes", "Certificats"],
      pitfalls: [
        "Appeler le KMS par enregistrement écrit : le débit tombe à quelques milliers/s.",
        "Clé de données unique pour toute la table : la rotation n'a plus d'effet cloisonné.",
      ],
      concepts: ["Enveloppe", "HSM", "Rotation de clés", "Chiffrement au repos"],
    },
  },
  {
    id: "audit-logs",
    name: "Journaux d'audit",
    category: "security",
    icon: "FileText",
    description:
      "Piste d'audit immuable : qui a fait quoi, quand, avec quel résultat.",
    ports: { inputs: 1, outputs: 1 },
    fields: auditLogs.fields,
    defaults: auditLogs.defaults,
    maturity: "visual",
    subtitleFields: ["retentionDays"],
    learning: {
      role: "Preuve chronologique des actions : sécurité, conformité et enquêtes après incident.",
      howItWorks:
        "Chaque action sensible est journalisée avec identité, horodatage, action et résultat, puis exportée vers un stockage à écriture seule (WORM) que même les administrateurs ne peuvent pas réécrire. La valeur vient de la chaîne complète : des trous dans la piste détruisent sa valeur probante.",
      pros: [
        "Enquête après incident possible (chronologie fiable)",
        "Exigences de conformité satisfaites (traçabilité)",
      ],
      cons: [
        "Volume important : rétention coûteuse",
        "Journaliser trop de données sensibles… crée un problème de données sensibles",
      ],
      useCases: ["Accès aux données de santé", "Opérations financières", "Actions d'administration"],
      pitfalls: [
        "Journal modifiable par les admins qu'il est censé surveiller.",
        "Absence d'horodatage synchronisé (NTP) : la chronologie ne tient pas debout.",
      ],
      concepts: ["WORM", "Horodatage", "Traçabilité", "Conformité"],
    },
  },
];
