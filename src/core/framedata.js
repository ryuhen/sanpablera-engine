/**
 * ============================================================================
 * SANPABLERA ENGINE · core/framedata.js
 * ----------------------------------------------------------------------------
 * MOTOR DE CALCULO DE CUADROS: la ventaja de cada golpe.
 *
 * QUE HAY AQUI Y POR QUE FALTABA
 * ----------------------------------------------------------------------------
 *   Los frames YA existen en `MoveTable.js` (startup, active, recovery) y el
 *   `hitstun` / `blockstun` tambien. Lo que no existia era la cuenta: los
 *   numeros con los que se COMPARA un golpe con otro.
 *
 *   Sin ellos, "¿este golpe es mejor que aquel?" se respondia a ojo, leyendo
 *   las tablas. Y es exactamente la clase de pregunta que se equivoca: un
 *   golpe con 4 frames de startup y 7 de recovery parece rapido, pero si su
 *   hitstun es de 3 frames, el rival se levanta ANTES de que acabes y te
 *   contraataca gratis. El numero que decide eso no se ve en los campos.
 *
 * QUE SE CALCULA AQUI
 * ----------------------------------------------------------------------------
 *   VENTAJA AL IMPACTAR   (hit advantage)
 *       Quien conecta el golpe, Cuantos frames le sobran al rival aturdido
 *       para levantarse antes de que el atacante termine su recuperacion.
 *       Positivo = el atacante puede seguir. Negativo = el rival responde.
 *
 *   VENTAJA AL BLOQUEAR   (block advantage)
 *       Lo mismo, pero el rival queda en blockstun. Suele ser mas negativa que
 *       la de impacto: bloquear es peor que ser golpeado.
 *
 *   Las dos se miden en frames y a 60 Hz, que es como las cuenta cualquier
 *   juego de pelea. La formula es la de siempre:
 *
 *       hitAdvantage   = hitstun  - recovery
 *       blockAdvantage = blockstun - recovery
 *
 *   Ojo al signo: `recovery` va con signo menos porque es TIEMPO QUE PASA en
 *   disadvantage. Si el golpe dura 31 frames y el rival esta aturdido 20, al
 *   atacante le sobran -11: le pega y come.
 *
 * ES PURO: sin Babylon ni DOM. Se testea en Node (tests/framedata.smoke.mjs).
 * ============================================================================
 */

/** Frames por segundo con los que se mide el frame data. */
export const FPS = 60;

/** Convierte segundos a frames, redondeando al frame entero. */
export function secondsToFrames(sec, fps = FPS) {
    return Math.round(sec * fps);
}

/** Convierte frames a segundos. */
export function framesToSeconds(frames, fps = FPS) {
    return frames / fps;
}

// ===========================================================================
// 1. LAS CUENTAS
// ===========================================================================

/**
 * Ventaja al IMPACTAR, la CUENTA PURA: hitstun - recovery.
 *
 * OJO: aqui NO entra el tiempo en el suelo de un derribo. Un golpe que
 * derriba tiene DOS numeros distintos: este (el impacto inmediato) y
 * `fullHitAdvantage`, que suma los frames que el rival esta tirado. Se
 * separan a proposito: si los dos dieran lo mismo, este seria inutil.
 *
 * @param {object} move  un golpe de MoveTable (o uno con los mismos campos)
 * @returns {number} frames. Positivo = el atacante puede seguir.
 */
export function hitAdvantage(move) {
    if (!move) return 0;
    return (move.hitstun || 0) - (move.recovery || 0);
}

/**
 * Ventaja al BLOQUEAR: lo mismo con el blockstun.
 *
 * @returns {number} frames. Negativo significa que bloquear es malo.
 */
export function blockAdvantage(move) {
    if (!move) return 0;
    return (move.blockstun || 0) - (move.recovery || 0);
}

/**
 * Cuantos frames de aturdimiento da un derribo.
 *
    // Diseno, no fisica: son los frames que el rival esta DOWNED antes de levantarse.
 * mas en levantarse. Por eso un golpe que derriba tiene ventaja aunque su
 * recovery sea larguisimo. Sin esto, el golpe mas lento del juego pareceria el
 * mejor, y es justo al reves.
 */
export function knockdownStun(move) {
    if (!move || !move.knockdown || move.knockdown === 'NONE') return 0;
    // Valores de diseno, no fisicas: los frames que el rival esta DOWNED
    // Diseno, no fisica: son los frames que el rival esta DOWNED antes de levantarse.
    if (move.knockdown === 'LIGHT') return 24;
    if (move.knockdown === 'ALWAYS') return 30;   // derribo garantizado
    return 0;
}

/** Ventaja al impacto de un golpe DERRIBADOR (incluye el tiempo en el suelo). */
export function fullHitAdvantage(move) {
    if (!move) return 0;
    return (knockdownStun(move) || move.hitstun || 0) - (move.recovery || 0);
}

// ===========================================================================
// 2. ETIQUETAS Y LECTURA RAPIDA
// ===========================================================================

/**
 * Como se lee una ventaja, para menus y para la consola.
 *
 *   >= +6  "muy ventajoso"   (el rival esta muerto, conecta en cadena)
 *   >=  0  "a favor"         (se puede seguir)
 *   >= -4  "a contralaura"   (hay que tener cuidado)
 *   >= -10 "muy malo"        (no se debe golpear)
 *   <  -10 "imposible"       (te mata siempre)
 */
export const ADVANTAGE_BANDS = Object.freeze([
    { min: 6, id: 'MUY_VENTAJOSO', label: 'muy ventajoso' },
    { min: 0, id: 'A_FAVOR', label: 'a favor' },
    { min: -4, id: 'A_CONTRALAURA', label: 'a contralaura' },
    { min: -10, id: 'MUY_MALO', label: 'muy malo' },
    { min: -Infinity, id: 'IMPOSIBLE', label: 'imposible' }
]);

export function advantageBand(frames) {
    return ADVANTAGE_BANDS.find((b) => frames >= b.min);
}

// ===========================================================================
// 3. INDICE DE GOLPES
//
// El motor recorre la tabla ENTERA cada vez que necesita un golpe. Con el
// moveset de Pedro, la tabla por personaje, y ahora los ataques corriendo, son
// cientos de golpes: buscar por nombre en bucle cada frame es tirar CPU a la
// basura. El indice lo deja en O(1).
// ===========================================================================

/**
 * Construye el indice de golpes por nombre, para consulta rapida.
 *
 * @param {object} movesSet  un set de golpes (el que devuelve getMoves)
 * @returns {object} { byKey, all, byState }
 */
export function buildMoveIndex(movesSet) {
    const byKey = Object.create(null);
    const byState = Object.create(null);
    const all = [];

    for (const key of Object.keys(movesSet || {})) {
        const m = movesSet[key];
        if (!m) continue;
        byKey[key] = m;
        all.push(m);
        if (m.state != null) {
            (byState[m.state] || (byState[m.state] = [])).push(m);
        }
    }

    return Object.freeze({
        byKey,
        byState,
        all: Object.freeze(all),
        /** O(1): un golpe por su nombre. */
        get: (key) => byKey[key] || null,
        /** Todos los golpes que salen de un estado. */
        fromState: (state) => byState[state] || Object.freeze([]),
        size: all.length
    });
}

/**
 * Ficha completa de un golpe: los frames y las dos ventajas, ya calculadas.
 * Es lo que se enseña en un menu de entrenamiento o se imprime en consola.
 *
 * @returns {object} o null si el golpe no existe
 */
export function frameSheet(move) {
    if (!move) return null;
    const ha = fullHitAdvantage(move);
    const ba = blockAdvantage(move);
    return Object.freeze({
        key: move.key,
        label: move.label,
        // Los tres bloques de frames, que es como lo cuenta cualquier juego.
        startup: move.startup,
        active: move.active,
        recovery: move.recovery,
        total: move.duration != null
            ? move.duration
            : (move.startup || 0) + (move.active || 0) + (move.recovery || 0),
        // Ventajas, ya en frames y en segundos.
        hitAdvantage: ha,
        blockAdvantage: ba,
        hitAdvantageSec: +framesToSeconds(ha).toFixed(4),
        blockAdvantageSec: +framesToSeconds(ba).toFixed(4),
        // Etiquetas, para no tener que mirar el numero.
        hitBand: advantageBand(ha).id,
        blockBand: advantageBand(ba).id,
        // Datos de golpe que explican la ventaja.
        hitstun: move.hitstun,
        blockstun: move.blockstun,
        knockdown: move.knockdown || 'NONE',
        knockdownStun: knockdownStun(move),
        type: move.type,
        height: move.height,
        damage: move.damage
    });
}

/**
 * Comparador de golpes por frame data, para ordenar un moveset de "mejor a
 * peor". Ordena por la ventaja MINIMA entre impacto y bloqueo: un golpe que
 * conecta bien pero se come al bloquear no es un buen golpe.
 */
export function compareFrameData(a, b) {
    const va = Math.min(fullHitAdvantage(a), blockAdvantage(a));
    const vb = Math.min(fullHitAdvantage(b), blockAdvantage(b));
    if (vb !== va) return vb - va;         // mejor primero
    // A igualdad de ventaja, el mas corto es mas seguro: acaba antes y deja
    // menos frames en los que te pueden interrumpir.
    return (a.duration || 0) - (b.duration || 0);
}

export default {
    FPS, secondsToFrames, framesToSeconds,
    hitAdvantage, blockAdvantage, knockdownStun, fullHitAdvantage,
    ADVANTAGE_BANDS, advantageBand,
    buildMoveIndex, frameSheet, compareFrameData
};