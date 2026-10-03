# Brevet Panorama Portable

Lire ce guide au debut de chaque reprise. Langue de travail : francais.

Depot autonome derive de Brevet-Panorama, sous licence AGPL-3.0-or-later.
Le depot en ligne reste independant. Ne pas y modifier ou deployer du code
pendant le portage local.

Objectif : application Windows x64 mono-utilisateur, hors ligne, sans installation.
React/Next est exporte en fichiers statiques et embarque dans Tauri 2.
Rust gere SQLite, les transactions et les sauvegardes. Tous les fichiers
modifiables suivent le dossier executable (data, profil WebView, sauvegardes).
Le paquet portable inclut WebView2 Fixed Version et une base initialement vide.

Ne jamais ajouter de donnees reelles d'eleves, exports d'etablissement,
base SQLite, sauvegardes ou identifiants au depot. Tests : donnees fictives.
Les identites sont importees depuis SIECLE ZIP/XML, uniquement les classes de 3e.
Les modeles et imports XLSX brevet blanc et DNB sont distincts.

Verifications : npm test, npm run lint, npm run typecheck, npm run build,
cargo test --manifest-path src-tauri/Cargo.toml, puis application native reelle.
Verifier import, reimport, notes BB1/BB2 independantes, filtres, exports,
sauvegarde/restauration, fermeture/reouverture et deplacement du dossier.
Un build reussi ne prouve pas le fonctionnement hors ligne ou la portabilite.

Sol orchestre. Utiliser luna_worker pour les travaux independants precis.
Attribuer les fichiers, ne pas ecraser les modifications des autres agents.
Ne pas declarer le portage termine tant que les parcours requis ne sont pas verifies.
