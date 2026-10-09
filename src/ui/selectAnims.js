/**
 * ============================================================================
 * SANPABLERA ENGINE · ui/selectAnims.js
 * ----------------------------------------------------------------------------
 * LAS ANIMACIONES DE LA VISTA PREVIA, y quien las tiene.
 *
 * QUE ES ESTO (Y QUE NO ES TODAVIA)
 * ----------------------------------------------------------------------------
 *   Es la LISTA de lo que puede verse en la vista previa de cada peleador, con
 *   el clip que se le pide al motor y el rollo que tiene. Todavia no ejecuta
 *   nada: solo decide QUE se ve. Quien lo ejecuta es la vista previa 3D
 *   (SelectScreen.js), que le pide el clip al motor segun este id.
 *
 *   Por que son datos y no clips de verdad: el motor genera poses
 *   procedurales (cine/Stances.js, fsm/states/AttackPoses.js) y todavia no
 *   tiene una biblioteca de clips grabados (esta en los pendientes de la
 *   bitacora). El `clip` de cada animacion dice QUE estado de la FSM se le
 *   pide, de modo que cuando existan los clips, esta tabla no cambia: solo se
 *   le anaden entradas.
 *
 * LAS ANIMACIONES SON DISTINTAS POR PELEADOR
 * ----------------------------------------------------------------------------
 *   Cada arquetipo se mueve distinto, asi que cada uno tiene su repertorio:
 *   el boxeador hace combinaciones cortas y la guardia alta; el marcial hace
 *   patadas y el jab con mas alcance; la calle improvisa. Un peleador sin
 *   animaciones propias heredaria las de Pedro, que es exactamente lo que no
 *   queremos: la pantalla de seleccion es donde el jugador se decide por como
 *   se mueve alguien, y si todos se mueven igual no sirve para nada.
 *
 *   Cada animacion lleva `clip` (que estado se pide), `dur` (cuanto dura el
 *   bucle, para que el motor sepa cuando repetir) y `pes` (cuanto pesa: el
 *   `defaultAnimationFor` usa la de mas peso como la animacion de reposo).
 *
 * COMO SE USA EL BOTON DE GUARDIA
 * ----------------------------------------------------------------------------
 *   L cicla por `animationsOf(fighterId)`, o sea, SOLO por las suyas. Si un
 *   peleador tiene tres y otro tiene cinco, cada uno recorre los suyos y no se
 *   cuela el clip de otro.
 * ============================================================================
 */

/**
 * Las animaciones de la vista previa.
 *
 *   id      : identificador unico.
 *   nombre  : como sale escrito en la pantalla.
 *   tipo    : que es (movimiento, tecnica, provocacion, guardia).
 *   clip    : el estado/clip que se le pide al motor.
 *   dur     : duracion del bucle en segundos (0 = una sola vez, sin repetir).
 *   pes     : peso relativo; la de mas peso es la de reposo.
 */
export const ANIMATIONS = Object.freeze({
    // --- Las que tienen TODOS -------------------------------------------
    // (La `guardia` es el estado de reposo de la vista previa.)
    guardia: Object.freeze({
        id: 'guardia', nombre: 'Guardia', tipo: 'guardia',
        clip: 'IDLE', dur: 0, pes: 10
    }),
    taunt: Object.freeze({
        id: 'taunt', nombre: 'Provocación', tipo: 'provocacion',
        clip: 'TAUNT', dur: 2.4, pes: 6
    }),
    caminar: Object.freeze({
        id: 'caminar', nombre: 'Caminar', tipo: 'movimiento',
        clip: 'WALK', dur: 1.1, pes: 5
    }),

    // --- YUGO: el boxeador ------------------------------------------------
    jab: Object.freeze({
        id: 'jab', nombre: 'Jab', tipo: 'tecnica',
        clip: 'LIGHT_1', dur: 0.7, pes: 4
    }),
    gancho: Object.freeze({
        id: 'gancho', nombre: 'Gancho', tipo: 'tecnica',
        clip: 'HEAVY_2', dur: 1.0, pes: 4
    }),
    uppercut: Object.freeze({
        id: 'uppercut', nombre: 'Uppercut', tipo: 'tecnica',
        clip: 'UPPERCUT', dur: 1.2, pes: 3
    }),
    esquiva: Object.freeze({
        id: 'esquiva', nombre: 'Esquiva', tipo: 'movimiento',
        clip: 'DASH_SIDE', dur: 0.6, pes: 2
    }),

    // --- MUSASHI: el vagabundo marcial ------------------------------------
    patada: Object.freeze({
        id: 'patada', nombre: 'Patada', tipo: 'tecnica',
        clip: 'KICK_HIGH', dur: 1.0, pes: 5
    }),
    patadaBaja: Object.freeze({
        id: 'patadaBaja', nombre: 'Patada baja', tipo: 'tecnica',
        clip: 'KICK_LOW', dur: 0.9, pes: 3
    }),
    sumision: Object.freeze({
        id: 'sumision', nombre: 'Sumisión', tipo: 'tecnica',
        clip: 'SUBMISSION', dur: 1.6, pes: 2
    }),
    salto: Object.freeze({
        id: 'salto', nombre: 'Salto', tipo: 'movimiento',
        clip: 'JUMP', dur: 1.0, pes: 3
    }),

    // --- MONTE: el salvaje / callejero -------------------------------------
    acrobacia: Object.freeze({
        id: 'acrobacia', nombre: 'Acrobacia', tipo: 'movimiento',
        clip: 'QUADRUPED', dur: 1.3, pes: 5
    }),
    deslizamiento: Object.freeze({
        id: 'deslizamiento', nombre: 'Deslizamiento', tipo: 'movimiento',
        clip: 'SLIDE', dur: 1.1, pes: 4
    }),
    revision: Object.freeze({
        id: 'revision', nombre: 'Revisión', tipo: 'tecnica',
        clip: 'REVERSE_KICK', dur: 1.2, pes: 4
    }),
    bottle: Object.freeze({
        id: 'bottle', nombre: 'Botellazo', tipo: 'tecnica',
        clip: 'BOTTLE', dur: 1.4, pes: 2
    }),

    // --- Extras de los peleadores con moveset propio -----------------------
    // (ver fsm/states/Movesets.js)
    proyectacion: Object.freeze({
        id: 'proyectacion', nombre: 'Proyección', tipo: 'tecnica',
        clip: 'PROJECTION', dur: 1.3, pes: 4
    }),
    llave: Object.freeze({
        id: 'llave', nombre: 'Llave de brazo', tipo: 'tecnica',
        clip: 'ARM_LOCK', dur: 1.5, pes: 3
    }),
    llave_patas: Object.freeze({
        id: 'llave_patas', nombre: 'Llave de piernas', tipo: 'tecnica',
        clip: 'LEG_LOCK', dur: 1.5, pes: 3
    })
});

/**
 * Quien tiene cada animacion.
 *
 * Se declara POR PELEADOR y no por arquetipo a proposito: un peleador puede
 * tener una animacion que otro del mismo arquetipo no (Pedro hace Uppercut
 * porque es boxeador, Juan tambien MUSASHI pero no). El arquetipo es el punto
 * de partida, no la regla.
 *
 * La `guardia`, la `taunt` y el `caminar` las tienen todos: se anaden sola si
 * un peleador no las declara (ver `animationsOf`).
 */
export const ANIM_BY_FIGHTER = Object.freeze({
    // Pedro Pérez · YUGO · boxeador. Es el peleador con mas moveset escrito
    // capa por capa (ver Movesets.js), asi que es el que mas animaciones tiene.
    PEDRO: ['jab', 'gancho', 'uppercut', 'esquiva', 'caminar', 'taunt', 'bottle', 'guardia'],
    // Juan García · MUSASHI · kenjutsu improvisado
    JUAN: ['jab', 'patada', 'proyectacion', 'salto', 'caminar', 'taunt', 'guardia'],
    // José López · MONTE · capoeira
    JOSE: ['jab', 'patadaBaja', 'acrobacia', 'deslizamiento', 'caminar', 'taunt', 'guardia'],
    // María González · YUGO · muay thai
    MARIA: ['jab', 'patada', 'revision', 'gancho', 'caminar', 'taunt', 'guardia'],
    // John Doe · MUSASHI · kali
    JOHN: ['llave', 'patadaBaja', 'patada', 'sumision', 'caminar', 'taunt', 'guardia'],
    // Jane Doe · MUSASHI · lanza y vara
    JANE: ['patada', 'proyectacion', 'llave_patas', 'salto', 'caminar', 'taunt', 'guardia'],
    // Carlos Ruiz · MUSASHI · BJJ y suelo
    CARLOS: ['llave_patas', 'sumision', 'llave', 'patadaBaja', 'caminar', 'taunt', 'guardia'],
    // Ana Torres · MONTE · calle e improvisación
    ANA: ['deslizamiento', 'acrobacia', 'revision', 'bottle', 'caminar', 'taunt', 'guardia'],

    // El peleador del jugador (core/CustomFighter.js) no tiene moveset propio
    // todavia: hereda el de Pedro, asi que ve lo que ve Pedro.
    CUSTOM: ['jab', 'gancho', 'uppercut', 'patada', 'caminar', 'taunt', 'guardia']
});

/**
 * Las animaciones de un peleador, SIEMPRE con guardia/taunt/caminar.
 *
 * @param {string} fighterId
 * @returns {string[]} ids, sin repetir, en un orden estable
 */
export function animationsOf(fighterId) {
    const base = ['guardia', 'taunt', 'caminar'];
    const suyas = ANIM_BY_FIGHTER[fighterId] || [];
    // Se quitan repetidos: si un peleador declara la guardia, no aparece dos
    // veces en el ciclo del boton de guardia.
    const out = [];
    for (const id of [...suyas, ...base]) {
        if (ANIMATIONS[id] && !out.includes(id)) out.push(id);
    }
    return out;
}

/**
 * La animacion de REPOSO de un peleador: la de mas peso entre las suyas.
 *
 * Si un peleador no declara ninguna, cae en la guardia, que siempre existe.
 */
export function defaultAnimationFor(fighterId) {
    const lista = animationsOf(fighterId);
    if (!lista.length) return 'guardia';
    let mejor = lista[0];
    for (const id of lista) {
        if ((ANIMATIONS[id].pes || 0) > (ANIMATIONS[mejor].pes || 0)) mejor = id;
    }
    return mejor;
}

/**
 * El clip que se le pide al motor para una animacion.
 * @returns {string} el nombre del clip/estado
 */
export function clipOf(animId) {
    const a = ANIMATIONS[animId];
    return a ? a.clip : null;
}

/**
 * Todas las animaciones, para la galería.
 * @returns {Array<object>}
 */
export function allAnimations() {
    return Object.values(ANIMATIONS);
}

/**
 * Comprueba que la tabla esta sana. Se usa en los tests.
 * @returns {string[]} problemas
 */
export function validate() {
    const problemas = [];
    for (const [id, a] of Object.entries(ANIMATIONS)) {
        if (!a.nombre) problemas.push(`${id}: sin nombre`);
        if (!a.clip) problemas.push(`${id}: sin clip`);
        if (!['movimiento', 'tecnica', 'provocacion', 'guardia'].includes(a.tipo)) {
            problemas.push(`${id}: tipo desconocido "${a.tipo}"`);
        }
        if (typeof a.dur !== 'number' || a.dur < 0) problemas.push(`${id}: duracion invalida`);
        if (typeof a.pes !== 'number' || a.pes < 0) problemas.push(`${id}: peso invalido`);
    }
    for (const [fid, lista] of Object.entries(ANIM_BY_FIGHTER)) {
        if (!Array.isArray(lista) || !lista.length) {
            problemas.push(`${fid}: sin animaciones`);
            continue;
        }
        for (const id of lista) {
            if (!ANIMATIONS[id]) problemas.push(`${fid}: pide la animacion "${id}", que no existe`);
        }
        const tres = ['guardia', 'taunt', 'caminar'];
        for (const t of tres) {
            if (!lista.includes(t)) {
                // No es error: `animationsOf` las anade sola. Se avisa del
                // hecho, para que se sepa que el peleador no las declaro.
                problemas.push(`${fid}: "${t}" no la declara (se pondra por defecto)`);
            }
        }
    }
    return problemas;
}

export default {
    ANIMATIONS, ANIM_BY_FIGHTER,
    animationsOf, defaultAnimationFor, clipOf, allAnimations, validate
};
