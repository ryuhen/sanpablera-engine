/**
 * ============================================================================
 * SANPABLERA ENGINE · core/locomotion.js
 * ----------------------------------------------------------------------------
 * COMO SE MUEVE UN PELEADOR: el paso, la caminata, el paso largo, el dash, y
 * los ataques que se lanzan CORRIENDO.
 *
 * QUE HAY AQUI Y POR QUE FALTABA
 * ----------------------------------------------------------------------------
 *   Los estados de suelo ya existen con sus clips (walk, sprint_f, dash_side,
 *   side_step, backdash, slide...) y los saltos tambien. Lo que NO habia era la
 *   CAPA QUE LOS ELIGE: que distinguishes entre un TOQUE corto y una pulsacion
 *   mantenida, y por tanto entre dar un paso y andar.
 *
 *   Esto no es un capricho. En un juego de pelea, el toque y el mantenimiento son
 *   dos acciones distintas:
 *
 *     TOQUE ..... un paso. Se usa para medir distancias y para entrar y salir sin
 *                comprometerse. No te deja atrapado en un compromiso largo.
 *     CAMINATA . mantener. Te mueve de verdad.
 *     PASO LARGO. un paso rapido y largo. Es el "ajustar un paso hacia el
 *                rival" de los juegos de pelea: cubre mas sin comprometerte.
 *     DASH ..... doble toque. El compromiso.
 *
 *   Sin esta capa, tocar el boton de mover y mantenerlo son lo mismo, y el
 *   personaje se mueve a trompicones porque el estado cambia cada frame.
 *
 *   Y aparte: los ATAQUES CORRIENDO. NO son choques: son golpes con su propia
 *   ventana de carga y su propio bloqueo (ver core/clinch.js, que es otra cosa).
 *
 * ES PURO: sin Babylon ni DOM. Se testea en Node (tests/locomotion.smoke.mjs).
 * ============================================================================
 */

// ===========================================================================
// 1. TIPOS DE DESPLAZAMIENTO
// ===========================================================================

export const LOCO = Object.freeze({
    /** Quieto. */
    IDLE: 'IDLE',
    /** Un paso corto, por un TOQUE del boton. Compromiso minimo. */
    STEP: 'STEP',
    /** Caminata sostenida. */
    WALK: 'WALK',
    /** Un paso rapido y largo: cubre distancia sin comprometerse. */
    STEP_LONG: 'STEP_LONG',
    /** Carrera. Compromiso alto, se puede atacar. */
    RUN: 'RUN',
    /** Dash: doble toque. El compromiso total. */
    DASH: 'DASH',
    /** Deslizamiento. */
    SLIDE: 'SLIDE',
    /** Rodar por el suelo. */
    ROLL: 'ROLL'
});

/**
 * Cada tipo: que clip usa, cuanto dura un ciclo, y el compromiso.
 *
 * `commitment` = cuanto se compromete el personaje. Es la cifra que decide si
 * un golpe sale o no: un paso no permite atacar, una carrera si.
 */
export const LOCO_TABLE = Object.freeze({
    [LOCO.IDLE]: Object.freeze({
        clip: 'idle', cycle: 0, speed: 0, commitment: 0, cancellable: true
    }),
    // El paso por toque: un solo ciclo, rapido. Es el ajuste fino de distancia.
    [LOCO.STEP]: Object.freeze({
        clip: 'step', cycle: 0.28, speed: 2.2, commitment: 0.15, cancellable: true
    }),
    // El paso largo: mismo patron, mas recorrido y mas compromiso.
    [LOCO.STEP_LONG]: Object.freeze({
        clip: 'step_long', cycle: 0.34, speed: 3.6, commitment: 0.35, cancellable: true
    }),
    [LOCO.WALK]: Object.freeze({
        clip: 'walk', cycle: 0.62, speed: 2.8, commitment: 0.45, cancellable: true
    }),
    [LOCO.RUN]: Object.freeze({
        clip: 'sprint_f', cycle: 0.44, speed: 5.2, commitment: 0.75, cancellable: false
    }),
    [LOCO.DASH]: Object.freeze({
        clip: 'dash_side', cycle: 0.30, speed: 8.5, commitment: 1.0, cancellable: false
    }),
    [LOCO.SLIDE]: Object.freeze({
        clip: 'slide', cycle: 0.55, speed: 6.0, commitment: 0.9, cancellable: false
    }),
    [LOCO.ROLL]: Object.freeze({
        clip: 'roll', cycle: 0.50, speed: 5.0, commitment: 0.85, cancellable: false
    })
});

/**
 * Umbrales de tiempo para leer un TOQUE frente a una pulsacion mantenida (s).
 *
 * POR QUE ESTOS NUMEROS
 *   - TAP_MAX por debajo de 0,18 s es un toque. Por encima, ya es intencion de
 *     andar, aunque el jugador suelte pronto.
 *   - LONG_HOLD a partir de 0,55 s el personaje ya esta acelerando: pasa a
 *     paso largo y luego a carrera. Antes de eso, un paso largo.
 *
 *   Es la misma logica que en cualquier juego de pelea, y se nota: tocar y
 *   mantener se sienten distintos sin que el jugador tenga que aprender nada
 *   nuevo, porque es lo que ya espera de un mando.
 */
export const TAP = Object.freeze({
    TAP_MAX: 0.18,        // por debajo: toque (paso)
    LONG_HOLD: 0.55,      // a partir de aqui: acelerando
    RUN_HOLD: 1.10,       // a partir de aqui: carrera
    DOUBLE_TAP_WINDOW: 0.26,  // segundo toque: dash
    TAP_STEP_MIN: 0.10    // por debajo: ni es paso, se ignora
});

// ===========================================================================
// 2. ATAQUES CORRIENDO  (NO son choques)
//
// Un ataque corriendo tiene tres ventanas, y esto es lo que lo hace un ataque
// y no un golpe suelto:
//   ARRANCQUE ... el golpe aun no sale. Aqui se puede cancelar.
//   CARGA ..... estas cargando. Cuanto mas cargas, mas dano y mas alcance.
//   ACTIVO .... sale. Bloqueable, como cualquier golpe.
//
// ===========================================================================

export const RUN_ATTACK = Object.freeze({
    /** Puño cargado corriendo: si conecta, derriba. */
    CHARGE_PUNCH: 'CHARGE_PUNCH',
    /** Carga de hombro: manda lejos. */
    SHOULDER_CHARGE: 'SHOULDER_CHARGE',
    /** Rodada por el suelo a las piernas: agarra. */
    LEG_GRAB: 'LEG_GRAB',
    /** Salto al cuello: agarra. */
    NECK_GRAB: 'NECK_GRAB',
    /** Takedown en carrera: agarra y tira. */
    TAKEDOWN_RUN: 'TAKEDOWN_RUN'
});

/** Las tres ventanas de un ataque corriendo, en segundos. */
export const RUN_PHASE = Object.freeze({
    WINDUP: 'WINDUP',   // arrancque: cancelable
    CHARGE: 'CHARGE',   // cargando
    ACTIVE: 'ACTIVE'    // sale
});

/**
 * Cada ataque corriendo: ventanas, bloqueo, a que pega y que animacion.
 *
 * `startup/active/recovery` en segundos. `charge` es cuanto puede cargar antes
 * de que salga solo.
 *
 * NOTAS DE DISENO
 *   - La CARGA PUNCH se bloquea como cualquier golpe, pero si conecta DERRIBA:
 *     esa es su razon de ser. El jugador asume que puede ser bloqueado a
 *     cambio de que si acierta, tumbe.
 *   - La CARGA DE HOMBRO se puede BLOQUEAR pero mandando a volar al que la
 *     recibe: el bloqueo no la anula, la castiga. Asi el ataque mas fuerte
 *     tambien es el mas arriesgado.
 *   - Los agarres (rodada, cuello, takedown) NO se pueden bloquear: o fallas
 *     de cerca o se ejecutan. Es la diferencia clasica entre golpe y agarre.
 *   - Un ataque corriendo SALE mas lejos que el mismo golpe de pie: por eso
 *     tiene su propia hitbox y no reutiliza la del estado.
 */
export const RUN_ATTACKS = Object.freeze({
    [RUN_ATTACK.CHARGE_PUNCH]: Object.freeze({
        label: 'Puno cargado',
        command: 'correr + puño (mantener)',
        startup: 0.18, chargeMax: 0.42, active: 0.09, recovery: 0.34,
        clip: 'run_punch', targetHeight: 'torso',
        damage: [8, 18], reach: 1.05,
        blockable: true,
        onHit: 'KNOCKDOWN',
        knockback: 5.5
    }),
    [RUN_ATTACK.SHOULDER_CHARGE]: Object.freeze({
        label: 'Carga de hombro',
        command: 'correr + patada (mantener)',
        startup: 0.24, chargeMax: 0.55, active: 0.14, recovery: 0.46,
        clip: 'shoulder_charge', targetHeight: 'torso',
        damage: [10, 22], reach: 1.15,
        blockable: true,
        onBlock: 'LAUNCH',      // el bloqueo la castiga mandandote a volar
        onHit: 'LAUNCH',
        knockback: 9.0
    }),
    [RUN_ATTACK.LEG_GRAB]: Object.freeze({
        label: 'Rodada a las piernas',
        command: 'correr + abajo (dash bajo)',
        startup: 0.20, chargeMax: 0.0, active: 0.12, recovery: 0.40,
        clip: 'leg_grab', targetHeight: 'piernas',
        damage: [0, 6], reach: 1.0,
        blockable: false,          // es un agarre: no se bloquea
        grapple: 'LEG_GRAB',
        onHit: 'GRAPPLE'
    }),
    [RUN_ATTACK.NECK_GRAB]: Object.freeze({
        label: 'Salto al cuello',
        command: 'correr + arriba (salto hacia el)',
        startup: 0.22, chargeMax: 0.0, active: 0.10, recovery: 0.42,
        clip: 'neck_grab', targetHeight: 'cabeza',
        damage: [0, 4], reach: 1.1,
        blockable: false,
        grapple: 'NECK_GRAB',
        onHit: 'GRAPPLE'
    }),
    [RUN_ATTACK.TAKEDOWN_RUN]: Object.freeze({
        label: 'Takedown en carrera',
        command: 'correr + puño + abajo',
        startup: 0.26, chargeMax: 0.0, active: 0.11, recovery: 0.44,
        clip: 'takedown_run', targetHeight: 'torso',
        damage: [0, 8], reach: 1.2,
        blockable: false,
        grapple: 'TAKEDOWN',
        onHit: 'GRAPPLE'
    })
});

// ===========================================================================
// 3. LECTURA DEL INPUT: que tipo de desplazamiento hay
// ===========================================================================

/**
 * Estado de la lectura del boton de mover. Lo mantiene el motor (o el
 * InputRouter) y se le pasa tal cual a `readLoco`.
 */
export function makeLocoState() {
    return {
        /** true mientras el boton de mover esta pulsado. */
        down: false,
        /** Cuando se pulso por ultima vez. */
        since: -Infinity,
        /** Cuando se solto por ultima vez. */
        releasedAt: -Infinity,
        /** Cuando fue el toque anterior (para el doble toque). */
        lastTapAt: -Infinity,
        /** true si este frame es el frame en que se pulso. */
        justPressed: false,
        /** true si este frame es el frame en que se solto. */
        justReleased: false,
        /** Direccion en el momento de pulsar (para el dash). */
        dir: { x: 0, z: 0 }
    };
}

/**
 * Actualiza la memoria de pulsaciones y devuelve el tipo de desplazamiento.
 *
 * @param {object} st     estado (lo devuelve makeLocoState, se reusa)
 * @param {object} opts
 * @param {boolean} opts.down     el boton esta pulsado AHORA
 * @param {boolean} opts.justDown este frame se acaba de pulsar
 * @param {boolean} opts.justUp   este frame se acaba de soltar
 * @param {number}  opts.time     reloj del juego (s)
 * @param {boolean} [opts.guard]  guardia mantenida
 * @param {object}  [opts.dir]    direccion pulsada
 * @returns {string} una clave de LOCO
 */
export function readLoco(st, opts) {
    const { down, justDown, justUp, time } = opts;
    st.justPressed = !!justDown;
    st.justReleased = !!justUp;
    if (opts.dir) st.dir = opts.dir;

    if (justDown) {
        const gap = time - st.lastTapAt;
        // Doble toque dentro de la ventana = dash.
        if (gap <= TAP.DOUBLE_TAP_WINDOW && st.down === false) {
            st.since = time;
            st.down = true;
            return LOCO.DASH;
        }
        st.since = time;
        st.down = true;
        // Un toque recien salido: todavia no se sabe si va a ser paso o
        // caminata, asi que se devuelve STEP y se corrige en los frames
        // siguientes segun cuanto lo mantenga.
        return LOCO.STEP;
    }

    if (justUp) {
        st.down = false;
        st.releasedAt = time;
        const held = time - st.since;
        if (held >= TAP.TAP_STEP_MIN && held <= TAP.TAP_MAX) {
            st.lastTapAt = time;    // cuenta como toque (para el doble toque)
        }
        return LOCO.IDLE;
    }

    if (!down) return LOCO.IDLE;

    // Mantenido. El tiempo decide el tipo.
    const held = time - st.since;
    if (held >= TAP.RUN_HOLD) return LOCO.RUN;
    if (held >= TAP.LONG_HOLD) return LOCO.STEP_LONG;
    // Entre el toque y el paso largo: sigue siendo paso, y si lo mantiene mas
    // pasara a caminata.
    if (held >= TAP.TAP_MAX) return LOCO.WALK;
    return LOCO.STEP;
}

/**
 * ¿Se puede atacar en este desplazamiento?
 *
 * Un paso NO: te estas ajustando, no quieres comprometerte. La carrera si:
 * los ataques corriendo existen precisamente porque se puede correr Y atacar.
 */
export function canAttackDuring(loco) {
    const t = LOCO_TABLE[loco];
    if (!t) return false;
    return t.commitment >= 0.4;
}

/** ¿Es este un ataque que se puede BLOQUEAR? (los agarres no) */
export function isBlockable(runAttack) {
    const def = RUN_ATTACKS[runAttack];
    return !!(def && def.blockable);
}

/**
 * Dano de un ataque corriendo segun cuanto se haya cargado (0 a 1).
 *
 * Cargar tiene coste: el daño sube, pero el arranque es mas largo y el castigo
 * tambien, asi que cargar a tope no es siempre lo correcto.
 */
export function chargedDamage(runAttack, chargeRatio) {
    const def = RUN_ATTACKS[runAttack];
    if (!def) return 0;
    const c = Math.max(0, Math.min(1, chargeRatio || 0));
    const [min, max] = def.damage;
    return Math.round(min + (max - min) * c);
}

/** Frames (s) de castigo al bloquear un ataque corriendo. */
export function blockPunish(runAttack) {
    const def = RUN_ATTACKS[runAttack];
    return def && def.blockable ? def.recovery : 0;
}

/**
 * ¿Que ataque corriendo sale con esta combinacion?
 * @returns {string|null} clave de RUN_ATTACK, o null si no hay ninguno
 */
export function runAttackFor(attackBtn, guardHeld, downHeld) {
    if (guardHeld) return null;
    if (attackBtn === 'PUNCH') return downHeld ? RUN_ATTACK.TAKEDOWN_RUN : RUN_ATTACK.CHARGE_PUNCH;
    if (attackBtn === 'KICK') return RUN_ATTACK.SHOULDER_CHARGE;
    if (attackBtn === 'DOWN') return RUN_ATTACK.LEG_GRAB;
    if (attackBtn === 'UP') return RUN_ATTACK.NECK_GRAB;
    return null;
}

export default {
    LOCO, LOCO_TABLE, TAP, makeLocoState, readLoco, canAttackDuring,
    RUN_ATTACK, RUN_ATTACKS, RUN_PHASE, runAttackFor,
    isBlockable, chargedDamage, blockPunish
};
