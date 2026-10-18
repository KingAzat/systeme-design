import type { CatalogComponent } from "@/types";
import { f, storageFields, visualFields } from "../field";

/** Catégorie stockage — persistance d'objets, fichiers et blocs. */

const stockageObjet = storageFields({ latencyMs: 40, capacityRps: 5500 });
const stockageFichiers = storageFields({ latencyMs: 15, capacityRps: 8000 });
const stockageBloc = storageFields({ latencyMs: 5, capacityRps: 15000 });

const volumePersistant = visualFields([
  f.num("capacityGb", "Capacité (Go)", 100, "general", {
    min: 1, max: 10000, step: 1,
    help: "Taille du volume attaché (informatif).",
  }),
  f.sel("type", "Type de disque", [
    { value: "ssd", label: "SSD (faible latence)" },
    { value: "hdd", label: "HDD ( gros volume )" },
  ], "ssd", "capacity"),
]);

const sauvegarde = visualFields([
  f.sel("frequency", "Fréquence", [
    { value: "hourly", label: "Horaire" },
    { value: "daily", label: "Quotidienne" },
    { value: "weekly", label: "Hebdomadaire" },
  ], "daily", "general"),
  f.num("retentionDays", "Rétention (jours)", 30, "capacity", {
    min: 1, max: 3650, step: 1,
    help: "Durée de conservation des sauvegardes (informatif).",
  }),
]);

export const STORAGE_COMPONENTS: CatalogComponent[] = [
  {
    id: "stockage-objet",
    name: "Stockage objet",
    category: "storage",
    icon: "Package",
    description:
      "Stockage d'objets adressés par clé (S3, GCS) : durable, illimité, latence de dizaines de ms.",
    ports: { inputs: 1, outputs: 0 },
    fields: stockageObjet.fields,
    defaults: stockageObjet.defaults,
    maturity: "partial",
    simRole: "storage",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Range des objets binaires (médias, documents, sauvegardes) avec une durabilité extrême.",
      howItWorks:
        "Chaque objet est adressé par une clé unique dans un bucket ; l'accès passe par une API HTTP. La latence de premier octet se compte en dizaines de millisecondes — imbattable en coût et durabilité (11 neufs), mais pas fait pour les lectures aléatoires fines. Le listing coûte cher sur de gros préfixes.",
      pros: [
        "Coût au Go imbattable et durabilité très élevée",
        "Montée en charge quasi illimitée, pas de capacité à planifier",
      ],
      cons: [
        "Latence de dizaines de ms : inadapté aux accès aléatoires fréquents",
        "Pas de système de fichiers : renommage = copie",
      ],
      useCases: ["Médias utilisateur", "Sauvegardes", "Artefacts de build", "Data lake brut"],
      pitfalls: [
        "Millions de petits objets : coûts de requête et de listing explosent.",
        "Oublier le cycle de vie : les données provisoires restent des années.",
      ],
      concepts: ["Bucket", "Clé", "Durabilité 11×9", "Cycle de vie"],
    },
  },
  {
    id: "stockage-fichiers",
    name: "Stockage fichiers",
    category: "storage",
    icon: "FolderOpen",
    description:
      "Partage réseau de fichiers (NFS, EFS) : arborescence commune à plusieurs serveurs.",
    ports: { inputs: 1, outputs: 0 },
    fields: stockageFichiers.fields,
    defaults: stockageFichiers.defaults,
    maturity: "partial",
    simRole: "storage",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Un disque réseau partagé : plusieurs instances voient la même arborescence.",
      howItWorks:
        "Le protocole réseau de fichiers (NFS, SMB) rend un répertoire distant utilisable comme un disque local. Latence de quelques millisecondes à quelques dizaines selon le cache. Pratique pour les applications qui exigent un vrai système de fichiers — mais le débit dépend du partage, pas de l'application.",
      pros: [
        "Compatible avec les outils classiques (chemins, permissions)",
        "Partage natif entre instances",
      ],
      cons: [
        "Débit et latence bornés par le serveur de fichiers",
        "Verrous et métadonnées : performances décevantes à grande échelle",
      ],
      useCases: ["Fichiers applicatifs partagés", "Imports/exports", "Legacy"],
      pitfalls: [
        "Utiliser du fichier là où l'objet suffirait : coût et latence supérieurs.",
        "Beaucoup de petites écritures : les métadonnées dominent le temps.",
      ],
      concepts: ["NFS", "SMB", "Métadonnées", "Cache client"],
    },
  },
  {
    id: "stockage-bloc",
    name: "Stockage bloc",
    category: "storage",
    icon: "HardDrive",
    description:
      "Disque virtuel attaché à une machine : latence de millisecondes pour les bases de données.",
    ports: { inputs: 1, outputs: 0 },
    fields: stockageBloc.fields,
    defaults: stockageBloc.defaults,
    maturity: "partial",
    simRole: "storage",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Le disque dur d'une machine virtuelle : rapide, dédié, non partagé.",
      howItWorks:
        "Le volume bloc est présenté comme un disque brut (à formater). Les IOPS et le débit sont provisionnés ; les bases de données en dépendent directement (fsync par transaction). Attaché à une seule machine à la fois : pour partager, il faut du réseau de fichiers au-dessus.",
      pros: [
        "Latence de millisecondes : l'étage pour les charges transactionnelles",
        "Performances prévisibles (IOPS provisionnés)",
      ],
      cons: [
        "Non partageable entre instances",
        "Coût au Go supérieur à l'objet",
      ],
      useCases: ["Disques de bases de données", "Volumes de systèmes", "Swap"],
      pitfalls: [
        "IOPS insuffisants pour les écritures transactionnelles : chaque COMMIT attend le disque.",
        "Snapshot pendant pic d'écriture : latence et contention.",
      ],
      concepts: ["IOPS", "fsync", "Volume", "Snapshot"],
    },
  },
  {
    id: "volume-persistant",
    name: "Volume persistant",
    category: "storage",
    icon: "HardDrive",
    description:
      "Volume détaché du cycle de vie des conteneurs : survit aux redéploiements.",
    ports: { inputs: 1, outputs: 1 },
    fields: volumePersistant.fields,
    defaults: volumePersistant.defaults,
    maturity: "visual",
    subtitleFields: ["capacityGb", "type"],
    learning: {
      role: "Mémoire de survie des conteneurs : les données dépassent la vie du pod.",
      howItWorks:
        "Le volume est monté dans le conteneur à un chemin donné ; ce qui y est écrit survit au redémarrage (et parfois à la réinstallation sur un autre nœud selon la classe de stockage). En éphémère par défaut, un conteneur perd tout — le volume persistant est la réponse.",
      pros: [
        "Les données survivent aux déploiements et redémarrages",
        "Snapshots et sauvegardes possibles au niveau du volume",
      ],
      cons: [
        "Casse la scalabilité horizontale si les données sont locales à un nœud",
        "Attachement limité à un nœud à la fois (sauf système distribué au-dessus)",
      ],
      useCases: ["Données de base conteneurisée", "Cache local à un pod", "Artefacts de build"],
      pitfalls: [
        "Volume local + autoscaling : les requêtes aboutissent sur des instances sans les données.",
        "Oublier la sauvegarde du volume : le « persistant » n'est pas l'« indestructible ».",
      ],
      concepts: ["Ephemeral vs persistent", "PV/PVC", "Classe de stockage"],
    },
  },
  {
    id: "sauvegarde",
    name: "Sauvegarde",
    category: "storage",
    icon: "DatabaseBackup",
    description:
      "Copies de secours planifiées des données : dernier rempart contre la perte.",
    ports: { inputs: 1, outputs: 1 },
    fields: sauvegarde.fields,
    defaults: sauvegarde.defaults,
    maturity: "visual",
    subtitleFields: ["frequency", "retentionDays"],
    learning: {
      role: "Filet de sécurité : restaurer les données après une erreur humaine ou un sinistre.",
      howItWorks:
        "Des instantanés (snapshots) ou exports complets sont pris selon une cadence, conservés selon une rétention et idéalement répliqués hors site. La vraie mesure d'une sauvegarde n'est pas sa prise mais sa restauration : sans test de restauration régulier, on découvre les problèmes pendant l'incident.",
      pros: [
        "Protection contre l'effacement accidentel et le rançonnage",
        "Historique de rétention pour revenir dans le temps",
      ],
      cons: [
        "Restauration lente (volumes massifs)",
        "Sans test : confiance aveugle et découverte au pire moment",
      ],
      useCases: ["Bases de données", "Stockage d'objets", "Conformité réglementaire"],
      pitfalls: [
        "Sauvegarder sur le même site que la production : le sinistre emporte les deux.",
        "Aucun test de restauration depuis plus d'un an : ce n'est pas une sauvegarde, c'est un espoir.",
      ],
      concepts: ["RPO/RTO", "Snapshot", "Restauration", "Hors site"],
    },
  },
];
