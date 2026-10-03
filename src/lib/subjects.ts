/**
 * @fileoverview Fichier centralisant la liste des matières (sujets)
 * autorisées pour l'assignation aux utilisateurs.
 * Utiliser ce fichier comme source unique de vérité pour l'interface utilisateur.
 */

interface MatiereOption {
  value: string;
  label: string;
}

// Cette liste doit être synchronisée avec `MATIERES_AUTORISEES` dans les Cloud Functions.
export const MATIERES_AUTORISEES_POUR_AFFICHAGE: readonly MatiereOption[] = [
  { value: "Français", label: "Français" },
  { value: "Mathématiques", label: "Mathématiques" },
  { value: "Histoire-Géographie-Enseignement moral et civique", label: "Histoire-Géographie & EMC" },
  { value: "Physique-Chimie", label: "Physique-Chimie" },
  { value: "Sciences de la Vie et de la Terre", label: "SVT" },
  { value: "Technologie", label: "Technologie" },
  { value: "Oral de soutenance", label: "Oral de soutenance" },
];
