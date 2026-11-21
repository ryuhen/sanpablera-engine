# sanpablera-engine

Motor de peleas 3D en Babylon.js / WebGL, inspirado en la
**Biblia de Diseño y Combate Apex Primal**. Es un laboratorio: la lógica de
combate se escribe como módulos puros y se prueba en Node; la capa visual
(Babylon + DOM) se cablea encima y se mira en el navegador.

## Arranque

```bash
npm install
npm start
```

Abre <http://localhost:8080>. El servidor es `server.js`, un estático sin
dependencias que sirve el directorio del proyecto (incluye los `.glb`, con su
tipo MIME propio).

## Tests

```bash
npm test
```

Corre todas las suites registradas en `package.json` (lógica pura, DOM falso y
verificación de cableado). No necesita navegador. Dos suites son especiales:

- `tests/sessionpanel.dom.mjs` y `tests/animateditor.dom.mjs` — paneles con un
  DOM de mentira (id mal escrito = botón mudo, y eso no da excepción).
- `tests/wiring.smoke.mjs` — lee `src/core/Engine.js` como texto y falla si un
  punto de conexión desaparece o si aparece una suite nueva sin registrar en
  `package.json`.
- `tests/clipmap.smoke.mjs` y `tests/clipeditor.smoke.mjs` — el mapa y el estado
  editable; el primero comprueba además que los 18 aliases producen poses
  reales con el rig del contrato.

Las comprobaciones visuales **no** están automatizadas: el shader sobre el GLB,
el zoom de la maqueta y el panel pintado requieren mirar el navegador.

## Los cuatro modos

Al arrancar, después de elegir peleadores, `ui/ModeSelect.js` ofrece:

| Modo | Qué es |
|---|---|
| `CLASICO` | Duelo en el dojo. |
| `DIORAMA` | Maqueta low-poly de Margarita: elige un hito y entra en su tatami. |
| `ROYALE` | Cuadro de hasta cuatro, relevos y botín; último en pie gana. |
| `CAMPAÑA` | El Cuarteto de Caribe: ciclos, bandos, secretos y misiones. |

`CLASICO` y `DIORAMA` son jugables de principio a fin. En `ROYALE` y `CAMPAÑA`
las reglas existen y están probadas, pero el motor solo cablea el KO → sesión →
HUD/guardado; el resto sigue siendo lógica sin entrada del jugador (ver abajo).

## Herramientas de animación

Dos teclas, dos preguntas distintas:

| Tecla | Herramienta | Para qué |
|---|---|---|
| `F2` | Inspector (`anim/Inspector.js`) | Mirar y ajustar la POSE de un instante: tablas IK, cadera, mano, alcance. |
| `F3` | Editor (`ui/AnimEditor.js`) | Ver el MAPA de las 18 animaciones y ajustarlas **una a una**. |

El editor muestra una fila por animación con su clip y una barra de tres fases
(`STARTUP` / `ACTIVE` / `RECOVERY`). Las fases son una partición editable de la
duración para recorrer la animación; **no** son el frame data del combate, que
sigue en `core/fsm/MoveTable.js`. Las filas cuyo clip no existe se marcan y se
pueden reasignar; `selectAnims` pide nombres de estado (`IDLE`, `LIGHT_1`…) y el
mapa los traduce al clip real (`idle`, `st_recto`…).

- **Ratón:** clic en una fila para seleccionarla, botones y deslizadores para
  duración, peso, clip, frase e instante; rueda sobre la lista para recorrerla;
  `EXPORTAR` deja el parche en `localStorage` y en la consola.
- **Teclado:** `↑`/`↓` (o `W`/`S`) cambian de animación, `←`/`→` mueven el
  cabezal, `Espacio` reproduce, `[`/`]` cambian de frase, `+`/`-` ajustan la
  duración, `Ctrl+Z`/`Ctrl+Y` deshacen, `Enter` exporta y `Esc` cierra.

El editor edita una copia y exporta solo lo cambiado: no muta las tablas
`Object.freeze` del motor. Mientras está abierto el combate se congela, como con
F2, y la vista previa usa primero el clip GLB grabado y cae a la pose procedural
si no existe.

## Estructura

```
src/
  core/       lógica pura, sin Babylon ni DOM
    fsm/        estados, transiciones, tabla de movimientos, frame data
    cine/       rig, IK de un hueso, poses y ventajas
    modes/      battle royale y sesión (KO → Cobre → ciclo)
    economy/    Cobre/Diamante, rentas e inactividad (adapter inyectado)
    narrative/  El Cuarteto de Caribe
    geo/        datos de la maqueta
    ground/     modelo posicional de suelo
  engine/     Engine.js (bucle y cableado) y systems/index.js (fachada)
  render/     mallas, cel-shading, diorama, maniquí de piezas, tela
  ui/         pantallas, grafiti, editor e inspector de animación, panel de sesión
tests/        suites .smoke.mjs (lógica) y .dom.mjs (DOM falso)
```

La fachada `src/engine/systems/index.js` reúne los exports y publica
`SYSTEM_STATUS` y `PENDING`: el mapa rápido de qué sistemas están cerrados.

## Estado y pendientes

La referencia completa y viva es **`TODOS.md`**. Resumen honesto:

- **Cerrado/con cableado:** frame data, estados, impactos, posturas, aire,
  locomoción, tela, cel-shading, diorama con zoom, menú de modos y panel de
  sesión.
- **Datos probados pero sin cablear al bucle:** botín/protección/vehículos y
  relevos del Royale, secretos y sidequests del Cuarteto, rentas e inactividad,
  modelo posicional de suelo, grafiti en la carga y `selectState` en la
  selección.
- **No implementado:** IK de dos esqueletos, fatiga de guardia/fracturas/TKO
  anatómico, Tai Sabaki, encadenado real de golpes, sentadilla+upkick, blitz,
  pasos fantasma, escena híbrida con sprites/partículas, Supabase y Google
  reales (sin credenciales).

El motor de animaciones y el editor se describen en la sección anterior. El
estado del repositorio se lleva con commits periódicos; `git log` es la fuente
de verdad de lo que ya quedó guardado.
