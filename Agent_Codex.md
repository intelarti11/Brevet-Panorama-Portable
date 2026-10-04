# Brevet Panorama Portable — sans Remplacements

Lire ce guide au début de chaque reprise. Langue de travail : français.

## Dépôts et périmètre

Cette édition sans Remplacements vit dans son propre dépôt GitHub, préparé pour la publication publique et une proposition à la Ressourcerie. L’édition complète est maintenue dans un autre dépôt, prévu pour rester privé. Ce sont deux dépôts distincts avec une branche principale <code>main</code> chacun ; ne les traite pas comme des branches d’un même projet. L’application web en ligne reste indépendante.

Cette édition cible Windows x64, un seul utilisateur et un usage local hors ligne. L’interface React/Next est exportée en fichiers statiques et intégrée dans Tauri 2. Rust gère SQLite, les transactions et les sauvegardes. Les données, le profil WebView et les sauvegardes suivent le dossier de l’application. Le paquet portable embarque WebView2 Fixed Version et commence avec une base vide.

## Données et imports

Ne jamais ajouter de noms réels, INE, exports d’établissement, bases SQLite, sauvegardes, données de Remplacements ou identifiants dans Git, les rapports de bug ou les paquets sources. Utiliser des données fictives.

L’import officiel des élèves doit indiquer le nom de fichier exact <code>ExportXML_ElevesSansAdresses.xml</code> ; le XML seul ou le ZIP qui le contient est accepté. Seuls les élèves de troisième sont importés. Les imports des notes du brevet blanc (BB1/BB2) et du DNB sont distincts.

Le module Remplacements est absent de cette édition. Ne pas y réintroduire ses pages, imports CSV/ICS ou exports. Préserver la compatibilité des anciennes sauvegardes selon les règles du code, sans réactiver leurs anciennes fonctions.

## Documentation et notices

Garder en français le README, CONTRIBUTING, les notices tierces et les consignes Forge. Le projet est candidat à la Ressourcerie, mais ne pas le présenter comme publié ou approuvé. Toute page Forge doit être créée avant d’indiquer son URL. La description de l’assistance de Codex doit rester transparente et ne pas revendiquer de certification.

Maintenir l’AGPL du code et la notice SIL OFL 1.1 des fichiers Noto Sans. La licence Microsoft de WebView2 s’applique séparément et doit rester avec le runtime dans les archives. Ne pas supprimer les notices générées dans <code>LICENCES/Dependances/</code>.

## Vérifications à effectuer pour les changements concernés

Lancer les tests frontend, lint, typage, build et tests Rust ; vérifier aussi un parcours natif pertinent. Pour toute modification des imports ou sauvegardes, tester avec des données fictives. Un build réussi seul ne prouve pas le comportement hors ligne ni la portabilité. Vérifier l’import exact SIECLE, l’indépendance BB1/BB2/DNB, les sauvegardes/restaurations, la fermeture/réouverture et le déplacement du dossier lorsque ces zones changent.

Sol orchestre. Attribuer les fichiers pour éviter les conflits. Ne pas modifier l’application en ligne ou l’autre dépôt dans le cadre d’une tâche limitée à cette édition. Ne pas modifier Git, les branches, commits ou publications dans le cadre d’un travail limité à la documentation.
