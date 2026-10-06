# Contribuer

Ce dépôt contient l’application Brevet Panorama Portable pour Windows.

## Signaler un problème

Utilisez les [Issues GitHub](https://github.com/intelarti11/Brevet-Panorama-Portable-DNB/issues). Indiquez la version, Windows, les étapes pour reproduire le problème et le résultat attendu et observé. N’ajoutez aucun nom d’élève, INE, export SIECLE, classeur de notes, base de données, sauvegarde ou export d’établissement ; reproduisez le problème avec des données fictives.

## Développer et vérifier

Prérequis pour la compilation Windows : Node.js 22, Rust stable, les outils C++ MSVC de Visual Studio Build Tools et le SDK Windows. Depuis la racine du dépôt, installez les dépendances et exécutez les vérifications utiles :

    npm ci
    npm test
    npm run lint
    npm run typecheck
    npm run native:test

Pour compiler l’interface, exécutez aussi **npm run build**. Vérifiez le parcours concerné lorsque vous modifiez un import, les sauvegardes ou le stockage local.

## Construire l’application portable

Lisez les [conditions Microsoft de WebView2 Fixed Version](https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us&fixed=true) et acceptez-les avant l’acquisition du moteur. Le script exige le paramètre explicite **-AcceptLicense** :

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/get-webview-runtime.ps1 -AcceptLicense
    npm run portable

La commande **npm run portable** compile l’application et prépare le dossier ainsi que l’archive ZIP dans **dist-portable/**. L’exécutable Windows utilise le moteur WebView2 inclus dans le paquet.

Le code est sous licence GNU AGPL version 3 ou ultérieure (**LICENSE**). Les polices Noto Sans, WebView2 et les dépendances conservent leurs notices propres ; voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et les répertoires de licences du paquet.
