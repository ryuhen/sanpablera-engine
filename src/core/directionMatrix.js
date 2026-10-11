/**
 * ============================================================================
 * SANPABLERA ENGINE · core/directionMatrix.js
 * ----------------------------------------------------------------------------
 * LA MATRIZ DE GOLPES POR DIRECCION: que golpe sale al pulsar un boton
 * mirando hacia un lado.
 * ============================================================================
 *
 * QUE FALTA HOY Y QUE HACE ESTO
 * ----------------------------------------------------------------------------
 *   La FSM decide el golpe mirando `input.forward`, `input.back`, `input.down`
 *   e `input.up`. `left` y `right` NO APARECEN NI UNA VEZ en todo
 *   `Transitions.js`: hay cuatro direcciones, no ocho. Y las diagonales se
 *   detectan en el `InputMapper` (`dirEdge`, que usa el baile de posturas) pero
 *   nunca llegan a decidir un golpe.
 *
 *   El resultado es que el jugador tiene una cruceta de 8 direcciones y solo
 *   4 hacen algo distinto. Este modulo es la pieza que falta: una TABLA que
 *   dice, para cada postura y cada direccion, que golpe hay.
 *
 * POR QUE UNA TABLA Y NO 48 ESTADOS
 * ----------------------------------------------------------------------------
 *   `StateMachine.get move()` ya resuelve el golpe en runtime:
 *
 *       const stanceKey = this.api.stanceAttack ? this.api.stanceAttack(key) : null;
 *       return getMove(this.api.characterId, stanceKey || key) || null;
 *
 *   Ese gancho es el que usan hoy los ocho golpes de las posturas de boxeo para
 *   sustituir un golpe por otro SIN crear estados nuevos. La matriz entra por el
 *   mismo sitio, asi que 48 combinaciones cuestan UNA tabla, no 48 estados.
 *
 * POR QUE UNA BASE RELATIVA AL RIVAL Y NO A LA PANTALLA
 * ----------------------------------------------------------------------------
 *   "Lateral" depende de a quien estas mirando. El hook `stanceAttackKey` ya
 *   se llama con el estado del peleador, y lo natural es que la direccion se
 *   mida en la base `(side, fwd)` que el `InputMapper` ya calcula:
 *
 *       fwd  =  move . toOpp        -> positivo mira AL RIVAL
 *       side =  move . perpendicular-> positivo es la DERECHA del peleador
 *
 *   Es la MISMA base que usan `input.forward` e `input.back` hoy, asi que
 *   medir aqui y medir alla no pueden discrepar: las diagonales salen de los
 *   mismos numeros que los cardinales.
 *
 * CUAL ES CADA DIRECCION
 * ----------------------------------------------------------------------------
 *       FL          F          FR
 *         \         |         /
 *          L   N    |    R
 *          /         |         \
 *       BL          B          BR
 *
 *   `N` es el sticksuelto. No cuenta como una de las 8: es el caso por defecto
 *   y el que usa el jugador sin querer al pulsar el boton corriendo. Existe en
 *   la tabla para que la matriz sea TOTAL (toda combinacion resuelve a algo,
 *   nunca a `undefined`), no como direccion nueva.
 *
 * QUE NO HACE ESTE ARCHIVO
 * ----------------------------------------------------------------------------
 *   No toca la FSM, ni el `InputMapper`, ni define golpes. Solo LA MATRIZ y su
 *   resolucion. Quien la conecta es `FighterEntity.stanceAttackKey`, que ya
 *   existe: si la matriz da una clave y el peleador no la tiene en su moveset,
 *   `hasMove` devuelve falso y gana el golpe del estado. Es lo mismo que ya
 *   pasa con las posturas de boxeo, y es lo que permite llenar la matriz de
 *   golpe a golpe sin romper nada mientras se rellena.
 *
 * ES PURO: sin Babylon ni DOM. Se testea en Node (tests/direction.smoke.mjs).
 * ============================================================================
 */

/** Umbral para considerar que un eje esta pulsado. El mismo que el mapper. */
export const AXIS_EPS = 0.35;

/** Las 8 direcciones de la cruceta, mas el sticksuelto. */
export const DIRECTIONS = Object.freeze([
    'FL', 'F', 'FR',
    'L', 'N', 'R',
    'BL', 'B', 'BR'
]);

/** Las dos acciones de ataque. */
export const BUTTONS = Object.freeze(['PUNCH', 'KICK']);

/** Las tres posturas con golpes propios. */
export const STANCES = Object.freeze(['STAND', 'CROUCH', 'AIR']);

/**
 * Cuantiza el vector del stick a una de las 8 direcciones.
 *
 * @param {number} side  lateral (positivo = derecha del peleador)
 * @param {number} fwd   adelante (positivo = hacia el rival)
 * @param {number} [eps]
 * @returns {string} una de `DIRECTIONS`
 */
export function quantizeDirection(side, fwd, eps = AXIS_EPS) {
    const l = side < -eps;
    const r = side > eps;
    const f = fwd > eps;
    const b = fwd < -eps;
    if (f && l) return 'FL';
    if (f && r) return 'FR';
    if (b && l) return 'BL';
    if (b && r) return 'BR';
    if (f) return 'F';
    if (b) return 'B';
    if (l) return 'L';
    if (r) return 'R';
    return 'N';
}

// ===========================================================================
// LA MATRIZ
// ===========================================================================

/**
 * Golpes por postura y direccion. Llave de boton: 'PUNCH' (ataque1, J) o
 * 'KICK' (ataque2, K).
 *
 * POR QUE NOMBRES SISTEMATICOS Y NO SUGESTIVOS
 *   Con ocho direcciones por postura, los nombres libres ('gancho', 'codo',
 *   'recto'...) se acaban o se pisan entre si: dos direcciones distintas
 *   acababan llamandose igual. Con el patron `PUNO_<DIRECCION>` la tabla se
 *   lee sola, se puede comprobar que no faltan celdas y una direccion se
 *   renombra tocando un solo sitio.
 *
 *   Los cuatro cardinales que YA existen conservan su nombre (ATAQUE_LIGERO,
 *   GANCHO, GOLPE_CODO, PATADA_FRONTAL) para no tirar abajo los golpes que el
 *   combate ya produce y los tests ya comprueban.
 */
export const ATTACK_MATRIX = Object.freeze({
    // --- DE PIE ---------------------------------------------------------
    STAND: Object.freeze({
        N: Object.freeze({ PUNCH: 'ATAQUE_LIGERO', KICK: 'ATAQUE_PESADO' }),
        F: Object.freeze({ PUNCH: 'GANCHO', KICK: 'PATADA_FRONTAL' }),
        B: Object.freeze({ PUNCH: 'GOLPE_CODO', KICK: 'PATADA_ATRAS' }),
        L: Object.freeze({ PUNCH: 'PUNO_IZQUIERDO', KICK: 'PATADA_LADO_IZQ' }),
        R: Object.freeze({ PUNCH: 'PUNO_DERECHO', KICK: 'PATADA_LADO_DER' }),
        FL: Object.freeze({ PUNCH: 'PUNO_ADELANTE_IZQ', KICK: 'PATADA_ALTA_IZQ' }),
        FR: Object.freeze({ PUNCH: 'PUNO_ADELANTE_DER', KICK: 'PATADA_ALTA_DER' }),
        BL: Object.freeze({ PUNCH: 'PUNO_ATRAS_IZQ', KICK: 'PATADA_SPIN_IZQ' }),
        BR: Object.freeze({ PUNCH: 'PUNO_ATRAS_DER', KICK: 'PATADA_SPIN_DER' })
    }),

    // --- AGACHADO -------------------------------------------------------
    // Todo aqui es por lo bajo: es la lectura que hace la matrix de reacciones
    // (`HitReactions.HIT_REACTIONS`), donde la altura decide si el rival se
    // levanta antes de tiempo. Un agachado que golpea alto no esta agachado.
    CROUCH: Object.freeze({
        N: Object.freeze({ PUNCH: 'ATAQUE_AGACHADO', KICK: 'PATADA_BAJA' }),
        F: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ADELANTE', KICK: 'PATADA_AGACHADA' }),
        B: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ATRAS', KICK: 'PATADA_AGACHADA_ATRAS' }),
        L: Object.freeze({ PUNCH: 'PUNO_AGACHADO_IZQ', KICK: 'PATADA_BAJA_IZQ' }),
        R: Object.freeze({ PUNCH: 'PUNO_AGACHADO_DER', KICK: 'PATADA_BAJA_DER' }),
        FL: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ADELANTE_IZQ', KICK: 'PATADA_BAJA_ALTA_IZQ' }),
        FR: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ADELANTE_DER', KICK: 'PATADA_BAJA_ALTA_DER' }),
        BL: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ATRAS_IZQ', KICK: 'BARRIDO_IZQ' }),
        BR: Object.freeze({ PUNCH: 'PUNO_AGACHADO_ATRAS_DER', KICK: 'BARRIDO_DER' })
    }),

    // --- EN EL AIRE -----------------------------------------------------
    // El aire tiene una diferencia con los otros dos: no hay suelo al que
    // apoyarse, asi que `DIR` es lo que empuja al rival al caer. Los golpes
    // de aire son los unicos que pueden poner al otro de pie.
    AIR: Object.freeze({
        N: Object.freeze({ PUNCH: 'ATAQUE_AEREO', KICK: 'PATADA_AEREA' }),
        F: Object.freeze({ PUNCH: 'PUNO_AEREO_ADELANTE', KICK: 'PATADA_AEREA_ADELANTE' }),
        B: Object.freeze({ PUNCH: 'PUNO_AEREO_ATRAS', KICK: 'PATADA_AEREA_ATRAS' }),
        L: Object.freeze({ PUNCH: 'PUNO_AEREO_IZQ', KICK: 'PATADA_AEREA_IZQ' }),
        R: Object.freeze({ PUNCH: 'PUNO_AEREO_DER', KICK: 'PATADA_AEREA_DER' }),
        FL: Object.freeze({ PUNCH: 'PUNO_AEREO_ADELANTE_IZQ', KICK: 'PATADA_AEREA_ALTA_IZQ' }),
        FR: Object.freeze({ PUNCH: 'PUNO_AEREO_ADELANTE_DER', KICK: 'PATADA_AEREA_ALTA_DER' }),
        BL: Object.freeze({ PUNCH: 'PUNO_AEREO_ATRAS_IZQ', KICK: 'PATADA_AEREO_SPIN_IZQ' }),
        BR: Object.freeze({ PUNCH: 'PUNO_AEREO_ATRAS_DER', KICK: 'PATADA_AEREO_SPIN_DER' })
    })
});

/**
 * El golpe que sale de esta postura, direccion y boton.
 *
 * ES TOTAL A PROPOSITO
 *   Cualquier combinacion devuelve una clave de golpe: una postura
 *   desconocida, una direccion mal escrita o un boton raro caen en el golpe
 *   base del boton. La razon es que esta funcion se llama en el CAMINO DE UN
 *   GOLPE: si devolviera `null` por un dato raro, quien la llama tendria que
 *   defenderse, y un fallo ahi se ve como "el golpe no hace nada", que es el
 *   fallo mas dificil de depurar que tiene un motor de pelea.
 *
 * @param {string} stance  'STAND' | 'CROUCH' | 'AIR'
 * @param {string} dir     una de `DIRECTIONS`
 * @param {string} button  'PUNCH' | 'KICK'
 * @returns {string} clave de golpe
 */
export function resolveAttack(stance, dir, button) {
    const fila = ATTACK_MATRIX[stance] || ATTACK_MATRIX.STAND;
    const par = fila[dir] || fila.N;
    return par[button] || par.PUNCH;
}

/**
 * Las 54 combinaciones de la matriz (3 posturas x 9 direcciones x 2 botones).
 * Se usa para los tests y para herramientas de ajuste.
 *
 * @returns {Array<{stance, dir, button, move}>}
 */
export function allCombinations() {
    const out = [];
    for (const stance of STANCES) {
        for (const dir of DIRECTIONS) {
            for (const button of BUTTONS) {
                out.push({ stance, dir, button, move: resolveAttack(stance, dir, button) });
            }
        }
    }
    return out;
}

export default {
    AXIS_EPS, DIRECTIONS, BUTTONS, STANCES,
    quantizeDirection, resolveAttack, allCombinations,
    ATTACK_MATRIX
};