# FORM — 3D Car Configurator MVP

React 19 + Vite + TypeScript + React Three Fiber 9 + Drei + Three.js.

## Windows (PowerShell)

Requirements: Node.js 20.19+ or 22.12+.

```powershell
cd car-configurator-mvp
npm install
npm run dev
```

Open http://localhost:5173

The prototype initially streams the **Khronos Car Concept** model from its public GitHub repository (Internet required). For reliable loading and local operation, download the GLB once:

```powershell
powershell -ExecutionPolicy Bypass -File .\download-model.ps1
npm run dev
```

After downloading, open **http://localhost:5173/?local** to use the locally stored model. To make the local model the default, update `src/components/CarScene.tsx` so that `url = MODEL_URL`.

## MVP features

- Realistic GLB car viewer with 360° OrbitControls, zoom and lighting
- Select one of six car paint colors
- Wheel finish materials: silver, graphite, black
- Typed sample license plate on an independent 3D overlay
- Toggle demonstrational rear spoiler geometry
- Save the configuration in browser localStorage
- Export configuration as JSON
- Responsive desktop/mobile layout

## Known limitations

- Single model; adding models requires new GLB assets.
- Plate and spoiler are rough 3D overlays, **not fitted components**. Their position may need adjustments for this GLB.
- Material changes rely on the model's paint/rim material names. Other GLBs need material mapping.
- GitHub can be inaccessible on some networks; use the local GLB option above.
- HDRI environment (`Environment preset="city"`) can also require network access. Replace with static studio lights for fully offline use.
- No backend, ordering, validated Kyrgyz license plates, or persistent account storage yet.

## Model license

Car Concept 3D asset © Darmstadt Graphics Group GmbH / Eric Chadwick, **CC BY 4.0**, Khronos glTF Sample Assets. Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept . Model's Khronos trademarks/logos are excluded from the CC BY license and require separate consideration; replace/remove brand logos for commercial use. See official LICENSE.md.

## Production next steps

1. Bundle optimized, licensed GLB and HDRI locally; validate their sizes and texture performance.
2. Replace overlays with correctly anchored custom car parts / license-plate meshes.
3. Add schema for multiple car models and material node mappings.
4. Add screenshot export, backend price list, customer requests and admin.
