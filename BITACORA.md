# Bitácora del Proyecto - Sanpablera Engine

Esta bitácora nos permite registrar y sincronizar las actividades realizadas en el proyecto.

## Registro de Actividades

| Fecha | Autor | Commit | Actividad | Notas |
|---|---|---|---|---|
| 2026-10-08 | Sistema | *este commit* | **Los golpes no conectaban: el combate era imposible** | Los peleadores salian con `facing: 0` y `facing: PI` en `FIGHTER_CORNERS`, pero las esquinas estan en diagonal, asi que `facing: 0` (que apunta a +Z) miraba **justo hacia el lado contrario del rival**: todos los golpes salian de espaldas, la hitbox se calculaba al otro lado y no impactaba nunca. La vida del rival no bajaba de 100 en ninguna circunstancia, ni con la API interna `SANPABLERA.punch`. Ahora el facing se **calcula** con `facingToward()` para que los dos miren al otro desde el primer frame. Verificado en navegador: `resultado: "hit"`, vida del rival 100 -> 95. Los ataques y los botones de pantalla ya funcionaban (J -> `ATAQUE_LIGERO` con 13 rotaciones del brazo, y el boton "Attack 1" igual por `pointer`); lo que faltaba era que **algo conectase**. Ojo con el alcance: la distancia minima a la que el motor deja acercarse (`MIN_SPACING` 0,9 m) esta justo por encima del alcance efectivo del golpe corto (radio 0,42 + casco 0,45 = 0,87 m), asi que hay margen muy poco: sigue haciendo falta acercarse. **517 comprobaciones, 0 fallos** |
| 2026-10-08 | Sistema | *este commit* | Teclado, mando y Bluetooth, mas el fix del rig que hacia que el juego no respondiera | **Controles**: `ui/InputRouter.js` une teclado, mando (Gamepad API = llega el Bluetooth) y tactil en el mismo estado, asi que ni la FSM ni el `InputMapper` se enteran; `ui/ControlsSettings.js` guarda el mapeo en `localStorage`; `ui/ControlsScreen.js` es el menu (**F1**) para reasignar las 8 acciones y ver que mando hay conectado. Layout por defecto: WASD/flechas, **J** ligero, **K** pesado, **L** guardia, **U** accion. Arreglado tambien que las diagonales del dpad tactil no movieran (el `InputMapper` solo leia up/down/left/right y las esquinas se guardaban sueltas). **Bug grave, preexistente (commit 44e2505)**: `readModelBones` descartaba todo nodo con geometria *descendiente* sin bajar a sus hijos, y el envoltorio `__root__` del importador de glTF tiene la malla debajo: el rig salia con **0 huesos**, `placeFoot` reventaba en cada frame y por eso no habia dos peleadores ni ningun control. Se arregla distinguiendo geometria propia de la de los descendientes. Ademas `ImportMesh` cachea por URL (hacia que el segundo peleador robase los meshes del primero): ahora `LoadAssetContainerAsync`; y el `pivot` del saco se creaba sin quaternion (`Engine.js`). **517 comprobaciones, 0 fallos** |
| 2026-10-08 | Sistema | *este commit* | Modelo CC0 de Quaternius: probarlo y dejar constancia de hasta donde llega | Descargado el pack **Universal Base Characters** (CC0, 13k triangulos) a `assets/characters/quaternius-superhero-male/`. Su convencion de huesos (`spine_01`, `calf_l`, `ball_l`...) no estaba en `BoneMap`: 4 alias nuevos y reordenada la lista de `PELVIS`, que mapeaba a `root` en vez de a `pelvis`. El eje se decide probando `Z_UP` y `Y_UP` y quedandose con el que deja la cadena coherente: este modelo tiene la malla en Y (1,82 m) pero **los huesos en Z**, cosa que no se ve mirando solo los vertices. La escala sale de la altura de la malla, no de la distancia entre huesos, que son cosas distintas. **Queda pendiente**: la postura procedural aun no se aplica bien sobre este esqueleto y el peleador sale hecho una bola, asi que el mannequin sigue siendo el de por defecto. El motor acepta `?modelo=<ruta>` para probarlos. Ver `assets/ASSETS.md` |
| 2026-10-07 | Sistema | `dbfdea7` | Arquetipos base, roadmap de fases y el sistema de estancias del boxeador | `Specs.txt` crece con las secciones **11 (los tres arquetipos base: YUGO el boxeador, MONTE el salvaje y MUSASHI el vagabundo marcial, con el kenjutsu improvisado), 12 (escalada de combate por fases: el arbitro y la ventana de 1 s de la Fase 1, el callejero a KO de la 2, las armas portatiles de la 3 y el desarme/apropiacion de la 4) y 13 (el sistema de estancias de boxeo)**. Todo entra como MODULO PURO: `core/archetypes.js`, `core/phases.js` y `core/boxing.js` son tablas que el motor lee; el roster declara el arquetipo de cada peleador. Las estancias (rotacion con el boton de accion, inversion con atras, el "baile de posiciones" por tilt, la fijacion post-golpe con encadenado automatico, y las tres posturas de comando: presion, absorcion y atrapamiento) se resuelven en `FighterEntity._stances`; el golpe de la postura sustituye al del estado en el getter `move` de la FSM (mismo estado, distinta lectura). Pedro recibe su moveset exclusivo capa por capa (capa 1b de `Movesets.js`). Se sustituye el antiguo abanico de estilos cosmeticos por posturas de combate reales, y el toque del boton de accion deja de disparar el especial: ahora lo hace el doble toque (para que el botellazo siga siendo alcanzable). **517 comprobaciones, 0 fallos** (nuevo `tests/design.smoke.mjs`, 67 checks) |
| 2026-10-07 | Sistema | `fff6741` | Biblia de diseño, moveset por capas y el peleador del jugador | `Specs.txt` ahora ES la biblia de diseño (las 8 secciones de jugabilidad + caracteristicas tecnicas: peleador personalizado en `localStorage`, la nube por **subapase** en sistema de membresia y el MMORPG **"Isla Caribe"**). Roster renombrado a nombres comunes y memorables (Pedro Pérez, Juan García, José López, María González, John Doe, Jane Doe, Carlos Ruiz, Ana Torres) con historia y estilo de pelea por peleador. Moveset de Pedro escrito capa por capa en `fsm/states/Movesets.js` (**boxeo → patadas → suelo → botella**): `hasMove` en la tabla de transiciones hace que un moveset amplie el vocabulario sin tocar la FSM ni romper al resto. Peleador del jugador (`CustomFighter.js`): novena celda, renombrable con **R**, guardado local, hereda el moveset de un peleador del juego. Input: acorde ligero+pesado = TECNICA (derribo), toque del boton ACCION = ESPECIAL, eventos pointer en la UI tactil (probable con raton). **450 ok, 0 fallos** |
| 2025-10-04 | Sistema | `a6c6aa1` | Revisión inicial del proyecto | Se analizaron archivos HTML, JS y estructura del proyecto |
| 2026-10-04 | Sistema | `d96057b` | Recuperación de trabajo perdido | La FSM solo existía en el árbol local sin commitear: recuperación de 5.351 líneas. Se corrigió la ruta de `aiAssistant.js` en `index.html` (`./src/tools/aiAssistant.js`) y se añadieron los scripts `start` y `test` a `package.json` |
| 2026-10-04 | Sistema | `afd2d06` | Integración de la rama de respaldo | Merge de `backup/github-babylon-2026-10-04`. Se conservaron sus stubs (`index.ts`, `Src/index.ts`) y se descartaron las copias vendorizadas de Babylon (idénticas a `node_modules/babylonjs/`). **Advertencia:** esos stubs importaban `core/Legacy/legacy`, que no existe |
| 2026-10-05 | Sistema | `0101f12` | Corrección de la FSM (6 bugs) | `_clearRequests()` al reiniciar sesión · orden del tope/decaimiento de presión · overrides `null` en `GrappleStates` · coste del especial vía `ctx.affordable()` · tier solicitado en APC vía `ctx.requestedTier` · payload del hit propagado a los handlers · entrada de intents desde `DOWNED` · asserts de clips indexados por `SPF.VisualFacing`. **64 ok, 0 fallos** |
| 2026-10-05 | Sistema | *este commit* | Base matemática y de contrato del rig | `src/core/cine/Math3.js` (vectores, quaternions, matrices column-major, damping independiente del framerate, 7 curvas de easing) y `src/core/cine/CineConstants.js` (CFG a 60 Hz, 21 huesos del esqueleto humanoide con el CONTRATO documentado, 10 canales, 9 morphs de física, 6 presets de impacto, planos y transiciones). Se corrigió `Side.NONE`, que existía en la API pero no se usaba en los 5 huesos axiales |
| 2026-10-05 | Sistema | *este commit* | Modelo humanoide con rigging (sustituye al cubo) | Búsqueda y selección de asset: `assets/characters/mannequin.glb` = "Rigged Figure" de Khronos (antes CesiumMan), **CC BY 4.0**, 50 KB, malla skinned con 19 huesos y 1 clip. Se verificó numéricamente que el archivo es Z-up y que con `rot.x = -π/2` el personaje queda de pie (cabeza 0,507 m sobre caderas, caderas 0,601 m sobre los pies). Créditos en `assets/ATTRIBUTIONS.md`. Se añadió `src/render/BoneMap.js`, que traduce los nombres de hueso de cualquier modelo al CONTRATO (alias de Khronos, Mixamo con y sin prefijo, y genéricos de Kenney/Quaternius/RPM) |
| 2026-10-05 | Sistema | *este commit* | Pruebas y serving de assets | `tests/cine.smoke.mjs` (**333 comprobaciones, 0 fallos**), incluida la verificación del `.glb` real del repo. `npm test` ejecuta las suites. `server.js` sirve `.glb/.gltf/.bin/.ktx2/.fbx` |
| 2026-10-05 | Sistema | `80a3bd9` | Integración del remoto | El remoto tenía 8 commits que no eran ancestros del `main` local. Fusionados; los conflictos add/add de `BITACORA.md`, `index.html` y `server.js` se resolvieron con la versión local (la última modificada). A partir de aquí el push es fast-forward y no hace falta force-push |
| 2026-10-05 | Sistema | *este commit* | Bitácora del bloqueo del push | Se documenta cómo desbloquear el push a `ryuhen/sanpablera-engine`: la clave pública que hay que registrar en GitHub y la alternativa por token HTTPS |
| 2026-10-06 | Sistema | `44e2505` | Rig, poses, stances y modelo humanoide | `cine/Rig.js` (esqueleto vivo: FK, IK de dos huesos y plantado de pies), `cine/Pose.js` (poses como deltas de la pose de reposo), `cine/Stances.js` (posturas de combate derivadas de parámetros), `render/CharacterModel.js` (puente entre el rig numérico y los nodos de Babylon) y `tests/glb.mjs` (lector GLB mínimo). **Se quitó el cubo placeholder de `Engine.js`** |
| 2026-10-06 | Sistema | `25509b9` | HUD de combate (spec sección 3) | `ui/HUD.js`: barras de vida y de recurso por luchador, ancladas al centro (P1 a la derecha, P2 a la izquierda), con lerp independiente del framerate, color por umbrales y pulso de vida baja. `ui/UI.js` dejó de dibujar la barra vertical heredada. `Engine.js` crea el HUD, da salud y barra a cada peleador y expone `setHealth`/`setMeter` para debug |
| 2026-10-06 | Sistema | `75b8437` | HUD estilo SF2, stamina y menús | Dos barras de vida arriba, tiempo al centro y stamina bajo el nombre de cada luchador; economía de stamina (1x hacia el rival, 1.5x alejándose, 0 lateral, regen al parar; parkour: rebote 8 / deslizar 14); cámara que encuadra siempre a ambos peleadores; `SelectScreen` (8 celdas de panal) y `StageSelect` (libro de origami, de momento solo Dojo Origami); `roster.js` y `stages.js`; fix del cargador glTF (`babylonjs-loaders`) en `index.html` |
| 2026-10-07 | Sistema | *este commit* | Bitácora al día y limpieza de stubs | Se registran los 3 commits del 06-10, se tacha lo hecho y se reevalúa lo que queda de verdad. Se borran los stubs rotos `index.ts` y `Src/index.ts` (importaban `core/Legacy/legacy`, que no existe; nada los usaba). Se cierra el bloqueo del push: ya está resuelto |

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
- [x] `CharacterModel.js`: cargador con Babylon (`rot.x = -π/2`, escala a `CFG.CHARACTER_HEIGHT`, `BoneMap` sobre los nodos reales, clips)
- [x] Quitar el cubo placeholder de `Engine.js`
- [x] `cine/Rig.js` (FK, IK de dos huesos, plantado de pies), `cine/Pose.js` (deltas) y `cine/Stances.js` (posturas por parámetros)
- [x] HUD de combate y estilo SF2: barras de vida, timer y stamina (spec sección 3)
- [x] Economía de stamina al correr y en parkour (`combat/Stamina.js`)
- [x] Pantallas de selección de peleador (`SelectScreen`) y de escenario (`StageSelect`)
- [x] Cámara que encuadra siempre a ambos peleadores (`Engine.js`, `fitCamera`)
- [x] UI táctil (spec sección 1): `TouchControls.js` + botones DOM en `UI.js` (pad de 8 direcciones y 4 acciones con eventos touch)
- [x] Borrar los stubs rotos `index.ts` y `Src/index.ts` (importaban `core/Legacy/legacy`)
- [x] `Specs.txt` interpretado: ahora es la biblia de diseño completa (secciones 1-8) + caracteristicas tecnicas (sección 9) + arquitectura (sección 10)
- [x] Moveset de Pedro Pérez por capas (`fsm/states/Movesets.js`) + reglas de alcance por `hasMove` (`Transitions.js`)
- [x] Roster con nombres comunes memorables, historia y estilo por peleador (`core/roster.js`)
- [x] Peleador del jugador: localStorage, renombrable (R en la selección), hereda movesets (`core/CustomFighter.js`, `ui/SelectScreen.js`)
- [x] Eventos pointer en la UI táctil (`ui/UI.js`): el pad y los botones responden al ratón/estilo además del dedo
- [x] `npm test` en verde: **517 comprobaciones, 0 fallos** (FSM 68 · Design 67 · Cine 333 · HUD 23 · Stamina 26)
- [x] Los tres arquetipos base registrados como datos puros (`core/archetypes.js`) y asignados al roster
- [x] Escalada de combate por fases como tabla modular (`core/phases.js`): arbitro, ventana de 1 s, zonas legales/ilegales, armas y desarme
- [x] Sistema de estancias del arquetipo YUGO (`core/boxing.js` + `FighterEntity._stances`): rotacion, inversion, baile, fijacion y las tres posturas de comando
- [x] Moveset exclusivo de cada postura en el primer peleador (`Movesets.js` capa 1b) y poses procedurales (`FighterRig.js`)

### Verificación: la biblia (Specs.txt) contra el motor

Lo que exige la biblia de diseño y dónde está hoy:

| Biblia | Estado | Dónde vive |
|---|---|---|
| 1. Motor ES6 + Babylon web | ✅ hecho | `package.json`, `index.html` |
| 2. Pad de 8 vías + 4 botones | ✅ hecho | `ui/TouchControls.js` + `ui/UI.js` (touch y pointer) |
| 3. Cámara dinámica (P1 / punto medio) | ✅ hecho | `Engine.js` `fitCamera` (zoom en modo target) |
| 4. HUD (vida + recurso + timer) | ✅ hecho | `ui/HUD.js` |
| 5. Paso → caminar → correr; dash, dash agachado (esquiva altos), dash aéreo (esquiva bajos) | ✅ hecho | `entities/FighterEntity.js`: máquina de locomoción + ventanas de esquive |
| 6. LINEAL esquivable / AREA caza al que se mueve (stun o derribo) | ✅ hecho | `FighterEntity.defend()` + `Engine.js` `world.tryHit` |
| 7. Moveset por movimiento (jab, gancho, upper, plexo...) | 🟡 parcial | Moveset por capas de Pedro (`Movesets.js`) y mods de pose por locomoción (`FighterRig.ATTACK_LOCO_MODS`); **falta** un moveset DISTINTO por estado de movimiento (caminando / corriendo / dash) |
| 7. Ataques aéreos (↑↑ + dir + puño/patada) | ✅ hecho | `InputMapper` (secuencia doble-arriba) + `FighterEntity._airAttack` |
| 7. Cuadrúpedos y deslizamientos (acción + dir + puño) | ✅ hecho | `InputMapper` (combos) + `FighterEntity._combos` |
| 7. Variantes frente / espaldas a cámara | ✅ hecho (datos) | `MoveTable` (clips por `VisualFacing`) |
| 8. FSM: bases, suelo, orientaciones, stances, juggle, hit levels | ✅ hecho | `fsm/` (68 comprobaciones) |
| 8. Tortuga / dominante (suelo interactivo) | 🟡 parcial | Estados y sesión de agarre existen (`GrappleSession`, `GrappleStates`); **falta el cableado entre los DOS peleadores** (`canGrapple: () => false` en `FighterEntity`) |
| 8. Aproximación de suelo (correr al caído, ground slides) | 🟡 parcial | El deslizamiento existe; falta el castigo al caído (`isDownAttack` está declarado en `false`) |
| 9.1 Peleador personalizado (localStorage, renombrable) | ✅ hecho | `core/CustomFighter.js`, `ui/SelectScreen.js` |
| 9.2 Nube por subapase (membresía) | ⏳ futuro | Documentado en Specs 9.2 |
| 9.3 MMORPG "Isla Caribe" | ⏳ futuro | Documentado en Specs 9.3 |
| 11. Arquetipos base (YUGO / MONTE / MUSASHI) | ✅ hecho | `core/archetypes.js`; cada peleador del roster declara el suyo |
| 12. Escalada por fases (datos modulares) | ✅ hecho (tabla) · ⏳ aplicar | `core/phases.js`: reglas, arbitro, ventana, zonas y armas por fase |
| 13. Estancias de boxeo (rotación, baile, Target Action, comando) | ✅ hecho | `core/boxing.js` + `FighterEntity._stances` + poses en `FighterRig.js` |

### Pendiente (siguiente sesión)

- [ ] **Confirmar el personaje en el navegador** (la validación hecha es
      numérica, no visual): `npm start` y ver el mannequin de pie, los
      colores por peleador, el HUD y las pantallas de selección.
- [ ] **Sistema de morphs de física** (muelle + amortiguación) sobre
      `MorphId`. Los 9 morphs ya están definidos en `CineConstants.js`;
      falta el runtime.
- [ ] **Ejecutor de impactos**: hitstop, temblor de cámara y morphs por
      `IMPACT_PRESETS`. Los valores de `hitstop` ya están en `MoveTable.js`
      y los estados en `fsm/states/ImpactStates.js`; falta quien los aplique.
- [ ] **Cámara cinematográfica**: planos (`ShotSize`) y movimientos
      (`CameraMove`) sobre Babylon. La cámara de encuadre ya existe; falta
      la parte cinematográfica.
- [ ] **Animaciones**: importar y mezclar clips, IK y root motion (el
      mannequin trae un solo clip).
- [ ] **Timeline de clips y transiciones** (`TransitionKind`).
- [ ] **Migrar la IA de `Legacy`** a los módulos actuales (el HUD ya está
      migrado; `aiAssistant.js` carga sin errores).
- [ ] **Cableado del agarre entre los dos peleadores** (la sesión ya
      existe; falta que el rival entre en el estado espejo y que los
      pedidos del UKE lleguen a la sesión del TORI). Es la puerta a la
      sumisión de Pedro y al suelo interactivo (biblia 8).
- [ ] **Moveset distinto por estado de locomoción** (biblia 7): hoy la
      pose cambia al caminar/correr/dash (`ATTACK_LOCO_MODS`) pero el
      frame data es el mismo; la siguiente capa es frame data propio
      por movimiento.
- [ ] **Castigo en el suelo** (biblia 8): ataques contra el rival
      caído (`isDownAttack`) y ground slides ofensivos.
- [ ] **Aplicar las fases al combate** (Specs 12): las reglas ya
      están como datos (`core/phases.js`), falta que el referee,
      la ventana de 1 s en el suelo, los jueces con tarjetas y el
      desbloqueo de armas las consulten en runtime.
- [ ] **Stances como estados de la FSM** (Specs 8): hoy las
      posturas son de la entidad (silueta + moveset); falta que la
      FSM las conozca para transiciones y animaciones propias.
- [ ] **Desarme / apropiación del arma rival** (Specs 12, fase 4).

### Bloqueos

- ~~**`git push` a `ryuhen/sanpablera-engine` sigue sin poder hacerse: no hay
   autenticación válida.**~~ **RESUELTO (2026-10-06):** el push funciona y
   `main` está al día con `origin/main`. Se conserva la nota original por si
   vuelve a fallar la autenticación:
   1. Añadir esta clave pública en GitHub → *Settings* → *SSH and GPG keys* →
      *New SSH key*:
      ```
      ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILJAKSVzAIc9H9K0pPiDWlCgy6JG5CXPY5q6X3ifpoZ0 ryuhen@sanpablera-engine
      ```
   2. O crear un token personal con permiso `repo` y pushing por HTTPS:
      ```
      git remote set-url origin https://<usuario>:<token>@github.com/ryuhen/sanpablera-engine.git
      ```

### Lo que falta para que el remoto reciba el trabajo

- [x] Autenticar el push. **Resuelto**: todo el trabajo local ya está en
      `origin/main`; el árbol está limpio y no hace falta force-push.

---

*Última actualización: 2026-10-07*
