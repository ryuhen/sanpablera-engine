/**
 * ============================================================================
 * SANPABLERA ENGINE · core/boxing.js
 * ----------------------------------------------------------------------------
 * EL SISTEMA DE ESTANCIAS DE BOXEO — el arquetipo YUGO
 * (core/archetypes.js) escrito como MODULO PURO de datos.
 *
 * En vez de una transformacion animal, el boxeador tiene un
 * SISTEMA TECNICO DE POSTURAS (stances) rotativas y
 * dinamicas, y cada postura tiene SU PROPIO MOVESET, accesible
 * en cualquier fotograma en que este activa.
 *
 *   LAS TRES POSTURAS BASE (rotacion con el boton ACCION)
 *     SHELL  · Peek-a-Boo / Shell: postura compacta que
 *             protege rostro y torso alto; absorbe castigo y
 *             contraataca en corta.
 *     LEAD   · Puño al Frente: postura estirada y adelantada,
 *             velocidad de jabeo y control del espacio frontal.
 *     RELAX  · Postura Descansada: postura baja con un puño a
 *             la altura de la rodilla; altera el perfil del
 *             cuerpo y habilita entradas angulares.
 *
 *   LAS TRES POSTURAS DE COMANDO (inputs especiales)
 *     PRESS  · Abajo+Adelante+Accion: postura ofensiva para
 *             romper guardias y disparar rectos y ganchos.
 *     ABSORB · Guardia+Accion: absorbe uno o dos impactos
 *             directos con un brazo mientras la otra mano
 *             castiga con jabs o patadas bajas de respuesta.
 *     CATCH  · Abajo+Atras+Guardia+Accion: atrapa patadas
 *             bajas levantando pierna o torso; desde el
 *             abrazo, rafaga a las costillas y remate con
 *             proyeccion o derribo.
 *
 *   EL "BAILE DE POSICIONES" (Flashing Footwork)
 *     Accion + tilt rapido a una direccional = transicion
 *     corta que pasa por DOS posturas; encadenar otra
 *     direccional antes de que acabe = otras dos. Se cancela
 *     al instante con el boton de GUARDIA.
 *
 *   MANTENIMIENTO: accion + direccion MANTENIDA adopta la
 *   postura y la DIRIGE hacia ese vector espacial.
 *
 *   TARGET ACTION: accion justo despues de que conecte un
 *   golpe = fijacion; mantenida, encadena ataques logicos y
 *   consecutivos dirigidos al punto de impacto anterior.
 *
 * TODO AQUI ES DATO, no codigo de combate: el motor
 * (entities/FighterEntity.js) y el engine (Engine.js) leen
 * estas tablas. Programar una postura nueva es anadir una
 * entrada, no tocar la maquina.
 * ============================================================================
 */
import SPF from './fsm/Constants.js';

const { Intent } = SPF;

// ===========================================================================
// LAS POSTURAS
// ===========================================================================

/**
 * Cada postura declara su guarda, su silueta (para el rig) y
 * SU MOVESET EXCLUSIVO: que golpe sustituye a cada boton de
 * ataque mientras la postura esta activa.
 */
export const STANCES = Object.freeze({

    // --- LAS TRES BASE (entran en la rotacion) ------------------------
    SHELL: Object.freeze({
        id: 'SHELL',
        label: 'Peek-a-Boo / Shell',
        base: true,
        guard: 'ALTA',              // protege rostro y torso alto
        silhouette: Object.freeze({  // lo que ve el rig
            spread: 0.34, lead: 0.05, lean: 7, guard: 1.20, crouch: 0.115
        }),
        arms: 'COMPACT',             // codos pegados, rostro tapado
        handY: 1.32,
        note: 'Postura defensiva compacta: absorbe castigo y contraataca en cortas distancias.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'GOLPE_CORTO',
            [Intent.ATAQUE_PESADO]: 'UPPERCUT',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    }),

    LEAD: Object.freeze({
        id: 'LEAD',
        label: 'Puño al Frente',
        base: true,
        guard: 'MEDIA',
        silhouette: Object.freeze({
            spread: 0.48, lead: 0.26, lean: 2, guard: 0.60, crouch: 0.045
        }),
        arms: 'EXTENDED',            // mano adelantada, cuerpo estirado
        handY: 1.24,
        note: 'Postura estirada y adelantada: velocidad de jabeo y control del espacio frontal.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'JAB_LARGO',
            [Intent.ATAQUE_PESADO]: 'CRUZADO',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    }),

    RELAX: Object.freeze({
        id: 'RELAX',
        label: 'Postura Descansada',
        base: true,
        guard: 'BAJA',               // mano baja: perfil UNDER, entrada angular
        silhouette: Object.freeze({
            spread: 0.52, lead: 0.10, lean: 6, guard: 0.25, crouch: 0.185
        }),
        arms: 'DROPPED',             // un puño a la altura de la rodilla
        handY: 0.52,
        note: 'Postura baja con un puño a la rodilla: altera el perfil del cuerpo y habilita entradas angulares.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'GANCHO',
            [Intent.ATAQUE_PESADO]: 'PATADA_BAJA',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    }),

    // --- LAS TRES DE COMANDO (inputs especiales) -----------------------
    PRESS: Object.freeze({
        id: 'PRESS',
        label: 'Presión Frontal',
        base: false,                  // no entra en la rotacion
        command: 'DOWN_FORWARD_ACTION',
        guard: 'MEDIA',
        silhouette: Object.freeze({
            spread: 0.42, lead: 0.30, lean: 9, guard: 0.75, crouch: 0.095
        }),
        arms: 'ADVANCED',             // manos en punta, cuerpo encima del rival
        handY: 1.30,
        pressure: true,               // rompe guardias
        note: 'Postura ofensiva para romper guardias: rectos y ganchos encadenados.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'RECTO',
            [Intent.ATAQUE_PESADO]: 'GANCHO',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    }),

    ABSORB: Object.freeze({
        id: 'ABSORB',
        label: 'Absorción y Contraataque',
        base: false,
        command: 'BLOCK_ACTION',
        guard: 'ALTA',
        silhouette: Object.freeze({
            spread: 0.38, lead: 0.08, lean: 4, guard: 1.10, crouch: 0.100
        }),
        arms: 'COVER_COUNTER',        // un brazo cubre, el otro castiga
        handY: 1.26,
        absorb: 2,                    // absorbe hasta DOS impactos directos
        note: 'Absorbe uno o dos impactos con un brazo mientras la otra mano responde con jabs o patadas bajas.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'GOLPE_CORTO',
            [Intent.ATAQUE_PESADO]: 'PATADA_BAJA',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    }),

    CATCH: Object.freeze({
        id: 'CATCH',
        label: 'Atrapamiento de Patadas Bajas',
        base: false,
        command: 'DOWN_BACK_BLOCK_ACTION',
        guard: 'BAJA',
        silhouette: Object.freeze({
            spread: 0.44, lead: 0.06, lean: 12, guard: 0.40, crouch: 0.240
        }),
        arms: 'TRAP',                 // pierna o torso levantado para atrapar
        handY: 0.78,
        catchLow: true,               // atrapa patadas del rival
        clinch: true,                 // desde aqui, el abrazo tactico
        note: 'Atrapa patadas bajas levantando la pierna o el torso; desde el abrazo, rafaga a las costillas y remate con proyeccion.',
        moves: Object.freeze({
            [Intent.ATAQUE_LIGERO]: 'COSTILLAZO',
            [Intent.ATAQUE_PESADO]: 'PROYECCION',
            [Intent.ATAQUE_ESPECIAL]: 'ATAQUE_ESPECIAL'
        })
    })
});

/** El abanico de rotacion: el orden de la rotacion simple. */
export const STANCE_CYCLE = Object.freeze(['SHELL', 'LEAD', 'RELAX']);

/** Las posturas de comando (no entran en la rotacion). */
export const COMMAND_STANCES = Object.freeze(['PRESS', 'ABSORB', 'CATCH']);

/** Todas las posturas, en el orden del abanico + las de comando. */
export const ALL_STANCES = Object.freeze([
    ...STANCE_CYCLE, ...COMMAND_STANCES
]);

/**
 * Rotacion simple (accion) e inversion (accion + atras).
 * @param {string} stanceId  postura actual
 * @param {boolean} inverse  true = invertir el ciclo
 * @returns {string} la siguiente postura del abanico
 */
export function nextStance(stanceId, inverse) {
    const i = STANCE_CYCLE.indexOf(stanceId);
    const n = STANCE_CYCLE.length;
    // Una postura de comando no esta en el abanico: se entra al
    // primer elemento del ciclo (volver a la guardia base).
    if (i === -1) return inverse ? STANCE_CYCLE[n - 1] : STANCE_CYCLE[0];
    return STANCE_CYCLE[(i + (inverse ? n - 1 : 1)) % n];
}

/** Golpe que hace la postura `stanceId` con el boton `intent` (o null). */
export function stanceMove(stanceId, intent) {
    const s = STANCES[stanceId];
    if (!s) return null;
    return s.moves[intent] || null;
}

// ===========================================================================
// EL BAILE DE POSICIONES (Flashing Footwork / Swell Dance)
// ===========================================================================

/** Duracion de una transicion de baile (s): pasa por DOS posturas. */
export const DANCE_DURATION = 0.22;

/** Ventana para encadenar otro baile antes de que acabe el actual (s). */
export const DANCE_CHAIN_WINDOW = 0.34;

/**
 * Cada direccion del tilt marca la postura de ENTRADA del baile;
 * el baile recorre entrada -> siguiente del ciclo. Asi la
 * direccion elegida decide el PAR de posturas destino.
 */
export const DANCE_START = Object.freeze({
    UP: 'LEAD', UP_LEFT: 'LEAD', UP_RIGHT: 'LEAD',
    DOWN: 'RELAX', DOWN_LEFT: 'RELAX', DOWN_RIGHT: 'RELAX',
    LEFT: 'SHELL', RIGHT: 'SHELL'
});

/** El par de posturas que recorre un baile en la direccion `dir`. */
export function dancePair(dir) {
    const start = DANCE_START[dir] || 'SHELL';
    return [start, nextStance(start, false)];
}

// ===========================================================================
// TARGET ACTION
// ===========================================================================

/** Ventana post-golpe para pedir la fijacion (s). */
export const TARGET_WINDOW = 0.45;

/** Cadencia del encadenado automatico con ACCION mantenida (s). */
export const TARGET_CHAIN_STEP = 0.30;

/** Cuanto hay que mantener ACCION para pasar de fijacion a encadenado (s). */
export const TARGET_HOLD = 0.32;

/** El punto de impacto que persigo la fijacion (de donde sale el rayo). */
export const TARGET_RAY_HIT = Object.freeze({ x: 0.0, y: 1.15, z: 0.9 });

// ===========================================================================
// POSTURAS DE COMANDO: que input pide cada una
// ===========================================================================

/**
 * Que postura de comando pide este input (o null si no hay ninguna).
 * El orden es de especificidad: la mas restrictiva gana.
 *
 *   CATCH  <- abajo + atras + guardia + accion
 *   ABSORB <- guardia + accion
 *   PRESS  <- abajo + adelante + accion
 *
 * @param {object} input  snapshot del InputMapper (con held.GUARDIA y flags)
 * @param {boolean} actionFresh  la pulsacion de ACCION es reciente
 */
export function commandStance(input, actionFresh) {
    if (!actionFresh) return null;
    const guard = !!(input.held && input.held[Intent.GUARDIA]);
    if (input.down && input.back && guard) return 'CATCH';
    if (guard) return 'ABSORB';
    if (input.down && input.forward) return 'PRESS';
    return null;
}

/** Cuantos impactos directos absorbe la postura (0 si ninguna). */
export function stanceAbsorb(stanceId) {
    const s = STANCES[stanceId];
    return s && s.absorb ? s.absorb : 0;
}

/** ¿La postura atrapa patadas bajas? */
export function catchesLowKicks(stanceId) {
    const s = STANCES[stanceId];
    return !!(s && s.catchLow);
}

export default {
    STANCES, STANCE_CYCLE, COMMAND_STANCES, ALL_STANCES,
    nextStance, stanceMove, stanceAbsorb, catchesLowKicks, commandStance,
    DANCE_DURATION, DANCE_CHAIN_WINDOW, DANCE_START, dancePair,
    TARGET_WINDOW, TARGET_CHAIN_STEP, TARGET_HOLD, TARGET_RAY_HIT
};