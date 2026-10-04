# Brevet Panorama Portable — sans Remplacements

Édition Windows x64, locale et mono-utilisateur de [Brevet Panorama](https://github.com/intelarti11/Brevet-Panorama). Elle permet de suivre les résultats du brevet blanc et du DNB, d’analyser les résultats par élève, classe et établissement, et d’exporter des bilans.

Cette édition **ne contient pas le module Remplacements**. L’édition complète avec ce module est maintenue dans un dépôt séparé. Ce sont deux projets distincts, chacun avec sa branche principale <code>main</code> ; les éditions ne sont pas des branches l’une de l’autre.

## Fonctionnalités

- Import des identités depuis l’export SIECLE/BEE : sélectionnez <code>ExportXML_ElevesSansAdresses.xml</code>, directement ou dans son ZIP. Seuls les élèves de troisième sont importés.
- Imports des notes du brevet blanc et du DNB séparés ; les modèles XLSX et les résultats BB1/BB2 ne se mélangent pas avec ceux du DNB.
- Saisie et analyse des résultats, suivi PIX, verrouillage des notes et comparaisons.
- Exports et bilans PDF/XLSX.
- Base SQLite et sauvegardes stockées localement dans le dossier de l’application ; aucune connexion Firebase n’est nécessaire.

## Utilisation sous Windows

Téléchargement : [dernière version et archive ZIP](https://github.com/intelarti11/Brevet-Panorama-Portable/releases/latest). [Page de présentation](https://intelarti11.github.io/Brevet-Panorama-Portable/).

1. Téléchargez et extrayez **tout le contenu** du ZIP dans un dossier local où vous pouvez écrire.
2. Gardez <code>WebView2Fixed</code> à côté de <code>BrevetPanoramaPortable.exe</code>.
3. Lancez <code>BrevetPanoramaPortable.exe</code>.

Au premier lancement, l’application crée <code>data/panorama.sqlite3</code>, un profil WebView dans <code>data/webview</code> et le dossier <code>data/backups</code>. Dans **Données locales**, créez régulièrement une sauvegarde et restaurez-la au besoin. Fermez l’application avant de copier ou déplacer son dossier. Le ZIP initial ne contient aucune donnée d’élève.

Pour les détails sur les données et les mises à jour, consultez [la notice de distribution](docs/distribution.md). Le moteur Microsoft WebView2 livré avec l’application et ses conditions sont décrits dans [la notice WebView2](docs/webview-runtime.md).

## Développement

Prérequis : Node.js, Rust stable, les outils MSVC et le SDK Windows. Depuis la racine du dépôt :

~~~powershell
npm ci
npm run tauri -- dev
~~~

Le navigateur seul ne fournit pas le stockage local : les fonctions de données nécessitent le backend Tauri.

~~~powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run native:test
~~~

Voir [le suivi du portage](docs/portage.md) et [les consignes de contribution](CONTRIBUTING.md).

### Construire le ZIP portable

Après avoir lu et accepté les [conditions Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us&fixed=true), acquérez le runtime depuis Microsoft, puis construisez le paquet :

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/get-webview-runtime.ps1 -AcceptLicense
npm run portable
~~~

La construction prépare le dossier et son ZIP dans <code>dist-portable/</code>, avec une base initialement vide, les notices et le moteur complet. Les dépendances sont téléchargées lors de la préparation des sources ; l'application embarque ensuite son interface et son stockage local.

## Auteur, licence et état de la candidature

Auteur et mainteneur : [intelarti11](https://github.com/intelarti11).

Les sources de cette édition sont préparées pour une publication publique et une proposition à la Ressourcerie de la Forge des communs numériques éducatifs. **La candidature n’est pas encore approuvée et le projet n’est pas présenté comme déjà référencé par la Forge.** La description proposée et les points restant à traiter sont dans [la checklist Forge](docs/forge.md).

Une partie du code et de la documentation a été préparée avec une assistance de programmation par Codex (OpenAI). L’application ne propose pas de fonctionnalité d’IA générative. Cette mention décrit le processus de développement et ne prétend pas certifier la conformité à un cadre officiel.

Le code de Brevet Panorama Portable est sous licence [GNU AGPL version 3 ou ultérieure](LICENSE). Les polices Noto Sans embarquées ont leur propre licence SIL OFL 1.1 et leurs crédits dans [les notices des composants tiers](THIRD_PARTY_NOTICES.md) et [public/fonts/OFL.txt](public/fonts/OFL.txt).
