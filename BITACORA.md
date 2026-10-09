# Bitácora del Proyecto - Sanpablera Engine

Esta bitácora nos permite registrar y sincronizar las actividades realizadas en el proyecto.

## Registro de Actividades

| Fecha | Autor | Commit | Actividad | Notas |
|---|---|---|---|---|
| 2026-10-09 | Sistema | *este commit* | La jerga del muro, los seis grafiteros, el vestuario y el estado de la seleccion | Todo entra como **DATOS PUROS y testeados**, sin DOM ni Babylon: `ui/graffiti/lexicon.js` (**93 palabras** de jerga de **18 paises** — Caribe (PR, RD, CU, JM) y Latinoamerica (MX, CO, AR, VE, PE, EC, BO, DO, GT, HN, PA, NI, UY, PY) — cada una con su rollo y su tono; `ui/graffiti/writers.js` (**6 grafiteros**: ZURDO, FLORA, BLOCKO, CANAL, MURO, CHISPA, cada uno con paleta, rollo, paises de jerga y gesto de brocha, y **el del dia se elige por fecha** para que el muro sea coherente dentro de la sesion y cambie al dia siguiente); `ui/wardrobe.js` (**8 atuendos** por pieza, con el campo `soltable`/`arma` que deja preparado el desarme de la fase 4: MECANICO tiene guantes con `arma: 'PATADA'` y ORO un cinturon con `arma: 'MANO'`); `ui/selectAnims.js` (**21 animaciones** con repertorio DISTINTO por peleador, que es lo que hace util la vista previa: si dos se movieran igual, la pantalla no serviria para elegir) y `ui/selectState.js` (la logica entera de la seleccion sin DOM: cruceta, los cuatro botones —ataque elige, patada cambia ropa, guardia cambia animacion, accion suelta— y P1 a la derecha / P2 a la izquierda). **1.184 comprobaciones, 0 fallos** (nuevas `tests/ui.smoke.mjs` 134 y `tests/select.smoke.mjs` 123, las dos en `npm test`). Bugs cazados de paso: `unescapeTag` dejaba `CO~NIZA` en `COñIZA` con enye minuscula en mayusculas y el `~` de una letra sin vocal se comia el acento entero; `paletteOf` se callaba un typo en la clave de la paleta en vez de avisar, y por eso BLOCKO salia con la paleta de otro sin un error en consola; `selectState.move` llevaba el foco a una celda inexistente con un roster de una sola fila. **`TODOS.md` nuevo**: la lista de lo que falta en 6 bloques, cada uno con el archivo que toca y como se comprueba. Ojo: los datos estan hechos pero **`LoadingScreen.js` y `SelectScreen.js` todavia no los leen** — ver el bloque 1 y el 2 de `TODOS.md` |
| 2026-10-09 | Sistema | *este commit* | Tela simulada, maniqui de piezas, golpes por contexto y la matriz de reacciones (3 alturas x 3 potencias) | **1 · SIMULADOR DE TELA** (`core/cloth/Cloth.js`, Verlet con restriccion de distancia, puro y testeado en Node). Se busco en npm y se descarto bajar nada: las librerias de tela de navegador (`three-simplecloth` y las de Three.js WebGPU) estan atadas a Three.js, y este motor usa Babylon; Ammo/Cannon si tienen soft bodies pero son motores rigidos completos (2 MB de WASM para 40 particulas). Ademas el proyecto escribe todo como modulos puros (`tests/loader.mjs` obliga a ello) y un solver atado a un motor 3D no se puede testear. El solver trae **tres tipos de cuerda** (estructural, cizallamiento y doble salto) porque sin cizallamiento la tela se ve como paramalla y sin doble salto se ve como humo, 2 subpasos por frame (con uno solo sale goma, no tela), colision contra suelo, esferas y capsulas, viento y rafagas. **La costura se cose con el ancho del pano**: si es mas corta, las cuerdas de la primera fila quedan comprimidas para siempre (los dos extremos estan clavados y el solver no puede ganar) y la capa nace con un bulto en los hombros que no se va. Se expone `pinMismatch` para verlo, porque en pantalla el sintoma es "la capa tiene un bulto" y no dice nada de la anchura. **La capa se cose 14 cm DETRAS del pecho, no pegada**: medido, pegada (7 cm) la tela nace dentro de la capsula del torso y sale despedida (estiramiento de 3,3 cm); a 14 cm cae limpia (0,6 cm) y a 20 cm casi nada (0,1 cm). **2 · MANIQUI DE PIEZAS** (`render/PartMannequin.js`): humanoide construido con capsulas, cajas y esferas colgadas de los huesos DEL CONTRATO, no de los nombres del archivo. Se activa con `?piezas=1` y quita de en medio el problema viejo del modelo de Quaternius: las piezas son propias, asi que la silueta es siempre la misma y la postura procedural funciona con cualquier `.glb`. Un peleador mas corpulento es una tabla de medidas distinta, no un asset. Se tine por peleador dejando manos y cabeza mas claras, que es lo que hace legible de quien es quien a tres metros. **Bug encontrado al probarlo**: el llamante emparejaba malla y hueso por indice sobre la tabla de entrada, asi que en cuanto el modelo no traia un hueso (una fila se saltaba) **todas las piezas siguientes llevaban el nombre de otra** y al tintar se pintaban las manos como torso. Ahora `buildParts` devuelve `contracts` en el mismo orden. **3 · GOLPES POR CONTEXTO** (`entities/AttackPoses.js`): el mismo jab salia igual de pie, agachado y en el aire, y en el aire clavaba los pies donde estaria el suelo. Ahora hay **5 familias** (jab, gancho, ascendente, patada, barrido) x **4 contextos** (de pie, agachado, aire, suelo), y el que decide el contexto es el ESTADO, no el boton. El jab agachado llega 20 cm mas abajo que el de pie, que es lo que hace que el boton de abajo se vea que hace algo. **4 · MATRIZ DE REACCIONES** (`entities/HitReactions.js`): antes habia UNA (`flinchPose` miraba solo si era FUERTE) para nueve casos. Ahora son 9 filas de datos: ALTO/MEDIO/BAJO x DEBIL/MEDIO/FUERTE, con cadera, torso, cabeza, brazos, piernas y **cuanto tarda en recuperarse** (un golpe fuerte vuelve a la guardia despacio: es lo que el jugador lee como "me han pegado fuerte"). El golpe BAJO dobla el torso hacia DELANTE, que es lo que hace que un barrido se lea como barrido. Y la reaccion se le **echa encima** de la guardia (mezcla aditiva) en vez de sustituirla, que es la diferencia entre "le pegan sin que deje de estar en guardia" y un muneco de trapo. **5 · GOLPES EN EL SUELO Y LEVANTADA**: `isDownAttack` devolvia `false` fijo, asi que el castigo al rival caido no existia. Ahora `_downAttack` clasifica el golpe (PIE / MANOS / SALTAR / PESADO) segun la postura del RIVAL y la potencia del golpe, y `wakeupPose` levanta del suelo mostrando la mecanica (apoyo en el codo, se encoge, se empuja) en vez de teletransportarse a la guardia. **6 · UN BUG DE 4 MESES EN LA FK** (`cine/Rig.js`): el delta de traslacion de la RAIZ se sumaba **dos veces** (una al armar el `localT` y otra al escribir la posicion), asi que "bajar la cadera 10 cm" la bajaba 20. Como la pelvis es la raiz en todos los modelos, agacharse hundia el doble de lo pedido. No reventaba nada: el IK se adaptaba y de pie se veía bien, y por eso nadie lo noto en cuatro meses. Lo delata el nuevo `tests/anim.smoke.mjs`, que compara el delta pedido contra el obtenu (0,65 y no 0,35). **7 · SIGNOS QUE SALIAN AL REVES**: la cadera de las reacciones se escribia como `restHipY - altura` cuando `setPos` guarda un delta (con el signo mal la cadera MEDIA salia a **1,18 m**, mas arriba que de pie) y `groundAttackPose` restaba donde tenia que sumar (el pisoton salia con los pies por encima de la cintura). Los dos estan documentados con el signo verificado contra el rig. Ademas `groundAttackPose` ignoraba el parametro `phase` y repartia `t` en tercios, con lo que el amago y el golpe salian identicos. **8 · `gust()` recibe m/s, no un desplazamiento**: el empuje se aplica a `prev`, que en Verlet guarda metros por frame, y dar un numero en "cuanto se mueve" hacia que un golpe fuerte rebotara la capa de -0,55 a -0,81 y volviera a +0,43 en tres frames (una serpentante, no una capa). Ahora convierte con el dt y el efecto es el mismo a 30 y a 144 fps. **PRUEBAS**: `tests/anim.smoke.mjs` (**112**, la capa de animacion sobre el rig real: que el jab agachado llegue mas bajo, que un golpe ALTO no se parezca a uno BAJO, que la tela caiga y no se estire, y dos tests de INTEGRACION con dos entidades peleando de verdad) y `tests/render.smoke.mjs` (**29**, lo que toca Babylon con un **BABYLON de mentira**: piezas colgadas del hueso correcto, tinte, capa, viento, y que un modelo sin el hueso ancla no reviente). Con la suite de aire y
      clinch que ya venia a medias: **761 comprobaciones, 0 fallos** |
| 2026-10-09 | Sistema | *este commit* | El peleador de Quaternius salia hecho una bola: era el rootFix contado dos veces | La entrada anterior de `ASSETS.md` atribuia el fallo a `Stances.js` y a "las longitudes que espera el IK". **Era un diagnostico equivocado**: el esqueleto estaba bien todo el rato (cadena pelvis 0,94 -> cabeza 1,48) y el rig mapeaba 21/21. El fallo estaba en el PUENTE, en `CharacterModel.applyPose`. Ese metodo escribe un LOCAL en cada hueso, pero el hueso raiz del rig no es el raiz de la ESCENA: el `.gltf` de Quaternius cuelga la pelvis de un nodo `root` con un giro de **90 grados sobre X**, que es justo el `rootFix 'Z_UP'` que el rig aplica. Babylon compone ese nodo encima del local escrito, asi que el giro se sumaba dos veces y la pelvis acababa a **1,34 m** de donde el rig creia: tumbada contra una malla de pie. De ahi la bola. Se anade `wrapperTransform()`, que mide el envoltorio acumulado del archivo por encima del hueso raiz, y `applyPose` lo neutraliza con su inversa antes de escribir: el error pasa a **0,0000 m**. El mannequin nunca lo noto porque su cadena (`Z_UP -> Armature`) es identidad, y por eso el bug solo puede aparecer con un archivo que traiga su propia correccion de eje. Nuevo `tests/glb.mjs parseGLTF/loadGLTFPair` para poder testear un `.gltf` + `.bin` (el lector solo sabia de `.glb`) y nuevo bloque `Puente rig->Babylon` en `tests/cine.smoke.mjs` que verifica los DOS modelos reales: que con la correccion la pelvis cae donde dice el rig, y que sin ella el error pasaria de un metro. **534 comprobaciones, 0 fallos** |
| 2026-10-08 | Sistema | *este commit* | Salirse del ring es una falta: 50 de daño y vuelta al centro | `RING_LIMIT` era una **pared invisible**: `FighterEntity._moveWorld` recortaba la posicion dentro del radio, asi que nadie podia salirse nunca y empujar al rival hacia las cuerdas era imposible. Ahora el limite se comprueba DESPUES de mover a todos (en el bucle del engine, no dentro de la entidad, para que el rival no pueda "arrastrar" al otro fuera el mismo frame en que se mueve) y `world.ringOut()` penaliza: **50 de vida** al que cruza, los dos vuelven al centro separados lo justo para no violar `MIN_SPACING`, mirandose otra vez, con la inercia a cero y el `inputMapper` reiniciado. Hitstop de 14 frames para que se note. Verificado en el navegador con los dos peleadores: vida 100 -> 50 y ambos en el centro. **517 comprobaciones, 0 fallos** |
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
- [x] `npm test` en verde: **1.184 comprobaciones, 0 fallos** (HUD 23 · Stamina 26 · FSM 68 · Design 67 · UI 134 · Select 123 · Cine 350 · Air+clinch 86 · Anim 112 · Render 29 · Overrides 166)
- [x] La jerga del muro, los 6 grafiteros, el vestuario y el estado de la selección, todo como datos puros (`ui/graffiti/lexicon.js`, `ui/graffiti/writers.js`, `ui/wardrobe.js`, `ui/selectAnims.js`, `ui/selectState.js`) con sus dos suites (`tests/ui.smoke.mjs`, `tests/select.smoke.mjs`)
- [x] `TODOS.md`: lo que falta, en 6 bloques, con el archivo que toca y cómo se comprueba cada uno
- [x] Los tres arquetipos base registrados como datos puros (`core/archetypes.js`) y asignados al roster
- [x] Escalada de combate por fases como tabla modular (`core/phases.js`): arbitro, ventana de 1 s, zonas legales/ilegales, armas y desarme
- [x] Sistema de estancias del arquetipo YUGO (`core/boxing.js` + `FighterEntity._stances`): rotacion, inversion, baile, fijacion y las tres posturas de comando
- [x] Moveset exclusivo de cada postura en el primer peleador (`Movesets.js` capa 1b) y poses procedurales (`FighterRig.js`)
- [x] Postura procedural sobre el esqueleto de Quaternius: el fallo era el `rootFix` duplicado en el puente (`wrapperTransform` + `applyPose`), no `Stances.js`

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
| 7. Moveset por movimiento (jab, gancho, upper, plexo...) | 🟡 parcial | Moveset por capas de Pedro (`Movesets.js`) y **5 familias de golpe x 4 contextos** (`AttackPoses.js`: de pie / agachado / aire / suelo); **falta** un frame data DISTINTO por estado de locomoción (caminando / corriendo / dash): hoy la silueta acompaña pero los frames son los mismos |
| 7. Ataques aéreos (↑↑ + dir + puño/patada) | ✅ hecho | `InputMapper` (secuencia doble-arriba) + `FighterEntity._airAttack` |
| 7. Cuadrúpedos y deslizamientos (acción + dir + puño) | ✅ hecho | `InputMapper` (combos) + `FighterEntity._combos` |
| 7. Variantes frente / espaldas a cámara | ✅ hecho (datos) | `MoveTable` (clips por `VisualFacing`) |
| 8. FSM: bases, suelo, orientaciones, stances, juggle, hit levels | ✅ hecho | `fsm/` (68 comprobaciones) |
| 8. Tortuga / dominante (suelo interactivo) | 🟡 parcial | Estados y sesión de agarre existen (`GrappleSession`, `GrappleStates`); **falta el cableado entre los DOS peleadores** (`canGrapple: () => false` en `FighterEntity`) |
| 8. Aproximación de suelo (correr al caído, ground slides) | 🟡 parcial | El deslizamiento y el **castigo al caído** existen (`HitReactions.groundAttackPose` + `FighterEntity._downAttack`, con sus cuatro siluetas: pisotón / manos / patada descendente / pesado) y la **levantada** muestra la mecánica (`wakeupPose`); falta el **ground slide ofensivo** (deslizarse hasta el rival caído) |
| 7 (nuevo). Reacciones lógicas de golpe (alto/medio/bajo x débil/medio/fuerte) | ✅ hecho | `entities/HitReactions.js`: 9 filas de datos, potencia desde el frame data, la reacción se echa encima de la guardia |
| (nuevo). Tela simulada | ✅ hecho | `core/cloth/Cloth.js` (Verlet puro) + `render/ClothMesh.js` (puente a Babylon, malla actualizable) + `Cape` con la costura cosida a la clavícula |
| (nuevo). Modelos genéricos con piezas | ✅ hecho | `render/PartMannequin.js`: capsulas y cajas colgadas de los huesos del CONTRATO, con `?piezas=1` para probarlo |
| 9.1 Peleador personalizado (localStorage, renombrable) | ✅ hecho | `core/CustomFighter.js`, `ui/SelectScreen.js` |
| 9.2 Nube por subapase (membresía) | ⏳ futuro | Documentado en Specs 9.2 |
| 9.3 MMORPG "Isla Caribe" | ⏳ futuro | Documentado en Specs 9.3 |
| 11. Arquetipos base (YUGO / MONTE / MUSASHI) | ✅ hecho | `core/archetypes.js`; cada peleador del roster declara el suyo |
| 12. Escalada por fases (datos modulares) | ✅ hecho (tabla) · ⏳ aplicar | `core/phases.js`: reglas, arbitro, ventana, zonas y armas por fase |
| 13. Estancias de boxeo (rotación, baile, Target Action, comando) | ✅ hecho | `core/boxing.js` + `FighterEntity._stances` + poses en `FighterRig.js` |

### Cerrado en esta sesión (pendientes que ya no lo están)

- [x] ~~**Castigo en el suelo**~~ (biblia 8): las cuatro siluetas de golpe
      contra el rival caído (`HitReactions.groundAttackPose`), la clasificación
      por postura del rival y potencia (`FighterEntity._downAttack`, que antes
      devolvía `false` fijo) y la levantada (`wakeupPose`, que enseña el
      apoyo en el codo en vez de teletransportarse).
- [x] ~~**Tela simulada**~~ (`core/cloth/Cloth.js` + `render/ClothMesh.js` +
      `Cape`). Lo que queda, en "Pendiente": darle forma de verdad y decidir
      quién la lleva.
- [x] ~~**Modelos genéricos con piezas**~~ (`render/PartMannequin.js`, con
      `?piezas=1`). Falta verlo en el navegador.
- [x] ~~**Reacciones lógicas de golpe**~~ (`HitReactions.js`: 3 alturas x
      3 potencias, 9 filas de datos).
- [x] ~~**Golpes por contexto**~~ (`AttackPoses.js`: 5 familias x 4
      contextos). El *frame data* por locomoción sigue pendiente, es otra cosa.

### Pendiente (siguiente sesión)

- [ ] **CONFIRMAR TODO EN EL NAVEGADOR.** Es la tarea que mas importa y la mas
      mudahosa de hacer aqui: lo de esta sesion esta verificado en **números**
      (`npm test`, 761 comprobaciones) pero no se ha visto. Con `npm start`:
      1. `?piezas=1` — el maniqui de piezas: dos peleadores de colores
         distintos, con la capa colgando de los hombros. Es la forma mas
         rapida de comprobar la animacion, porque la silueta es siempre la
         misma y no depende de ninguna malla.
      2. Los golpes: de pie (J), pesado (K), agachado (abajo + J), aire
         (doble arriba + delante + J). El jab agachado tiene que verse mas
         bajo que el de pie; en el aire los pies NO pueden clavarse.
      3. Las reacciones: `SANPABLERA.recibir('P2', 'ALTO', 'FUERTE')` y las
         ocho combinaciones mas. Un golpe ALTO y uno BAJO tienen que verse
         distintos, y un FUERTE tiene que volver a la guardia mas despacio.
      4. El castigo al caido: derribar al rival (golpe FUERTE) y golpearle
         mientras esta en el suelo — la silueta tiene que cambiar a pisoton.
      5. La tela: `SANPABLERA.viento(6, 0, 0)` y `SANPABLERA.tela('P1', false)`.
         La capa no debe ir un frame por detras del cuerpo ni quedarse pegada
         al pecho.
      6. `?modelo=assets/characters/quaternius-superhero-male/Superhero_Male_FullBody.gltf`
         — el de Quaternius, que ya cuadra en numeros pero sigue sin verse.
- [ ] **Morphs de física**: la capa da la tela y las reacciones dan el
      movimiento del cuerpo, pero los 9 `MorphId` de `CineConstants.js`
      (squash, stretch, head lag, jiggle...) siguen sin runtime. El sitio
      natural es el mismo `fleeReactionPose`, que ya sabe DONDE pega el golpe
      (`IMPACT_BONE_GAIN`) y con que potencia: el squash es el missing link
      entre la matriz de reacciones y el ejecutor de impactos.
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
- [x] ~~**Moveset distinto por estado de locomoción**~~: la pose ya cambia
      por contexto (4 siluetas en `AttackPoses.js`). Queda el frame data, que
      esta mas abajo y es otra cosa.
- [ ] **Ground slide ofensivo** (biblia 8): el castigo al caído ya sale
      (`groundAttackPose` + `_downAttack`) y la levantada tambien
      (`wakeupPose`); falta el deslizarse hasta el rival del suelo. Ojo:
      `_downAttack` mira la postura del RIVAL, asi que al cablear el slide hay
      que decidir si cuenta como ataque contra el suelo (y por tanto cambia la
      silueta) o es solo movimiento.
- [ ] **La capa como pieza de personaje, no como adorno**: ahora la capa es
      la misma para los dos peleadores y cuelga de la clavícula. Falta decidir
      que la lleva (¿todos? ¿solo los arquetipos con peso?), y las piezas de
      tela que si tienen forma: faldón, mangas, cinta en la cabeza. El solver
      y `ClothMesh` ya las soportan; es trabajo de datos.
- [ ] **Frame data por estado de locomoción** (biblia 7): la silueta ya
      acompaña al movimiento (4 contextos) pero los frames son los mismos en
      caminar, correr y dash.
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

*Última actualización: 2026-10-09*
