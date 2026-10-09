# Lo que falta, en orden de trabajo

Lista viva. Cada bloque dice qué hay que hacer, qué archivo toca y cómo se
comprueba que está hecho. Los bloques marcados `[x]` están cerrados y tienen
comprobaciones que lo fijan.

Regla de la casa: **nada se da por hecho hasta que hay un test que lo falla si
se rompe.** Cuando algo no se puede testear en Node (DOM, Babylon), se anota
como "mirar en el navegador" y no se cuenta como cerrado.

---

## Bloque 1 · El muro de grafiti `[x] PARCIAL`

Lo que ya está:

- [x] `ui/graffiti/lexicon.js` — 93 palabras de jerga de 18 países, con rollo y
      tono. Caribe (PR, RD, CU, JM) + Latinoamérica (MX, CO, AR, VE, PE, EC,
      BO, DO, GT, HN, PA, NI, UY, PY).
- [x] `ui/graffiti/writers.js` — 6 grafiteros con paleta, rollo, jerga y brocha.
      El del día se elige por fecha.
- [x] `tests/ui.smoke.mjs` — 134 comprobaciones.

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
- [x] `ui/selectAnims.js` — 21 animaciones, repertorio DISTINTO por peleador.
- [x] `tests/select.smoke.mjs` — 123 comprobaciones.
- [x] `ui/wardrobe.js` — 8 atuendos con `soltable`/`arma` para el desarme futuro.

Lo que falta:

- [ ] **Reescribir `SelectScreen.js` para usar `selectState.js`.** Ahora la
      pantalla tiene su propia lógica (`this.pick1`, `this.pick2`, `this.turn`)
      y la de `selectState.js` no la usa nadie. Hay que elegir una sola fuente
      de verdad: la de `selectState`, que sí está testeada.
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

## Bloque 5 · Vestuario con malla (a futuro)

- [ ] Cuando haya ropa de verdad, cada atuendo traerá un `model`. La
      estructura ya está preparada (`piezas` son huesos del contrato).
- [ ] **Las piezas que se rompen.** El campo `soltable`/`arma` ya existe en los
      datos; falta la mecánica en el combate (desarme de la fase 4, ver
      `core/phases.js`).

---

## Bloque 6 · Animaciones por peleador (a futuro)

- [ ] **La biblioteca de clips** (`ClipLibrary`): hoy el motor genera poses
      procedurales, no reproduce clips grabados.
- [ ] **Cada `clip` de `selectAnims.js` pasa a existir de verdad.** Los nombres
      ya están puestos (`IDLE`, `KICK_HIGH`, `SUBMISSION`...); cuando haya
      clips, esta tabla no cambia, solo se le añaden entradas.

---

## Cómo se comprueba cada bloque

| Bloque | Test |
|---|---|
| 1 (datos del muro) | `node tests/ui.smoke.mjs` |
| 2 (lógica de selección) | `node tests/select.smoke.mjs` |
| 2 y 1 (lo pintado) | navegador: `npm start` |
| 3, 4 | navegador (no hay forma de testear un SVG en Node) |

`npm test` corre las 10 suites. Un bloque no está cerrado hasta que su test
pasa.
