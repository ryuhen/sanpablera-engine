/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · MoveTable.js
 * ----------------------------------------------------------------------------
 * FRAME DATA de cada golpe, en FRAMES a 60 Hz (ver la convencion de
 * Constants.js). Un golpe no es "un estado": es un estado + una tabla de
 * frames + una forma de colision. Separarlo permite que dos personajes
 * compartan el mismo estado ATAQUE_LIGERO y se sientan distintos.
 *
 * Que hay aqui y que no:
 *   - Aqui: timings, dano, hitstun, nivel de impacto, coste/ganancia de
 *     recurso, knockback, cancelabilidad, forma de la hitbox y clips.
 *   - En StateCatalog.js: en que estado entra el golpe, como se sale y que
 *     flags fisicas tiene.
 * ============================================================================
 */
import SPF from './Constants.js';

const { State, HitLevel, GuardHeight, CancelTier, VisualFacing, Phase } = SPF;

/**
 * Normaliza una definicion de golpe y calcula lo derivado. Todo lo derivado
 * (duracion total, id numerico) se calcula UNA vez aqui: si dos sitios tuvieran
 * que sumar startup+active+recovery a mano, tarde o temprano uno se equivoca.
 */
function defineMove(key, def) {
    const move = {
        key,
        label: def.label || key,
        state: def.state,
        phase: def.phase || Phase.GROUND,
        required: Object.freeze({ ...(def.required || {}) }),

        startup: def.startup,
        active: def.active,
        recovery: def.recovery,

        damage: def.damage,
        hitstun: def.hitstun,
        blockstun: def.blockstun,
        hitLevel: def.hitLevel || HitLevel.MEDIO,
        // --- Clasificacion del golpe (spec: movimiento estilo Soulcalibur) ---
        // LINEAL: va en linea recta y QUIEN SE MUEVE (paso, dash) lo
        //         esquiva. Es el golpe "castigado" por la movilidad.
        // AREA:   barre un arco o zona y CAZA a quien se esta moviendo:
        //         conecta con aturdimiento (stun) o derribo. Es el castigo
        //         a la movilidad.
        type: def.type || 'LINEAL',
        // Altura del golpe: ALTO (lo esquiva el dash agachado), MEDIO,
        // BAJO y SUELO (los dos ultimos los esquiva el dash saltando).
        height: def.height || 'MEDIO',
        // Altura de guardia que BLOQUEA este golpe. Si el_guardaje del rival es
        // mas bajo, el golpe pasa: es lo que hace que agacharse no baste contra
        // un overhead sin anadir un ataque mas.
        breaksGuardHeight: def.breaksGuardHeight || GuardHeight.ALTA,

        knockdown: def.knockdown || 'NONE',      // NONE | LIGHT | ALWAYS
        launch: Object.freeze({ x: def.launchX || 0, y: def.launchY || 0 }),
        juggleAdd: def.juggleAdd || 0,
        // Frames en los que la FSM "congela" a los dos luchadores al conectar
        // (el hitstop). Es la sensacion de impacto del juego entero.
        hitstop: def.hitstop != null ? def.hitstop : 6,
        freeze: def.freeze || 0,                 // super freeze del especial

        cancelTier: def.cancelTier || CancelTier.LIGHT,
        meterCost: def.meterCost || 0,
        meterGain: def.meterGain || 0,

        hitbox: Object.freeze({
            radius: def.radius || 0.55,
            forward: def.forward != null ? def.forward : 0.55,
            centerY: def.centerY != null ? def.centerY : 1.0
        }),

        // Dos clips por orientacion visual (ver VisualFacing). Es el requisito
        // "normal / agachado / salto con frente y con espalda a camara"
        // resuelto como dato y no duplicando estados.
        clips: Object.freeze({
            [VisualFacing.FRENTE_A_CAMARA]: def.clipFront || (def.clip + '__f'),
            [VisualFacing.ESPALDA_A_CAMARA]: def.clipBack || (def.clip + '__b')
        })
    };

    move.duration = move.startup + move.active + move.recovery;
    // Frame en el que la hitbox se enciende (0-indexado) y en el que se apaga.
    move.activeStart = move.startup;
    move.activeEnd = move.startup + move.active - 1;
    return Object.freeze(move);
}

/**
 * ============================================================================
 * LOS GOLPES POR DIRECCION (core/directionMatrix.js los decide)
 * ============================================================================
 *
 * POR QUE UN ESCRITOR COMPACTO Y NO 45 LLAMADAS A `defineMove`
 *   Los 45 golpes de la matriz se parecen en su forma y se diferencian en los
 *   numeros: todos tienen hitbox, todos tienen hitstop, y lo que cambia de uno
 *   a otro son los frames, el dano y a que altura pegan. Escritos con
 *   `defineMove` a mano serian 45 bloques de catorce lineas en los que la
 *   mitad es siempre identica, y comparar dos golpes exigia buscar en dos
 *   sitios distintos. Aqui cabe UN golpe en una linea, que es como se lee de
 *   verdad: de un vistazo se comparan los frames de las ocho direcciones.
 *
 * LA JERARQUIA DE FUERZA (lo que hace que las direcciones importen)
 *   Los cuatro golpes que ya existian son el 0: el jab es el mas rapido y el
 *   mas flojo, el pesado el mas lento y el mas fuerte. A partir de ahi, cada
 *   direccion pega MAS que la anterior y llega mas lejos, y las diagonales
 *   mandan sobre las cardinales. Asi el jugador aprende la cruceta: arriba
 *   golpea mas fuerte que abajo, y en diagonal mas que de lado.
 *
 *   Un golpe nuevo que no encaje en esta escalera no va aqui: va en el
 *   moveset del personaje (`registerMoves`), que es donde viven las
 *   excepciones. Esta tabla es el vocabulario COMUN: lo que cualquiera sabe
 *   hacer con el cuerpo.
 */
function golpe(key, o) {
    return defineMove(key, {
        label: o.label || key,
        state: o.state,
        phase: o.phase,
        startup: o.s, active: o.a, recovery: o.r,
        damage: o.dmg, hitstun: o.hs, blockstun: o.bs,
        hitLevel: o.lv, breaksGuardHeight: o.brk,
        type: o.type, height: o.h,
        knockdown: o.kd, launchX: o.lx, launchY: o.ly, juggleAdd: o.ja,
        cancelTier: o.tier, meterGain: o.mg,
        hitstop: o.hitstop, radius: o.rad, forward: o.fwd, centerY: o.cy,
        clip: o.clip || ('atk_' + key.toLowerCase())
    });
}

/** Golpes de puño: estado de ataque ligero, cancelables en cadena corta. */
const P = State.ATAQUE_LIGERO;
/** Golpes de patada pesada: estado de ataque pesado, premio de meter. */
const K = State.ATAQUE_PESADO;
/** Golpes en el aire: fase aire y su propio estado. */
const A = State.ATAQUE_AEREO;

const DIRECTIONAL_MOVES = {
    // =====================================================================
    // DE PIE · PUÑO
    // =====================================================================
    PUNO_IZQUIERDO: golpe('PUNO_IZQUIERDO', {
        label: 'Izquierdo', state: P,
        s: 5, a: 3, r: 8, dmg: 7, hs: 13, bs: 8,
        tier: 'LIGHT', mg: 8, hitstop: 5, rad: 0.55, fwd: 0.5, cy: 1.15
    }),
    PUNO_DERECHO: golpe('PUNO_DERECHO', {
        label: 'Derecho', state: P,
        s: 6, a: 4, r: 11, dmg: 9, hs: 15, bs: 9,
        tier: 'LIGHT', mg: 10, hitstop: 6, rad: 0.58, fwd: 0.52, cy: 1.15
    }),
    PUNO_ADELANTE_IZQ: golpe('PUNO_ADELANTE_IZQ', {
        label: 'Adelante izq.', state: P,
        s: 5, a: 3, r: 9, dmg: 7, hs: 14, bs: 8,
        tier: 'LIGHT', mg: 9, hitstop: 6, rad: 0.54, fwd: 0.55, cy: 1.2
    }),
    PUNO_ADELANTE_DER: golpe('PUNO_ADELANTE_DER', {
        label: 'Adelante der.', state: P,
        s: 7, a: 4, r: 12, dmg: 10, hs: 16, bs: 10,
        tier: 'LIGHT', mg: 11, hitstop: 7, rad: 0.6, fwd: 0.58, cy: 1.2
    }),
    PUNO_ATRAS_IZQ: golpe('PUNO_ATRAS_IZQ', {
        label: 'Atras izq.', state: P,
        s: 6, a: 3, r: 11, dmg: 8, hs: 15, bs: 9,
        tier: 'LIGHT', mg: 9, hitstop: 7, rad: 0.5, fwd: 0.35, cy: 1.18
    }),
    PUNO_ATRAS_DER: golpe('PUNO_ATRAS_DER', {
        label: 'Atras der.', state: P,
        s: 8, a: 4, r: 14, dmg: 11, hs: 18, bs: 11,
        lv: 'FUERTE', type: 'AREA',
        kd: 'LIGHT', lx: 2.4, ly: 1.8, ja: 1,
        tier: 'HEAVY', mg: 12, hitstop: 9, rad: 0.62, fwd: 0.3, cy: 1.18
    }),

    // =====================================================================
    // DE PIE · PATADA
    // =====================================================================
    PATADA_ATRAS: golpe('PATADA_ATRAS', {
        label: 'Patada atras', state: K,
        s: 8, a: 4, r: 15, dmg: 11, hs: 18, bs: 11,
        tier: 'HEAVY', mg: 11, hitstop: 9, rad: 0.6, fwd: -0.1, cy: 1.0
    }),
    PATADA_LADO_IZQ: golpe('PATADA_LADO_IZQ', {
        label: 'Patada izq.', state: K,
        s: 7, a: 4, r: 14, dmg: 10, hs: 17, bs: 10,
        tier: 'HEAVY', mg: 10, hitstop: 8, rad: 0.58, fwd: 0.1, cy: 1.15
    }),
    PATADA_LADO_DER: golpe('PATADA_LADO_DER', {
        label: 'Patada der.', state: K,
        s: 9, a: 4, r: 16, dmg: 12, hs: 19, bs: 12,
        tier: 'HEAVY', mg: 12, hitstop: 9, rad: 0.62, fwd: 0.12, cy: 1.15
    }),
    PATADA_ALTA_IZQ: golpe('PATADA_ALTA_IZQ', {
        // ALTA y rompe guardia alta: es lo que hace que arriba duela y abajo no.
        label: 'Patada alta izq.', state: K,
        s: 9, a: 4, r: 17, dmg: 12, hs: 20, bs: 12,
        lv: 'FUERTE', brk: 'ALTA', h: 'ALTO',
        kd: 'LIGHT', lx: 2.6, ly: 2.2, ja: 1,
        tier: 'HEAVY', mg: 13, hitstop: 10, rad: 0.65, fwd: 0.45, cy: 1.5
    }),
    PATADA_ALTA_DER: golpe('PATADA_ALTA_DER', {
        label: 'Patada alta der.', state: K,
        s: 11, a: 5, r: 19, dmg: 14, hs: 22, bs: 14,
        lv: 'FUERTE', brk: 'ALTA', h: 'ALTO', type: 'AREA',
        kd: 'LIGHT', lx: 3.4, ly: 2.8, ja: 1,
        tier: 'HEAVY', mg: 15, hitstop: 12, rad: 0.7, fwd: 0.5, cy: 1.5
    }),
    PATADA_SPIN_IZQ: golpe('PATADA_SPIN_IZQ', {
        label: 'Giro izq.', state: K,
        s: 10, a: 4, r: 20, dmg: 12, hs: 20, bs: 12,
        type: 'AREA',
        kd: 'LIGHT', lx: 3.0, ly: 2.0, ja: 1,
        tier: 'HEAVY', mg: 13, hitstop: 11, rad: 0.72, fwd: 0.5, cy: 1.1
    }),
    PATADA_SPIN_DER: golpe('PATADA_SPIN_DER', {
        label: 'Giro der.', state: K,
        s: 12, a: 5, r: 22, dmg: 15, hs: 23, bs: 14,
        lv: 'FUERTE', type: 'AREA',
        kd: 'LIGHT', lx: 4.0, ly: 2.6, ja: 2,
        tier: 'HEAVY', mg: 16, hitstop: 13, rad: 0.78, fwd: 0.55, cy: 1.1
    }),

    // =====================================================================
    // AGACHADO · PUÑO   (todo `height: BAJO`: lo salta el dash)
    // =====================================================================
    PUNO_AGACHADO_ADELANTE: golpe('PUNO_AGACHADO_ADELANTE', {
        label: 'Agach. adelante', state: P,
        s: 5, a: 3, r: 8, dmg: 6, hs: 12, bs: 8,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 7, hitstop: 5, rad: 0.5, fwd: 0.5, cy: 0.42
    }),
    PUNO_AGACHADO_ATRAS: golpe('PUNO_AGACHADO_ATRAS', {
        label: 'Agach. atras', state: P,
        s: 6, a: 3, r: 10, dmg: 7, hs: 13, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 8, hitstop: 6, rad: 0.48, fwd: 0.4, cy: 0.42
    }),
    PUNO_AGACHADO_IZQ: golpe('PUNO_AGACHADO_IZQ', {
        label: 'Agach. izq.', state: P,
        s: 5, a: 3, r: 9, dmg: 6, hs: 13, bs: 8,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 8, hitstop: 5, rad: 0.52, fwd: 0.45, cy: 0.4
    }),
    PUNO_AGACHADO_DER: golpe('PUNO_AGACHADO_DER', {
        label: 'Agach. der.', state: P,
        s: 6, a: 4, r: 11, dmg: 8, hs: 15, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 9, hitstop: 6, rad: 0.55, fwd: 0.48, cy: 0.4
    }),
    PUNO_AGACHADO_ADELANTE_IZQ: golpe('PUNO_AGACHADO_ADELANTE_IZQ', {
        label: 'Agach. adel. izq.', state: P,
        s: 6, a: 3, r: 11, dmg: 7, hs: 14, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 8, hitstop: 6, rad: 0.52, fwd: 0.5, cy: 0.45
    }),
    PUNO_AGACHADO_ADELANTE_DER: golpe('PUNO_AGACHADO_ADELANTE_DER', {
        label: 'Agach. adel. der.', state: P,
        s: 7, a: 4, r: 12, dmg: 9, hs: 16, bs: 10,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 10, hitstop: 7, rad: 0.56, fwd: 0.52, cy: 0.45
    }),
    PUNO_AGACHADO_ATRAS_IZQ: golpe('PUNO_AGACHADO_ATRAS_IZQ', {
        label: 'Agach. atr. izq.', state: P,
        s: 7, a: 3, r: 12, dmg: 8, hs: 15, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 9, hitstop: 7, rad: 0.46, fwd: 0.35, cy: 0.4
    }),
    PUNO_AGACHADO_ATRAS_DER: golpe('PUNO_AGACHADO_ATRAS_DER', {
        label: 'Agach. atr. der.', state: P,
        s: 8, a: 4, r: 14, dmg: 10, hs: 17, bs: 11,
        lv: 'FUERTE', brk: 'BAJA', h: 'BAJO', type: 'AREA',
        kd: 'LIGHT', lx: 2.0, ly: 1.2, ja: 1,
        tier: 'HEAVY', mg: 11, hitstop: 9, rad: 0.6, fwd: 0.3, cy: 0.4
    }),

    // =====================================================================
    // AGACHADO · PATADA
    // =====================================================================
    PATADA_AGACHADA: golpe('PATADA_AGACHADA', {
        label: 'Patada agach.', state: K,
        s: 6, a: 3, r: 10, dmg: 7, hs: 13, bs: 8,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 8, hitstop: 6, rad: 0.52, fwd: 0.55, cy: 0.35
    }),
    PATADA_AGACHADA_ATRAS: golpe('PATADA_AGACHADA_ATRAS', {
        label: 'Patada ag. atras', state: K,
        s: 7, a: 3, r: 13, dmg: 8, hs: 14, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 9, hitstop: 7, rad: 0.5, fwd: -0.05, cy: 0.35
    }),
    PATADA_BAJA_IZQ: golpe('PATADA_BAJA_IZQ', {
        label: 'Patada baja izq.', state: K,
        s: 6, a: 3, r: 11, dmg: 7, hs: 13, bs: 8,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'LIGHT', mg: 8, hitstop: 6, rad: 0.55, fwd: 0.2, cy: 0.3
    }),
    PATADA_BAJA_DER: golpe('PATADA_BAJA_DER', {
        label: 'Patada baja der.', state: K,
        s: 7, a: 4, r: 13, dmg: 9, hs: 15, bs: 9,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        tier: 'HEAVY', mg: 10, hitstop: 7, rad: 0.58, fwd: 0.22, cy: 0.3
    }),
    PATADA_BAJA_ALTA_IZQ: golpe('PATADA_BAJA_ALTA_IZQ', {
        // La unica del agachado que SUBE: rompe la guardia baja porque va a
        // media altura. Es la respuesta a que agacharse sea gratis.
        label: 'Patada subiendo izq.', state: K,
        s: 7, a: 4, r: 12, dmg: 9, hs: 16, bs: 10,
        lv: 'MEDIO', brk: 'BAJA', h: 'MEDIO',
        tier: 'HEAVY', mg: 11, hitstop: 8, rad: 0.56, fwd: 0.5, cy: 0.95
    }),
    PATADA_BAJA_ALTA_DER: golpe('PATADA_BAJA_ALTA_DER', {
        label: 'Patada subiendo der.', state: K,
        s: 8, a: 4, r: 14, dmg: 11, hs: 18, bs: 11,
        lv: 'FUERTE', brk: 'BAJA', h: 'MEDIO', type: 'AREA',
        kd: 'LIGHT', lx: 2.2, ly: 2.4, ja: 1,
        tier: 'HEAVY', mg: 13, hitstop: 10, rad: 0.6, fwd: 0.52, cy: 0.95
    }),
    BARRIDO_IZQ: golpe('BARRIDO_IZQ', {
        label: 'Barrido izq.', state: K,
        s: 9, a: 4, r: 20, dmg: 8, hs: 0, bs: 10,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        kd: 'ALWAYS', lx: 1.1, ly: 0,
        tier: 'HEAVY', mg: 10, hitstop: 8, rad: 0.82, fwd: 0.7, cy: 0.2
    }),
    BARRIDO_DER: golpe('BARRIDO_DER', {
        label: 'Barrido der.', state: K,
        s: 10, a: 5, r: 22, dmg: 10, hs: 0, bs: 12,
        lv: 'BAJO', brk: 'BAJA', h: 'BAJO',
        kd: 'ALWAYS', lx: 1.4, ly: 0,
        tier: 'HEAVY', mg: 12, hitstop: 9, rad: 0.86, fwd: 0.72, cy: 0.2
    }),

    // =====================================================================
    // EN EL AIRE
    // =====================================================================
    PATADA_AEREA: golpe('PATADA_AEREA', {
        label: 'Patada aerea', state: A, phase: Phase.AIR,
        s: 7, a: 6, r: 9, dmg: 11, hs: 17, bs: 10,
        tier: 'HEAVY', mg: 11, hitstop: 8, rad: 0.6, fwd: 0.55, cy: 0.2
    }),
    PUNO_AEREO_ADELANTE: golpe('PUNO_AEREO_ADELANTE', {
        label: 'Aereo adelante', state: A, phase: Phase.AIR,
        s: 5, a: 5, r: 7, dmg: 9, hs: 16, bs: 9,
        tier: 'LIGHT', mg: 10, hitstop: 6, rad: 0.55, fwd: 0.5, cy: 0.2
    }),
    PUNO_AEREO_ATRAS: golpe('PUNO_AEREO_ATRAS', {
        label: 'Aereo atras', state: A, phase: Phase.AIR,
        s: 6, a: 5, r: 9, dmg: 10, hs: 17, bs: 10,
        tier: 'LIGHT', mg: 10, hitstop: 7, rad: 0.5, fwd: 0.35, cy: 0.2
    }),
    PUNO_AEREO_IZQ: golpe('PUNO_AEREO_IZQ', {
        label: 'Aereo izq.', state: A, phase: Phase.AIR,
        s: 5, a: 5, r: 8, dmg: 9, hs: 16, bs: 9,
        tier: 'LIGHT', mg: 10, hitstop: 6, rad: 0.55, fwd: 0.4, cy: 0.2
    }),
    PUNO_AEREO_DER: golpe('PUNO_AEREO_DER', {
        label: 'Aereo der.', state: A, phase: Phase.AIR,
        s: 6, a: 6, r: 9, dmg: 11, hs: 18, bs: 10,
        tier: 'LIGHT', mg: 11, hitstop: 7, rad: 0.58, fwd: 0.42, cy: 0.2
    }),
    PUNO_AEREO_ADELANTE_IZQ: golpe('PUNO_AEREO_ADELANTE_IZQ', {
        label: 'Aereo adel. izq.', state: A, phase: Phase.AIR,
        s: 6, a: 5, r: 10, dmg: 10, hs: 17, bs: 10,
        tier: 'LIGHT', mg: 11, hitstop: 7, rad: 0.56, fwd: 0.5, cy: 0.2
    }),
    PUNO_AEREO_ADELANTE_DER: golpe('PUNO_AEREO_ADELANTE_DER', {
        label: 'Aereo adel. der.', state: A, phase: Phase.AIR,
        s: 7, a: 6, r: 10, dmg: 12, hs: 19, bs: 11,
        tier: 'HEAVY', mg: 12, hitstop: 8, rad: 0.6, fwd: 0.52, cy: 0.2
    }),
    PUNO_AEREO_ATRAS_IZQ: golpe('PUNO_AEREO_ATRAS_IZQ', {
        label: 'Aereo atr. izq.', state: A, phase: Phase.AIR,
        s: 7, a: 5, r: 10, dmg: 11, hs: 18, bs: 10,
        tier: 'LIGHT', mg: 11, hitstop: 8, rad: 0.5, fwd: 0.3, cy: 0.2
    }),
    PUNO_AEREO_ATRAS_DER: golpe('PUNO_AEREO_ATRAS_DER', {
        label: 'Aereo atr. der.', state: A, phase: Phase.AIR,
        s: 8, a: 6, r: 11, dmg: 13, hs: 20, bs: 12,
        lv: 'FUERTE', brk: 'ALTA',
        kd: 'LIGHT', lx: 2.2, ly: 1.6, ja: 1,
        tier: 'HEAVY', mg: 13, hitstop: 9, rad: 0.62, fwd: 0.25, cy: 0.2
    }),
    PATADA_AEREA_ADELANTE: golpe('PATADA_AEREA_ADELANTE', {
        label: 'Patada aerea adel.', state: A, phase: Phase.AIR,
        s: 7, a: 6, r: 10, dmg: 12, hs: 19, bs: 11,
        tier: 'HEAVY', mg: 12, hitstop: 8, rad: 0.62, fwd: 0.55, cy: 0.2
    }),
    PATADA_AEREA_ATRAS: golpe('PATADA_AEREA_ATRAS', {
        label: 'Patada aerea atras', state: A, phase: Phase.AIR,
        s: 8, a: 6, r: 11, dmg: 12, hs: 19, bs: 11,
        tier: 'HEAVY', mg: 12, hitstop: 8, rad: 0.58, fwd: -0.1, cy: 0.2
    }),
    PATADA_AEREA_IZQ: golpe('PATADA_AEREA_IZQ', {
        label: 'Patada aerea izq.', state: A, phase: Phase.AIR,
        s: 8, a: 6, r: 10, dmg: 11, hs: 18, bs: 10,
        tier: 'HEAVY', mg: 11, hitstop: 8, rad: 0.6, fwd: 0.2, cy: 0.2
    }),
    PATADA_AEREA_DER: golpe('PATADA_AEREA_DER', {
        label: 'Patada aerea der.', state: A, phase: Phase.AIR,
        s: 9, a: 7, r: 11, dmg: 13, hs: 20, bs: 12,
        tier: 'HEAVY', mg: 13, hitstop: 9, rad: 0.64, fwd: 0.22, cy: 0.2
    }),
    PATADA_AEREA_ALTA_IZQ: golpe('PATADA_AEREA_ALTA_IZQ', {
        label: 'Patada aerea alta izq.', state: A, phase: Phase.AIR,
        s: 9, a: 6, r: 12, dmg: 12, hs: 20, bs: 12,
        lv: 'FUERTE', brk: 'ALTA', h: 'ALTO',
        tier: 'HEAVY', mg: 13, hitstop: 9, rad: 0.66, fwd: 0.45, cy: 0.5
    }),
    PATADA_AEREA_ALTA_DER: golpe('PATADA_AEREA_ALTA_DER', {
        label: 'Patada aerea alta der.', state: A, phase: Phase.AIR,
        s: 10, a: 7, r: 13, dmg: 14, hs: 22, bs: 13,
        lv: 'FUERTE', brk: 'ALTA', h: 'ALTO', type: 'AREA',
        kd: 'LIGHT', lx: 2.6, ly: 2.2, ja: 1,
        tier: 'HEAVY', mg: 15, hitstop: 11, rad: 0.7, fwd: 0.48, cy: 0.5
    }),
    PATADA_AEREO_SPIN_IZQ: golpe('PATADA_AEREO_SPIN_IZQ', {
        label: 'Giro aereo izq.', state: A, phase: Phase.AIR,
        s: 10, a: 6, r: 13, dmg: 12, hs: 20, bs: 12,
        type: 'AREA',
        kd: 'LIGHT', lx: 2.4, ly: 1.8, ja: 1,
        tier: 'HEAVY', mg: 13, hitstop: 10, rad: 0.74, fwd: 0.5, cy: 0.2
    }),
    PATADA_AEREO_SPIN_DER: golpe('PATADA_AEREO_SPIN_DER', {
        // El golpe mas fuerte de la matriz y el que mas tarda: 18 frames de
        // startup. Si conecta, el rival sale volando y el atacante tiene
        // recuperacion de sobra. Pagar 18 frames a cambio es la pregunta que
        // el jugador tiene que hacerse, y por eso es el ultimo.
        label: 'Giro aereo der.', state: A, phase: Phase.AIR,
        s: 11, a: 7, r: 14, dmg: 15, hs: 24, bs: 14,
        lv: 'FUERTE', brk: 'ALTA', type: 'AREA',
        kd: 'ALWAYS', lx: 3.6, ly: 3.0, ja: 2,
        tier: 'HEAVY', mg: 16, hitstop: 13, rad: 0.8, fwd: 0.55, cy: 0.2
    })
};

/**
 * Set base del juego. Cualquier personaje arranca con esto y encima le anade
 * (o sustituye) sus golpes propios via registerMoves().
 */
const CORE_MOVES = {
    ...DIRECTIONAL_MOVES,

    ATAQUE_LIGERO: defineMove('ATAQUE_LIGERO', {
        label: 'Ligero', state: State.ATAQUE_LIGERO,
        startup: 4, active: 3, recovery: 7,
        damage: 6, hitstun: 12, blockstun: 8,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',   // directo: lo esquiva el paso
        cancelTier: CancelTier.LIGHT, meterGain: 8, meterCost: 0,
        hitstop: 5, radius: 0.5, forward: 0.5, centerY: 1.15,
        clip: 'atk_light'
    }),

    ATAQUE_PESADO: defineMove('ATAQUE_PESADO', {
        label: 'Pesado', state: State.ATAQUE_PESADO,
        startup: 9, active: 4, recovery: 18,
        damage: 14, hitstun: 20, blockstun: 12,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',     // barre arco: caza al que se mueve
        knockdown: 'LIGHT', launchX: 3.2, launchY: 2.6, juggleAdd: 1,
        cancelTier: CancelTier.HEAVY, meterGain: 12, meterCost: 0,
        hitstop: 10, radius: 0.72, forward: 0.7, centerY: 1.05,
        clip: 'atk_heavy'
    }),

    ATAQUE_ESPECIAL: defineMove('ATAQUE_ESPECIAL', {
        label: 'Especial', state: State.ATAQUE_ESPECIAL,
        required: { meter: 25 },
        startup: 11, active: 6, recovery: 26,
        damage: 22, hitstun: 26, blockstun: 14,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',     // onda: caza al que se mueve
        knockdown: 'ALWAYS', launchX: 6.5, launchY: 4.2, juggleAdd: 2,
        cancelTier: CancelTier.SPECIAL, meterCost: 25, meterGain: 0,
        hitstop: 14, freeze: 48, radius: 0.85, forward: 0.9, centerY: 1.1,
        clip: 'atk_special'
    }),

    // Golpe en el aire. El unico que puede conectar mientras se esta en JUGGLER,
    // y por eso el unico que suma juggle.
    ATAQUE_AEREO: defineMove('ATAQUE_AEREO', {
        label: 'Aereo', state: State.ATAQUE_AEREO,
        phase: Phase.AIR,
        startup: 5, active: 6, recovery: 8,
        damage: 9, hitstun: 16, blockstun: 9,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',   // directo en el aire
        launchX: 1.4, launchY: 2.2, juggleAdd: 1,
        cancelTier: CancelTier.LIGHT, meterGain: 10, meterCost: 0,
        hitstop: 6, radius: 0.55, forward: 0.5, centerY: 0.2,
        clip: 'atk_air'
    }),

    ATAQUE_AGACHADO: defineMove('ATAQUE_AGACHADO', {
        label: 'Agachado', state: State.ATAQUE_LIGERO,
        startup: 5, active: 3, recovery: 9,
        damage: 5, hitstun: 11, blockstun: 8,
        hitLevel: HitLevel.BAJO, breaksGuardHeight: GuardHeight.BAJA,
        type: 'LINEAL', height: 'BAJO',    // corto y bajo: lo salta el dash
        cancelTier: CancelTier.LIGHT, meterGain: 6, meterCost: 0,
        hitstop: 4, radius: 0.5, forward: 0.45, centerY: 0.42,
        clip: 'atk_crouch'
    }),

    // Barrido: el unico golpe BAJO con launch, por eso derriba. Lanza al
    // estado de suelo con la orientacion de cabeza al rival.
    ATAQUE_BARRIDO: defineMove('ATAQUE_BARRIDO', {
        label: 'Barrido', state: State.ATAQUE_PESADO,
        startup: 8, active: 4, recovery: 22,
        damage: 8, hitstun: 0, blockstun: 10,
        hitLevel: HitLevel.BAJO, breaksGuardHeight: GuardHeight.BAJA,
        type: 'LINEAL', height: 'BAJO',    // rasante: lo salta el dash
        knockdown: 'ALWAYS', launchX: 1.1, launchY: 0,
        cancelTier: CancelTier.HEAVY, meterGain: 10, meterCost: 0,
        hitstop: 8, radius: 0.8, forward: 0.75, centerY: 0.22,
        clip: 'atk_sweep'
    }),

    // Derivada tecnica: solo sale desde POSTURA_DERIVADA_TECNICA (la ventana
    // tecnica) y es el final de la cadena de cancelacion (CancelTier.TECHNIQUE).
    DERIVADA_TECNICA: defineMove('DERIVADA_TECNICA', {
        label: 'Derivada', state: State.ATAQUE_ESPECIAL,
        required: { stance: 'POSTURA_DERIVADA_TECNICA' },
        startup: 6, active: 5, recovery: 20,
        damage: 18, hitstun: 30, blockstun: 10,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',     // cierra el espacio: caza
        knockdown: 'ALWAYS', launchX: 5.0, launchY: 5.0, juggleAdd: 3,
        cancelTier: CancelTier.TECHNIQUE, meterCost: 0, meterGain: 0,
        hitstop: 16, freeze: 30, radius: 0.8, forward: 0.85, centerY: 1.0,
        clip: 'tech_derived'
    })
};

/**
 * Registro de golpes por personaje. `base` es el set comun; cada personaje
 * registra encima su set propio y el que comparte keys con el base lo SUSTITUYE
 * (override) o lo usa si no existe (add).
 *
 *   registerMoves('PEDRO', {
 *     ATAQUE_ESPECIAL: { ...def, label: 'Botellazo' }   // override
 *     GANCHO: defineMove('GANCHO', { ... })             // add
 *   });
 */
const characterMoves = new Map();

function registerMoves(characterId, moves) {
    const set = characterMoves.get(characterId) || Object.create(null);
    for (const key of Object.keys(moves)) {
        set[key] = moves[key].duration
            ? moves[key]
            : defineMove(key, moves[key]);
    }
    characterMoves.set(characterId, Object.freeze(set));
    return set;
}

function getMoves(characterId) {
    return Object.freeze({
        ...CORE_MOVES,
        ...(characterMoves.get(characterId) || {})
    });
}

/**
 * ¿El personaje define EL PROPIO golpe (no el base)? Es la
 * pregunta que hacen las reglas de alcance: un moveset amplia
 * el vocabulario solo con lo que define; lo que no define lo
 * resuelve el set base.
 */
function hasMove(characterId, key) {
    const set = characterMoves.get(characterId);
    return !!(set && set[key]);
}

function getMove(characterId, key) {
    const set = characterMoves.get(characterId);
    return (set && set[key]) || CORE_MOVES[key] || null;
}

export {
    CORE_MOVES,
    defineMove,
    registerMoves,
    getMoves,
    getMove,
    hasMove
};

export default {
    CORE_MOVES,
    defineMove,
    registerMoves,
    getMoves,
    getMove,
    hasMove
};