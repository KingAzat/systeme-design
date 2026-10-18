/**
 * SystemLab — constantes partagées de l'éditeur.
 */

/** Type MIME du drag & drop HTML5 d'un composant depuis la bibliothèque. */
export const COMPONENT_DND_TYPE = "application/systemlab-component";

/**
 * Événement fenêtre (CustomEvent<string>) : demande d'ajout d'un composant
 * au centre du canvas (double-clic sur une carte de la bibliothèque).
 * Le canvas est le seul à connaître la conversion écran → coordonnées flow.
 */
export const ADD_COMPONENT_CENTER_EVENT = "systemlab:add-component-center";

/** Largeur/hauteur d'une carte nœud sur le canvas (px). */
export const NODE_CARD_WIDTH = 208;
export const NODE_CARD_HEIGHT = 64;

/** Taille par défaut d'une nouvelle zone (px). */
export const ZONE_DEFAULT_WIDTH = 460;
export const ZONE_DEFAULT_HEIGHT = 320;
