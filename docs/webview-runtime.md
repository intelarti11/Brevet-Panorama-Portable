# Runtime WebView2 portable

L’application embarque le runtime **WebView2 Fixed Version x64**. Cela garde la version Chromium avec l’application et évite une installation du runtime sur le poste. Microsoft précise que les binaires Fixed Version dépassent 250 Mo et qu’ils doivent être distribués avec l’application.

## Source et version sélectionnée

La source de téléchargement est la page officielle Microsoft [Download the WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section). Sa liste Fixed Version x64 indique actuellement **154.0.4258.53** (consultée le 3 octobre 2026). L’API de métadonnées utilisée par cette page publie le CAB suivant, acquis directement auprès du serveur Microsoft :

```text
https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/0b89c3a3-0043-4746-b39e-65830da7744d/Microsoft.WebView2.FixedVersionRuntime.154.0.4258.53.x64.cab
```

La documentation Microsoft explique le mode Fixed Version, son extraction avec `expand` et l’empaquetage de tous ses binaires avec l’application : [Distribute your app and the WebView2 Runtime](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#the-fixed-version-runtime-distribution-mode). La page indique que seuls les builds les plus corrigés des deux versions majeures les plus récentes sont disponibles en téléchargement ; archiver le CAB permet de conserver une version précise.

## Conditions de licence

Le bouton Download de la section Fixed Version ouvre les [Microsoft Software License Terms pour Microsoft Edge WebView2 Runtime (Fixed Version)](https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us&fixed=true). Le fichier complet fourni par cet endpoint est inclus à la racine du runtime sous `WebView2Fixed\LICENSE-MICROSOFT-WEBVIEW2.html`. Les clauses 2(a) et 2(b) autorisent la redistribution du code objet sous les conditions indiquées ; elles demandent notamment que distributeurs et utilisateurs finaux acceptent des conditions qui protègent au moins autant Microsoft et le logiciel (2(b)(ii)), et que le code soit acquis directement auprès de Microsoft (2(b)(iii)). La section 8 impose un avis à l’utilisateur final sur Microsoft Defender SmartScreen et les données qu’il collecte et transmet, sauf si SmartScreen est désactivé. Ce relevé décrit le texte de la licence, sans interprétation juridique.

Le CAB contient également `show_third_party_software_licenses.bat`, `Trust Protection Lists\Mu\LICENSE`, `Trust Protection Lists\Sigma\LICENSE` et `WidevineCdm\LICENSE`. Ces notices restent dans le répertoire complet `WebView2Fixed`.

Le script refuse de télécharger sans le paramètre `-AcceptLicense`. Avant de l’utiliser, la personne qui lance la commande doit lire et accepter les conditions Microsoft. Le paramètre est un garde-fou explicite du script ; il ne simule pas l’acceptation du site.

## Acquisition et vérification

Après acceptation des conditions, depuis la racine du dépôt :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\get-webview-runtime.ps1 -AcceptLicense
```

La commande choisit le build x64 le plus récent exposé par la page officielle. Pour épingler une version encore listée par Microsoft, ajouter `-Version '154.0.4258.53'`. On peut aussi fournir un lien CAB direct avec `-Url`; le script exige un chemin de package Fixed Version x64, HTTPS, sur un hôte Microsoft approuvé. Chaque redirection est contrôlée et toute sortie vers un hôte ou protocole non approuvé est refusée. `-TimeoutSec` règle les délais réseau et `-RetryCount` le nombre de tentatives.

Le CAB est conservé dans `tmp\WebView2Fixed\` (ignoré par Git). Les binaires et les notices sont extraits sous `WebView2Fixed\`, avec `msedgewebview2.exe` à la racine. Le script récupère aussi l’EULA sur l’endpoint officiel Microsoft. En cas de remplacement voulu d’un runtime présent, ajouter `-Replace`; le script prépare et vérifie d’abord le nouveau runtime, puis remplace le dossier en gardant une sauvegarde temporaire pendant l’opération. Il ne demande pas de privilèges élevés.

Avant la mise en place, le script vérifie la structure CAB, la version de `msedgewebview2.exe`, la signature Authenticode valide et le certificat Microsoft Corporation. Il calcule et affiche les SHA-256 du CAB, de l’exécutable et de l’EULA, et écrit le résultat ainsi que la liste des notices dans `tmp\WebView2Fixed\WebView2FixedRuntime-<version>.json`.

## Empreintes du build préparé

Acquisition réalisée le 3 octobre 2026 depuis le CAB Microsoft ci-dessus. La signature de `msedgewebview2.exe` est `Valid`, signataire `CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US`; sa version de fichier et sa version produit sont toutes deux `154.0.4258.53`.

| Fichier | Version | SHA-256 |
| --- | --- | --- |
| `Microsoft.WebView2.FixedVersionRuntime.154.0.4258.53.x64.cab` | 154.0.4258.53 x64 | `EC12B2DB6423D127FB8E1935D34E2E68ABC70FE8ECB1F6162BA1C1CCC2825F6D` |
| `WebView2Fixed\msedgewebview2.exe` | 154.0.4258.53 x64 | `30285E24A33BE3C0B2D0A7C3909FA1CC21D2FC0F0C2AB4EB79E46A9304B4256D` |
| `WebView2Fixed\LICENSE-MICROSOFT-WEBVIEW2.html` | Fixed Version terms, en-US | `6A444576A0AFFECD6060A1009DD7E89DCCAFD75B8090197C10864B3BB27C6CDB` |

## Dépendances PE vérifiées

Le 3 octobre 2026, une analyse statique des tables d’import PE a été faite sur `src-tauri\target\release\brevet-panorama-portable.exe` et sur les exécutables/DLL du runtime. L’application est x64 (PE32+, machine `0x8664`) et n’importe aucune DLL `VCRUNTIME`, `MSVCP`, `MSVCR` ou `CONCRT`. Ses autres imports sont des DLL Windows et des API sets, dont ceux du runtime C universel. Microsoft documente que l’UCRT fait partie de Windows 10 et Windows 11 : [Universal CRT deployment](https://learn.microsoft.com/en-us/cpp/windows/universal-crt-deployment?view=msvc-170).

`msedgewebview2.exe` est aussi x64, version `154.0.4258.53`; ses imports directs sont `msedge_elf.dll`, `KERNEL32.dll` et `ntdll.dll`. `msedge_elf.dll` est inclus à la racine du runtime. L’analyse de ses dépendances puis des 40 images PE du dossier a résolu tous les imports statiques dans le runtime, Windows ou ses API sets. Les DLL VC++ référencées par le runtime (`msvcp140.dll`, `vcruntime140.dll` et `vcruntime140_1.dll`) sont incluses; `ucrtbase_enclave.dll` est fourni par `Windows\System32`.

Cette vérification statique n’énumère pas les DLL chargées dynamiquement et ne remplace pas l’essai de l’application sur un Windows x64 hors ligne. Elle n’indique toutefois aucun besoin d’installer le VC++ Redistributable pour les imports PE observés avec Windows 10/11.
