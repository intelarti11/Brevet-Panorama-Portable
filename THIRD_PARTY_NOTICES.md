# Notices des composants tiers

Le code de Brevet Panorama Portable est distribué sous licence GNU Affero General Public License, version 3 ou ultérieure. Le texte intégral est fourni dans **LICENSE**. Le code source correspondant à l’exécutable est indiqué dans **SOURCE.txt** dans l’archive.

## Polices Noto Sans

Les fichiers Noto Sans Regular et Bold intégrés à l’application sont en version 2.008. Leurs métadonnées indiquent Copyright 2015–2021 Google LLC et créditent Monotype Design Team et Irene Vlachou. Ils sont sous licence SIL Open Font License 1.1. Le texte complet se trouve, dans les sources, à **public/fonts/OFL.txt** et, dans l’archive portable, à **LICENCES/Polices/OFL.txt**.

Références amont : [Google Fonts — Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans), [métadonnées et licence](https://github.com/google/fonts/tree/main/ofl/notosans) et [dépôt Noto Latin/Greek/Cyrillic](https://github.com/notofonts/latin-greek-cyrillic). Noto est une marque de Google LLC. La licence des polices reste distincte de celle du logiciel.

## Microsoft WebView2 Fixed Version

Le paquet Windows x64 inclut Microsoft WebView2 Fixed Version **154.0.4258.53**, acquis le 3 octobre 2026 depuis la [page officielle de téléchargement Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section). Microsoft décrit le [mode de distribution Fixed Version](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#the-fixed-version-runtime-distribution-mode) et publie ses [conditions de licence](https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us&fixed=true).

Le texte des conditions est livré avec le moteur sous **WebView2Fixed/LICENSE-MICROSOFT-WEBVIEW2.html** et parmi les notices sous **LICENCES/Microsoft/**. Les autres avis de licence fournis avec WebView2 sont conservés avec le runtime et dans le dossier des notices Microsoft. Ces conditions comportent des règles spécifiques à la redistribution et à l’utilisation ; consultez le texte Microsoft inclus avec le paquet. Cette notice n’est pas une certification juridique de conformité.

L’article 8 des conditions Microsoft demande d’informer l’utilisateur final que Microsoft Defender SmartScreen peut collecter et transmettre des données à Microsoft, sauf lorsque SmartScreen est désactivé. Consultez les conditions incluses et les paramètres de confidentialité de Windows pour les détails et les options disponibles.

## Dépendances

Les fichiers Excel importés sont lus avec **SheetJS CE 0.20.3** (Apache-2.0), fourni dans les sources sous **vendor/xlsx-0.20.3.tgz**. **xlsx-js-style 1.2.0** sert uniquement à écrire les classeurs produits par l’application avec leurs styles ; son ancien lecteur n’est pas utilisé pour les fichiers importés. Les [avis SheetJS](https://cdn.sheetjs.com/advisories/) concernent la lecture des fichiers non fiables ; le détail et l’empreinte de l’archive sont dans **vendor/README.md**.

L’archive contient l’inventaire (**LICENCES/Dependances/index.md** et **LICENCES/Dependances/inventory.json**) et les textes de licence disponibles dans **LICENCES/Dependances/npm/** et **LICENCES/Dependances/cargo/**. Les dépendances Cargo de construction et de test sont aussi recensées ; leur présence n’indique pas qu’elles sont toutes intégrées à l’exécutable. Les droits et auteurs de chaque composant restent ceux de ses propres auteurs.
