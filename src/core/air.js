/**
 * ============================================================================
 * SANPABLERA ENGINE · core/air.js
 * ----------------------------------------------------------------------------
 * EL AIRE: saltos, tipos de salto y las tres familias de ataque aereo.
 *
 * QUE HAY AQUI Y POR QUE ESTA SEPARADO
 * ----------------------------------------------------------------------------
 *   El motor tiene saltos (SALTO_NORMAL y SALTO_CORTO) y una ventana de doble
 *   arriba para el ataque aereo. Lo que NO tiene son los tipos de salto que un
 *   juego de pelea necesita, ni la distincion entre un ataque que exige haber
 *   saltado y uno que sube por si mismo.
 *
 *   Esa distincion importa MUCHO y es la que este archivo fija. Hay tres
 *   familias y no se mezclan:
 *
 *     AEREO ..... el personaje YA esta en el aire y golpea alli. Requiere haber
 *                 saltado. Es el unico que puede fallar por timing de salto.
 *
 *     ASCENDENTE . desde el suelo, el golpe SUBE y lleva al personaje al aire
 *                 dentro del propio movimiento. No hay salto previo: es un solo
 *                 comando. (El "shoryuken" clasico, el DD de KOF, un uppercut.)
 *                 Ventaja: es imparable si no se bloquea, y por eso es lento.
 *
 *     DESCENDENTE . desde el suelo, el golpe sube y CAE sobre el rival, sin
 *                 control en el aire. (El dive kick, el jumping CD.) Es rapido,
 *                 pero deja al personaje en el suelo al final: hay castigo.
 *
 *   Un personaje con ataque aereo NO tiene por que poder saltar: puede tener
 *   solo ascendentes, solo descendentes, o los tres. Eso es la tabla.
 *
 * ES PURO: sin Babylon ni DOM, se testea en Node (tests/air.smoke.mjs).
 * ============================================================================
 */

// ===========================================================================
// 1. SALTOS
// ===========================================================================

export const JUMP = Object.freeze({
    /** Salto normal: el de siempre, el que da altura y control. */
    NORMAL: 'NORMAL',
    /** Salto corto: menos altura, se queda para combinar. */
    SHORT: 'SHORT',
    /** Salto atras: para mantener la distancia. */
    BACK: 'BACK',
    /** Salto adelante: entra en el rival. */
    FORWARD: 'FORWARD',
    /** Salto multiple (el arquetipo MONTE): se puede repetir en el aire. */
    DOUBLE: 'DOUBLE',
    /** Salto acrobatico (el arquetipo MONTE): mas alto y mas lento. */
    ACRO: 'ACRO'
});

/**
 * Como es cada salto: altura, cuanto dura, y cuanto control da en el aire.
 * `apex` es en segundos hasta el punto mas alto.
 *
 * NOTAS DE DISENO
 *   - El salto corto es el que hace posible el mixup: sube poco y atacar en el
 *     aire da menos margen, pero permite encadenar.
 *   - El salto atras tiene la misma altura que el normal: lo que cambia es la
 *     velocidad horizontal (negativa). Un salto atras lento seria una trampa,
 *     porque no te alejas y no puedes atacar.
 *   - El multiple NO es mas alto: es un segundo impulso en el aire. Si fuera mas
 *     alto, con dos ya se sale del ring.
 */
export const JUMP_TABLE = Object.freeze({
    [JUMP.NORMAL]: Object.freeze({
        apex: 0.42, vy: 7.2, vx: 0,
        airControl: 0.55, forward: true, back: false, doubleable: false, cancelable: true
    }),
    [JUMP.SHORT]: Object.freeze({
        apex: 0.26, vy: 5.0, vx: 0,
        airControl: 0.60, forward: true, back: false, doubleable: false, cancelable: true
    }),
    [JUMP.BACK]: Object.freeze({
        apex: 0.42, vy: 7.2, vx: 0,
        airControl: 0.35, forward: false, back: true, doubleable: false, cancelable: false
    }),
    [JUMP.FORWARD]: Object.freeze({
        apex: 0.40, vy: 6.8, vx: 0,
        airControl: 0.40, forward: true, back: false, doubleable: false, cancelable: true
    }),
    [JUMP.DOUBLE]: Object.freeze({
        apex: 0.34, vy: 6.2, vx: 0,
        airControl: 0.62, forward: true, back: false, doubleable: true, cancelable: true
    }),
    [JUMP.ACRO]: Object.freeze({
        apex: 0.62, vy: 9.4, vx: 0,
        airControl: 0.70, forward: true, back: false, doubleable: true, cancelable: true
    })
});

/** Gravedad del aire. La misma para todos: la diferencia la da `vy`. */
export const AIR_GRAVITY = 17.5;

/** Techo del aire: por encima de esta altura ya no se puede subir mas. */
export const AIR_CEILING = 6.0;

/** Multiplicador de gravedad segun el tipo de salto (caida mas o menos rapida). */
export const FALL_FACTOR = Object.freeze({
    [JUMP.NORMAL]: 1.0,
    [JUMP.SHORT]: 1.15,     // cae mas rapido: por eso es corto
    [JUMP.BACK]: 1.0,
    [JUMP.FORWARD]: 1.0,
    [JUMP.DOUBLE]: 0.85,    // flota mas: el multiple dura mas en el aire
    [JUMP.ACRO]: 0.75       // cae despacio: el acrobatico es lento y flota
});

// ===========================================================================
// 2. LOS ESTADOS DE POSTURA (lo que el motor ya tiene, declarado aqui)
//
// No se redefinen: se DECLARAN para que clinch.js y los tests hablen el mismo
// idioma. El motor sigue siendo el dueno de la FSM.
// ===========================================================================

export const STANCE = Object.freeze({
    NEUTRAL: 'NEUTRAL',           // de pie, quieto
    WALK: 'WALK',                 // caminando
    GUARD: 'GUARD',               // de pie, guardia alta
    CROUCH: 'CROUCH',             // agachado sin guardia
    CROUCH_GUARD: 'CROUCH_GUARD', // agachado con guardia baja: el muro
    RUN: 'RUN',                   // corriendo
    DASH: 'DASH',                 // dash
    PLANTED: 'PLANTED',           // de pie con los pies clavados (guardia fuerte)
    AIRBORNE: 'AIRBORNE',         // en el aire
    DOWNED: 'DOWNED',             // en el suelo
    GRAPPLE: 'GRAPPLE'            // agarrado
});

/** Altura del centro de masa por postura: sirve para el choque. */
export const CENTER_OF_MASS = Object.freeze({
    [STANCE.NEUTRAL]: 0.95, [STANCE.WALK]: 0.95, [STANCE.GUARD]: 0.95,
    [STANCE.RUN]: 0.95, [STANCE.DASH]: 0.95, [STANCE.PLANTED]: 0.92,
    [STANCE.CROUCH]: 0.60, [STANCE.CROUCH_GUARD]: 0.58,
    [STANCE.AIRBORNE]: -1, [STANCE.DOWNED]: 0.25, [STANCE.GRAPPLE]: 0.80
});

// ===========================================================================
// 3. LAS TRES FAMILIAS DE ATAQUE AEREO
// ===========================================================================

export const AIR_FAMILY = Object.freeze({
    /** Requiere estar en el aire. Es el unico vulnerable al timing del salto. */
    AEREO: 'AEREO',
    /** Desde el suelo, sube en el mismo movimiento. Imparable si no bloqueas. */
    ASCENDENTE: 'ASCENDENTE',
    /** Desde el suelo, sube y cae. Rapido pero deja en el suelo. */
    DESCENDENTE: 'DESCENDENTE'
});

/**
 * Que necesita cada familia para ejecutarse y que deja despues.
 *
 *  `needs`   : POSTURA en la que se puede ordenar (NEUTRAL = desde el suelo)
 *  `endsIn`  : POSTURA en la que queda el personaje al acabar
 *  `airInvuln`: frames de invulnerabilidad (las ascendentes los tienen)
 *  `onBlock` : castigo al bloquear (frames)
 */
export const AIR_FAMILY_RULES = Object.freeze({
    [AIR_FAMILY.AEREO]: Object.freeze({
        needs: STANCE.AIRBORNE,
        endsIn: STANCE.AIRBORNE,
        airInvuln: 0,
        onBlock: 6
    }),
    [AIR_FAMILY.ASCENDENTE]: Object.freeze({
        needs: STANCE.NEUTRAL,       // o de pie: es un comando de suelo
        endsIn: STANCE.AIRBORNE,
        airInvuln: 5,                // imparable mientras sube
        onBlock: 18                  // castigo: es lento a proposito
    }),
    [AIR_FAMILY.DESCENDENTE]: Object.freeze({
        needs: STANCE.NEUTRAL,
        endsIn: STANCE.NEUTRAL,      // vuelve al suelo: hay recuperacion
        airInvuln: 2,                // solo al principio
        onBlock: 10
    })
});

/**
 * ¿Puede este personaje ejecutar un ataque de esta familia?
 *
 * NO es lo mismo "tiene un ataque aereo" que "puede saltar". Un peleador de
 * Muay Thai puede tener ascendentes sin tener NINGUN salto: su unico comando
 * de aire es el que lo lanza al aire.
 *
 * @param {object} character  la carta del roster (o unMoveset)
 * @param {string} family     clave de AIR_FAMILY
 * @returns {boolean}
 */
export function canUseAirAttack(character, family) {
    const set = character && (character.airAttacks || (character.moveset || {}).airAttacks);
    if (!set) return false;
    return Array.isArray(set[family]) && set[family].length > 0;
}

/** Todos los ataques aereos de un personaje, por familia. */
export function airAttacksOf(character) {
    const set = (character && (character.airAttacks || (character.moveset || {}).airAttacks)) || {};
    const out = {};
    for (const f of [AIR_FAMILY.AEREO, AIR_FAMILY.ASCENDENTE, AIR_FAMILY.DESCENDENTE]) {
        out[f] = (set[f] || []).slice();
    }
    return out;
}

/** ¿Puede este personaje dar un salto multiple? (arquetipo MONTE) */
export function canDoubleJump(character) {
    const j = character && (character.jumps || (character.moveset || {}).jumps);
    return Array.isArray(j) ? j.indexOf(JUMP.DOUBLE) !== -1 : false;
}

/** ¿Tiene salto acrobatico? */
export function canAcroJump(character) {
    const j = character && (character.jumps || (character.moveset || {}).jumps);
    return Array.isArray(j) ? j.indexOf(JUMP.ACRO) !== -1 : false;
}

// ===========================================================================
// 4. COMANDOS: que pulsacion da cada salto y cada postura
//
// GUARDIA + abajo = agachado en guardia (el muro). El resto son direccion +
// arriba. El caso raro (dos veces adelante + patada) NO es un salto: es un
// ataque antiaereo que sale desde el suelo, y esta en la seccion 5.
// ===========================================================================

export const COMMAND = Object.freeze({
    GUARD_DOWN: 'GUARD_DOWN',       // guardia + abajo -> agachado en guardia
    UP: 'UP',                       // solo arriba -> salto alto
    UP_FORWARD: 'UP_FORWARD',       // arriba + adelante -> salto al frente
    UP_BACK: 'UP_BACK',             // arriba + atras -> salto atras
    TAP_UP: 'TAP_UP',               // toque corto de arriba -> salto corto
    DOUBLE_TAP_UP: 'DOUBLE_TAP_UP'  // doble arriba -> salto multiple
});

/**
 * Que comando produce cada pulsacion. El motor decide despues si el personaje
 * tiene ese salto, pero el MAPEO es fijo para todos: aprenderlo es parte del
 * control, igual que en cualquier juego de pelea.
 */
export const COMMAND_TABLE = Object.freeze({
    [COMMAND.GUARD_DOWN]: { stance: STANCE.CROUCH_GUARD, jump: null },
    [COMMAND.UP]: { stance: null, jump: JUMP.NORMAL },
    [COMMAND.UP_FORWARD]: { stance: null, jump: JUMP.FORWARD },
    [COMMAND.UP_BACK]: { stance: null, jump: JUMP.BACK },
    [COMMAND.TAP_UP]: { stance: null, jump: JUMP.SHORT },
    [COMMAND.DOUBLE_TAP_UP]: { stance: null, jump: JUMP.DOUBLE }
});

// ===========================================================================
// 5. EL ANTIAEREO: un ataque aereo que se ejecuta DESDE EL SUELO
//
// Este es el caso que pidio el diseno y que conviene tener separado: pega a la
// cabeza de un rival que esta en el aire, asi que ES un ataque aereo, pero no
// se ejecuta en el aire: se lanza desde el suelo.
//
// Por eso "ataque aereo" no puede definirse como "se hace en el aire", sino
// como "pega a un objetivo en el aire". La patada voladora con grito es esto.
//
// Se marca con `antiAir: true`, y el motor lo usa para dos cosas:
//   1. Prioridad sobre cualquier otro golpe (si hay rival en el aire, el
//      antiaereo es lo que quieres).
//   2. Que sea IMPARABLE: bloquear una patada que te viene desde arriba no
//      tiene sentido. Lleva sus PROPIOS numeros de golpe y no se mezcla con
//      los estados de la FSM.
// ===========================================================================

export const AIR_TARGET = Object.freeze({
    GROUND: 'GROUND',     // el rival esta en el suelo: pega en el cuerpo
    AIR: 'AIR',           // el rival esta en el aire: pega en la cabeza
    NONE: 'NONE'          // no es un ataque antiaereo
});

/** Que zona usa este golpe segun donde este el rival. */
export function targetZone(antiAir, rivalEnElAire) {
    if (!antiAir) return AIR_TARGET.NONE;
    return rivalEnElAire ? AIR_TARGET.AIR : AIR_TARGET.GROUND;
}

/** Como se bloquea un antiaereo. */
export const ANTIAIR_BLOCK = Object.freeze({
    BLOCKABLE: 'BLOCKABLE',       // se bloquea, pero con castigo: es lento
    UNBLOCKABLE: 'UNBLOCKABLE',   // vuela por encima de los brazos
    GRAB: 'GRAB'                  // es un agarre: si pega, agarra
});

/** Que hace con el rival al impactar. */
export const ANTIAIR_SEND = Object.freeze({
    LAUNCH: 'LAUNCH',   // sale despedido por los aires
    DROP: 'DROP',       // cae al suelo
    CLINCH: 'CLINCH'    // se agarra: empieza un clinch
});

/** Los golpes aereos del diseno, con su familia y su regla. */
export const AIR_MOVES = Object.freeze({
    /** La patada voladora con grito: dos veces adelante + patada. */
    patada_voladora: Object.freeze({
        label: 'Patada voladora',
        command: 'doble adelante + patada',
        family: AIR_FAMILY.DESCENDENTE,        // sale del suelo, sube y cae
        antiAir: true,
        block: ANTIAIR_BLOCK.UNBLOCKABLE,     // vuela por encima de los brazos
        send: ANTIAIR_SEND.LAUNCH,             // al impactar manda a volar
        shout: true,                           // el grito, con audio
        damage: 18
    }),
    /** El shoryuken clasico: bloqueable, lento, tumba pero no manda lejos. */
    ascendente_marcial: Object.freeze({
        label: 'Ascendente marcial',
        command: 'arriba + puño pesado',
        family: AIR_FAMILY.ASCENDENTE,
        antiAir: true,
        block: ANTIAIR_BLOCK.BLOCKABLE,
        send: ANTIAIR_SEND.DROP,
        shout: false,
        damage: 14
    })
});

// ===========================================================================
// 6. PRESETS: los tres arquetipos base con su aire
//
// No es "el moveset de cada uno" como Pedro (que esta en Movesets.js): esto es
// solo lo necesario para saber COMO se mueve en el aire.
// ===========================================================================

export const AIR_PRESETS = Object.freeze({
    /** YUGO, el boxeador: saltos simples, sin multiples ni acrobacias. */
    YUGO: Object.freeze({
        jumps: Object.freeze([JUMP.NORMAL, JUMP.SHORT, JUMP.BACK, JUMP.FORWARD]),
        airAttacks: Object.freeze({
            [AIR_FAMILY.AEREO]: Object.freeze(['patada_aerea_simple']),
            [AIR_FAMILY.ASCENDENTE]: Object.freeze([]),
            [AIR_FAMILY.DESCENDENTE]: Object.freeze([])
        })
    }),
    /** MONTE, el salvaje: multiples y acrobacias, y el unico con descendente. */
    MONTE: Object.freeze({
        jumps: Object.freeze([JUMP.NORMAL, JUMP.SHORT, JUMP.DOUBLE, JUMP.ACRO, JUMP.FORWARD]),
        airAttacks: Object.freeze({
            [AIR_FAMILY.AEREO]: Object.freeze(['tijera', 'rodilla_aerea']),
            [AIR_FAMILY.ASCENDENTE]: Object.freeze(['zarpazo_ascendente']),
            [AIR_FAMILY.DESCENDENTE]: Object.freeze(['caida_patada'])
        })
    }),
    /** MUSASHI, el vagabundo marcial: NO tiene saltos raros, pero tiene el
     *  ascendente clasico y un descendente de entrada. Puede entrar por el suelo
     *  sin saber saltar: es su rasgo. */
    MUSASHI: Object.freeze({
        jumps: Object.freeze([JUMP.NORMAL, JUMP.SHORT, JUMP.BACK]),
        airAttacks: Object.freeze({
            [AIR_FAMILY.AEREO]: Object.freeze([]),
            [AIR_FAMILY.ASCENDENTE]: Object.freeze(['ascendente_marcial']),
            [AIR_FAMILY.DESCENDENTE]: Object.freeze(['entrada_al_suelo'])
        })
    })
});

/**
 * Verificacion de coherencia. Sirve como test y para avisar en desarrollo si
 * una tabla se descuadra: un arquetipo que dice tener un ataque aereo pero no
 * tiene ningun salto con el que alcanzar el aire.
 */
export function checkPreset(id) {
    const p = AIR_PRESETS[id];
    if (!p) return { ok: false, why: 'no existe el preset ' + id };

    const tieneAereo = canUseAirAttack(p, AIR_FAMILY.AEREO);
    const tieneAlgunSalto = p.jumps.length > 0;

    // Un ataque AEREO sin ningun salto es imposible de ejecutar: nadie te
    // lleva al aire. Es el error mas facil de cometer al escribir un moveset.
    if (tieneAereo && !tieneAlgunSalto) {
        return { ok: false, why: 'tiene ataque AEREO pero ningun salto' };
    }
    return { ok: true, why: '' };
}

export default {
    JUMP, JUMP_TABLE, AIR_GRAVITY, AIR_CEILING, FALL_FACTOR,
    STANCE, CENTER_OF_MASS,
    COMMAND, COMMAND_TABLE,
    AIR_TARGET, targetZone, ANTIAIR_BLOCK, ANTIAIR_SEND, AIR_MOVES,
    AIR_FAMILY, AIR_FAMILY_RULES,
    canUseAirAttack, airAttacksOf, canDoubleJump, canAcroJump,
    AIR_PRESETS, checkPreset
};
