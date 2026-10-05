/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/GrappleStates.js
 * ----------------------------------------------------------------------------
 * ESTADOS DE AGARRE. Un estado = (papel UKE/TORI) x (postura del agarre).
 *
 * Lo que el diseno pide explicitamente y este archivo resuelve:
 *
 *   1. ¿DE QUIEN ES? -> GrappleRole. UKE (recibe la tecnica) y TORI (la
 *      aplica) tienen estados propios porque tienen animaciones, control y
 *      volumen de colision distintos. El UKE no puede atacar mientras esta
 *      agarrado; el TORI si.
 *
 *   2. ¿DE QUE TIPO ES EL AGARRE? -> GrappleStance:
 *      de pie, uke agachado, tori agachado, clinch bajo, atemi, ukemi,
 *      proyeccion, sumision, escape, presion, y las variantes en el suelo.
 *
 *   3. ¿QUE ANIMACIONES TIENE CADA AGARRE? -> el bloque `actions` de cada
 *      estado declara las 4 animaciones del agarre (ATACAR / ESCAPE /
 *      PROYECCION / SUMISION), y cada una con su variante de frente y de
 *      espaldas a camara. Un agarre sin sumision NO debe tener un clip de
 *      sumision: se declara como null y la tabla de transiciones lo respeta.
 *
 * Por que se GENERAN los estados en vez de escribirlos a mano: son 15 posturas
 * x 2 papeles = 30 estados con la misma forma. Escribirlos a mano son 700
 * lineas que nadie mantiene; generarlos son 15 descriptores. Lo que no se
 * puede abstraer (animaciones, dano, timings) esta en la tabla DESCRIPTORS.
 * ============================================================================
 */
import SPF from '../Constants.js';

const {
    State, StateGroup, Phase, VelocityPolicy, HullKind, PhysicalFlag,
    GrappleRole, GrappleStance, GrappleAction, VisualFacing, FacingAxis,
    CONFIG
} = SPF;

const A = CONFIG.GRAPPLE_ACTION_FRAMES;

/**
 * Perfiles fisicos del agarre. Durante el agarre los dos luchadores estan
 * PEGADOS: no colisionan entre si, no caen por gravedad (el suelo los sostiene)
 * y no se pueden separar salvo que la sesion lo decida. Por eso NO llevan
 * PUSHABLE ni IMPULSE_SENSITIVE: si los llevaran, el segundo en entrar se
 * empujaria al primero y el agarre se romperia solo.
 */
const F = {
    GRAPPLE: SPF.toFlags([PhysicalFlag.LOCK_ROTATION, PhysicalFlag.MANAGES_VELOCITY]),
    GRAPPLE_SUELO: SPF.toFlags([PhysicalFlag.LOCK_ROTATION, PhysicalFlag.MANAGES_VELOCITY])
};

/** Hull pegado al suelo (clinch) y hull tumbado (groundwork). */
const HULL = {
    PIE: { kind: HullKind.CAPSULE, radius: 0.44, height: 1.7, centerY: 0.85 },
    AGACHADO: { kind: HullKind.CAPSULE, radius: 0.48, height: 1.15, centerY: 0.58 },
    SUELO_TOP: { kind: HullKind.CAPSULE, radius: 0.5, height: 0.5, centerY: 0.25 },
    SUELO_BOTTOM: { kind: HullKind.CAPSULE, radius: 0.48, height: 0.4, centerY: 0.2 }
};

/**
 * Constructor de clips. El nombre sigue el convenio del exportador de
 * modelos: gr_<postura>_<accion>__f / __b. Se centraliza aqui para que un
 * cambio de nomenclatura sea una linea y no 60.
 */
function clip(stance, action, side) {
    const suffix = side === VisualFacing.FRENTE_A_CAMARA ? '__f' : '__b';
    return 'gr_' + stance.toLowerCase() + '_' + action.toLowerCase() + suffix;
}

/**
 * Declara las 4 acciones de una postura. `null` como accion significa que esa
 * postura NO admite esa accion (una sumision no se puede escapar; un escape no
 * se puede sumar) y la tabla de transiciones lo respeta.
 */
function actions(stance, opts = {}) {
    const build = (action, overrides) => {
        if ((opts.skip || []).indexOf(action) !== -1) return null;
        const conf = Object.assign({
            frames: A[action],
            damage: 0,
            // Presion que se suma al UKE. El atemi es el unico que presiona de
            // verdad: es lo que obliga al UKE a jugar su escape o a agonizar.
            pressure: 0,
            // QUE PASA CUANDO LA ACCION TERMINA:
            //   HOLD    -> el agarre sigue
            //   ESCAPE  -> el UKE se libera (gana el UKE)
            //   THROW   -> proyeccion: el UKE sale lanzado
            //   SUBMIT  -> sumision confirmada: el UKE queda atrapado
            resolves: 'HOLD',
            meterGain: 0
        }, overrides || {});
        return Object.freeze({
            action,
            frames: conf.frames,
            damage: conf.damage,
            pressure: conf.pressure,
            resolves: conf.resolves,
            meterGain: conf.meterGain,
            clips: Object.freeze({
                [VisualFacing.FRENTE_A_CAMARA]: clip(stance, action, VisualFacing.FRENTE_A_CAMARA),
                [VisualFacing.ESPALDA_A_CAMARA]: clip(stance, action, VisualFacing.ESPALDA_A_CAMARA)
            })
        });
    };

    return Object.freeze({
        [GrappleAction.ATACAR]: build(GrappleAction.ATACAR, opts.ATACAR),
        [GrappleAction.ESCAPE]: build(GrappleAction.ESCAPE, opts.ESCAPE),
        [GrappleAction.PROYECCION]: build(GrappleAction.PROYECCION, opts.PROYECCION),
        [GrappleAction.SUMISION]: build(GrappleAction.SUMISION, opts.SUMISION)
    });
}

/**
 * Acciones permitidas por papel. El UKE no puede golpear, proyectar ni sumar:
 * sus clips de esas acciones serian mentira (el estado se reproduce aunque el
 * luchador no pueda hacer nada). El TORI si puede, y el ESCAPE se declara en
 * ambos porque es la unica accion que la sesion necesita leer del estado TORI
 * para resolver una fuga.
 */
function actionsForRole(role, declared) {
    if (role !== GrappleRole.UKE) return declared;
    return Object.freeze({
        [GrappleAction.ATACAR]: null,
        [GrappleAction.ESCAPE]: declared[GrappleAction.ESCAPE],
        [GrappleAction.PROYECCION]: null,
        [GrappleAction.SUMISION]: null
    });
}

/**
 * DESCRIPTORES: una entrada por postura de agarre. Es el lugar donde se
 * declaran las animaciones y el comportamiento de cada agarre.
 */
const DESCRIPTORS = {
    // =====================================================================
    // AGARRES DE PIE
    // =====================================================================
    [GrappleStance.PIE]: {
        surface: 'VERTICAL',
        hold: 'gr_pie_hold',
        stanceFrames: 0,                     // 0 = se mantiene hasta resolver
        uke: { posture: { limbs: 'GRAPPLE_UKE', hipY: 0.85, spinePitch: 0.12 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'GRAPPLE_TORI', hipY: 0.9, spinePitch: 0.06 }, hull: HULL.PIE },
        // UKE: solo puede escapar. TORI: ataca, proyecta y sume.
        actions: actions(GrappleStance.PIE, {
            ATACAR: { frames: A.ATACAR, damage: 5, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 6 },
            ESCAPE: { frames: A.ESCAPE, resolves: 'ESCAPE' },
            PROYECCION: { frames: A.PROYECCION, damage: 16, resolves: 'THROW', meterGain: 10 },
            SUMISION: { frames: A.SUMISION, damage: 6, resolves: 'SUBMIT' }
        })
    },

    // UKE agachado, TORI de pie: el agarre bajo desde el que el tori trabaja
    // con mas margen. El UKE aguanta mas en esta postura: es el agarre "defensivo".
    [GrappleStance.UKE_AGACHADO]: {
        surface: 'VERTICAL',
        hold: 'gr_uke_agachado_hold',
        uke: { posture: { limbs: 'GRAPPLE_UKE', hipY: 0.42, spinePitch: 0.45 }, hull: HULL.AGACHADO },
        tori: { posture: { limbs: 'GRAPPLE_TORI', hipY: 0.9, spinePitch: 0.18 }, hull: HULL.PIE },
        actions: actions(GrappleStance.UKE_AGACHADO, {
            ATACAR: { frames: A.ATACAR, damage: 4, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 5 },
            ESCAPE: { frames: A.ESCAPE + 4, resolves: 'ESCAPE' },   // mas lento: abajo es mas dificil salir
            PROYECCION: { frames: A.PROYECCION, damage: 13, resolves: 'THROW', meterGain: 8 },
            SUMISION: { frames: A.SUMISION + 6, damage: 5, resolves: 'SUBMIT' }
        })
    },

    // TORI agachado, UKE de pie: el agarre "ofensivo", el que usa el tori para
    // entrar y levantar al rival. El UKE aguanta mas.
    [GrappleStance.TORI_AGACHADO]: {
        surface: 'VERTICAL',
        hold: 'gr_tori_agachado_hold',
        uke: { posture: { limbs: 'GRAPPLE_UKE', hipY: 0.88, spinePitch: -0.05 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'GRAPPLE_TORI', hipY: 0.45, spinePitch: 0.4 }, hull: HULL.AGACHADO },
        actions: actions(GrappleStance.TORI_AGACHADO, {
            ATACAR: { frames: A.ATACAR - 2, damage: 6, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 7 },
            ESCAPE: { frames: A.ESCAPE - 2, resolves: 'ESCAPE' },
            PROYECCION: { frames: A.PROYECCION + 4, damage: 18, resolves: 'THROW', meterGain: 12 },
            SUMISION: { frames: A.SUMISION, damage: 7, resolves: 'SUBMIT' }
        })
    },

    // Clinch bajo: los dos abajo. Es el agarre de wrestle/boxeo: se hace de pie
    // pero trabaja abajo. El ukemi es mas rapido (rodar por debajo).
    [GrappleStance.AGACHADO]: {
        surface: 'VERTICAL',
        hold: 'gr_agachado_hold',
        uke: { posture: { limbs: 'GRAPPLE_UKE', hipY: 0.4, spinePitch: 0.5 }, hull: HULL.AGACHADO },
        tori: { posture: { limbs: 'GRAPPLE_TORI', hipY: 0.42, spinePitch: 0.5 }, hull: HULL.AGACHADO },
        actions: actions(GrappleStance.AGACHADO, {
            ATACAR: { frames: A.ATACAR, damage: 4, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 5 },
            ESCAPE: { frames: A.ESCAPE - 4, resolves: 'ESCAPE' },   // el mejor escape: rodar por debajo
            PROYECCION: { frames: A.PROYECCION, damage: 10, resolves: 'THROW', meterGain: 8 },
            SUMISION: null                                          // clinch no admite sumision
        })
    },

    // =====================================================================
    // MOMENTOS DENTRO DEL AGARRE
    // =====================================================================
    [GrappleStance.ATEMI]: {
        surface: 'VERTICAL',
        // Un atemi no se "mantiene": dura lo que dura el golpe. El frame data
        // sale del propio bloque de acciones.
        hold: 'gr_atemi_hold',
        autoFrames: A.ATACAR,
        uke: { posture: { limbs: 'HITSTUN_GRAPPLE', hipY: 0.8, spinePitch: -0.2, headPitch: 0.3 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'ATEMI_TORI', hipY: 0.86, spinePitch: 0.3 }, hull: HULL.PIE },
        actions: actions(GrappleStance.ATEMI, {
            ATACAR: { frames: A.ATACAR, damage: 5, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 6 },
            ESCAPE: { frames: A.ESCAPE, resolves: 'ESCAPE' },
            PROYECCION: null,      // no se proyecta desde dentro de un atemi
            SUMISION: null
        })
    },

    // Ukemi: la rotura. Es el escape "de emergencia" que el UKE consigue
    // cuando ya no le da el escape normal: cae de forma segura y ambos se
    // separan. Es la salida anti-bloqueo del sistema.
    [GrappleStance.UKEMI]: {
        surface: 'VERTICAL',
        hold: 'gr_ukemi_hold',
        autoFrames: A.ESCAPE + 8,
        uke: { posture: { limbs: 'UKEMI', hipY: 0.4, spinePitch: 0.9, headPitch: 0.4 }, hull: HULL.AGACHADO },
        tori: { posture: { limbs: 'UKEMI', hipY: 0.4, spinePitch: 0.9, headPitch: 0.4 }, hull: HULL.AGACHADO },
        // En ukemi los dos se separan: el tori no puede atacarlo (es la
        // ventana gratuita del UKE).
        actions: actions(GrappleStance.UKEMI, {
            ATACAR: null,
            ESCAPE: { frames: A.ESCAPE + 8, resolves: 'ESCAPE' },
            PROYECCION: null,
            SUMISION: null
        })
    },

    [GrappleStance.PROYECCION]: {
        surface: 'VERTICAL',
        hold: 'gr_proyeccion_hold',
        autoFrames: A.PROYECCION,
        // Al proyectar, el UKE va con el cuerpo al aire y el TORI le sigue la
        // caida. El UKE es el que sale lanzado (ver HIT del resultado).
        uke: { posture: { limbs: 'THROWN', hipY: 0.9, spinePitch: -0.6 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'THROW_TORI', hipY: 0.7, spinePitch: 0.4 }, hull: HULL.PIE },
        actions: actions(GrappleStance.PROYECCION, {
            ATACAR: null,
            ESCAPE: { frames: 10, resolves: 'ESCAPE' },   // escape tardio: ya casi se ha thrown
            PROYECCION: { frames: A.PROYECCION, damage: 16, resolves: 'THROW', meterGain: 10 },
            SUMISION: null
        })
    },

    // Sumision: se puede entrar desde un agarre de pie o desde el suelo. El
    // UKE NO puede escapar con el metodo normal (skip ESCAPE): para salir hay
    // que romper la presion del UKE, que es la mecanica de tension del estado.
    [GrappleStance.SUMISION]: {
        surface: 'VERTICAL',
        hold: 'gr_sumision_hold',
        autoFrames: A.SUMISION,
        uke: { posture: { limbs: 'SUBMITTED', hipY: 0.45, spinePitch: 0.5, headPitch: 0.2 }, hull: HULL.AGACHADO },
        tori: { posture: { limbs: 'SUBMIT_TORI', hipY: 0.6, spinePitch: 0.3 }, hull: HULL.AGACHADO },
        actions: actions(GrappleStance.SUMISION, {
            ATACAR: { frames: A.SUMISION, damage: 4, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'SUBMIT', meterGain: 8 },
            ESCAPE: null,     // de una sumision no se escapa: se rompe la presion
            PROYECCION: null,
            SUMISION: { frames: A.SUMISION, damage: 5, resolves: 'SUBMIT' }
        })
    },

    [GrappleStance.ESCAPE]: {
        surface: 'VERTICAL',
        hold: 'gr_escape_hold',
        autoFrames: A.ESCAPE,
        uke: { posture: { limbs: 'ESCAPING', hipY: 0.6, spinePitch: 0.35 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'ESCAPING', hipY: 0.6, spinePitch: 0.35 }, hull: HULL.PIE },
        actions: actions(GrappleStance.ESCAPE, {
            ATACAR: null,
            ESCAPE: { frames: A.ESCAPE, resolves: 'ESCAPE' },
            PROYECCION: null,
            SUMISION: null
        })
    },

    [GrappleStance.PRESION]: {
        surface: 'VERTICAL',
        hold: 'gr_presion_hold',
        // La presion es lo que rompe al UKE si el TORI no resuelve: la
        // presion sube frame a frame y al maximo el UKE se suelta solo.
        pressurePerFrame: CONFIG.GRAPPLE_PRESSURE_PER_FRAME,
        uke: { posture: { limbs: 'PRESSED', hipY: 0.7, spinePitch: 0.25 }, hull: HULL.PIE },
        tori: { posture: { limbs: 'PRESS_TORI', hipY: 0.8, spinePitch: 0.15 }, hull: HULL.PIE },
        actions: actions(GrappleStance.PRESION, {
            ATACAR: { frames: A.ATACAR, damage: 3, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 4 },
            ESCAPE: { frames: A.ESCAPE, resolves: 'ESCAPE' },
            PROYECCION: { frames: A.PROYECCION, damage: 14, resolves: 'THROW', meterGain: 8 },
            SUMISION: null
        })
    },

    // =====================================================================
    // AGARRES EN EL SUELO (GROUNDWORK)
    // =====================================================================
    [GrappleStance.SUELO]: {
        surface: 'SUELO',
        hold: 'gr_suelo_hold',
        // En el suelo el UKE esta debajo (bottom) y el TORI arriba (top).
        uke: { posture: { limbs: 'BOTTOM', hipY: 0.18, spinePitch: 0 }, hull: HULL.SUELO_BOTTOM },
        tori: { posture: { limbs: 'TOP', hipY: 0.34, spinePitch: 0.35 }, hull: HULL.SUELO_TOP },
        actions: actions(GrappleStance.SUELO, {
            ATACAR: { frames: A.ATACAR, damage: 4, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 5 },
            ESCAPE: { frames: A.ESCAPE + 6, resolves: 'ESCAPE' },
            PROYECCION: { frames: A.PROYECCION, damage: 8, resolves: 'THROW', meterGain: 6 },  // rodar lejos
            SUMISION: { frames: A.SUMISION, damage: 4, resolves: 'SUBMIT' }
        })
    },

    [GrappleStance.SUELO_AGACHADO]: {
        surface: 'SUELO',
        hold: 'gr_suelo_agachado_hold',
        uke: { posture: { limbs: 'BOTTOM', hipY: 0.16, spinePitch: 0.1 }, hull: HULL.SUELO_BOTTOM },
        tori: { posture: { limbs: 'TOP_CROUCH', hipY: 0.26, spinePitch: 0.5 }, hull: HULL.SUELO_BOTTOM },
        actions: actions(GrappleStance.SUELO_AGACHADO, {
            ATACAR: { frames: A.ATACAR - 2, damage: 3, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 4 },
            ESCAPE: { frames: A.ESCAPE + 10, resolves: 'ESCAPE' },  // el peor sitio para estar
            PROYECCION: { frames: A.PROYECCION, damage: 6, resolves: 'THROW', meterGain: 5 },
            SUMISION: { frames: A.SUMISION + 8, damage: 3, resolves: 'SUBMIT' }
        })
    },

    [GrappleStance.SUELO_ATEMI]: {
        surface: 'SUELO',
        hold: 'gr_suelo_atemi_hold',
        autoFrames: A.ATACAR,
        uke: { posture: { limbs: 'BOTTOM_HIT', hipY: 0.16, spinePitch: 0, headPitch: 0.35 }, hull: HULL.SUELO_BOTTOM },
        tori: { posture: { limbs: 'TOP_STRIKE', hipY: 0.34, spinePitch: 0.4 }, hull: HULL.SUELO_TOP },
        actions: actions(GrappleStance.SUELO_ATEMI, {
            ATACAR: { frames: A.ATACAR, damage: 4, pressure: CONFIG.GRAPPLE_PRESSURE_PER_ATEMI, resolves: 'HOLD', meterGain: 5 },
            ESCAPE: { frames: A.ESCAPE + 6, resolves: 'ESCAPE' },
            PROYECCION: null,
            SUMISION: null
        })
    },

    [GrappleStance.SUELO_ESCAPE]: {
        surface: 'SUELO',
        hold: 'gr_suelo_escape_hold',
        autoFrames: A.ESCAPE + 6,
        uke: { posture: { limbs: 'BOTTOM_ESCAPE', hipY: 0.2, spinePitch: 0.3 }, hull: HULL.SUELO_BOTTOM },
        tori: { posture: { limbs: 'TOP_ESCAPE', hipY: 0.3, spinePitch: 0.3 }, hull: HULL.SUELO_TOP },
        actions: actions(GrappleStance.SUELO_ESCAPE, {
            ATACAR: null,
            ESCAPE: { frames: A.ESCAPE + 6, resolves: 'ESCAPE' },
            PROYECCION: null,
            SUMISION: null
        })
    },

    [GrappleStance.SUELO_UKEMI]: {
        surface: 'SUELO',
        hold: 'gr_suelo_ukemi_hold',
        autoFrames: A.ESCAPE + 12,
        // Ukemi en el suelo: la caida controlada. Es lo que evita que el UKE
        // encadene knockdown -> ukemi -> knockdown sin poder moverse.
        uke: { posture: { limbs: 'SUELO_UKEMI', hipY: 0.22, spinePitch: 0.6 }, hull: HULL.SUELO_BOTTOM },
        tori: { posture: { limbs: 'SUELO_UKEMI', hipY: 0.22, spinePitch: 0.6 }, hull: HULL.SUELO_BOTTOM },
        actions: actions(GrappleStance.SUELO_UKEMI, {
            ATACAR: null,
            ESCAPE: { frames: A.ESCAPE + 12, resolves: 'ESCAPE' },
            PROYECCION: null,
            SUMISION: null
        })
    }
};

/**
 * Genera los 2 estados de cada postura (UKE y TORI) y los devuelve como
 * definiciones para que states/index.js las registre.
 */
function buildGrappleStates() {
    const out = [];

    for (const stanceKey of Object.keys(DESCRIPTORS)) {
        const d = DESCRIPTORS[stanceKey];

        for (const role of [GrappleRole.UKE, GrappleRole.TORI]) {
            const isUke = role === GrappleRole.UKE;
            const body = isUke ? d.uke : d.tori;

            out.push({
                id: SPF.grappleState(stanceKey, role),
                tag: 'AGARRE',
                phase: Phase.GRAPPLE,
                groups: isUke
                    ? [StateGroup.GRAPPLE, StateGroup.GRAPPLE_UKE]
                    : [StateGroup.GRAPPLE, StateGroup.GRAPPLE_TORI],

                // En un agarre el eje del cuerpo lo fija la postura (el UKE va
                // de espaldas al tori, el tori de frente al uke).
                facingAxis: isUke ? FacingAxis.PIES_A_RIVAL : FacingAxis.CABEZA_A_RIVAL,

                // 0/null = se mantiene (el agarre es un estado sostenido);
                // >0 = duracion fija (los momentos: atemi, ukemi, proyeccion).
                durationFrames: d.autoFrames || null,

                clip: d.hold,
                loop: !d.autoFrames,
                physics: {
                    flags: d.surface === 'SUELO' ? F.GRAPPLE_SUELO : F.GRAPPLE,
                    velocityPolicy: VelocityPolicy.ZERO,
                    gravity: 0,
                    hull: body.hull
                },
                // El UKE no puede iniciar ataques: su unica verbacion es
                // escapar. El TORI puede atacar, proyectar y sumar.
                control: {
                    canAct: !isUke,
                    canTurn: false,
                    buffersInput: true,
                    invulnerable: false
                },
                posture: body.posture,
                grapple: {
                    role,
                    stance: stanceKey,
                    surface: d.surface,
                    // La sesion de agarre lee estas acciones para resolver.
                    actions: actionsForRole(role, d.actions),
                    // El UKE acumula la presion; el TORI la genera.
                    pressurePerFrame: isUke ? 0 : (d.pressurePerFrame || 0)
                },
                notes: d.notes || ('Agarre ' + stanceKey + ' · papel ' + role)
            });
        }
    }

    return out;
}

export default buildGrappleStates();