# Contribuer à l’édition sans Remplacements

Merci de contribuer à Brevet Panorama Portable. Ce dépôt correspond à l’édition sans Remplacements ; l’édition complète avec ce module est conservée séparément.

## Signaler un problème

Depuis l’onglet **Issues** du dépôt, indiquez :

- la version de l’application et la version de Windows ;
- les étapes permettant de reproduire le problème ;
- le résultat attendu et le résultat observé ;
- si nécessaire, une capture d’écran ou un journal **anonymisé**.

N’ajoutez jamais de nom d’élève, INE, fichier SIECLE, classeur contenant des notes, base SQLite, sauvegarde ou export issu d’un établissement. Reproduisez le problème avec des données fictives.

## Proposer une modification

Les propositions de code ciblent la branche principale <code>main</code>. Décrivez le besoin et les effets sur les imports, calculs, exports et sauvegardes. Gardez la modification compatible avec l’usage local hors ligne.

Avant de soumettre une pull request, exécutez les vérifications utiles :

~~~powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run native:test
~~~

Pour les changements touchant au stockage ou aux imports, vérifiez aussi un parcours natif avec des données fictives. Un build réussi ne suffit pas à prouver que l’application fonctionne dans son dossier portable.

## Données et licences

Les données de la base et les sauvegardes restent à côté de l’application. Elles ne doivent jamais être ajoutées à Git ou jointes à une issue. Les nouvelles dépendances doivent être documentées par leurs notices de licence ; les polices et le runtime WebView2 ont des notices séparées. Consultez [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et [docs/webview-runtime.md](docs/webview-runtime.md).

Le code est sous licence AGPL-3.0-or-later. Les polices Noto Sans restent sous la licence SIL OFL 1.1.
