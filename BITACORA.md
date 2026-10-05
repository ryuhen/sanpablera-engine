# Bitácora del Proyecto - Sanpablera Engine

Esta bitácora nos permite registrar y sincronizar las actividades realizadas en el proyecto.

## Registro de Actividades

| Fecha | Autor | Commit | Actividad | Notas |
|---|---|---|---|---|
| 2025-10-04 | Sistema | `a6c6aa1` | Revisión inicial del proyecto | Se analizaron archivos HTML, JS y estructura del proyecto |
| 2026-10-04 | Sistema | `d96057b` | Recuperación de trabajo perdido | La FSM solo existía en el árbol local sin commitear: recuperación de 5.351 líneas. Se corrigió la ruta de `aiAssistant.js` en `index.html` (`./src/tools/aiAssistant.js`) y se añadieron los scripts `start` y `test` a `package.json` |
| 2026-10-04 | Sistema | `afd2d06` | Integración de la rama de respaldo | Merge de `backup/github-babylon-2026-10-04`. Se conservaron sus stubs (`index.ts`, `Src/index.ts`) y se descartaron las copias vendorizadas de Babylon (idénticas a `node_modules/babylonjs/`). **Advertencia:** esos stubs importan `core/Legacy/legacy`, que no existe |
| 2026-10-05 | Sistema | `0101f12` | Corrección de la FSM (6 bugs) | `_clearRequests()` al reiniciar sesión · orden del tope/decaimiento de presión · overrides `null` en `GrappleStates` · coste del especial vía `ctx.affordable()` · tier solicitado en APC vía `ctx.requestedTier` · payload del hit propagado a los handlers · entrada de intents desde `DOWNED` · asserts de clips indexados por `SPF.VisualFacing`. **64 ok, 0 fallos** |
| 2026-10-05 | Sistema | *este commit* | Base matemática y de contrato del rig | `src/core/cine/Math3.js` (vectores, quaternions, matrices column-major, damping independiente del framerate, 7 curvas de easing) y `src/core/cine/CineConstants.js` (CFG a 60 Hz, 21 huesos del esqueleto humanoide con el CONTRATO documentado, 10 canales, 9 morphs de física, 6 presets de impacto, planos y transiciones). Se corrigió `Side.NONE`, que existía en la API pero no se usaba en los 5 huesos axiales |
| 2026-10-05 | Sistema | *este commit* | Modelo humanoide con rigging (sustituye al cubo) | Búsqueda y selección de asset: `assets/characters/mannequin.glb` = "Rigged Figure" de Khronos (antes CesiumMan), **CC BY 4.0**, 50 KB, malla skinned con 19 huesos y 1 clip. Se verificó numéricamente que el archivo es Z-up y que con `rot.x = -π/2` el personaje queda de pie (cabeza 0,507 m sobre caderas, caderas 0,601 m sobre los pies). Créditos en `assets/ATTRIBUTIONS.md`. Se añadió `src/render/BoneMap.js`, que traduce los nombres de hueso de cualquier modelo al CONTRATO (alias de Khronos, Mixamo con y sin prefijo, y genéricos de Kenney/Quaternius/RPM) |
| 2026-10-05 | Sistema | *este commit* | Pruebas y serving de assets | `tests/cine.smoke.mjs` (**333 comprobaciones, 0 fallos**), incluida la verificación del `.glb` real del repo. `npm test` ejecuta las dos suites (64 + 333 = 397). `server.js` sirve `.glb/.gltf/.bin/.ktx2/.fbx` |

### Cómo se comprobó que el modelo es un humano de pie

Sin navegador ni WebGL no se puede "ver" el modelo, así que se calcularon las
posiciones de los huesos en la pose de bind leyendo el GLB y se aplicó la
rotación candidata. Con `rot.x = -π/2` la anatomía cuadra; con `0` o `+π/2` el
personaje aparece tumbado o con la cabeza debajo de las caderas. Queda
pendiente la confirmación visual en el navegador.

### Modelos descartados y por qué

- **Xbot / Soldier (three.js)**: son Mixamo. Adobe deja usarlos en proyectos pero
  **no redistribuir el archivo**, así que no pueden ir en el repo. BoneMap ya
  trae sus alias, por si el usuario los baja a mano.
- **Gobkit Free Minions (CC0)**: rigging correcto, pero la anatomía de minion no
  es humana.
- **Khronos RiggedSimple**: solo 2 huesos; es un cilindro, no sirve.

---

## Tareas Pendientes

### Hecho y verificado

- [x] Recuperar el trabajo perdido de la FSM y la IA
- [x] Corregir la carga de `aiAssistant.js` en `index.html`
- [x] Añadir scripts `start` y `test` a `package.json`
- [x] Integrar la rama `backup/github-babylon-2026-10-04` sin duplicar Babylon
- [x] Corregir los 6 bugs de la FSM de agarre (64/64 tests)
- [x] Base matemática del rig (`Math3.js`)
- [x] Contrato del esqueleto, canales, morphs e impactos (`CineConstants.js`)
- [x] Buscar y traer un humanoide con rigging con licencia redistribuible
- [x] `BoneMap.js` para que el motor no dependa de los nombres de un modelo
- [x] Servir `.glb` desde `server.js`

### Pendiente (siguiente sesión)

- [ ] **`src/render/CharacterModel.js`**: el cargador con Babylon (el módulo
      *todavía no existe*). Debe aplicar `rot.x = -π/2`, normalizar la escala a
      `CFG.CHARACTER_HEIGHT`, resolver `BoneMap` sobre los nodos reales y
      exponer clips.
- [ ] **Quitar el cubo placeholder de `src/core/Engine.js`** y poner al personaje
      en su lugar (sigue ahí; el modelo está en el repo pero no se carga).
- [ ] **Confirmar el personaje en el navegador** (la validación hecha es
      numérica, no visual).
- [ ] `src/core/cine/Rig.js`: aplicar poses por nombre del contrato, FK e IK de
      dos huesos, yRoots de contacto para los pies.
- [ ] Sistema de morphs de física (muelle + amortiguación) sobre `MorphId`.
- [ ] Cámara: planos (`ShotSize`) y movimientos (`CameraMove`) sobre Babylon.
- [ ] Sistema de vistas/escenario.
- [ ] Animaciones: importar y mezclar clips,IK y root motion.
- [ ] Timeline de clips y transiciones (`TransitionKind`).
- [ ] Impactos: hitstop, temblor de cámara y morphs por `IMPACT_PRESETS`.
- [ ] UI táctil de botones (pad de 8 direcciones + 4 acciones) y HUD con barras
      de vida y recursos, según `Specs.txt`.
- [ ] Migrar el HUD/IA de `Legacy` a los módulos actuales.
- [ ] `index.ts` y `Src/index.ts` importan `core/Legacy/legacy`, que no existe:
      hay que arreglarlos o borrarlos.
- [ ] `Specs.txt` se ha guardado en el repo sin interpretar: sus 6 secciones
      (controles, cámara, HUD, FSM, hit levels, stances) son el trabajo grande que
      queda.

### Bloqueos

- **`git push` a GitHub por SSH falla**: `git@github.com: Permission denied
  (publickey)`. Existe `/root/.ssh/id_ed25519_github` y `/root/.ssh/config`,
  pero GitHub rechaza esa clave. No hay `gh` CLI ni token. Hasta que haya una
  clave válida, el push no se puede hacer.
- El remoto (`6b2485d`) tiene cuatro commits que **no son ancestros** del `main`
  local, aunque su contenido ya está todo aquí. Para poder hacer push normal hay
  que integrar ese remoto en el grafo local (merge), no hacer force-push.

---

*Última actualización: 2026-10-05*