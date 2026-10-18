import type { CatalogComponent } from "@/types";
import { generatorFields } from "../field";

/** Catégorie clients — sources de trafic additionnelles. */

const navigateur = generatorFields("Répartition du trafic entre les navigateurs et les autres sources.");
const applicationMobile = generatorFields("Répartition du trafic entre les applications mobiles et les autres sources.");
const clientApi = generatorFields("Répartition du trafic entre les clients machine et les autres sources.");

export const CLIENTS_COMPONENTS: CatalogComponent[] = [
  {
    id: "navigateur",
    name: "Navigateur",
    category: "clients",
    icon: "Monitor",
    description:
      "Navigateur web exécuté côté client : rendu, cache local et appels HTTP/HTTPS vers le système.",
    ports: { inputs: 0, outputs: 1 },
    fields: navigateur.fields,
    defaults: navigateur.defaults,
    maturity: "simulated",
    simRole: "generator",
    subtitleFields: [],
    learning: {
      role: "Source de trafic web : chaque visiteur actif déclenche des requêtes HTTP.",
      howItWorks:
        "Le navigateur émet des requêtes selon le scénario global (débit cible, mix lecture/écriture). En réalité, il apporte aussi son propre cache HTTP, la revalidation conditionnelle (ETag/If-None-Match) et le multiplexage HTTP/2 — autant de mécanismes qui réduisent le trafic atteignant l'origine.",
      pros: [
        "Cache HTTP côté client : réduit le trafic réseau gratuitement",
        "HTTP/2 et HTTP/3 multiplexent les requêtes sur une seule connexion",
      ],
      cons: [
        "Le cache navigateur échappe au contrôle du serveur (TTL uniquement)",
        "Le comportement réel dépend de l'appareil et du réseau de l'utilisateur",
      ],
      useCases: ["Site web grand public", "Application web SPA", "Back-office interne"],
      pitfalls: [
        "Compter les vues de page pour des requêtes API : une page peut déclencher 50 appels.",
        "Oublier les mécanismes de revalidation : le trafic mesuré côté serveur est déjà filtré.",
      ],
      concepts: ["Cache HTTP", "ETag", "HTTP/2", "SPA"],
    },
  },
  {
    id: "application-mobile",
    name: "Application mobile",
    category: "clients",
    icon: "Smartphone",
    description:
      "Application installée sur smartphone : trafic API plus concentré et plus agressif que le web.",
    ports: { inputs: 0, outputs: 1 },
    fields: applicationMobile.fields,
    defaults: applicationMobile.defaults,
    maturity: "simulated",
    simRole: "generator",
    subtitleFields: [],
    learning: {
      role: "Source de trafic applicative : requêtes API structurées, souvent JSON sur HTTPS.",
      howItWorks:
        "L'application émet les requêtes dictées par le scénario. Réseau mobile oblige, la latence de base et les pertes de paquets sont plus élevées qu'en fixe : les timeouts et les retries clients doivent être calibrés en conséquence. Un cache local (SQLite, fichiers) allège aussi le trafic.",
      pros: [
        "Cache local persistant : moins de requêtes répétées",
        "Requêtes plus prévisibles que le navigateur (pas d'assets)",
      ],
      cons: [
        "Versions anciennes de l'app coexistent longtemps : le backend doit tolérer des clients obsolètes",
        "Réseau mobile : latence et erreurs plus fréquentes",
      ],
      useCases: ["Application consommateur", "Application terrain hors-ligne", "Notifications push"],
      pitfalls: [
        "Retries automatiques du SDK mobile : une panne se transforme en tempête de requêtes.",
        "Ignorer les versions déployées : une API cassée pour les vieux clients reste un incident réel.",
      ],
      concepts: ["API versioning", "Retry storm", "Offline-first", "Push"],
    },
  },
  {
    id: "client-api",
    name: "Client API",
    category: "clients",
    icon: "Terminal",
    description:
      "Client programmatique (script, intégration, agent) consommant l'API de manière automatisée.",
    ports: { inputs: 0, outputs: 1 },
    fields: clientApi.fields,
    defaults: clientApi.defaults,
    maturity: "simulated",
    simRole: "generator",
    subtitleFields: [],
    learning: {
      role: "Source de trafic machine : intégrations serveur-à-serveur, batchs et automatisations.",
      howItWorks:
        "Le client API émet un trafic régulier, souvent avec des pics programmés (cron de synchronisation, exports nocturnes). Ce trafic s'ajoute au trafic humain et peut dominer le débit total, alors qu'il ne représente qu'un seul « utilisateur ».",
      pros: [
        "Trafic prévisible et planifiable (fenêtres de batch)",
        "Authentification machine (clés, mTLS) plus fiable que les sessions",
      ],
      cons: [
        "Un seul client peut générer un débit énorme et saturer l'API",
        "Pas de patience humaine : les timeouts machine sont courts",
      ],
      useCases: ["Intégration SI", "Synchronisation périodique", "Agents d'automatisation"],
      pitfalls: [
        "Laisser un client batch sans quota : il écrase le trafic utilisateur aux heures ouvrées.",
        "Oublier de distinguer trafic machine et humain dans les métriques.",
      ],
      concepts: ["mTLS", "API key", "Quota", "Batch"],
    },
  },
];
