# Suivi du portage

## Resultat attendu

- Dossier Windows portable avec executable, interface embarquee et WebView2 fixe.
- Un seul utilisateur local, toutes les fonctions metier accessibles.
- Aucun appel Firebase, service externe ou police distante au runtime.
- SQLite, profil WebView et sauvegardes dans le dossier du programme.
- Imports SIECLE 3e, modeles et notes BB1/BB2, DNB et PIX.
- Panoramas, comparaisons pluriannuelles, filtres et exports PDF/XLSX.
- Correction des fiches, divisions, doublons et verrous de saisie.
- Sauvegarde/restauration coherente et protection contre les ecritures partielles.

## Version 0.1.1 sans Remplacements — 4 octobre 2026

Les pages de consultation et d'import des remplacements, leur navigation,
les traitements CSV/ICS et l'export de semainier sont retires. L'aide SIECLE
nomme explicitement `ExportXML_ElevesSansAdresses.xml`, directement ou dans son ZIP.

Le stockage actif se limite aux quatre collections des eleves, resultats et
parametres. Les anciennes sauvegardes 0.1.0 restent restaurables sans perdre
les notes; leurs enregistrements historiques du module retire sont conserves
sans acces depuis l'application ou les commandes IPC.

Validation de cette edition : 73 tests frontend et 10 tests Rust reussis,
lint, typage, export statique (23 pages) et construction native reussis.
Les onze etapes du parcours natif SIECLE/BB1/BB2/DNB, la saisie, les verrous,
les sauvegardes et les exports PDF/XLSX passent. La revue de l'ecran d'import
1280 x 820 confirme le nom du fichier et l'absence du menu retire, sans erreur
de console. Ses collections sont aussi refusees par les commandes IPC.

Paquet 0.1.1 :
`dist-portable/BrevetPanoramaPortable-0.1.1-SansRemplacements-20261004-112506-691.zip`,
315 227 867 octets. SHA-256 :
`fa656aa81a2768d6ea0f2f7ee885bc80649e4e893b8a21573c5bb1aa6f662638`.
Son executable est identique a celui des essais. Le ZIP comprend le runtime
et les licences, sans fichier SQLite ni donnees d'eleves.

La fenetre native de test a ete fermee normalement. Le relancement automatise
a ete refuse par le controle automatique, sans motif plus precis : la reouverture
de l'application 0.1.1 n'a pas ete verifiee. Les tests Rust de persistance et de
restauration passent; le deplacement complet a ete teste sur la version 0.1.0.

## Validation de la version 0.1.0 — 3 octobre 2026

- [x] Tests des regles reprises et adaptateurs locaux : 73 tests frontend.
- [x] Tests Rust : 9 tests, dont transactions, persistance et restauration invalide.
- [x] Lint, typage, export statique (25 pages) et build natif.
- [x] Parcours natif d'import d'eleves fictifs et generation des deux modeles.
- [x] Imports BB1, BB2 et DNB distincts, reimport sans perte des autres notes.
- [x] Notes manuelles, verrous, annees et actualisation des panoramas.
- [x] PIX et alias de divisions par appels reels au backend Rust; corrections de
      fiches et doublons couverts par les tests de facade; pages rendues en natif.
- [x] Remplacements : collage d'un tableau EDT fictif, analyse et stockage SQLite.
- [x] Exports DNB et BB PDF/XLSX depuis le WebView natif; classeurs relus, PDF
      extraits et inspectes visuellement.
- [x] Sauvegarde/restauration depuis l'interface, reouverture et deplacement.
- [x] Aucune requete externe de la page observee pendant les parcours; l'essai
      complementaire bloque les requetes HTTP externes.
- [x] Paquet complet avec runtime fixe, base vide et notice utilisateur.
- [ ] Verification sur Windows cible sans installation prealable de WebView2.

Les essais natifs utilisent le vrai executable de production, le runtime fixe
du dossier et SQLite, sans remplacement du transport IPC ni stockage simule.
Apres fermeture et deplacement de tout le dossier, les six collections sont
identiques, les notes sont conservees et les six sauvegardes restent accessibles.
Le chemin du moteur WebView observe pointe vers le nouveau dossier portable.

Les rapports locaux sont ignores par Git : `tmp/qa/qa-summary.json`,
`tmp/native-storage-report.json`, `tmp/native-exports/report.json` et
`tmp/native-move-report.json`. Les scripts QA correspondants restent dans
`scripts/`. Les jeux de donnees sont fictifs; aucun export d'etablissement n'a
ete ajoute au depot ni au paquet.

## Paquet 0.1.0 verifie

`dist-portable/BrevetPanoramaPortable-20261003-201513-238.zip`, 315 131 983 octets.

SHA-256 : `62579fb336fee068facd329b2e6f1754ef09bbc15bea1d4d8e52106482ecc4aa`.

Le ZIP contient exactement l'executable utilise dans les essais, le runtime
Microsoft complet et les licences. Il ne contient aucun fichier SQLite ni base
d'eleves. Le script produit une base vide au premier lancement.

## Limites des essais

Le poste de test possede aussi WebView2 installe : l'utilisation du moteur
embarque a ete verifiee par son chemin de processus, mais aucun second PC ou
Windows vierge n'etait disponible. L'absence de requetes observees concerne
les pages de l'application; ce controle n'est pas une capture reseau de tout
le systeme Windows. Les pages PIX sans donnees ont ete affichees et le stockage
PIX reel a ete teste; tous les graphiques PIX n'ont pas ete compares visuellement.

## Dependances de developpement

L'installation depuis le lock reussit. `npm audit` signale 17 entrees, dont
Next 16.2.1 en criticite critique. L'[avis Next pour les serveurs Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
concerne le serveur HTTP Next, absent de l'executable portable : aucune route
API, Server Action, optimisation d'image ou `next/og` n'est embarquee. Le greffon
HTML de jsPDF qui charge DOMPurify n'est pas utilise par les exports du projet.
Aucun chemin affecte depuis les imports XML/XLSX n'a ete identifie dans cette revue.

Les alertes restent a traiter pour l'outillage de developpement; elles ne sont
pas presentees comme corrigees. Le serveur de developpement est desormais lie
a `127.0.0.1`. Une mise a jour de Next est requise avant d'en faire un serveur
accessible au reseau. Le produit distribue utilise uniquement les pages statiques
et le backend Tauri/Rust, sans serveur Next.
