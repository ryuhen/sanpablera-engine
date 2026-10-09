/**
 * ============================================================================
 * SANPABLERA ENGINE · entities/AttackPoses.js
 * ----------------------------------------------------------------------------
 * LOS GOLPES POR CONTEXTO: de pie, agachado, en el aire y en el suelo.
 *
 * QUE HACE Y POR QUE EXISTE
 * ----------------------------------------------------------------------------
 *   Antes habia UN attackPose() para todos los golpes: el mismo puño de pie,
 *   agachado y en el aire salia con el torso casi igual y los pies en el
 *   suelo. Y el suelo era el peor caso, porque en el aire no hay suelo: la
 *   pose se construia clavando los pies donde estaria el suelo, que no existe,
 *   y el resultado era un puñetazo con las piernas estiradas hacia un punto
 *   imaginario.
 *
 *   Aqui cada golpe tiene CUATRO siluetas, y se elige una por el estado en que
 *   se ejecuta. No son cuatro animaciones distintas: son el MISMO golpe con la
 *   base distinta y los mismos objetivos de miembro, que es como lo hace un
 *   animador (la misma accion, distinto cuerpo debajo).
 *
 * LAS CUATRO SILUETAS
 * ----------------------------------------------------------------------------
 *   STAND    de pie, piernas apoyadas, peso al frente
 *   CROUCH   agachado: el golpe sale desde abajo, la cadera a 0,5 m
 *   AIR      en el aire: piernas recogidas, NO se clavan pies
 *   DOWN     sobre el rival caido: postura de montage, un pie arriba
 *
 * LA REGLA QUE LO SOSTIENE
 * ----------------------------------------------------------------------------
 *   El que decide es el ESTADO, no el boton. El boton dice que golpe es
 *   (ligero, pesado, barrido) y el estado dice desde donde sale. Por eso el
 *   mismo ATAQUE_LIGERO se ve distinto agachado que de pie, sin que ningun
 *   moveset tenga que declarar dos veces el mismo golpe. Es la misma logica que
 *   el moveset por capas, pero en la capa de la animacion.
 *
 * ESPACIO
 *   Y arriba, Z adelante, origen en el suelo bajo la pelvis (cine/Stances.js).
 *   Los objetivos de mano y de pie van en metros absolutos de ese espacio.
 * ============================================================================
 */

import { createPose, setEuler, setPos, clonePose, addPose } from '../cine/Pose.js';
import { fk, solveTwoBone, placeFoot } from '../cine/Rig.js';
import { clamp01, lerp, ease } from '../cine/Math3.js';

// ===========================================================================
// LAS CUATRO BASES
// ===========================================================================

/**
 * Base de cada contexto. Son los datos que ya usan Stances.js (spread, lead,
 * lean, guard, crouch) mas lo especifico del aire y del suelo.
 *
 * `planted: false` es el campo que mas importa: es el que le dice al codigo
 * que NOuede clavar los pies. En el aire clavar un pie produce el fallo
 * caracteristico del personaje "patinando en el aire".
 */
export const ATTACK_BASES = Object.freeze({
    STAND: Object.freeze({
        planted: true, limbs: 'BRACE', hipY: 0.86, spinePitch: 0.10,
        spec: Object.freeze({ spread: 0.40, lead: 0.12, lean: 6, guard: 1.0, crouch: 0.085 })
    }),
    CROUCH: Object.freeze({
        planted: true, limbs: 'CROUCH', hipY: 0.52, spinePitch: 0.34,
        spec: Object.freeze({ spread: 0.58, lead: 0.06, lean: 10, guard: 0.85, crouch: 0.40 })
    }),
    AIR: Object.freeze({
        planted: false, limbs: 'FLOAT', hipY: 0.86, spinePitch: 0.18,
        spec: Object.freeze({ spread: 0.34, lead: 0.04, lean: 4, guard: 0.45, crouch: 0.12 })
    }),
    DOWN: Object.freeze({
        planted: true, limbs: 'CROUCH', hipY: 0.70, spinePitch: 0.44,
        spec: Object.freeze({ spread: 0.44, lead: 0.14, lean: 14, guard: 0.35, crouch: 0.22 })
    })
});

// ===========================================================================
// SILUETAS POR CONTEXTO
// ===========================================================================

/**
 * El objetivo de cada miembro en las TRES fases, por contexto.
 *
 * LA ESTRUCTURA
 *   base      cuerpo entero (la cadera, el torso)
 *   armL/R    objetivo del codo: donde va la mano. `null` = el brazo guarda.
 *   legs      objetivo del pie para la pierna de golpe.
 *   leg       'L' (por defecto) | 'R' (el otro pie adelanta)
 *   airborne  true si el cuerpo va por los aires (no clava pies)
 *
 * POR QUE LOS OBJETIVOS CAMBIAN TANTO ENTRE CONTEXTOS
 *   El mismo jab agachado tiene que salir a 0,55 m de altura (por debajo de la
 *   guardia del rival) y el de pie a 1,25 m (a la cara). Si se usara el mismo
 *   numero, el golpe agachado seria un jab que no llega a la cabeza y el
 *   jugador leeria "este boton no hace nada" sin ver por que. Esa lectura es
 *   exactamente la que hay que evitar: el jugador tiene que ver el por que.
 */
export const ATTACK_SILHOUETTES = Object.freeze({
    // --- PUÑO / GANCHO (el jab) -----------------------------------------
    JAB: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.10, twist: 0.44, yaw: 0 }),
            armL: Object.freeze({ home: [0.26, 1.16, 0.24], startup: [0.16, 1.06, 0.06], active: [0.02, 1.28, 0.88] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.34, twist: 0.38, yaw: 0 }),
            armL: Object.freeze({ home: [0.24, 0.86, 0.20], startup: [0.18, 0.76, 0.04], active: [0.04, 0.72, 0.78] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.20, twist: 0.52, yaw: 0 }),
            airborne: true,
            armL: Object.freeze({ home: [0.34, 1.10, 0.10], startup: [0.30, 1.30, -0.06], active: [0.06, 1.34, 0.72] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.70, pitch: 0.46, twist: 0.30, yaw: 0 }),
            armL: Object.freeze({ home: [0.28, 1.10, 0.24], startup: [0.24, 1.24, 0.06], active: [0.06, 1.06, 0.80] })
        })
    }),

    // --- GANCHO (curvo, entra por el lado) -------------------------------
    GANCHO: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.84, pitch: 0.14, twist: 0.62, yaw: 0.30 }),
            armL: Object.freeze({ home: [0.26, 1.16, 0.24], startup: [0.36, 1.02, 0.14], active: [0.12, 1.12, 0.66] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.48, pitch: 0.38, twist: 0.54, yaw: 0.34 }),
            armL: Object.freeze({ home: [0.24, 0.86, 0.20], startup: [0.36, 0.72, 0.12], active: [0.14, 0.80, 0.60] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.88, pitch: 0.24, twist: 0.70, yaw: 0.36 }),
            airborne: true,
            armL: Object.freeze({ home: [0.34, 1.10, 0.10], startup: [0.44, 0.96, 0.08], active: [0.16, 1.06, 0.58] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.68, pitch: 0.48, twist: 0.46, yaw: 0.30 }),
            armL: Object.freeze({ home: [0.28, 1.10, 0.24], startup: [0.40, 0.96, 0.12], active: [0.16, 1.02, 0.62] })
        })
    }),

    // --- ASCENDENTE (el que rompe la guardia alta) -----------------------
    UPPERCUT: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.72, pitch: 0.06, twist: 0.22, yaw: -0.10 }),
            armL: Object.freeze({ home: [0.22, 1.20, 0.22], startup: [0.16, 0.84, 0.02], active: [0.04, 1.54, 0.54] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.38, pitch: 0.24, twist: 0.20, yaw: -0.12 }),
            armL: Object.freeze({ home: [0.24, 0.84, 0.18], startup: [0.20, 0.54, 0.00], active: [0.06, 1.16, 0.48] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.82, pitch: 0.10, twist: 0.28, yaw: -0.08 }),
            airborne: true,
            armL: Object.freeze({ home: [0.32, 1.08, 0.10], startup: [0.26, 0.80, -0.04], active: [0.08, 1.46, 0.44] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.62, pitch: 0.34, twist: 0.18, yaw: -0.06 }),
            armL: Object.freeze({ home: [0.28, 1.08, 0.22], startup: [0.20, 0.72, 0.04], active: [0.06, 1.36, 0.50] })
        })
    }),

    // --- PATADA (pierna de golpe) ----------------------------------------
    KICK: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.16, twist: -0.20, yaw: 0, hipLift: 0.05 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.16, 0.32, -0.02], active: [0.04, 0.88, 0.88] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.40, twist: -0.18, yaw: 0, hipLift: 0.03 }),
            legL: Object.freeze({ home: [0.24, 0.04, 0.14], startup: [0.22, 0.24, 0.00], active: [0.08, 0.52, 0.70] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.84, pitch: 0.24, twist: -0.28, yaw: 0, hipLift: 0.06 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.34, 0.16], startup: [0.14, 0.52, 0.06], active: [0.04, 0.86, 0.70] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.68, pitch: 0.48, twist: -0.24, yaw: 0, hipDrop: 0.04 }),
            legL: Object.freeze({ home: [0.26, 0.06, 0.20], startup: [0.28, 0.30, 0.08], active: [0.14, 0.66, 0.76] })
        })
    }),

    // --- BARRIDO (rasante: el pie va al suelo) ---------------------------
    SWEEP: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.62, pitch: 0.34, twist: -0.36, yaw: 0, hipDrop: 0.20 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.18, 0.36, 0.06], active: [0.00, 0.14, 1.02] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.40, pitch: 0.50, twist: -0.30, yaw: 0, hipDrop: 0.08 }),
            legL: Object.freeze({ home: [0.26, 0.04, 0.16], startup: [0.26, 0.28, 0.08], active: [0.04, 0.12, 0.88] })
        }),
        AIR: Object.freeze({
            // En el aire un barrido es un patada descendente, no rasante: la
            // referencia del suelo no existe y el objetivo va por debajo del
            // cuerpo. Es el golpe que corta un salto.
            base: Object.freeze({ hip: 0.88, pitch: 0.30, twist: -0.34, yaw: 0 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.40, 0.14], startup: [0.14, 0.62, 0.06], active: [0.04, 0.16, 0.62] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.58, pitch: 0.56, twist: -0.28, yaw: 0, hipDrop: 0.10 }),
            legL: Object.freeze({ home: [0.28, 0.06, 0.20], startup: [0.30, 0.24, 0.10], active: [0.08, 0.14, 0.84] })
        })
    })
});

/**
 * Que silueta usa cada golpe del set base y de los movesets de personaje.
 *
 * SE RESUELVE POR CONTRATO, NO POR NOMBRE. La clave de un golpe no dice que
 * hacer (`GANCHO` no significa "gancho" para todos los peleadores), asi que
 * un moveset declara la silueta en su golpe. Lo que hay aqui es el plan B para
 * los golpes del set comun, y el fallback cuando un moveset nuevo no declara
 * ninguna: sin esta tabla, un golpe nuevo caeria en JAB y una patada se
 * animaria como un puño.
 */
export const MOVE_SILHOUETTES = Object.freeze({
    // Puños de arriba
    ATAQUE_LIGERO: 'JAB',
    JAB_LARGO: 'JAB',
    RECTO: 'JAB',
    GOLPE_CORTO: 'JAB',
    CRUZADO: 'JAB',
    GANCHO: 'GANCHO',
    GOLPE_CODO: 'GANCHO',
    DERIVADA_TECNICA: 'GANCHO',
    UPPERCUT: 'UPPERCUT',
    // Piernas
    ATAQUE_PESADO: 'KICK',
    PATADA_FRONTAL: 'KICK',
    PATADA_BAJA: 'KICK',
    COSTILLAZO: 'JAB',
    // Rasantes
    ATAQUE_BARRIDO: 'SWEEP',
    BARREDO: 'SWEEP',
    // Embestidas y demas
    EMBESTIDA: 'KICK',
    DERIBO: 'SWEEP',
    PROYECCION: 'SWEEP',
    SUMISION: 'JAB',
    ATAQUE_AEREO: 'KICK',
    ATAQUE_AGACHADO: 'JAB',
    ATAQUE_ESPECIAL: 'JAB',
    RV_FIN: 'KICK'
});

/** La silueta de un golpe: la que declara el moveset, o la de la tabla. */
export function silhouetteOf(moveKey, declared) {
    if (declared && ATTACK_SILHOUETTES[declared]) return declared;
    return MOVE_SILHOUETTES[moveKey] || 'JAB';
}

/**
 * De que CONTEXTO sale el golpe.
 *
 * POR QUE SE LEE DEL ESTADO Y NO DEL GOLPE
 *   El mismo `ATAQUE_AGACHADO` tiene que salir de pie en un round y agachado en
 *   otro segun lo que este haciendo el rival. Si el contexto lo decidiera el
 *   golpe, el jugador veria el mismo golpe con dos animaciones distintas segun
 *   la situacion, que es justo el bug de "las animaciones no cuadran".
 *
 * @param {object} snap  el snapshot de la FSM (ver FighterRig.poseFor)
 */
export function contextOf(snap) {
    if (!snap) return 'STAND';
    const groups = snap.groups || [];
    if (groups.indexOf('DOWNED') !== -1 || snap.phase === 'DOWNED') return 'DOWN';
    if (groups.indexOf('AIRBORNE') !== -1 || snap.phase === 'AIR') return 'AIR';
    if (snap.context) return snap.context;
    // Agachado: por la postura del estado (la FSM lo declara en `posture.limbs`)
    const limbs = snap.posture && snap.posture.limbs;
    if (limbs === 'CROUCH' || limbs === 'QUAD' || limbs === 'KNEEL') return 'CROUCH';
    return 'STAND';
}

// ===========================================================================
// LA POSE
// ===========================================================================

/**
 * Golpe con silueta de contexto.
 *
 * @param {object} rig
 * @param {string} moveKey    clave del golpe (para elegir silueta)
 * @param {string} context    'STAND' | 'CROUCH' | 'AIR' | 'DOWN'
 * @param {string} phase      'STARTUP' | 'ACTIVE' | 'RECOVERY'
 * @param {number} t          0..1 dentro de la fase
 * @param {object} [opts]
 *   posture   la postura de combate YA resuelta (posturePose): es la base y no
 *             se vuelve a calcular, para que las correcciones de estilo y de
 *             silueta de boxeo se apliquen igual que en reposo
 *   silhouette  silueta forzada (un moveset puede sobrescribir la de la tabla)
 *   loco      estado de movimiento (acompanamiento, ver FighterRig)
 */
export function attackPoseFor(rig, moveKey, context, phase, t, opts = {}) {
    const ctx = ATTACK_BASES[context] || ATTACK_BASES.STAND;
    const silName = silhouetteOf(moveKey, opts.silhouette);
    const sil = ATTACK_SILHOUETTES[silName] || ATTACK_SILHOUETTES.JAB;
    const S = sil[context] || sil.STAND;
    const tt = clamp01(t);

    // --- 1. base: la postura ya resuelta, o la del contexto --------------
    const base = opts.posture || {
        pose: createPose(),
        state: fk(rig, createPose())
    };
    const pose = clonePose(base.pose);
    let state = base.state;

    // --- 2. cuerpo: cadera, volcado y giro -----------------------------
    const B = S.base;
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.95;
    // El objetivo de cadera del contexto manda sobre el de la postura, EXCEPTO
    // en el aire, donde la postura ya sabe a que altura esta el cuerpo (la
    // entidad la pasa) y rebajarla dejaria al peleador colgando.
    const hip = context === 'AIR' ? (B.hip > 0 ? restHipY : B.hip) : B.hip;
    const cur = pose.pos && pose.pos.PELVIS ? pose.pos.PELVIS : [0, 0, 0];
    const dy = (hip - restHipY) - cur[1];
    if (Math.abs(dy) > 1e-4) setPos(pose, 'PELVIS', [cur[0], cur[1] + dy, cur[2]]);
    if (B.hipLift || B.hipDrop) {
        const c2 = pose.pos.PELVIS;
        const lift = ((B.hipLift || 0) - (B.hipDrop || 0)) * (phase === 'ACTIVE' ? 1 : 0.4);
        setPos(pose, 'PELVIS', [c2[0], c2[1] + lift, c2[2]]);
    }
    if (Math.abs(B.pitch) > 1e-4) {
        setEuler(pose, 'SPINE', 0, 0, -B.pitch);
        setEuler(pose, 'CHEST', 0, 0, -B.pitch * 0.6);
    }
    state = fk(rig, pose, state);

    // --- 3. el miembro de golpe, por fases ------------------------------
    // El easing NO es el mismo en las tres fases, y esa asimetria es lo que
    // hace que un golpe se lea como un golpe:
    //   STARTUP  EASE_OUT  arranca lento y acelera: el amago
    //   ACTIVE   EASE_IN   acelera y frena: el impacto
    //   RECOVERY EASE_IN_OUT vuelve sin prisa: la recogida
    const member = S.armL || S.legL;
    const K = member;
    let target = null;

    if (phase === 'STARTUP') target = lerp3(K.home, K.startup, ease('EASE_OUT', tt));
    else if (phase === 'ACTIVE') target = lerp3(K.startup, K.active, ease('EASE_IN', tt));
    else target = lerp3(K.active, K.home, ease('EASE_IN_OUT', tt));

    if (S.armL) {
        solveTwoBone(rig, pose, state, {
            upper: 'UPPERARM_L', lower: 'FOREARM_L',
            target, pole: [1, -0.15, -0.4]
        });
        state = fk(rig, pose, state);
    } else if (S.legL) {
        // --- pierna: el pie de APOYO se queda clavado ---------------------
        // Es la misma regla de FighterRig.attackPose: la patada no mueve el
        // apoyo, y si lo moviera el peleador pataria y saldria despedido.
        const other = S.leg === 'R' ? 'L' : 'R';
        solveTwoBone(rig, pose, state, {
            upper: 'THIGH_' + (S.leg || 'L'), lower: 'SHIN_' + (S.leg || 'L'),
            target, pole: [0.35, 0, 1]
        });
        state = fk(rig, pose, state);
        if (ctx.planted) {
            const support = base.targets && base.targets[other]
                ? base.targets[other]
                : [0, 0, 0];
            placeFoot(rig, pose, state, other, support, {
                autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
            });
            state = fk(rig, pose, state);
        }
    }

    // --- 4. el otro brazo: guarda o acompaña ----------------------------
    // Un golpe que mueve solo un brazo y deja el otro clavado en guardia
    // parece un mannequin. El otro brazo se lleva consigo: al amago se
    // recoge, en el impacto se extiende un poco.
    const guard = phase === 'ACTIVE' ? 0.72 : 1.0;
    const gx = S.armL ? 0.22 : 0.26;
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R',
        target: [gx * guard, (context === 'CROUCH' ? 0.90 : 1.18) * guard, 0.10],
        pole: [-1, -0.15, -0.3]
    });

    // --- 5. piernas del cuerpo, si no van de golpe ----------------------
    if (!S.legL && ctx.planted) {
        // Se dejan como estan: el punto de apoyo lo fijo la postura base. En
        // un golpe de brazo las piernas son lo que dice que el peleador esta
        // clavado, y tocarlas aqui rompe la base.
    }

    return {
        pose,
        state: fk(rig, pose, state),
        context,
        silhouette: silName,
        targets: base.targets,
        spec: base.spec
    };
}

/** Interpolacion lineal de un objetivo [x,y,z]. */
function lerp3(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}

export default {
    ATTACK_BASES, ATTACK_SILHOUETTES, MOVE_SILHOUETTES,
    silhouetteOf, contextOf, attackPoseFor
};