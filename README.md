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

- `tests/sessionpanel.dom.mjs` — el panel de sesión con un DOM de mentira.
- `tests/wiring.smoke.mjs` — lee `src/core/Engine.js` como texto y falla si un
  punto de conexión desaparece o si aparece una suite nueva sin registrar en
  `package.json`.

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
  ui/         pantallas, grafiti, inspector y panel de sesión
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

Todo lo anterior está sin commitear; este repositorio es un espacio de trabajo.
