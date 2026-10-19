# Gouden krachtbal renderen

Maakt `src/lib/gouden-krachtbal.ts` opnieuw aan (de bal op de weekendplan-Story) uit het echte
3D-model van het virtueel stadion.

1. Zet een plain-JS kopie van `src/app/(frontend)/virtueel/[slug]/krachtbal.ts` naast `index.html`
   als `krachtbal.js` (types weg, `canvasTex` inline) en link `node_modules/three` als `./three`.
2. Serveer de map (`python3 -m http.server 8765`) en draai `node render.mjs <map>` → `gouden-krachtbal.png`.
3. Trim, verklein tot 720×720 en zet om naar WebP (sharp, quality 86), en zet de base64 in
   `src/lib/gouden-krachtbal.ts`.
