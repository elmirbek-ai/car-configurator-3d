# Stage 5.5 — Camry tuning мүчүлүштүктөрү жана регрессия

## Тапшырма жана жыйынтык

Toyota Camry 2018’де **Original + Black** тандалганда spoke’тордун күмүш бойдон калышынын себебин текшерүү жана оңдоо; төрт дөңгөлөк дизайнын, калган tuning функцияларын жана ресурс тазалоону регрессиядан өткөрүү. **Тастыкталган ката оңдолду:** Original spoke cover’и эми Silver / Graphite / Black finish’ти алат. Chrome’догу акыркы PBR көрүнүшү бул чөйрөдө текшерилген жок. Колдонуучу Camry рендери жана мурунку black-screen оңдоосу Chrome’до иштегенин билдирген; бул билдирүү ушул этаптын өз browser тестине тең эмес. Камеранын коду/pose’тору өзгөргөн жок.

## Тастыкталган себеп жана оңдоо

- `codex-reports/visuals/stage-5-3/lf-side-original.png`, `lf-side-rim-hidden.png`, `lf-side-hubcap-hidden.png` кадрларын кайра карадым. `GreyWheel` rim жашырылганда да негизги spoke’тор көрүнөт; `hubcaps` cover жашырылганда spoke’тор жоголот. Чыныгы GLB material-use текшерүүсү `GreyWheel` **төрт** `alt*_GreyWheel_0` mesh’инде, `hubcaps` **беш** mesh’те экенин көрсөттү: төрт көрүнгөн `Object037/038/039/040_hubcaps_0` cover жана өзүнчө `Object058_hubcaps_0` (`scripts/test-vehicle-engine.mjs:144-157`). Демек `src/components/CamryScene.tsx:170` `GreyWheel` material’га finish бергени менен Original’дын үстүңкү spoke cover’и мурунку күмүш бойдон калган.
- `src/components/VehicleWheelSystem.tsx:19-20,36,43-67`: төрт **так mapped cover** үчүн corrected PBR material’дан owned finish clone түзүлөт. Бирдей source material колдонулса clone төрт дөңгөлөктө **бирөө** бөлүшүлөт. `Object058_hubcaps_0`, шиналар, brake, body, glass тийилбейт. Custom дизайн үчүн алынган Toyota center cap source neutral material’ды колдонот; Original spoke cover finish clone’ду колдонот. Cover geometry же GLB binary өзгөргөн жок.
- `src/components/VehicleWheelSystem.tsx:93-116`: `applyVehicleWheelSelection` Original cover жана custom replacement үчүн бирдей үч finish өңүн колдонот: Silver `#cbd4dc`, Graphite `#535b65`, Black `#171b22`. Original `GreyWheel` rim’и мурдагыдай `CamryScene` аркылуу боёлот. Custom тандоодо Original rim+cover жашырылат, neutral center cap жана replacement көрүнөт; Original’га кайткандан кийин rim+cover кайра көрүнөт.
- `src/components/VehicleWheelSystem.tsx:79-106`: setup катасында жана unmount’та cover баштапкы corrected material’га кайтарылат, retained center geometry жана replacement geometry алынат, owned finish clone dispose кылынат. `src/vehicleRegistry.ts:334` feature note учурдагы жүрүмгө туураланды. `SceneErrorBoundary` жана өткөн этаптагы stable mesh identity текшерүүсү өзгөртүлгөн жок.

## Дөңгөлөк визуалы жана автоматтык регрессия

`scripts/render-camry-original-wheel-finishes.py:1-78` Blender 5.2.3 LTS’ке өзгөртүлбөгөн Camry GLB’ин окуп, **бирдей Workbench studio жарыгы, 900×900 resolution жана ар бир wheel center’ге салыштырмалуу бирдей каптал камера** менен 13 кадр чыгарды: `before-black-WHEEL_LF.png` жана `original-{silver,graphite,black}-{WHEEL_LF,WHEEL_LR,WHEEL_RR,WHEEL_RF}.png` (`codex-reports/visuals/stage-5-5/`). Кадрларда runtime материал **дайындоо логикасы объект түсү менен моделденди**; бул WebGL PBR рендери эмес. Каралган before/after LF, RF жана RR/LR үлгүлөрүндө before Black spoke күмүш, жаңы үч finish айырмаланат, дөңгөлөк формасы/шина/борбордук эмблема сакталып турат. 13 кадр түзүлгөн; тандалган кадрлар кол менен каралды.

`scripts/test-vehicle-engine.mjs:190-337` чыныгы GLB’ден cover topology’син алып, мурдагы `GreyWheel`/`hubcaps` → corrected PBR material алмаштыруу тартибин кайра жаратат. Андан соң **4 дизайн × 3 finish × 4 позиция** үчүн материал өңү, original/custom visibility, center cap, geometry sharing жана шина текшерилет. Өзүнчө `Object058` neutral калат; Brake, Carpaint, Glass материалдары өзгөрбөйт. Original → Sport → Original, dispose, кайра mount → Forged → dispose өткөндө geometry/visibility калыбына келери жана owned cover material **бир жолу** dispose болоору текшерилди. Stable identity lookup өзгөргөн материал атынан көз каранды эмес; wrong path жана material slot саны дагы эле ката берет. Бул автоматтык тест Chrome визуалын алмаштырбайт.

## Башка tuning функцияларын аудит

- Body paint жана Glossy/Matte/Satin, өз алдынча front/rear bumper finish, Carbon Hood ON/OFF, Clear/Light/Medium/Dark tint үчүн `src/components/CamryScene.tsx:69-170` жана `src/vehicleTuning.ts:44-101` агымы каралды. `scripts/test-vehicle-engine.mjs:389-430` тандалган paint өңүнүн сакталышын, finish roughness тартибин, bumper clone изоляциясын, carbon map’тын hood’го гана тийишин жана tint Clear’га кайтканда source түс/transmission калыбына келишин текшерди. **Кошумча тастыкталган мүчүлүштүк табылган жок; бул функциялар өзгөртүлгөн жок.**
- Front/rear KG plate бир `config.plate` колдонот (`src/components/CamryScene.tsx:188-190`, `src/components/VehicleAttachments.tsx:119-126`). Region 01–10, invalid plate, pose жана bracket footprint тесттери өттү (`scripts/test-vehicle-engine.mjs:431-493`). Spoiler mount/clearance тесттери өттү (`scripts/test-vehicle-engine.mjs:494+`). Кошумча plate/spoiler code өзгөртүүсү жок.
- Per-vehicle Save/Reset/JSON Export `src/vehicleStorage.ts:32-170`, `src/App.tsx:63-129` аркылуу каралды. Camry reset’тен кийин default config кайтканын жана Concept GT сакталган мааниси калганын жаңы assertion текшерет (`scripts/test-vehicle-engine.mjs:60-91`). Concept GT scene/geometry/material коддору өзгөргөн жок.
- React lifecycle: `VehicleWheelSystem` setup жана cleanup’у ошол эле `root`/mount dependencies менен иштейт (`src/components/VehicleWheelSystem.tsx:129-152`); unmount’та owned finish clone калыбына келтирилип dispose кылынат. Browser’де тез көп жолу vehicle switch жасалган жок, ошондуктан GPU memory/FPS боюнча жыйынтык жок.

## Тесттер, каталар жана чектөөлөр

| Текшерүү | Чыныгы жыйынтык |
| --- | --- |
| `npx tsc --noEmit` | **Өттү**, exit 0. |
| `npm run test:vehicles` | **Өттү, 14/14**, exit 0. GLB material-use, төрт wheel × төрт дизайн × үч finish, center cap, cleanup/remount, paint/tint, storage, KG plate жана spoiler тесттери кирет. |
| `npm run validate:assets` | **Өттү**, Concept GT жана Camry structure/mapping катасы 0. Camry көлөм/triangle budget эскертүүсү калды: **34 196 580 byte / 875 294 triangle**. `codex-reports/asset-validation.json` жаңыртылды. |
| Blender 5.2.3 LTS | `FINISH_RENDERS 13`, exit 0; салыштыруу кадрлары түзүлдү. |
| `npm run build` | **Бул чөйрөдө өтпөдү**: `tsc -b` өткөндөн кийин Vite config/esbuild child process `Error: spawn EPERM`. Бул чөйрөнүн process чектөөсү; колдонуучу өз PC’синде build өткөнүн билдирген, бирок ушул коддун build’и ал жерде кайра текшерилген эмес. |
| Chrome/WebGL | **Бул этапта аткарылган жок.** Blender Workbench кадрлары browser PBR, реалдуу UI click, FPS же GPU memory далили эмес. |

Оригинал GLB hash’тери өзгөргөн жок: `public/models/CarConcept.glb` — `659C592E20ABA7AFA920DB7D14AD767874741384C215EE1DF23A5E1C5E1C411C`; `public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb` — `7D7A4E7AC2BFE1C71E83CB3BB5059E03C56EB71AF6D1DD666E661537E595CD14`. Dependency орнотулган жок; commit/push/deploy жасалган жок.

## Файлдар

**Каралды:** `AGENTS.md:1-14`; мурдагы `codex-reports/latest.md` (толук архив `codex-reports/history/20261109-095857-657593.md`, SHA-256 текшерилди); `src/App.tsx`, `src/types.ts`, `src/vehicleRegistry.ts`, `src/vehicleTuning.ts`, `src/components/CamryScene.tsx`, `src/components/VehicleWheelSystem.tsx`, `src/components/VehicleAttachments.tsx`, `src/components/camryAssets.ts`, `src/vehicleStorage.ts`, `scripts/test-vehicle-engine.mjs`, Stage 5.3 wheel кадрлары жана Camry GLB окуу режиминде.

**Өзгөрдү:** `src/components/VehicleWheelSystem.tsx:7,19-20,36-116`; `src/vehicleRegistry.ts:334`; `scripts/test-vehicle-engine.mjs:60-91,133-157,190-337,389-430`; validator жараткан `codex-reports/asset-validation.json`; ушул `codex-reports/latest.md`.

**Жаңы:** `scripts/render-camry-original-wheel-finishes.py:1-78`; `codex-reports/visuals/stage-5-5/` ичиндеги 13 PNG; мурунку отчеттун архиви. **Камера файлдары/позициялары:** өзгөргөн жок.

## Кийинки кадам

Колдонуучунун Chrome’унда Camry → Wheels аркылуу Original + Silver/Graphite/Black’ти **төрт дөңгөлөктө**, андан кийин Sport/Multi/Forged жана кайра Original’ды текшерүү керек. Black spoke’тор күмүш калбашы, custom center cap көрүнүшү жана console таза болушу зарыл. Paint/tint/hood/bumper/plate/spoiler, Save/Reset/Export жана Concept GT’ге кайтуу үчүн кыска manual regression жасалсын. Process уруксаты бар чөйрөдө `npm run build` кайра иштетилсин.
