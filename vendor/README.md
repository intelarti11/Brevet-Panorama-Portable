# Lecteur Excel

`xlsx-0.20.3.tgz` est la distribution officielle SheetJS CE 0.20.3, conservée
dans le dépôt pour rendre `npm ci` reproductible sans dépendre du CDN.

- Source : https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- SHA-256 : `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- Licence : Apache-2.0 (texte inclus dans l’archive et dans le paquet installé).
- Installation officielle : https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

La lecture des fichiers importés passe exclusivement par `src/lib/spreadsheet.ts`
et ce lecteur, corrigé pour CVE-2023-30533 et CVE-2024-22363.
`xlsx-js-style` reste réservé à l’écriture des classeurs produits par
l’application, afin de conserver leurs styles. Son lecteur n’est pas exposé.
ESLint interdit les imports directs de ce paquet en dehors de cet adaptateur.
