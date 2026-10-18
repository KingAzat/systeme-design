import type { CatalogComponent } from "@/types";
import { proxyFields } from "../field";

/** Catégorie services métier — briques fonctionnelles typiques d'une application. */

const serviceUtilisateur = proxyFields({
  capacityRps: 6000,
  latencyMs: 35,
  maxConnections: 8000,
  latencyHelp: "Profil, préférences et abonnements : lectures majoritaires.",
});

const servicePaiement = proxyFields({
  capacityRps: 2000,
  latencyMs: 150,
  maxConnections: 3000,
  latencyHelp: "Validation, risque et appel au prestataire : centaines de millisecondes typiques.",
});

const serviceNotification = proxyFields({
  capacityRps: 5000,
  latencyMs: 40,
  maxConnections: 5000,
});

const serviceEmail = proxyFields({
  capacityRps: 3000,
  latencyMs: 100,
  maxConnections: 2000,
  latencyHelp: "Rendu du message puis remise SMTP : souvent plusieurs centaines de ms.",
});

const serviceSms = proxyFields({
  capacityRps: 2000,
  latencyMs: 150,
  maxConnections: 2000,
  latencyHelp: "Passerelle opérateur : latence et frais par message.",
});

const serviceCommande = proxyFields({
  capacityRps: 4000,
  latencyMs: 60,
  maxConnections: 5000,
  latencyHelp: "Vérification de stock, totalisation et persistance transactionnelle.",
});

const serviceCatalogue = proxyFields({
  capacityRps: 8000,
  latencyMs: 25,
  maxConnections: 10000,
  latencyHelp: "Lectures quasi exclusives : idéal pour un cache devant.",
});

export const BUSINESS_COMPONENTS: CatalogComponent[] = [
  {
    id: "service-utilisateur",
    name: "Service utilisateur",
    category: "business",
    icon: "UserCog",
    description:
      "Gestion des comptes : profils, préférences, abonnements et consentements.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceUtilisateur.fields,
    defaults: serviceUtilisateur.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Le service qui sait tout des comptes : identité applicative et préférences.",
      howItWorks:
        "Exposé derrière l'API, il répond aux lectures de profil (majoritaires et cacheables) et aux modifications de préférences. Les données relativement stables en font un excellent candidat au cache — avec invalidation sur modification, sinon l'utilisateur voit ses changements tarder.",
      pros: [
        "Lectures majoritaires : simple à dimensionner et à cacher",
        "Domaine autonome, rarement le goulot",
      ],
      cons: [
        "Service critique : sans profil, presque rien ne fonctionne",
        "Données personnelles : exigences de protection et d'export",
      ],
      useCases: ["E-commerce", "SaaS multi-locataires", "Applications sociales"],
      pitfalls: [
        "Appels de profil synchrones à chaque requête : ce service devient la dépendance universelle.",
        "Cache de profil sans invalidation à la modification : préférences fantômes.",
      ],
      concepts: ["Profil", "Cache invalidable", "Données personnelles"],
    },
  },
  {
    id: "service-paiement",
    name: "Service paiement",
    category: "business",
    icon: "CreditCard",
    description:
      "Encaissement et remboursement : validation, risque, prestataires et réconciliation.",
    ports: { inputs: 1, outputs: 1 },
    fields: servicePaiement.fields,
    defaults: servicePaiement.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Là où l'argent change de main : lent par nature, critique par obligation.",
      howItWorks:
        "Une transaction passe la validation, l'évaluation de risque, l'appel au prestataire (centaines de ms), puis la confirmation asynchrone (webhook). L'idempotence est vitale : un paiement rejoué ne doit pas encaisser deux fois. La latence du prestataire domine : le paiement ne doit jamais être un appel bloquant du parcours sans timeout court et repli.",
      pros: [
        "Domaine isolé : auditabilité et conformité concentrées",
        "Réconciliation asynchrone possible (files d'attente)",
      ],
      cons: [
        "Latence de centaines de ms imposée par les prestataires",
        "Aucune tolérance d'erreur : doublons et pertes sont des incidents graves",
      ],
      useCases: ["E-commerce", "Abonnements", "Marketplace (splits)"],
      pitfalls: [
        "Retry naïf sur un paiement ambigu : double encaissement — clés d'idempotence obligatoires.",
        "Confirmation traitée en synchrone dans le parcours : l'utilisateur attend le prestataire.",
      ],
      concepts: ["Idempotence", "Webhook de confirmation", "Réconciliation", "PCI-DSS"],
    },
  },
  {
    id: "service-notification",
    name: "Service notification",
    category: "business",
    icon: "BellRing",
    description:
      "Centrale de notifications : canal, préférences, déduplication et priorités.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceNotification.fields,
    defaults: serviceNotification.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Le standardiste : accepte les événements, choisit le canal et délègue l'envoi.",
      howItWorks:
        "Les événements métier (« commande expédiée ») arrivent (souvent par file) ; le service résout les préférences du destinataire, applique les règles (déduplication, quiet hours) puis route vers le canal (e-mail, SMS, push). Le stockage du « qui a reçu quoi, quand » sert autant à l'audit qu'au dépannage.",
      pros: [
        "Un point d'entrée unique pour tous les canaux",
        "Préférences et règles centralisées",
      ],
      cons: [
        "Dépendance aux prestataires d'envoi (quotas, pannes)",
        "Volume : les notifications doubblonnent le trafic métier",
      ],
      useCases: ["Commandes et expéditions", "Alertes de sécurité", "Relances"],
      pitfalls: [
        "Envoi direct dans la requête métier : le prestataire lent bloque le parcours.",
        "Aucune déduplication : l'utilisateur reçoit trois fois le même événément (et désinstalle).",
      ],
      concepts: ["Canaux", "Préférences", "Déduplication", "Quiet hours"],
    },
  },
  {
    id: "service-email",
    name: "Service e-mail",
    category: "business",
    icon: "Mail",
    description:
      "Rendu et envoi d'e-mails transactionnels : templates, pièces jointes, suivi des rebonds.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceEmail.fields,
    defaults: serviceEmail.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Le canal roi du B2C transactionnel : confirmations, reçus, réinitialisations.",
      howItWorks:
        "Le rendu assemble template et données (attention aux adresses rompues par l'oubli d'encodage), puis la remise passe par un prestataire SMTP/API avec suivi des rebonds et des plaintes. La réputation d'envoi se cultive : SPF, DKIM, DMARC et hygiène des listes, sinon tout atterrit en spam.",
      pros: [
        "Canal universel et quasi gratuit",
        "Asynchrone par nature : jamais dans le chemin critique",
      ],
      cons: [
        "Latence et délivrabilité incontrôlables (opérateurs, spam)",
        "Sensible aux messages en rafale : les prestataires limitent le débit",
      ],
      useCases: ["Confirmation de commande", "Réinitialisation de mot de passe", "Factures"],
      pitfalls: [
        "E-mail de réinitialisation bloquant envoyé en synchrone : la panne SMTP ferme les sessions.",
        "Aucune gestion de rebond : la réputation du domaine se dégrade en silence.",
      ],
      concepts: ["SMTP", "SPF/DKIM/DMARC", "Rebond", "Réputation"],
    },
  },
  {
    id: "service-sms",
    name: "Service SMS",
    category: "business",
    icon: "MessageSquare",
    description:
      "Envoi de SMS transactionnels : codes de vérification, alertes urgentes.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceSms.fields,
    defaults: serviceSms.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Le canal court et urgent : ce qui doit arriver dans la poche, maintenant.",
      howItWorks:
        "La demande passe une passerelle opérateur (ou agrégateur) ; le coût est par message et par destination. Les codes de vérification exigent latence et fiabilité ; les quotas de débit sont réels. Le seuil anti-spam réglementaire impose consentement et opt-out.",
      pros: [
        "Taux de lecture exceptionnel (minutes)",
        "Idéal pour l'authentification à deux facteurs",
      ],
      cons: [
        "Coût par message (élevé à l'international)",
        "Latence opérateur variable et quotas de débit",
      ],
      useCases: ["OTP de connexion", "Alertes de sécurité", "Rappels de rendez-vous"],
      pitfalls: [
        "Fallback SMS de l'OTP sans limitation : une attaque par SMS coûte cher à l'expéditeur.",
        "Envois marketing sans consentement : amendes et blacklistage.",
      ],
      concepts: ["OTP", "A2P", "Quota opérateur", "Consentement"],
    },
  },
  {
    id: "service-commande",
    name: "Service commande",
    category: "business",
    icon: "Package",
    description:
      "Cycle de vie des commandes : création, vérification, suivi et historique.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceCommande.fields,
    defaults: serviceCommande.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Le chef d'orchestre du parcours d'achat : cohérence entre stock, paiement et livraison.",
      howItWorks:
        "La création vérifie stock et tarifs, persiste la commande (état machine : créée, payée, expédiée…) et publie les événements du cycle. Les mises à jour asynchrones (paiement confirmé, colis parti) arrivent par messages. Le service détient la vérité d'état : toute incohérence devient visible pour le client.",
      pros: [
        "État central et auditable du parcours",
        "Événements du cycle réutilisables partout",
      ],
      cons: [
        "Coordination multi-services : sagas et compensations à gérer",
        "Écritures dominantes : difficile à cacher",
      ],
      useCases: ["E-commerce", "Réservations", "Abonnements renouvelés"],
      pitfalls: [
        "Stock vérifié puis réservé en deux appels : survente en course critique (utiliser une réservation atomique).",
        "États mis à jour par tous les services : la machine à états devient inintelligible.",
      ],
      concepts: ["Machine à états", "Saga", "Réservation de stock", "Événement de cycle"],
    },
  },
  {
    id: "service-catalogue",
    name: "Service catalogue",
    category: "business",
    icon: "Store",
    description:
      "Produits et offres : fiches, prix, disponibilité, recherche et facettes.",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceCatalogue.fields,
    defaults: serviceCatalogue.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "La vitrine : ce que le client parcourt, filtre et met au panier.",
      howItWorks:
        "Les lectures dominent massivement (listes, fiches) : la forme de sortie épouse les écrans (dénormalisation), servie par cache et index de recherche. Les mises à jour (prix, stock affiché) arrivent par flux et invalident le cache. La cohérence prix affiché / prix facturé est le point d'attention : afficher une valeur légèrement retardée est acceptable, facturer l'ancien prix ne l'est pas.",
      pros: [
        "Lectures massives cacheables : dimensionnement confortable",
        "Idéal pour la recherche et les facettes",
      ],
      cons: [
        "Cohérence prix/stock affichés : tolérance à définir précisément",
        "Variations saisonnières de catalogue : invalidations massives",
      ],
      useCases: ["E-commerce", "Marketplace", "Annuaire de services"],
      pitfalls: [
        "Changer tous les prix en pleine période de pointe : le cache se vide et la base encaisse tout.",
        "Recherche SQL par LIKE sur des millions de produits : passer à un index dédié.",
      ],
      concepts: ["Dénormalisation", "Facettes", "Invalidation", "Cohérence prix"],
    },
  },
];
