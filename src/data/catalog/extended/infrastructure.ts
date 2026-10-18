import type { CatalogComponent } from "@/types";
import { databaseFields, f, proxyFields, storageFields, visualFields } from "../field";

/** Catégorie infrastructure — régions, réseaux et services cloud managés. */

const regionCloud = visualFields([
  f.num("latencyInterRegionMs", "Latence inter-régions (ms)", 40, "general", {
    min: 5, max: 300, step: 5,
    help: "Aller-retour moyen vers une autre région (informatif).",
  }),
  f.num("zonesParRegion", "Zones par région", 3, "capacity", {
    min: 1, max: 10, step: 1,
  }),
]);

const zoneDisponibilite = visualFields([
  f.num("latencyIntraRegionMs", "Latence intra-région (ms)", 2, "general", {
    min: 0.5, max: 10, step: 0.5,
    help: "Aller-retour entre zones d'une même région (informatif).",
  }),
  f.bool("redondanceEnergie", "Redondance énergie + réseau", true, "advanced", {
    help: "Isolation physique des alimentations et liens (informatif).",
  }),
]);

const vpc = visualFields([
  f.text("plageReseau", "Plage réseau", "10.0.0.0/16", "general", {
    help: "Bloc d'adresses privé du réseau (informatif).",
  }),
  f.num("subnets", "Sous-réseaux", 3, "capacity", { min: 1, max: 100, step: 1 }),
]);

const subnet = visualFields([
  f.text("plageReseau", "Plage réseau", "10.0.1.0/24", "general"),
  f.sel("type", "Type", [
    { value: "public", label: "Public (avec passerelle)" },
    { value: "prive", label: "Privé (sortie NAT uniquement)" },
  ], "prive", "capacity"),
]);

const machineVirtuelle = proxyFields({
  capacityRps: 5000,
  latencyMs: 8,
  maxConnections: 4000,
  capacityHelp: "Débit applicatif indicatif d'une machine moyenne bien dimensionnée.",
  latencyHelp: "Surcoût d'orchestration hyperviseur, très faible.",
});

const managedDatabase = databaseFields({
  versions: [
    { value: "aurora-pg", label: "Aurora PostgreSQL" },
    { value: "rds-pg", label: "RDS PostgreSQL" },
    { value: "cloud-sql", label: "Cloud SQL" },
  ],
  version: "aurora-pg",
  avgReadMs: 8,
  avgWriteMs: 20,
  maxConnections: 1000,
  dataGb: 500,
  cpuCores: 16,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Lectures sur instances réparties (réplicas gérés par la plateforme).",
  writeHelp: "Écriture sur l'instance primaire, réplication par la plateforme.",
});

const objectStorage = storageFields({ latencyMs: 35, capacityRps: 5500 });

const serverlessPlatform = visualFields([
  f.num("concurrencyMax", "Concurrence maximale", 1000, "capacity", {
    min: 10, max: 100000, step: 10,
    help: "Exécutions parallèles plafonn (informatif).",
  }),
  f.num("coldStartMs", "Cold start typique (ms)", 150, "advanced", {
    min: 10, max: 10000, step: 10,
    help: "Démarrage d'une exécution neuve (runtime léger).",
  }),
]);

export const INFRASTRUCTURE_COMPONENTS: CatalogComponent[] = [
  {
    id: "region-cloud",
    name: "Région cloud",
    category: "infrastructure",
    icon: "Map",
    description:
      "Zone géographique du cloud : latence utilisateur et stratégie de résidence des données.",
    ports: { inputs: 1, outputs: 1 },
    fields: regionCloud.fields,
    defaults: regionCloud.defaults,
    maturity: "visual",
    subtitleFields: ["latencyInterRegionMs"],
    learning: {
      role: "Décision géographique première : où vivent les serveurs, par rapport aux utilisateurs.",
      howItWorks:
        "Une région regroupe plusieurs zones de disponibilité isolées ; la latence inter-régions (60-150 ms aller-retour) dicte ce qui peut être synchrone entre régions… et ce qui ne peut pas. La résidence des données (RGPD, santé) impose parfois la région, indépendamment de toute considération de performance.",
      pros: [
        "Région proche des utilisateurs : latence réduite",
        "Multi-région : survie à un sinistre régional",
      ],
      cons: [
        "Latence inter-régions incompressible dans les échanges synchrones",
        "Frais de transfert entre régions",
      ],
      useCases: ["Service mondial", "Résidence de données", "PRA géographique"],
      pitfalls: [
        "Réplication synchrone inter-régions lointaines : chaque écriture paie l'aller-retour.",
        "Région unique sans plan de bascule : le sinistre régional est l'indisponibilité totale.",
      ],
      concepts: ["Zone de disponibilité", "Latence inter-régions", "Résidence des données"],
    },
  },
  {
    id: "zone-disponibilite",
    name: "Zone de disponibilité",
    category: "infrastructure",
    icon: "MapPin",
    description:
      "Datacenter isolé dans une région : énergie et réseau indépendants, latence intra faible.",
    ports: { inputs: 1, outputs: 1 },
    fields: zoneDisponibilite.fields,
    defaults: zoneDisponibilite.defaults,
    maturity: "visual",
    subtitleFields: ["latencyIntraRegionMs"],
    learning: {
      role: "Unité d'isolation des pannes : perdre une zone ne doit pas perdre le service.",
      howItWorks:
        "Les zones d'une même région partagent peu (alimentations, réseaux distincts) et communiquent en 1-2 ms : la réplication synchrone intra-région est abordable. Répartir les instances (et les réplicas) sur plusieurs zones survit à la perte d'un datacenter entier — c'est le minimum vital de la haute disponibilité.",
      pros: [
        "HA à coût raisonnable (latence intra-région très faible)",
        "Maintenance de zone sans indisponibilité",
      ],
      cons: [
        "Coût de trafic inter-zones (faible mais non nul)",
        "Capacité parfois inégale entre zones (pénuries d'instances)",
      ],
      useCases: ["Bases multi-AZ", "Clusters répartis sur zones", "Patching en tournant"],
      pitfalls: [
        "Toutes les instances dans la même zone « par hasard » : la HA promise n'existe pas.",
        "Réplicas dans la même zone que le primaire : la perte de zone perd tout.",
      ],
      concepts: ["Multi-AZ", "Isolation", "HA", "Latence intra-région"],
    },
  },
  {
    id: "vpc",
    name: "VPC",
    category: "infrastructure",
    icon: "Cloud",
    description:
      "Réseau privé virtuel du compte cloud : périmètre d'adressage et d'isolation.",
    ports: { inputs: 1, outputs: 1 },
    fields: vpc.fields,
    defaults: vpc.defaults,
    maturity: "visual",
    subtitleFields: ["plageReseau"],
    learning: {
      role: "Le mur d'enceinte réseau : tout ce qui est dedans est privé par défaut.",
      howItWorks:
        "Le VPC définit un bloc d'adresses privées (ex. 10.0.0.0/16) découpé en sous-réseaux par zone ; les tables de routage et les security groups contrôlent les flux. Seules les passerelles explicites exposent des services. Un VPC mal découpé se paie plus tard : les plages se recouvrent entre environnements et bloquent l'interconnexion.",
      pros: [
        "Isolation forte par défaut (rien d'exposé sans décision)",
        "Adressage et routage maîtrisés",
      ],
      cons: [
        "Plage trop petite : croissance bloquée (recréation nécessaire)",
        "Interconnexion VPC entre comptes : complexité réseau réelle",
      ],
      useCases: ["Environnement applicatif cloud", "Périmètre de données", "Interconnexion VPN"],
      pitfalls: [
        "Plage 10.0.0.0/24 de départ : saturation d'adresses après la dixième équipe.",
        "Security groups larges (0.0.0.0/0) en interne « temporairement » : permanents depuis trois ans.",
      ],
      concepts: ["CIDR", "Sous-réseau", "Security group", "Passerelle"],
    },
  },
  {
    id: "subnet",
    name: "Sous-réseau",
    category: "infrastructure",
    icon: "Network",
    description:
      "Segment du VPC par zone : sépare public et privé, affine la segmentation.",
    ports: { inputs: 1, outputs: 1 },
    fields: subnet.fields,
    defaults: subnet.defaults,
    maturity: "visual",
    subtitleFields: ["type"],
    learning: {
      role: "Le quartier du réseau : public (exposé) ou privé (invisible d'Internet).",
      howItWorks:
        "Un sous-réseau public héberge les passerelles (load balancer, NAT) et reçoit le trafic entrant ; les sous-réseaux privés n'ont que des routes internes et une sortie NAT. Les bases vivent en privé : leur seule porte est le security group du sous-réseau. Un sous-réseau par zone et par niveau (web, app, data) est la segmentation saine.",
      pros: [
        "Segmentation claire des niveaux d'exposition",
        "Filtrage par strate (le web ne voit pas la base directement)",
      ],
      cons: [
        "Adresses gaspillées par les plages trop larges",
        "Réseau mal documenté : la matrice de flux devient une croyance",
      ],
      useCases: ["Tiers web/app/data", "Isolation d'environnements", "Exposition maîtrisée"],
      pitfalls: [
        "Base dans un sous-réseau public « pour débloquer » : l'incident de conformité classique.",
        "Un seul énorme sous-réseau : plus aucune segmentation effective.",
      ],
      concepts: ["Public/privé", "NAT", "Segmentation", "Table de routage"],
    },
  },
  {
    id: "machine-virtuelle",
    name: "Machine virtuelle",
    category: "infrastructure",
    icon: "Server",
    description:
      "Serveur virtuel (EC2, Compute Engine) : dimensionnement CPU/mémoire/réseau au choix.",
    ports: { inputs: 1, outputs: 1 },
    fields: machineVirtuelle.fields,
    defaults: machineVirtuelle.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "L'unité de capacité brute : le mètre-étalon de la facture et du dimensionnement.",
      howItWorks:
        "L'hyperviseur alloue des parts de CPU, mémoire et réseau à chaque machine ; la capacité applicative suit grosso modo ces parts (avec l'overcommit du CPU en voisinage). Le redimensionnement exige le plus souvent un arrêt : choisir la taille à l'avance, et scaler horizontalement plutôt que verticalement.",
      pros: [
        "Contrôle total de l'environnement (OS, bibliothèques)",
        "Gamme de tailles très fine",
      ],
      cons: [
        "Verticalement limité : la taille maximale arrive vite",
        "Maintenance à sa charge (patchs, agents, durcissement)",
      ],
      useCases: ["Charges soutenues prévisibles", "Logiciels exigeants", "Réservations de capacité"],
      pitfalls: [
        "Taille unique pour tout : la VM « standard » surdimensionnée épuise le budget.",
        "Cœur/mémoire mal équilibrés : le goulot est tantôt l'un tantôt l'autre, jamais le même.",
      ],
      concepts: ["vCPU", "Overcommit", "Scale vertical/horizontal", "Instance réservée"],
    },
  },
  {
    id: "managed-database",
    name: "Base managée",
    category: "infrastructure",
    icon: "DatabaseZap",
    description:
      "Base de données gérée par le cloud : sauvegardes, réplicas et patchs automatisés.",
    ports: { inputs: 1, outputs: 1 },
    fields: managedDatabase.fields,
    defaults: managedDatabase.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Une base de données sans l'opération d'une base de données.",
      howItWorks:
        "La plateforme gère sauvegardes, mises à jour mineures, réplicas et bascules ; l'utilisateur garde le modèle de données et le SQL. Le point de fin de service reste le dimensionnement (instances, connexions). La facturation sépare calcul (par instance-heure) et stockage (par Go) : les réplicas de lecture doublent la partie calcul.",
      pros: [
        "Opérations (sauvegarde, failover, patchs) sorties de l'équipe",
        "Réplicas de lecture en un clic",
        " snapshots et restaurations à un instant donné",
      ],
      cons: [
        "Coût supérieur à l'auto-hébergement (parfois très supérieur)",
        "Moins de contrôle : extensions et réglages fins limités",
      ],
      useCases: ["Base applicative par défaut", "Équipes sans DBA", "Exigences de PRA"],
      pitfalls: [
        "Mettre à jour la version majeure au petit bonheur : les fenêtres et tests restent à planifier.",
        "Réplicas créés « pour la sauvegarde » : ce ne sont pas des sauvegardes (une suppression logique se réplique).",
      ],
      concepts: ["Managé", "Snapshot", "Réplica de lecture", "Calcul vs stockage"],
    },
  },
  {
    id: "object-storage",
    name: "Stockage objet managé",
    category: "infrastructure",
    icon: "Package",
    description:
      "Stockage objet de la plateforme (S3, GCS) : durabilité extrême, classes de coût.",
    ports: { inputs: 1, outputs: 0 },
    fields: objectStorage.fields,
    defaults: objectStorage.defaults,
    maturity: "partial",
    simRole: "storage",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "L'entrepôt universel du cloud : tout ce qui est binaire, durable et adressable par clé.",
      howItWorks:
        "Les objets sont répliqués sur plusieurs équipements/zones dès l'écriture (durabilité ~11 neufs). Les classes de stockage échangent latence/disponibilité contre coût ; les cycles de vie déplacent automatiquement vers les classes froides. La latence par défaut se compte en dizaines de millisecondes — prévoir un CDN devant tout ce qui est servi à des utilisateurs.",
      pros: [
        "Durabilité et disponibilité par défaut, sans administration",
        "Cycle de vie automatique vers le froid : facture divisée",
      ],
      cons: [
        "Latence de dizaines de ms : pas un disque",
        "Frais de requêtes et de sortie à surveiller sur les gros volumes",
      ],
      useCases: ["Médias servis par CDN", "Sauvegardes", "Artefacts", "Data lake"],
      pitfalls: [
        "Buckets publics par défaut à l'ancienne : fuite de données classique.",
        "Aucun cycle de vie : les fichiers provisoires paient la classe standard pendant des années.",
      ],
      concepts: ["Bucket", "Classe de stockage", "Cycle de vie", "CDN devant"],
    },
  },
  {
    id: "serverless-platform",
    name: "Plateforme serverless",
    category: "infrastructure",
    icon: "CloudUpload",
    description:
      "Exécution sans serveurs (FaaS, conteneurs managés) : la plateforme porte le scaling.",
    ports: { inputs: 1, outputs: 1 },
    fields: serverlessPlatform.fields,
    defaults: serverlessPlatform.defaults,
    maturity: "visual",
    subtitleFields: ["concurrencyMax", "coldStartMs"],
    learning: {
      role: "Capacité élastique extrême : des exécutions qui apparaissent avec la demande.",
      howItWorks:
        "La plateforme instancie les exécutions au rythme des requêtes, jusqu'à un plafond de concurrence. Les cold starts (150 ms à plusieurs secondes selon le runtime) frappent les montées rapides ; la concurrence maximale protège les dépendances aval — sinon mille exécutions ouvrent mille connexions à la base.",
      pros: [
        "Élasticité quasi instantanée, zéro serveur à gérer",
        "Facturation à la milliseconde d'exécution",
      ],
      cons: [
        "Cold starts sur les montées en charge",
        "Dépendances (pools de connexions, état) à repenser entièrement",
      ],
      useCases: ["Trafic imprévisible", "Webhooks", "Traitement événementiel"],
      pitfalls: [
        "Concurrence illimitée vers une base limitée : le serverless écrase sa propre dépendance.",
        "Runtime obèse (framework lourd) : chaque cold start devient une seconde.",
      ],
      concepts: ["FaaS", "Cold start", "Concurrence maximale", "Facturation à l'usage"],
    },
  },
];
