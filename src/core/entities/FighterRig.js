/**
 * ============================================================================
 * SANPABLERA ENGINE · entities/FighterRig.js
 * ----------------------------------------------------------------------------
 * Del ESTADO DE COMBATE a la POSE DEL RIG. Este es el "motor de
 * animacion procedural": no hay clips que reproducir, cada pose se
 * RESUELVE cada frame con IK sobre el rig numerico (cine/Rig.js).
 *
 * POR QUE ES UN ARCHIVO SEPARADO Y PURO
 *   El catalogo de la FSM (StateCatalog.js) ya lo anunciaba: cada
 *   estado lleva `posture` (cadera, torso, limbs) y el archivo que
 *   lo convierte en numeros de huesos vivia aqui. Al ser puro (solo
 *   importa cine/*), se testea en Node sin Babylon: una patada se
 *   comprueba leyendo la FK de la pose, sin abrir el navegador.
 *
 * QUE RESUELVE
 *   posturePose  .. la postura de cualquier estado (de pie, agachado,
 *                 guardia, cuadrupeda...) con los pies CLAVADOS en el
 *                 suelo por IK. Es Stances.js generalizada: en vez de
 *                 4 posturas escritas a mano, cualquier `posture` del
 *                 catalogo tiene su pose.
 *   attackPose   .. un golpe en sus 3 fases (startup / active /
 *                 recovery). El brazo o la pierna van a objetivos
 *                 clave interpolados con easing; el torso acompana
 *                 (giro en el puñetazo, volcado atras en la patada).
 *   flinchPose   .. reaccion a un golpe recibido (tropezon/hitstun).
 *   downPose     .. cuerpo en el suelo (boca arriba / abajo, con el
 *                 eje del knockdown: 0, 45, 135 o 180 grados).
 *   floatPose    .. aire (juggle, caida): piernas recogidas, sin pies
 *                 plantados porque NO hay suelo bajo los pies.
 *   poseFor      .. el dispatcher: mira un "snapshot" de la FSM (datos
 *                 planos, no la FSM) y elige la de arriba.
 *
 * ESTILOS (el abanico de tecnicas)
 *   El mismo estado con un estilo distinto se ve distinto: `opts.style`
 *   modula la postura base (mas guardia, mas agachado...). El estilo
 *   TAUNT es la pose de "baile": brazos arriba y balanceo.
 * ============================================================================
 */
import { stancePose } from '../cine/Stances.js';
import { createPose, setPos, setEuler } from '../cine/Pose.js';
import { fk, solveTwoBone, placeFoot } from '../cine/Rig.js';
import { ease, clamp01, lerp, vlerp } from '../cine/Math3.js';

/**
 * Postura base por "limbs" (el identificador de pose del catalogo de
 * la FSM), expresada como spec de Stances.js. `crouch` y `lean` se
 * derivan de la cadera y el torso que YA trae el estado: por eso no
 * hace falta escribir cada postura a mano.
 */
const LIMB_SPECS = Object.freeze({
    STAND:   Object.freeze({ spread: 0.46, lead: 0.09, lean: 3,  guard: 0.55, crouch: 0.055 }),
    BRACE:   Object.freeze({ spread: 0.40, lead: 0.12, lean: 5,  guard: 1.00, crouch: 0.085 }),
    CROUCH:  Object.freeze({ spread: 0.56, lead: 0.06, lean: 9,  guard: 0.75, crouch: 0.260 }),
    QUAD:    Object.freeze({ spread: 0.60, lead: 0.02, lean: 22, guard: 0.30, crouch: 0.500 }),
    KNEEL:   Object.freeze({ spread: 0.44, lead: 0.05, lean: 6,  guard: 0.45, crouch: 0.400 }),
    STAGGER: Object.freeze({ spread: 0.52, lead: 0.04, lean: -12, guard: 0.10, crouch: 0.100 }),
    ROLL:    Object.freeze({ spread: 0.42, lead: 0.06, lean: 12, guard: 0.20, crouch: 0.340 }),
    FLOAT:   Object.freeze({ spread: 0.40, lead: 0.08, lean: 4,  guard: 0.35, crouch: 0.150 })
});

/** Brazos en guardia segun la altura de guardia [L, R] ([fwd, up, open]). */
function handsFor(guard) {
    const fwd = 0.10 + guard * 0.12;
    const open = 0.26 + guard * 0.28;
    return [
        [fwd, 0.60 + guard * 0.40, open],
        [fwd - 0.02, 0.58 + guard * 0.40, -open]
    ];
}

/** Moduladores de estilo: la misma postura se ve distinta por estilo. */
const STYLE_MODS = Object.freeze({
    IDLE:      Object.freeze({}),
    GUARD:     Object.freeze({ guardBonus: 0.18, spreadBonus: -0.04, crouchBonus: 0.02 }),
    PRESSING:  Object.freeze({ leanBonus: 4, crouchBonus: 0.025, leadBonus: 0.03 }),
    DEFENSIVE: Object.freeze({ guardBonus: 0.12, crouchBonus: 0.035, spreadBonus: 0.06 }),
    TAUNT:     Object.freeze({ guard: 0 })   // la pose de baile: brazos arriba
});

/**
 * Posturas de los ESTADOS DE MOVIMIENTO (la maquina de locomocion de
 * FighterEntity: paso -> caminar -> correr, dash, cuadripedia...).
 * Mientras la FSM esta en un estado base (NORMAL_A) es esta tabla la
 * que decide la pose; el catalogo de la FSM solo aporta el "aspecto"
 * de los estados de combate (golpes, guardias, impactos).
 *
 * Convencion (ver Stances.js): `limbs` elige la familia, `hipY` la
 * altura de cadera (menor = mas agachado) y `spinePitch` el volcado
 * hacia delante. El `paso` es la animacion inicial de cualquier
 * movimiento: ligero volcado y cadera baja, listo para esquivar.
 */
export const LOCO_POSTURES = Object.freeze({
    IDLE:       Object.freeze({ limbs: 'STAND', hipY: 0.92, spinePitch: 0.04 }),
    STEP:       Object.freeze({ limbs: 'STAND', hipY: 0.88, spinePitch: 0.12, headPitch: 0.05 }),
    WALK:       Object.freeze({ limbs: 'STAND', hipY: 0.90, spinePitch: 0.08 }),
    RUN:        Object.freeze({ limbs: 'STAND', hipY: 0.97, spinePitch: 0.24, lean: 0.14 }),
    DASH:       Object.freeze({ limbs: 'STAND', hipY: 0.90, spinePitch: 0.36, lean: 0.24 }),
    CROUCH_DASH:Object.freeze({ limbs: 'CROUCH', hipY: 0.60, spinePitch: 0.40 }),
    JUMP_DASH:  Object.freeze({ limbs: 'FLOAT', hipY: 0.78, spinePitch: 0.16 }),
    QUAD:       Object.freeze({ limbs: 'QUAD', hipY: 0.34, spinePitch: 0.72 }),
    SLIDE:      Object.freeze({ limbs: 'CROUCH', hipY: 0.34, spinePitch: 0.20 })
});

/** Sin modificadores de movimiento (neutro). */
const ZERO_LOCO_MOD = Object.freeze({ lean: 0, reach: 0, twist: 0 });

/**
 * Acompanamiento del golpe segun el ESTADO DE MOVIMIENTO en que se
 * ejecuta: el mismo puño se ve distinto en caminata, carrera o dash
 * (mas volcado, mas alcance, mas giro). Es la semilla del "cada estado
 * tiene su moveset": los datos numericos del golpe siguen siendo los
 * de MoveTable, pero la ANIMACION del estado acompana.
 */
const ATTACK_LOCO_MODS = Object.freeze({
    WALK:        Object.freeze({ lean: 0.05, reach: 0.00, twist: 0.00 }),
    RUN:         Object.freeze({ lean: 0.16, reach: 0.07, twist: 0.12 }),
    DASH:        Object.freeze({ lean: 0.24, reach: 0.12, twist: 0.22 }),
    CROUCH_DASH: Object.freeze({ lean: 0.10, reach: 0.04, twist: 0.06 }),
    JUMP_DASH:   Object.freeze({ lean: 0.08, reach: 0.05, twist: 0.08 })
});

/**
 * Pose de un estado de locomocion (pies plantados, como toda postura
 * de suelo).
 */
export function locoPose(rig, locoState, opts = {}) {
    const posture = LOCO_POSTURES[locoState] || LOCO_POSTURES.IDLE;
    return posturePose(rig, posture, opts);
}

/**
 * Brazos por postura de boxeo (core/boxing.js). Cada `arms` de la
 * postura apunta a una de estas: donde caen las manos y cuanto
 * se hunde o levanta la cadera. Es la lectura a un golpe de vista
 * de si el peleador esta en Shell, en Lead o en Relax.
 */
const STANCE_ARMS = Object.freeze({
    COMPACT: Object.freeze({      // SHELL: codos pegados, rostro tapado
        L: [0.13, 1.34, 0.18], R: [-0.13, 1.34, 0.18]
    }),
    EXTENDED: Object.freeze({    // LEAD: mano de jab adelantada
        L: [0.14, 1.22, 0.68], R: [-0.24, 1.14, 0.12]
    }),
    DROPPED: Object.freeze({     // RELAX: un puno a la altura de la rodilla
        L: [0.24, 0.56, 0.22], R: [-0.20, 1.18, 0.22], hip: -0.04
    }),
    ADVANCED: Object.freeze({    // PRESS: manos en punta, encima del rival
        L: [0.12, 1.30, 0.60], R: [-0.10, 1.32, 0.52]
    }),
    COVER_COUNTER: Object.freeze({   // ABSORB: un brazo cubre, el otro carga
        L: [0.10, 1.36, 0.12], R: [-0.34, 1.06, -0.12]
    }),
    TRAP: Object.freeze({        // CATCH: agarra abajo, cuerpo alzado
        L: [0.26, 0.76, 0.34], R: [-0.22, 0.82, 0.30], hip: 0.03
    })
});

/**
 * Pose de una postura cualquiera del catalogo, con los pies plantados.
 *
 * @param rig     rig numerico (cine/Rig.js)
 * @param posture { limbs, hipY, spinePitch, headPitch } del estado
 * @param opts
 *   style    estilo del peleador (IDLE, GUARD, PRESSING, DEFENSIVE, TAUNT)
 *   forward  +1/-1 hacia donde mira en espacio local
 *   dist     distancia al rival: cuanto mas cerca, mas encimado
 *   time     segundos de vida (para el balanceo del TAUNT)
 * @returns { pose, state, spec } pose de deltas + FK ya calculada
 */
export function posturePose(rig, posture, opts = {}) {
    const p = posture || {};
    const limbs = LIMB_SPECS[p.limbs] ? p.limbs : 'STAND';
    const base = LIMB_SPECS[limbs];
    const mod = STYLE_MODS[opts.style] || STYLE_MODS.IDLE;

    // La cadera del estado manda sobre la flexion (el combate manda).
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.95;
    const wantHip = p.hipY != null ? p.hipY : restHipY;
    const crouch = Math.max(0.02, restHipY - wantHip) + (mod.crouchBonus || 0);

    // Cerca del rival: mas encimado (el boxeo de esquina no es el de
    // medio ring). Efecto sutil: solo ajusta, no decide nada.
    const near = opts.dist != null ? clamp01((0.9 - opts.dist) / 0.9) : 0;

    // --- SILUETA DE POSTURA (arquetipo YUGO) -------------------------
    // Si la entidad pasa opts.stance (core/boxing.js), ESA silueta
    // manda sobre la del estado: es lo que hace que SHELL, LEAD,
    // RELAX... se vean de verdad distintas. La entidad ya ha
    // interpolado el baile, asi que aqui solo llega una silueta.
    const st = opts.stance || null;
    const sil = st && st.silhouette;
    const spread = sil ? sil.spread : base.spread + (mod.spreadBonus || 0);
    const lead = sil ? sil.lead : base.lead + (mod.leadBonus || 0);
    const lean = sil ? sil.lean : base.lean + (mod.leanBonus || 0);
    const guard = clamp01(sil ? sil.guard : base.guard + (mod.guardBonus || 0));

    const spec = Object.freeze({
        spread: Math.max(0.2, spread - near * 0.05),
        lead,
        lean: lean * (1 + near * 0.4),
        guard,
        crouch: Math.min(0.55, crouch + (sil ? (sil.crouch || 0) : 0)),
        hands: handsFor(guard)
    });

    const res = stancePose(rig, spec, { forward: opts.forward === undefined ? 1 : opts.forward });

    // Brazos de la postura: SHELL compacta los codos, LEAD adelanta
    // la mano, RELAX baja un puno a la rodilla, ABSORB cubre con un
    // brazo y guarda el otro para castigar, CATCH agarra abajo...
    if (st && st.arms && STANCE_ARMS[st.arms]) {
        const arms = STANCE_ARMS[st.arms];
        let state = res.state;
        // La postura baja hunde la cadera (RELAX) o la levanta (CATCH).
        if (arms.hip) {
            const cur = res.pose.pos && res.pose.pos.PELVIS ? res.pose.pos.PELVIS : [0, 0, 0];
            setPos(res.pose, 'PELVIS', [cur[0], cur[1] + arms.hip, cur[2]]);
            state = fk(rig, res.pose, state);
        }
        solveTwoBone(rig, res.pose, state, {
            upper: 'UPPERARM_L', lower: 'FOREARM_L', target: arms.L, pole: [1, 0, 0]
        });
        state = fk(rig, res.pose, state);
        solveTwoBone(rig, res.pose, state, {
            upper: 'UPPERARM_R', lower: 'FOREARM_R', target: arms.R, pole: [-1, 0, 0]
        });
        res.state = fk(rig, res.pose, state);
    }

    // TAUNT: la pose de "baile" (el boton multiple la muestra). Los
    // brazos suben y el torso se balancea; no es una postura de combate.
    if (opts.style === 'TAUNT') {
        const t = opts.time || 0;
        const sway = Math.sin(t * 4.5) * 0.07;
        setEuler(res.pose, 'SPINE', 0, sway, 0);
        let state = fk(rig, res.pose, res.state);
        const up = 1.28 + Math.sin(t * 4.5) * 0.09;
        solveTwoBone(rig, res.pose, state, {
            upper: 'UPPERARM_L', lower: 'FOREARM_L',
            target: [0.30, up, 0.10], pole: [1, 0, 0]
        });
        state = fk(rig, res.pose, state);
        solveTwoBone(rig, res.pose, state, {
            upper: 'UPPERARM_R', lower: 'FOREARM_R',
            target: [-0.30, up, 0.10], pole: [-1, 0, 0]
        });
        res.state = fk(rig, res.pose, state);
    }
    return res;
}

// ===========================================================================
// ATAQUES
// ===========================================================================

/**
 * Golpes procedurales. Cada uno define, en espacio de personaje (Y arriba,
 * Z hacia el rival), el objetivo del miembro de golpe en cada fase:
 *   home     guardia (donde esta antes y despues)
 *   startup  amago (el golpe aun no salio)
 *   active   extension maxima (la hitbox se enciende aqui)
 * Y como acompana el torso (twist = giro sobre Y, pitch = volcado hacia
 * delante, con la convencion de Stances.js: positivo = hacia el rival).
 */
const ATTACK_KEYS = Object.freeze({
    ATAQUE_LIGERO: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.14, 1.04, 0.05],
        active: [0.02, 1.28, 0.90],
        twist: Object.freeze({ startup: -0.15, active: 0.48, recovery: 0 })
    }),
    GOLPE_CODO: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.30, 1.18, -0.12],
        active: [0.10, 1.34, 0.46],
        twist: Object.freeze({ startup: -0.28, active: 0.58, recovery: 0 })
    }),
    GANCHO: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.34, 1.08, 0.10],
        active: [0.10, 1.14, 0.72],
        twist: Object.freeze({ startup: -0.34, active: 0.66, recovery: 0 })
    }),
    // --- ESTANCIAS DE BOXEO (arquetipo YUGO) -------------------------
    // Los golpes de cada postura tienen silueta propia: el jab
    // largo estira el brazo, el ascendente sube, el costillazo
    // baja al torso y la proyeccion se lanza.
    GOLPE_CORTO: Object.freeze({
        limb: 'arm',
        home: [0.20, 1.22, 0.22],
        startup: [0.12, 1.10, 0.06],
        active: [0.02, 1.30, 0.74],
        twist: Object.freeze({ startup: -0.10, active: 0.40, recovery: 0 })
    }),
    JAB_LARGO: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.16, 1.08, 0.08],
        active: [0.04, 1.20, 1.02],
        twist: Object.freeze({ startup: -0.18, active: 0.34, recovery: 0 })
    }),
    UPPERCUT: Object.freeze({
        limb: 'arm',
        home: [0.20, 1.22, 0.22],
        startup: [0.14, 0.86, 0.02],
        active: [0.04, 1.52, 0.56],
        twist: Object.freeze({ startup: -0.06, active: 0.24, recovery: 0 }),
        pitch: Object.freeze({ startup: 0.16, active: 0.10, recovery: 0 })
    }),
    CRUZADO: Object.freeze({
        limb: 'arm',
        home: [0.24, 1.16, 0.24],
        startup: [0.20, 1.10, -0.06],
        active: [0.06, 1.20, 1.00],
        twist: Object.freeze({ startup: -0.24, active: 0.58, recovery: 0 })
    }),
    RECTO: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.18, 1.06, 0.02],
        active: [0.04, 1.20, 0.88],
        twist: Object.freeze({ startup: -0.20, active: 0.44, recovery: 0 })
    }),
    PATADA_BAJA: Object.freeze({
        limb: 'leg',
        home: [0.20, 0.02, 0.12],
        startup: [0.16, 0.34, 0.02],
        active: [0.02, 0.56, 0.86],
        twist: Object.freeze({ startup: 0.14, active: -0.24, recovery: 0 }),
        hipDrop: 0.10
    }),
    COSTILLAZO: Object.freeze({
        limb: 'arm',
        home: [0.20, 1.16, 0.22],
        startup: [0.16, 0.98, 0.10],
        active: [0.04, 0.86, 0.62],
        twist: Object.freeze({ startup: -0.08, active: 0.30, recovery: 0 }),
        pitch: Object.freeze({ startup: 0.14, active: 0.22, recovery: 0 })
    }),
    PROYECCION: Object.freeze({
        limb: 'lunge',
        home: [0.20, 0.02, 0.12],
        startup: [0.22, 0.10, 0.18],
        active: [0.12, 0.06, 0.72],
        twist: Object.freeze({ startup: 0.14, active: 0.30, recovery: 0 })
    }),
    PATADA_FRONTAL: Object.freeze({
        limb: 'leg',
        home: [0.20, 0.02, 0.12],
        startup: [0.14, 0.30, -0.02],
        active: [0.04, 0.86, 0.86],
        twist: Object.freeze({ startup: 0.08, active: -0.16, recovery: 0 }),
        hipLift: 0.04
    }),
    DERIBO: Object.freeze({
        limb: 'lunge',
        home: [0.20, 0.02, 0.12],
        startup: [0.20, 0.10, 0.24],
        active: [0.16, 0.02, 0.62],
        twist: Object.freeze({ startup: 0.12, active: 0.28, recovery: 0 })
    }),
    SUMISION: Object.freeze({
        limb: 'both',
        home: [[0.26, 1.16, 0.24], [-0.26, 1.16, 0.24]],
        startup: [[0.30, 0.92, 0.16], [-0.30, 0.92, 0.16]],
        active: [[0.22, 0.72, 0.62], [-0.22, 0.72, 0.62]],
        twist: Object.freeze({ startup: 0, active: 0.14, recovery: 0 }),
        pitch: Object.freeze({ startup: 0.22, active: 0.44, recovery: 0 })
    }),
    BARREDO: Object.freeze({
        limb: 'leg',
        home: [0.20, 0.02, 0.12],
        startup: [0.18, 0.38, 0.06],
        active: [0.00, 0.16, 1.02],
        twist: Object.freeze({ startup: 0.20, active: -0.38, recovery: 0 }),
        hipDrop: 0.18
    }),
    ATAQUE_PESADO: Object.freeze({
        limb: 'leg',
        home: [0.20, 0.02, 0.12],
        startup: [0.15, 0.32, -0.04],
        active: [0.03, 0.94, 0.92],
        twist: Object.freeze({ startup: 0.12, active: -0.22, recovery: 0 }),
        hipLift: 0.06
    }),
    ATAQUE_BARRIDO: Object.freeze({
        limb: 'leg',
        home: [0.20, 0.02, 0.12],
        startup: [0.16, 0.36, 0.04],
        active: [0.00, 0.14, 1.00],
        twist: Object.freeze({ startup: 0.18, active: -0.34, recovery: 0 }),
        hipDrop: 0.16
    }),
    ATAQUE_ESPECIAL: Object.freeze({
        limb: 'both',
        home: [[0.26, 1.16, 0.24], [-0.26, 1.16, 0.24]],
        startup: [[0.20, 1.04, 0.08], [-0.20, 1.04, 0.08]],
        active: [[0.14, 1.24, 0.80], [-0.14, 1.24, 0.80]],
        twist: Object.freeze({ startup: 0, active: 0.10, recovery: 0 }),
        pitch: Object.freeze({ startup: 0.10, active: 0.38, recovery: 0 })
    }),
    EMBESTIDA: Object.freeze({
        limb: 'lunge',
        home: [0.20, 0.02, 0.12],
        startup: [0.18, 0.04, 0.20],
        active: [0.14, 0.05, 0.55],
        twist: Object.freeze({ startup: 0.10, active: 0.25, recovery: 0 })
    }),
    DERIVADA_TECNICA: Object.freeze({
        limb: 'arm',
        home: [0.26, 1.16, 0.24],
        startup: [0.10, 1.00, 0.02],
        active: [0.02, 1.32, 0.96],
        twist: Object.freeze({ startup: -0.32, active: 0.72, recovery: 0 })
    })
});

/**
 * Objetivo (o giro) de una fase del golpe, interpolado entre las
 * claves con easing. Las fases son STARTUP -> ACTIVE -> RECOVERY y
 * cada una viaja de su clave a la siguiente (la recovery vuelve a
 * la guardia).
 */
function phaseVec(home, key, phase, t) {
    if (phase === 'STARTUP') return vlerp(home, key.startup, ease('EASE_OUT', t));
    if (phase === 'ACTIVE') return vlerp(key.startup, key.active, ease('EASE_IN', t));
    return vlerp(key.active, home, ease('EASE_IN_OUT', t));
}

function phaseScalar(K, phase, t) {
    if (!K) return 0;
    if (phase === 'STARTUP') return lerp(0, K.startup, ease('EASE_OUT', t));
    if (phase === 'ACTIVE') return lerp(K.startup, K.active, ease('EASE_IN', t));
    return lerp(K.active, 0, ease('EASE_IN_OUT', t));
}

/**
 * Pose de un golpe en su fase actual.
 *
 * @param rig     rig numerico
 * @param moveKey clave de MoveTable (ATAQUE_LIGERO, ATAQUE_PESADO...)
 * @param phase   'STARTUP' | 'ACTIVE' | 'RECOVERY'
 * @param t       progreso 0..1 DENTRO de la fase
 * @param opts    los de posturePose (style, forward, dist, time)
 */
export function attackPose(rig, moveKey, phase, t, opts = {}) {
    const K = ATTACK_KEYS[moveKey] || ATTACK_KEYS.ATAQUE_LIGERO;
    const tt = clamp01(t);

    // El estado de movimiento acompana al golpe (moveset por estado).
    const mod = ATTACK_LOCO_MODS[opts.loco] || ZERO_LOCO_MOD;

    // Base: la postura de combate (guardia), con los pies plantados.
    const base = posturePose(rig, { limbs: 'BRACE', hipY: 0.86, spinePitch: 0.10 }, opts);
    const pose = base.pose;
    let state = base.state;

    // Acompanamiento del torso: giro (puñetazos) o volcado (patadas).
    const twist = phaseScalar(K.twist, phase, tt) + mod.twist;
    const pitch = phaseScalar(K.pitch, phase, tt) + mod.lean;
    if (Math.abs(twist) > 1e-4) {
        setEuler(pose, 'SPINE', 0, twist, 0);
        setEuler(pose, 'CHEST', 0, twist * 0.7, 0);
    }
    if (Math.abs(pitch) > 1e-4) {
        setEuler(pose, 'SPINE', 0, 0, -pitch);
        setEuler(pose, 'CHEST', 0, 0, -pitch * 0.6);
    }
    if (Math.abs(twist) > 1e-4 || Math.abs(pitch) > 1e-4) {
        state = fk(rig, pose, state);
    }

    // --- brazo de golpe (puñetazo, codo, especial) ---
    if (K.limb === 'arm' || K.limb === 'both') {
        const target = phaseVec(K.home, K, phase, tt);
        if (mod.reach) target[2] += mod.reach;
        solveTwoBone(rig, pose, state, {
            upper: 'UPPERARM_L', lower: 'FOREARM_L',
            target, pole: [1, -0.15, -0.35]
        });
        if (K.limb === 'both') {
            const targetR = Array.isArray(target[0])
                ? vlerp(K.home[1], K.active[1], ease('EASE_IN', tt))
                : [-target[0], target[1], target[2] * 0.9];
            state = fk(rig, pose, state);
            solveTwoBone(rig, pose, state, {
                upper: 'UPPERARM_R', lower: 'FOREARM_R',
                target: Array.isArray(K.home[0]) ? phaseVec(K.home[1], { startup: K.startup[1], active: K.active[1] }, phase, tt) : targetR,
                pole: [-1, -0.15, -0.35]
            });
        }
    }

    // --- pierna de golpe (patada, barrido) ---
    if (K.limb === 'leg') {
        const target = phaseVec(K.home, K, phase, tt);
        // La cadera sube (patada alta) o baja (barrido) antes de resolver.
        const lift = (K.hipLift || 0) - (K.hipDrop || 0);
        if (Math.abs(lift) > 1e-4) {
            const cur = pose.pos && pose.pos.PELVIS ? pose.pos.PELVIS : [0, 0, 0];
            setPos(pose, 'PELVIS', [cur[0], cur[1] + lift * (phase === 'ACTIVE' ? 1 : 0.4), cur[2]]);
            state = fk(rig, pose, state);
        }
        solveTwoBone(rig, pose, state, {
            upper: 'THIGH_L', lower: 'SHIN_L',
            target, pole: [0.35, 0, 1]
        });
        // El pie de apoyo se queda CLAVADO: la patada no mueve el apoyo.
        state = fk(rig, pose, state);
        placeFoot(rig, pose, state, 'R', base.targets.R, {
            autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
        });
    }

    // --- zancada (embestida, remate) ---
    if (K.limb === 'lunge') {
        const k = phase === 'STARTUP' ? ease('EASE_OUT', tt) * 0.6
            : phase === 'ACTIVE' ? 1
            : 1 - ease('EASE_IN_OUT', tt);
        const cur = pose.pos && pose.pos.PELVIS ? pose.pos.PELVIS : [0, 0, 0];
        setPos(pose, 'PELVIS', [cur[0], cur[1] - 0.20 * k, cur[2]]);
        setEuler(pose, 'SPINE', 0, 0.30 * k, 0);
        setEuler(pose, 'CHEST', 0, 0.20 * k, 0);
        state = fk(rig, pose, state);
        placeFoot(rig, pose, state, 'L', [0.12, 0, 0.10 + 0.48 * k], {
            autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
        });
        state = fk(rig, pose, state);
        placeFoot(rig, pose, state, 'R', [-0.20, 0, -0.32 * k], {
            autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
        });
    }

    return { pose, state: fk(rig, pose, state), spec: base.spec };
}

// ===========================================================================
// REACCIONES
// ===========================================================================

/**
 * Reaccion a un golpe recibido (hitstun / tropezon / mareado). El
 * torso va hacia atras, la cabeza contrarresta y los brazos se abren
 * para recuperar el equilibrio.
 */
export function flinchPose(rig, hitLevel, opts = {}) {
    const strong = hitLevel === 'FUERTE';
    const base = posturePose(rig, {
        limbs: 'STAGGER',
        hipY: strong ? 0.70 : 0.78,
        spinePitch: strong ? -0.42 : -0.30,
        headPitch: strong ? 0.40 : 0.28
    }, opts);
    const pose = base.pose;
    const state = base.state;
    // Brazos abiertos y atras: la postura de "me he llevado uno".
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L',
        target: [0.46, 1.06, -0.18], pole: [1, 0, 0]
    });
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R',
        target: [-0.46, 1.06, -0.18], pole: [-1, 0, 0]
    });
    return { pose, state: fk(rig, pose, state) };
}

/**
 * Cuerpo en el suelo. `down` es lo que guarda la FSM al derribar:
 * { orientation, axis } (axis: 0 cabeza al rival, 180 pies, 45/135
 * diagonales). Prone = boca abajo (cae de cara), supine = boca arriba.
 */
export function downPose(rig, down, opts = {}) {
    const axis = (down && typeof down.axis === 'number') ? down.axis : 180;
    const orientation = down && down.orientation;
    const prone = orientation === 'CABEZA_A_RIVAL' ||
        orientation === 'FLANCO_IZQUIERDO' || orientation === 'FLANCO_DERECHO';
    const yaw = (axis * Math.PI) / 180;

    const pose = createPose();
    setPos(pose, 'PELVIS', [0, -0.70, 0]);
    setEuler(pose, 'PELVIS', 0, yaw, 0);
    setEuler(pose, 'SPINE', 0, 0, prone ? 1.30 : -1.30);
    setEuler(pose, 'CHEST', 0, 0, prone ? 0.45 : -0.45);
    setEuler(pose, 'NECK', 0, 0, prone ? -0.55 : 0.55);

    let state = fk(rig, pose);
    // Piernas juntas, estiradas hacia delante del eje de caida.
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_L', lower: 'SHIN_L', target: [0.10, 0.05, 0.55], pole: [0.4, 0, 1]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_R', lower: 'SHIN_R', target: [-0.10, 0.05, 0.55], pole: [-0.4, 0, 1]
    });
    state = fk(rig, pose, state);
    // Brazos abiertos a los lados.
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L', target: [0.44, 0.14, 0.08], pole: [1, 0, 0]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R', target: [-0.44, 0.14, 0.08], pole: [-1, 0, 0]
    });
    return { pose, state: fk(rig, pose, state) };
}

/**
 * Aire (juggle, caida libre): piernas recogidas y brazos abiertos.
 * NO planta los pies: no hay suelo bajo el peleador.
 */
export function floatPose(rig, opts = {}) {
    const pose = createPose();
    setPos(pose, 'PELVIS', [0, -0.10, 0]);
    setEuler(pose, 'SPINE', 0, 0, -0.14);
    setEuler(pose, 'CHEST', 0, 0, -0.08);

    let state = fk(rig, pose);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_L', lower: 'SHIN_L', target: [0.15, 0.44, 0.20], pole: [0.5, 0, 1]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_R', lower: 'SHIN_R', target: [-0.15, 0.44, 0.20], pole: [-0.5, 0, 1]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L', target: [0.44, 1.08, 0.04], pole: [1, 0, 0]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R', target: [-0.44, 1.08, 0.04], pole: [-1, 0, 0]
    });
    return { pose, state: fk(rig, pose, state) };
}

// ===========================================================================
// DISPATCHER
// ===========================================================================

/**
 * Elige la pose para un snapshot de la FSM (datos planos, no la FSM:
 * asi este archivo sigue siendo puro y testeable en Node).
 *
 * @param snap { phase, groups, posture, attack, attackPhase, attackT,
 *               hitLevel, down }
 */
export function poseFor(rig, snap, opts = {}) {
    const groups = snap.groups || [];
    const attacking = groups.indexOf('ATTACKING') !== -1 && snap.attack;
    if (attacking) {
        return attackPose(rig, snap.attack, snap.attackPhase || 'RECOVERY', snap.attackT || 0, opts);
    }
    if (snap.phase === 'DOWNED' || snap.down) {
        return downPose(rig, snap.down, opts);
    }
    if (snap.phase === 'AIR') {
        return floatPose(rig, opts);
    }
    if (groups.indexOf('IMPACT') !== -1 || groups.indexOf('STUNNED') !== -1) {
        return flinchPose(rig, snap.hitLevel, opts);
    }
    return posturePose(rig, snap.posture, opts);
}

export default {
    posturePose, attackPose, flinchPose, downPose, floatPose, poseFor, locoPose,
    ATTACK_KEYS, LIMB_SPECS, STYLE_MODS, LOCO_POSTURES, ATTACK_LOCO_MODS,
    STANCE_ARMS
};
