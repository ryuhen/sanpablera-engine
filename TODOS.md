# Lo que falta, en orden de trabajo

Lista viva. Cada bloque dice qué hay que hacer, qué archivo toca y cómo se
comprueba que está hecho. Los bloques marcados `[x]` están cerrados y tienen
comprobaciones que lo fijan.

Regla de la casa: **nada se da por hecho hasta que hay un test que lo falla si
se rompe.** Cuando algo no se puede testear en Node (DOM, Babylon), se anota
como "mirar en el navegador" y no se cuenta como cerrado.

Los números de comprobaciones NO se escriben aquí: cambian con cada test nuevo
y convertir esta lista en un censo es la forma más rápida de que mienta. La
fuente es `npm test`. Sí se nombra el archivo de test que fija cada bloque.

---

## Bloque 1 · El muro de grafiti `[x] PARCIAL`

Lo que ya está:

- [x] `ui/graffiti/lexicon.js` — 93 palabras de jerga de 18 países, con rollo y
      tono. Caribe (PR, RD, CU, JM) + Latinoamérica (MX, CO, AR, VE, PE, EC,
      BO, DO, GT, HN, PA, NI, UY, PY).
- [x] `ui/graffiti/writers.js` — 6 grafiteros con paleta, rollo, jerga y brocha.
      El del día se elige por fecha.
- [x] `tests/ui.smoke.mjs` fija los datos (jerga, paletas, brochas, grafitero
      del día). **No comprueba que se pinten**: `LoadingScreen.js` importa solo
      `Postcard.js`, no estos dos módulos (verificado).

Lo que falta:

- [ ] **Conectar los grafiteros con `LoadingScreen.js`.** Ahora los dos módulos
      son datos que NADIE lee: la pantalla sigue pintando sus 9 tags fijos de
      siempre. Hay que reescribir `_buildTag` para que el color, el rollo y la
      jerga salgan del grafitero elegido.
- [ ] **La palabra grande del muro** sale del grafitero (su firma), no de
      `SANPABLERA` fijo.
- [ ] **El fondo del muro** con el color del grafitero (`palette.bg`), para que
      cada uno pinte en una pared distinta y no solo con otras letras.
- [ ] **La brocha manda**: hoy `_paint()` usa constantes (`speed` fijo, jitter
      fijo). Tiene que leer `brushFor(grafitero)`.
- [ ] **Solapes controlados y jerárquicos**: las palabras grandes primero, las
      pequeñas encima, con borde propio para no perder legibilidad.
- [ ] **Ver en el navegador.** Es la parte que no se puede testear.

---

## Bloque 2 · La selección de peleador `[x] PARCIAL`

Lo que ya está:

- [x] `ui/selectState.js` — la lógica entera, sin DOM: cruceta, los 4 botones,
      los 2 lados, cuándo se puede pelear.
- [x] `ui/selectAnims.js` — 18 animaciones, repertorio DISTINTO por peleador.
- [x] `tests/select.smoke.mjs` fija la lógica pura. **No comprueba la pantalla**:
      `SelectScreen.js` importa `roster.js` y `CustomFighter.js`, mantiene su
      propia lógica (`this.pick1`, `this.pick2`, `this.turn`) y nunca usa
      `selectState.js` (verificado).
- [x] `ui/wardrobe.js` — 8 atuendos con `soltable`/`arma` para el desarme futuro.

Lo que falta:

- [ ] **Reescribir `SelectScreen.js` para usar `selectState.js`.** Hay que elegir
      una sola fuente de verdad: la de `selectState`, que sí está testeada.
- [ ] **El panal unido por lados.** Hoy son 8 celdas sueltas en un `grid`. Lo
      pedido es que cada hexágono se una a los demás por varios lados.
- [ ] **La vista previa 3D** del peleador enfocado (solo uno, no nueve).
- [ ] **Los botones de la pantalla** conectadas al `InputRouter`: ataque elige,
      patada=vestuario, guardia=animación, acción=deseleccionar.
- [ ] **Las fichas de P1 (derecha) y P2 (izquierda)** con nombre, atuendo y
      animación actual.
- [ ] **Ver en el navegador.**

---

## Bloque 3 · La esfera de peleadores

Lo pedido: los 9 peleadores en una esfera, cada uno con 6 alrededor, girando,
vista desde arriba.

- [ ] **Decidir si la esfera es 3D o 2D.** Con 9 peleadores, una esfera con
      exactamente 6 vecinos por peleador NO existe: la suma de grados de un
      grafo esférico es `6n - 12`, así que hay 6 "huecos" que repartir. Con 9
      tocaría que algunos tengan 5. Es geometría, no una decisión de código.
- [ ] **La escena:** los 9 en un `TransformNode` padre que gira.
- [ ] **Navegar por la esfera** girándola, no celda a celda.
- [ ] Si se hace después del bloque 2, reutiliza su estado: lo que ya está
      elegido se ve marcado en la esfera.

---

## Bloque 4 · La galería

Lo pedido: caricaturas de peleadores, escenarios y cosas urbanas, colgables
como arte del juego.

- [ ] **Decidir dónde vive.** Lo natural es un `Gallery.js` junto a los otros
      menús, no un archivo de imagen.
- [ ] **Caricaturas por código (SVG)**, como el muro: sin ficheros binarios,
      sin descargas.
- [ ] **Dibujar a los 8 peleadores** con su color y su atuendo.
- [ ] **Dibujar el escenario** (el Dojo Origami, de momento).
- [ ] **Cosas urbanas** (el saco de boxeo, una bicicleta, una papelera, un
      poste): cada una con su seed para que salga distinta cada vez.
- [ ] **Guardar el grafiti del jugador.** Si quieres que lo que pintó en la
      carga se pueda volver a ver después, hay que serializar el muro
      (semilla + grafitero + jerga) y volverlo a pintar.

---

## Bloque 5 · Vestuario con malla `[x] PARCIAL`

Lo que ya está:

- [x] `render/PartMannequin.js` — maniquí modular de cápsulas, cajas y esferas
      colgado de los huesos del contrato; se puede teñir por peleador.
      `CharacterModel.js` lo usa con `?piezas=1`.
- [x] `tests/render.smoke.mjs` y `tests/anim.smoke.mjs` cubren la construcción de
      las piezas con un stub de Babylon.
- [x] `ui/wardrobe.js` — catálogo de 8 atuendos con `soltable`/`arma`.

Lo que falta:

- [ ] **Colgar la MALLA de las prendas en runtime** (`SYSTEM_STATUS.APPAREL
      .done:false`): hoy el maniquí son primitives, no la malla del atuendo.
- [ ] **Las piezas que se rompen.** El campo `soltable`/`arma` ya existe en los
      datos; falta la mecánica en el combate (desarme de la fase 4, ver
      `core/phases.js`).
- [ ] **Ver en el navegador** el maniquí y el tinte por peleador.

---

## Bloque 6 · Animaciones por peleador `[x] PARCIAL`

Lo que ya está:

- [x] `core/anim/ClipLibrary.js` — 83 clips procedurales con ficha (duración en
      segundos, bucle, compromiso, capa); las fases viven dentro de cada
      generador, no como campo de la ficha. `render/ClipGrabber.js` trae además
      los clips grabados en GLB.
- [x] `tests/clips.smoke.mjs` y `tests/clipassets.smoke.mjs` fijan la biblioteca.
- [x] `ui/selectAnims.js` — 18 animaciones con repertorio distinto por peleador
      (21 es el número de huesos del contrato, no de animaciones).
- [x] Editor del mapa (F3): `core/anim/ClipMap.js` junta `selectAnims`, la
      biblioteca y los clips grabados; `core/anim/ClipEditor.js` mantiene una
      copia editable y exporta un parche; `ui/AnimEditor.js` es la ventana con
      ratón y teclado. F2 sigue siendo el inspector de poses/tablas IK.

Lo que falta:

- [ ] **Clips grabados de verdad.** Hoy son poses procedurales con nombre de
      clip: no hay captura de movimiento ni archivos de animación.
- [ ] **Cada `clip` de `selectAnims.js` pasa a existir de verdad.** Los nombres
      ya están puestos (`IDLE`, `KICK_HIGH`, `SUBMISSION`...); cuando haya
      clips, esta tabla no cambia, solo se le añaden entradas.
- [ ] **Los clips de §4 que faltan** (sentadilla+upkick, apoyo mixto, blitz en
      punta de pies, avance agachado con mano apoyada, pasos fantasma): ver
      bloque 8.

---

## Bloque 7 · Biblia Apex Primal §2, §6 y §7 `[x] PARCIAL`

Lo que ya está:

- [x] `core/geo/diorama.js` + `render/Diorama.js` — Margarita en miniatura:
      contorno, zonas, hitos, selección por marcador y zoom por hito.
- [x] `render/ToonMaterial.js` — cel-shading a tres tonos con borde entintado;
      cae a `StandardMaterial` si Babylon no trae `ShaderMaterial`.
- [x] `ui/ModeSelect.js` — cuatro modos: CLASICO, DIORAMA, ROYALE, CAMPAÑA.
- [x] `core/economy/economy.js` — Cobre/Diamante, rentas, inactividad y
      monedero con adapter inyectado. El motor solo gasta Cobre.
- [x] `core/modes/battleRoyale.js` + `core/modes/session.js` — cuadro de hasta
      cuatro, relevos, botín, campeón; y el pegamento que convierte cada KO en
      Cobre, avance de duelo y ciclo, con guardado local.
- [x] `core/narrative/cuarteto.js` — bandos tatami/afueras, secretos y
      misiones secundarias del Cuarteto del Caribe.
- [x] `core/Engine.js` — menú de modo en el arranque, maqueta en lugar del
      libro de origami en DIORAMA, cel-shading en los GLB, KO → sesión y panel
      con el estado de la partida.
- [x] `ui/SessionPanel.js` — la vista del panel, sacada de `Engine.js` para
      poder probarla con DOM falso.
- [x] Tests nuevos: `controls` (ModeSelect), `economy`, `royale`, `diorama`,
      `toon`, `narrative`, `session`, `sessionpanel.dom` y `wiring.smoke`.

Lo que falta:

- [ ] **Cuatro mandos locales reales para el Royale.** `InputRouter` detecta un
      solo mando y la UI es de un jugador; el cuadro de cuatro es solo datos.
- [ ] **Botín, protección segmentada, vehículos, comida y relevos EN PARTIDA.**
      `battleRoyale.js` lo decide en Node, pero `Engine` no importa `collect`,
      `openCrate`, `eat`, `protectionOf` ni `damageRoyale`.
- [ ] **Sidequests, secretos y emparejamientos dinámicos del Cuarteto.**
      `cuarteto.js` los tiene; `Engine` solo llama a `nextCycle()`.
- [ ] **Rentas, inactividad y avisos por correo en el bucle.** `economy.js` los
      calcula; `settleFees`, `advanceActivity` y `deserializeSession` nunca se
      ejecutan. La persistencia es `localStorage`, no Supabase.
- [ ] **La maqueta cobra vida (§2 híbrido).** Falta la transición a escena
      detallada con sprites 2D, polvo y objetos rompibles: hoy solo hay zoom.
- [ ] **Supabase/Google reales.** Sin credenciales, queda la capa con adapter
      inyectado.
- [ ] **Ver en el navegador.** Zoom de la maqueta, shader en el GLB y panel de
      sesión no se pueden comprobar en Node: `wiring.smoke` comprueba que el
      cableado existe, no que se vea.

---

## Bloque 8 · Biblia Apex Primal §3-§5 · núcleo biomecánico `[ ]`

Auditoría del PDF contra el código (§1-§7; **no hay §8 ni §9**). Es lo que de
verdad separa el motor actual del juego descrito en la Biblia. Nada de esto
tiene test todavía: al implementarlo se añade aquí la suite que lo fija.

### Prioridad 0 · lo que define el combate

- [ ] **IK a dos esqueletos (§3).** `Rig.js` resuelve un solo rig contra un
      *target*; `GrappleSession.js` arbitra frames pero no deforma esqueletos.
      Falta ajustar a la vez manos y brazos de TORI y UKE en agarres,
      proyecciones, clinches y *clashes*. Tampoco hay deflexión con IK
      (`GUARD_IK`).
- [ ] **Fatiga de guardia, fracturas por inercia y TKO anatómico (§5).**
      `defend()` es un check binario de altura: bloquear 1 o 20 golpes cuesta
      igual. `takeHit()` resta `move.damage` plano y `_contactoDe()` usa una
      banda declarada, no el punto real de contacto. `HitReactions` y `ZONES`
      son datos sin cablear.
- [ ] **Tai Sabaki (§3).** Hay un clip `side_step` y una ventana de evasión,
      pero nadie reposiciona el centro de gravedad ni encadena contraataque
      desde esa posición.
- [ ] **Encadenado real de golpes (§4 / `CANCEL`).** Están `cancelTier`,
      `Transitions`, `PoseBlender` y los clips; falta poder cancelar un golpe
      DENTRO de la recovery de otro.

### Prioridad 1 · dinámicas de §4 que no existen

- [ ] **Sentadilla profunda + upkicks.** Hay clips `sitting_*` como assets, pero
      no hay estado `SENTADO` ni move `upkick`.
- [ ] **Apoyo mixto (una rodilla en tierra).** `DE_RODILLAS` es recuperación de
      knockdown, no postura con pie opuesto soportando y ganchos de ángulo bajo.
- [ ] **Inversión de guardia en el paso sostenido.** `LOCO` distingue toque de
      mantenimiento como datos; `FighterEntity` nunca cambia `stance`. Además
      `readLoco()` escribe `tapKind`/`tapDirX` que nadie lee.
- [ ] **Blitz en punta de pies**, **avance agachado con mano apoyada** y
      **pasos fantasma**: no hay estado, clip ni función para ninguno.

### Otros sistemas abiertos (del propio `SYSTEM_STATUS`)

- [ ] `APPAREL`, `GUARD_IK`, `GROUND` (modelo posicional sin estado FSM ni
      botones), `CANCEL` y las variantes por disciplina de `GRAPPLE`
      (judo, sambo, sumo, greco) siguen con `done:false`.

---

## Cómo se comprueba cada bloque

| Bloque | Test |
|---|---|
| 1 (datos del muro) | `node tests/ui.smoke.mjs` |
| 2 (lógica de selección) | `node tests/select.smoke.mjs` |
| 5 (maniquí de piezas) | `node tests/render.smoke.mjs`, `tests/anim.smoke.mjs` |
| 6 (biblioteca de clips) | `node tests/clips.smoke.mjs`, `tests/clipassets.smoke.mjs` |
| 6 (mapa y editor) | `node tests/clipmap.smoke.mjs`, `tests/clipeditor.smoke.mjs`, `tests/animateditor.dom.mjs` |
| 2 y 1 (lo pintado) | navegador: `npm start` |
| 3, 4 | navegador (no hay forma de testear un SVG en Node) |
| 7 (modos y maqueta) | `node tests/{controls,economy,royale,diorama,toon,narrative,session}.smoke.mjs` |
| 7 (panel de sesión) | `node tests/sessionpanel.dom.mjs` |
| 6 y 7 (cableado en `Engine`, F1/F2/F3) | `node tests/wiring.smoke.mjs` |
| 7 (lo pintado: shader, maqueta, panel y ventana F3) | navegador: `npm start` |
| 8 (núcleo biomecánico) | sin test: está abierto, se añadirá al implementarlo |

`npm test` corre todas las suites registradas en `package.json`. Un bloque no
está cerrado hasta que su test pasa. `tests/wiring.smoke.mjs` falla si aparece
una suite nueva que no esté registrada ahí.
