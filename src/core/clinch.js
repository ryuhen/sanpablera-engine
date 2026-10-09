/**
 * ============================================================================
 * SANPABLERA ENGINE · core/clinch.js
 * ----------------------------------------------------------------------------
 * LA CAPA DE CHOQUE: cuando dos cuerpos se encuentran, QUE PASA Y QUIEN GANA.
 *
 * QUE HAY AQUI Y POR QUE FALTABA
 * ----------------------------------------------------------------------------
 *   Los estados declaraban `PhysicalFlag.PUSHABLE` e `IMPULSE_SENSITIVE`, pero
 *   NO HABIA NADA QUE DECIDIESA EL RESULTADO: dos cuerpos se empujaban de
 *   forma simetrica y nadie tropezaba nunca. Este archivo es el que convierte
 *   "dos cuerpos se han tocado" en una de las diez decisiones de la tabla.
 *
 *   Es PURO: sin Babylon, sin DOM. Se testea en Node (tests/clinch.smoke.mjs)
 *   como archetypes.js o boxing.js.
 *
 * POR QUE ATACAQUE x DEFENSA Y NO UNA MATRIZ DE POSTURAS
 * ----------------------------------------------------------------------------
 *   Lo que decide el choque no es "en que postura estaba cada uno" sino "que
 *   le estas haciendo al otro y como se esta cubriendo". Un barrido pierde
 *   contra una guardia baja pero le destroza a uno que esta de pie; un
 *   rodillazo funciona justo contra ese agachado. Con una matriz de posturas
 *   eso no se puede expresar.
 *
 * LAS REGLAS, EN ORDEN DE PRIORIDAD
 * ----------------------------------------------------------------------------
 *   0. Si uno NO esta de pie, no hay choque: hay evasion, pisoton o nada.
 *   1. EXPLOTACION (botones en el instante del impacto): piedra-papel-tijera.
 *   2. DEFENSA en el instante: ponerse fuerte, rebotar o abrazar.
 *   3. La tabla ATAQUE x DEFENSA de mas abajo.
 *
 * LO QUE ESTA FUERA DE AQUI, A PROPOSITO
 * ----------------------------------------------------------------------------
 *   Los ataques de carrera con carga (puño cargado, carga de hombro) NO son
 *   choques: son golpes con su propio bloqueo. Los agarres en carrera (rodada
 *   a las piernas, takedown en salto, llave al cuello) son agarres. Y el
 *   cascoteo del suelo es el sistema de suelo. Este archivo solo decide el
 *   CHOQUE entre los que estan de pie.
 * ============================================================================
 */

// ===========================================================================
// 1. POSTURAS (el "donde esta" de cada uno)
// ===========================================================================

export const POSTURE = Object.freeze({
    NEUTRAL: 'NEUTRAL',
    WALK: 'WALK',
    GUARD: 'GUARD',
    CROUCH: 'CROUCH',
    CROUCH_GUARD: 'CROUCH_GUARD',   // agachado con guardia baja: el muro
    RUN: 'RUN',
    DASH: 'DASH',
    AIRBORNE: 'AIRBORNE',
    DOWNED: 'DOWNED',
    GRAPPLE: 'GRAPPLE'
});

/** Solo los de pie participan en un choque. */
export const CLASHABLE = Object.freeze({
    [POSTURE.NEUTRAL]: true, [POSTURE.WALK]: true, [POSTURE.GUARD]: true,
    [POSTURE.CROUCH]: true, [POSTURE.CROUCH_GUARD]: true,
    [POSTURE.RUN]: true, [POSTURE.DASH]: true,
    [POSTURE.AIRBORNE]: false, [POSTURE.DOWNED]: false, [POSTURE.GRAPPLE]: false
});

export function clashable(posture) {
    return CLASHABLE[posture] === true;
}

// ===========================================================================
// 2. LO QUE CUANDO UNO NO ESTA DE PIE
// ===========================================================================

/**
 * No es un choque, pero tampoco es "no pasa nada". Sin esto, saltar y tumbar
 * serian un refugio donde nada puede pasar.
 */
export const OFFLINE = Object.freeze({
    /** El de arriba se desliza o salta POR ENCIMA del que corre. */
    EVADE_AIR: 'EVADE_AIR',
    /** El de pie PISA al que esta tirado. */
    STOMP: 'STOMP',
    /** Nada: los dos fuera de pie, o los dos agarrados. */
    NOTHING: 'NOTHING'
});

export function offlineRule(atk, def) {
    const aArriba = atk === POSTURE.AIRBORNE;
    const dArriba = def === POSTURE.AIRBORNE;
    const aSuelo = atk === POSTURE.DOWNED;
    const dSuelo = def === POSTURE.DOWNED;

    if (aArriba && !dSuelo) return OFFLINE.EVADE_AIR;
    if (dArriba && !aSuelo) return OFFLINE.EVADE_AIR;
    if (dSuelo && !aArriba) return OFFLINE.STOMP;
    if (aSuelo && !dArriba) return OFFLINE.STOMP;
    return OFFLINE.NOTHING;
}

// ===========================================================================
// 3. EL ATAQUE (que le estas haciendo al otro)
// ===========================================================================

export const CLASH_ATTACK = Object.freeze({
    /** Sin ataque: choque de cuerpos, el de las comprobaciones del RPS. */
    NONE: 'NONE',
    /** Carga de hombro: manda a volar. SI funciona contra agachado. */
    CHARGE: 'CHARGE',
    /** Takedown / llave al cuello. NO funciona contra guardia baja plantada. */
    TAKEDOWN: 'TAKEDOWN',
    /** Barrido a las piernas. PIERDE contra guardia baja. */
    SWEEP: 'SWEEP',
    /** Rodillazo / patada baja: justamente contra el que esta agachado. */
    KNEE: 'KNEE'
});

// ===========================================================================
// 4. LA DEFENSA (como esta cubriendose el que recibe)
// ===========================================================================

export const DEFENSE = Object.freeze({
    /** Sin defensa. */
    NONE: 'NONE',
    /** Guardia alta, de pie. */
    GUARD_HIGH: 'GUARD_HIGH',
    /** Guardia baja: cubriendose de un barrido o un rodillazo. */
    GUARD_LOW: 'GUARD_LOW',
    /**
     * Agachado, en guardia y CON LOS PIES EN EL SUELO. Es el muro: no se le
     * puede hacer takedown ni barrido. Pero un hombro si lo manda a volar, y
     * por detras sigue siendo vulnerable.
     */
    PLANTED_LOW: 'PLANTED_LOW',
    /** Salto por encima del rival. */
    EVADE: 'EVADE'
});

// ===========================================================================
// 5. RESULTADOS
// ===========================================================================

export const CLASH = Object.freeze({
    ABSORB: 'ABSORB',             // no pasa nada
    PUSH: 'PUSH',                 // empuje: ambos de pie, recolocados
    TUMBLE: 'TUMBLE',             // el atacante tropieza y queda en mala pose
    DROP: 'DROP',                 // el defensor cae al suelo
    LAUNCH: 'LAUNCH',             // el defensor sale VOLANDO (carga de hombro)
    MUTUAL: 'MUTUAL',             // los dos al suelo
    PROJECT: 'PROJECT',           // el defensor sale proyectado rodando
    REBOUND: 'REBOUND',           // el defensor aguanta y devuelve el choque
    CLINCH: 'CLINCH',             // abrazo: se resuelve en otro momento
    STOMP: 'STOMP',               // pisoton al que esta en el suelo
    EVADE: 'EVADE'                // el de arriba pasa por encima
});

/** Dano a cada uno: [atacante, defensor]. */
const DAMAGE = Object.freeze({
    [CLASH.ABSORB]: [0, 0],
    [CLASH.PUSH]: [0, 2],
    [CLASH.TUMBLE]: [0, 6],
    [CLASH.DROP]: [3, 12],
    [CLASH.LAUNCH]: [5, 15],
    [CLASH.MUTUAL]: [9, 9],
    [CLASH.PROJECT]: [4, 14],
    [CLASH.REBOUND]: [11, 0],
    [CLASH.CLINCH]: [0, 0],       // el castigo va aparte (resolveClinch)
    [CLASH.STOMP]: [0, 8],
    [CLASH.EVADE]: [0, 0]
});

/** Animaciones: [atacante, defensor]. Los clips son nombres; si un modelo no los
 *  tiene, el motor usa la animacion de reposo de ese rol. */
const ANIM = Object.freeze({
    [CLASH.ABSORB]: ['ch_idle', 'ch_idle'],
    [CLASH.PUSH]: ['ch_empuja', 'ch_recib_empuje'],
    [CLASH.TUMBLE]: ['ch_tripieza', 'ch_idle'],
    [CLASH.DROP]: ['ch_idle', 'ch_cae'],
    [CLASH.LAUNCH]: ['ch_carga_hombro', 'ch_sale_volando'],
    [CLASH.MUTUAL]: ['ch_tripieza', 'ch_arrolla'],
    [CLASH.PROJECT]: ['ch_idle', 'ch_rodada'],
    [CLASH.REBOUND]: ['ch_recib_empuje', 'ch_fuerte'],
    [CLASH.CLINCH]: ['ch_abrazo', 'ch_abrazo'],
    [CLASH.STOMP]: ['ch_pisoton', 'ch_pisado'],
    [CLASH.EVADE]: ['ch_pasa_de_largo', 'ch_salta_encima']
});

// ===========================================================================
// 6. LA TABLA ATAQUE x DEFENSA  (el corazon del sistema)
// ===========================================================================

/**
 * Cada celda es el resultado cuando A le aplica `ataque` a B, que se cubre con
 * `defensa`. Escribe la razon al lado: las reglas son de diseno, nofisicas.
 *
 * REGLAS QUE SALEN DE AQUI:
 *
 *  - La guardia BAJA plantada (PLANTED_LOW) es un MURO contra el takedown:
 *    no se le puede tumbar a travеs porque esta mas abajo y con los pies
 *    clavados. Por eso no hay takedown.
 *
 *  - Al mismo muro, la CARGA DE HOMBRO SI lo manda a volar: el hombro entra
 *    por arriba y le levanta del suelo. Es la respuesta a agacharse.
 *
 *  - El BARRIDO pierde contra guardia baja (te agarra la pierna) pero destroza
 *    a uno de pie o agachado SIN guardia.
 *
 *  - El RODILLAZO es al reves: contra la guardia alta no entra, pero contra el
 *    que esta agachado es justo lo que hay que pegarle.
 *
 *  - PLANTED_LOW no recibe NADA bien: es el muro, pero no invencible, porque
 *    la carga de hombro lo abre. Agacharse tapado no es la solucion, es una
 *    postura de riesgo.
 */
const TABLE = Object.freeze({
    [CLASH_ATTACK.NONE]: {
        [DEFENSE.NONE]: CLASH.PUSH,
        [DEFENSE.GUARD_HIGH]: CLASH.PUSH,
        [DEFENSE.GUARD_LOW]: CLASH.PUSH,
        [DEFENSE.PLANTED_LOW]: CLASH.PUSH,
        [DEFENSE.EVADE]: CLASH.EVADE
    },
    [CLASH_ATTACK.CHARGE]: {
        [DEFENSE.NONE]: CLASH.LAUNCH,
        [DEFENSE.GUARD_HIGH]: CLASH.REBOUND,     // guardia alta: rebota
        [DEFENSE.GUARD_LOW]: CLASH.LAUNCH,       // por encima de la guardia baja
        [DEFENSE.PLANTED_LOW]: CLASH.LAUNCH,     // al muro lo manda a volar
        [DEFENSE.EVADE]: CLASH.EVADE
    },
    [CLASH_ATTACK.TAKEDOWN]: {
        [DEFENSE.NONE]: CLASH.DROP,
        [DEFENSE.GUARD_HIGH]: CLASH.DROP,
        [DEFENSE.GUARD_LOW]: CLASH.TUMBLE,       // se libra y te tumba el
        [DEFENSE.PLANTED_LOW]: CLASH.ABSORB,     // EL MURO: no hay takedown
        [DEFENSE.EVADE]: CLASH.EVADE
    },
    [CLASH_ATTACK.SWEEP]: {
        [DEFENSE.NONE]: CLASH.DROP,
        [DEFENSE.GUARD_HIGH]: CLASH.DROP,
        [DEFENSE.GUARD_LOW]: CLASH.ABSORB,       // PIERDE contra guardia baja
        [DEFENSE.PLANTED_LOW]: CLASH.ABSORB,     // ni barrido ni takedown
        [DEFENSE.EVADE]: CLASH.EVADE
    },
    [CLASH_ATTACK.KNEE]: {
        [DEFENSE.NONE]: CLASH.PROJECT,
        [DEFENSE.GUARD_HIGH]: CLASH.REBOUND,     // la guardia alta lo para
        [DEFENSE.GUARD_LOW]: CLASH.PROJECT,      // justo contra el agachado
        [DEFENSE.PLANTED_LOW]: CLASH.PROJECT,    // le entra igual de bajo
        [DEFENSE.EVADE]: CLASH.EVADE
    }
});

// ===========================================================================
// 7. BOTONES DEL INSTANTE: PIEDRA-PAPEL-TIJERA
// ===========================================================================

export const INPUT = Object.freeze({
    NONE: 'NONE', PUNCH: 'PUNCH', KICK: 'KICK', ACTION: 'ACTION', GUARD: 'GUARD'
});

/**
 * La explotacion del choque: puño gana a accion, accion gana a patada, patada
 * gana a puño. Quien pierde la jugada se lleva el dano y la posicion mala.
 */
export const BEATS = Object.freeze({
    [INPUT.PUNCH]: INPUT.ACTION,
    [INPUT.ACTION]: INPUT.KICK,
    [INPUT.KICK]: INPUT.PUNCH
});

export function beats(move, other) {
    if (move === other) return false;
    return BEATS[move] === other;
}

const EXPLOITS = [INPUT.PUNCH, INPUT.KICK, INPUT.ACTION];

/** Ventana en frames para explotar un choque. */
export const EXPLOIT_WINDOW = Object.freeze({ start: 1, end: 10 });

/** Animaciones de cada explotacion: [quien explota, quien la sufre]. */
const EXPLOIT_ANIM = Object.freeze({
    [INPUT.PUNCH]: [['ch_llave_brazo', 'ch_takedown', 'ch_lanz_hombreo'],
        ['ch_sufre_llave', 'ch_sufre_takedown', 'ch_sueña_hombreo']],
    [INPUT.KICK]: [['ch_barril', 'ch_rodillazo', 'ch_rodada_mono'],
        ['ch_sufre_barril', 'ch_sufre_rodillazo', 'ch_sueña_rodada']],
    [INPUT.ACTION]: [['ch_esquiva', 'ch_finta', 'ch_floritura'],
        ['ch_pierde_equilibrio', 'ch_desequilibrado', 'ch_aturdido_finta']]
});

function pick(list, seed) {
    return list[Math.abs(Math.round(seed)) % list.length];
}

// ===========================================================================
// 8. EL RESOLUTOR
// ===========================================================================

/**
 * Traduce la postura del motor a la DEFENSA que se supone que tiene.
 *
 * OJO con PLANTED_LOW: agachado en guardia es guardia baja, pero si ademas
 * tiene los pies clavados (`planted`) se convierte en el MURO. Sin `planted`
 * es solo GUARD_LOW. Es la unica defensa que resiste takedown y barrido.
 */
export function defenseFrom(posture, guardPressed, planted) {
    if (posture === POSTURE.AIRBORNE) return DEFENSE.EVADE;
    if (posture === POSTURE.CROUCH_GUARD) {
        return planted ? DEFENSE.PLANTED_LOW : DEFENSE.GUARD_LOW;
    }
    if (posture === POSTURE.CROUCH) return guardPressed ? DEFENSE.GUARD_LOW : DEFENSE.NONE;
    if (posture === POSTURE.GUARD) return DEFENSE.GUARD_HIGH;
    return DEFENSE.NONE;
}

function vacio(reason) {
    return {
        isClash: false, rule: null, result: CLASH.ABSORB,
        attack: null, defense: null,
        attacker: null, loser: null, exploitation: null,
        damageA: 0, damageB: 0, animA: 'ch_idle', animB: 'ch_idle',
        clinch: false, reason: reason
    };
}

/**
 * @typedef {object} ClashBody
 * @property {number} x
 * @property {number} z
 * @property {string} posture      clave de POSTURE
 * @property {string} [attack]     clave de CLASH_ATTACK (por defecto NONE)
 * @property {boolean} [guard]     pulsa guardia en este frame
 * @property {boolean} [planted]   tiene los pies clavados
 * @property {string} [input]      boton del instante (INPUT), para la explotacion
 * @property {number} [mass]       masa relativa (1 = normal)
 */

/**
 * RESUELVE UN CHOQUE. Devuelve un veredicto con el resultado, quien lo lleva
 * mal y con que animacion y cuanto dano.
 *
 * @param {ClashBody} a  el que choca
 * @param {ClashBody} b  el que recibe
 */
export function resolveClash(a, b) {
    const atkPosture = a.posture;
    const defPosture = b.posture;

    // --- REGLA 0: si uno no esta de pie, no hay choque ---------------------
    if (!clashable(atkPosture) || !clashable(defPosture)) {
        const rule = offlineRule(atkPosture, defPosture);
        if (rule === OFFLINE.NOTHING) {
            return vacio('no es choque (' + atkPosture + ' / ' + defPosture + ')');
        }
        const out = vacio('fuera de pie: ' + rule);
        out.rule = rule;

        // Quien esquiva o pisa, para saber a quien se atribuye.
        if (rule === OFFLINE.EVADE_AIR) {
            out.isClash = false;
            out.attacker = atkPosture === POSTURE.AIRBORNE ? 'A' : 'B';
            out.result = CLASH.EVADE;
            out.animA = atkPosture === POSTURE.AIRBORNE ? 'ch_salta_encima' : 'ch_pasa_de_largo';
            out.animB = atkPosture === POSTURE.AIRBORNE ? 'ch_pasa_de_largo' : 'ch_salta_encima';
        } else {
            // Pisoton: pisa al que esta en el suelo.
            const pisa = defPosture === POSTURE.DOWNED ? 'A' : 'B';
            const pisado = pisa === 'A' ? 'B' : 'A';
            out.result = CLASH.STOMP;
            out.attacker = pisa;
            out.loser = pisado;
            out.animA = pisa === 'A' ? 'ch_pisoton' : 'ch_pisado';
            out.animB = pisa === 'A' ? 'ch_pisado' : 'ch_pisoton';
            out.damageA = pisa === 'A' ? 0 : DAMAGE[CLASH.STOMP][1];
            out.damageB = pisa === 'A' ? DAMAGE[CLASH.STOMP][1] : 0;
        }
        return out;
    }

    // --- datos geometria --------------------------------------------------
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const out = {
        isClash: true, rule: null,
        normal: Object.freeze({ x: dist > 1e-6 ? dx / dist : 1, z: dist > 1e-6 ? dz / dist : 0 }),
        attack: a.attack || CLASH_ATTACK.NONE,
        defense: null, result: CLASH.ABSORB,
        attacker: null, loser: null, exploitation: null,
        damageA: 0, damageB: 0, animA: 'ch_idle', animB: 'ch_idle',
        clinch: false, reason: ''
    };

    const massA = a.mass != null ? a.mass : 1;
    const seed = Math.round(a.x * 31 + a.z * 17 + b.x * 13 + b.z * 7);

    // --- REGLA 1: EXPLOTACION (tiene prioridad sobre todo lo demas) -------
    const ia = a.input || INPUT.NONE;
    const ib = b.input || INPUT.NONE;
    const aCan = EXPLOITS.includes(ia);
    const bCan = EXPLOITS.includes(ib);

    let exploita = null;
    if (aCan && bCan) {
        if (beats(ia, ib)) exploita = 'A';
        else if (beats(ib, ia)) exploita = 'B';
        // Mismo boton: empate, sigue la tabla.
    } else if (aCan) exploita = 'A';
    else if (bCan) exploita = 'B';

    // --- REGLA 2: DEFENSA en el instante (ponerse fuerte / abrazo) --------
    const aDef = defenseFrom(atkPosture, !!a.guard, !!a.planted);
    const bDef = defenseFrom(defPosture, !!b.guard, !!b.planted);
    const defKey = bDef;

    // Ponerse fuerte contra algo DURO puede abrir un abrazo en vez de resolverse.
    const guardaA = a.guard || aDef === DEFENSE.GUARD_HIGH || aDef === DEFENSE.PLANTED_LOW;
    const guardaB = b.guard || bDef === DEFENSE.GUARD_HIGH || bDef === DEFENSE.PLANTED_LOW;
    const fuerzaA = atkPosture === POSTURE.DASH || atkPosture === POSTURE.RUN;
    const fuerzaB = defPosture === POSTURE.DASH || defPosture === POSTURE.RUN;

    if (guardaB && fuerzaA && (atkPosture === POSTURE.DASH)) {
        // Un DASH contra alguien que se pone fuerte = ABRAZO.
        out.result = CLASH.CLINCH;
        out.clinch = true;
        out.defense = defKey;
        out.animA = 'ch_abrazo'; out.animB = 'ch_abrazo';
        out.reason = 'abrazo: un dash contra guardia fuerte';
        return out;
    }

    // --- Decision final por tabla -----------------------------------------
    let result;
    if (exploita) {
        // La explotacion decide la postura final, no el ataque concreto.
        const gana = exploita === 'A';
        const move = gana ? ia : ib;
        const [anWin, anLose] = EXPLOIT_ANIM[move];
        out.exploitation = exploita;
        out.attacker = exploita;
        out.loser = gana ? 'B' : 'A';
        out.damageA = gana ? 0 : 12;
        out.damageB = gana ? 12 : 0;
        out.animA = gana ? pick(anWin, seed) : pick(anLose, seed + 1);
        out.animB = gana ? pick(anLose, seed + 1) : pick(anWin, seed);
        // El que explota bien tira al otro al suelo (o lo desequilibra con
        // la accion, que es el unico caso donde no cae).
        if (move === INPUT.ACTION) {
            out.result = gana ? CLASH.TUMBLE : CLASH.REBOUND;
        } else {
            out.result = CLASH.PROJECT;
        }
        out.defense = bDef;
        out.reason = 'explotacion ' + move + ' gana el choque';
        return out;
    }

    // Sin explotacion: mandan la tabla y la guardia en el instante.
    // Si el que choca se pone fuerte, el rol se invierte (defiende el A).
    result = TABLE[out.attack][defKey];

    // AJUSTE POR CONTEXTO DE POSTURA. La tabla mira ataque x defensa, pero hay
    // un caso que depende de COMO se llega, no de que se hace:
    //
    //   CORRER contra un agachado lo AROLLA. Agacharse no es ganar el choque:
    //   el corredor pasa por encima y los dos caen. Es la contrapartida de que
    //   el muro (guardia baja plantada) si lo pare, pero el agachado SIN guardar
    //   no tiene con que.
    const aCarga = atkPosture === POSTURE.RUN || atkPosture === POSTURE.DASH;
    const bAgachado = defPosture === POSTURE.CROUCH || defPosture === POSTURE.CROUCH_GUARD;
    if (aCarga && bAgachado && out.attack === CLASH_ATTACK.NONE) {
        result = CLASH.MUTUAL;
    }

    // Ponerse fuerte es una defensa extra del que choca.
    if (guardaA && !guardaB && result === CLASH.DROP) {
        result = CLASH.REBOUND;
    }

    out.result = result;
    out.defense = bDef;
    const [dA, dB] = DAMAGE[result];
    out.damageA = dA;
    out.damageB = dB;
    const [anA, anB] = ANIM[result];
    out.animA = anA;
    out.animB = anB;

    // Quien recibe el resultado malo.
    if (result === CLASH.TUMBLE || result === CLASH.REBOUND) {
        out.attacker = 'A'; out.loser = 'A';
    } else if (result === CLASH.DROP || result === CLASH.LAUNCH ||
        result === CLASH.PROJECT || result === CLASH.STOMP) {
        out.attacker = 'A'; out.loser = 'B';
    } else if (result === CLASH.MUTUAL) {
        out.attacker = null; out.loser = null;
    }

    out.reason = out.attack + ' vs ' + defKey + ' = ' + result;
    return out;
}

/**
 * Resuelve el final de un ABRAZO (el clinch dura unos frames y luego hay
 * castigo). Quien mas momento llevo en la pelea se lleva el abrazo.
 *
 * @param {object} verdict  el veredicto original, con clinch:true
 * @param {number} [mA] momento acumulado por A
 * @param {number} [mB] momento acumulado por B
 */
export function resolveClinch(verdict, mA = 0, mB = 0) {
    const out = Object.assign({}, verdict);
    const ganaA = mA > mB;
    out.clinch = false;
    out.attacker = ganaA ? 'A' : 'B';
    out.loser = ganaA ? 'B' : 'A';
    out.damageA = ganaA ? 0 : 10;
    out.damageB = ganaA ? 10 : 0;
    out.animA = ganaA ? 'ch_rompe_abrazo' : 'ch_sufre_abrazo';
    out.animB = ganaA ? 'ch_sufre_abrazo' : 'ch_rompe_abrazo';
    out.result = CLASH.TUMBLE;
    out.reason = 'abrazo resuelto (' + mA + '-' + mB + ')';
    return out;
}

export default {
    POSTURE, CLASHABLE, clashable,
    OFFLINE, offlineRule,
    CLASH_ATTACK, DEFENSE, defenseFrom,
    CLASH, INPUT, BEATS, beats, EXPLOIT_WINDOW,
    resolveClash, resolveClinch
};
