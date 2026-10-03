# Brevet Panorama Portable

Version Windows x64, locale et mono-utilisateur de
[Brevet Panorama](https://github.com/intelarti11/Brevet-Panorama).

La premiere version portable est construite et ses principaux parcours ont ete
verifies dans l'application Windows. Ce depot contient les sources, sans donnees
d'eleves. Aucune connexion Firebase n'est necessaire.

L'interface React est exportee statiquement par Next.js et embarquee dans Tauri.
Rust gere une base SQLite locale, les transactions et les sauvegardes.
Les regles de calcul et les generateurs PDF/XLSX du site sont reutilises.

## Utilisation

Extraire entierement le ZIP dans un dossier inscriptible sur un disque local,
puis ouvrir `BrevetPanoramaPortable.exe`. Garder le dossier `WebView2Fixed`
a cote du programme : le moteur inclus permet de demarrer sans installation
prealable de WebView2. Le paquet initial ne contient aucune base d'eleves.

L'application cree `data/panorama.sqlite3`, son profil WebView dans
`data/webview` et ses sauvegardes dans `data/backups`. Dans **Donnees locales**,
on peut creer une sauvegarde et restaurer une sauvegarde existante. Les vingt
plus recentes sont conservees. Fermer l'application avant de deplacer ou copier
l'ensemble du dossier; les donnees et sauvegardes suivent alors le programme.

Les identites viennent de l'export officiel SIECLE ZIP/XML, en ne retenant que
les eleves de 3e. Les modeles XLSX pre-remplis et imports des notes du brevet
blanc (BB1 ou BB2) et du DNB sont separes. Les analyses, notes manuelles,
verrous, PIX, remplacements et exports PDF/XLSX sont disponibles localement.

Les essais utilisent uniquement des donnees fictives. Un essai sur un autre PC
Windows sans WebView2 deja installe reste a effectuer avant diffusion large.

## Developpement

Prerequis : Node.js, Rust stable, outils MSVC et SDK Windows.

```powershell
npm ci
npm run tauri -- dev
```

Un navigateur seul peut afficher les ecrans, mais les donnees exigent le backend Tauri.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run native:test
```

Voir [le suivi du portage](docs/portage.md) pour les criteres de validation.

## Construire le dossier portable

Lire et accepter les conditions Microsoft avant l'acquisition du runtime :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/get-webview-runtime.ps1 -AcceptLicense
npm run portable
```

Le script de construction prepare un dossier et son ZIP dans `dist-portable/`,
avec l'executable, le runtime complet, les licences et une notice. Les fichiers
generes, bases, sauvegardes et exports sont ignores par Git. Voir
[la provenance et les conditions du runtime](docs/webview-runtime.md).

## Licence

AGPL-3.0-or-later, comme l'application d'origine. Voir [LICENSE](LICENSE).
