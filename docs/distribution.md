# Notice de distribution — édition sans Remplacements

Cette édition est un programme Windows x64 à utilisateur local unique. Elle utilise une interface embarquée dans Tauri, une base SQLite locale et le moteur Microsoft WebView2 Fixed Version fourni dans le dossier portable.

## Extraire et lancer

Le fichier distribué est une archive ZIP. Extrayez-la entièrement dans un dossier local inscriptible et conservez sa structure : <code>BrevetPanoramaPortable.exe</code>, <code>WebView2Fixed</code>, les dossiers de données créés au lancement, et les notices doivent rester ensemble. Lancez ensuite <code>BrevetPanoramaPortable.exe</code>. Aucun installateur n’est requis.

Le premier lancement crée une base vide dans <code>data/panorama.sqlite3</code>. Le profil WebView est stocké dans <code>data/webview</code> et les sauvegardes locales dans <code>data/backups</code>. L’application ne requiert pas Firebase.

## Sauvegarder les données

Dans **Données locales**, créez une sauvegarde régulièrement et vérifiez que vous savez la restaurer. Fermez l’application avant de copier ou déplacer le dossier. Conservez une copie de sauvegarde séparée de celui-ci. Le ZIP d’origine ne contient pas de données d’établissement.

Le dossier <code>data</code>, les fichiers importés et les sauvegardes peuvent contenir des renseignements sur les élèves. Ne les ajoutez jamais à un dépôt ou à un rapport de bug. Utilisez des données fictives pour demander de l’aide.

## Imports

Pour importer les élèves, choisissez le fichier exact <code>ExportXML_ElevesSansAdresses.xml</code>, seul ou contenu dans un ZIP d’export SIECLE/BEE. Seuls les élèves de troisième sont retenus. Les imports de notes du brevet blanc (BB1 ou BB2) et du DNB sont distincts ; utilisez le modèle correspondant à l’import prévu.

## Limites et notices

L’application est conçue pour Windows x64. Un essai sur un autre PC Windows dépourvu de WebView2 préinstallé reste à effectuer avant diffusion large ; voir [le suivi du portage](portage.md).

Le runtime livré a ses propres conditions Microsoft. Consultez [la notice WebView2](webview-runtime.md) et gardez avec l’application le fichier de licence fourni dans <code>WebView2Fixed</code>. Les licences des autres dépendances figurent dans <code>LICENCES/Dependances/</code> dans le paquet construit. Les polices Noto Sans sont soumises à la licence SIL OFL 1.1, également présente dans [public/fonts/OFL.txt](../public/fonts/OFL.txt).
