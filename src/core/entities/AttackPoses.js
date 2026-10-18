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
import { footTargets } from '../cine/Stances.js';
import { clamp01, lerp, ease } from '../cine/Math3.js';
import { registerTable, merge, deepFreeze, setOverride } from '../anim/Overrides.js';

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
 * LO IMPORTANTE: TODOS LOS OBJETIVOS ESTAN AL ALCANCE DEL BRAZO O LA PIERNA
 *
 *   Los objetivos `active` son punteros que el IK persigue, y el IK recorta en
 *   silencio lo que no alcanza (cine/Rig.js, `clamp`): si le pides 0,88 m de
 *   extension a un brazo de 0,57, el brazo se estira entero hacia ahi y para.
 *   No hay error, no hay aviso, y la pose se ve... casi igual de bien. Por eso
 *   es facil escribir en esta tabla un objetivo que "suena bien" y que en
 *   pantalla no hace NADA: mover el slider un centimetro mas alla no cambia ni
 *   un pixel, porque ya estaba recortado.
 *
 *   Catorce objetivos estaban asi. Los de `active` de casi todos los golpes de
 *   brazo llegaban 10 a 49 cm mas lejos del hombro que el brazo, y el barrido
 *   12 cm mas lejos que la pierna. Los numeros de esta tabla son ahora los
 *   puntos alcanzables REALES de cada pose (medidos con el hombro ya en su
 *   sitio, con el torso girado, no con el hombro de reposo).
 *
 *   `tests/anim.smoke.mjs` (seccion de alcance) comprueba esto con TODOS los
 *   pares familia/contexto/fase, para que un objetivo nuevo no vuelva a
 *   colarse. Al escribir un objetivo nuevo, lo mas facil es medirlo con el
 *   inspector (F2) y no de memoria: el panel avisa cuando el punto queda fuera.
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
            armL: Object.freeze({ home: [0.26, 1.16, 0.24], startup: [0.16, 1.06, 0.06], active: [0.11, 1.29, 0.53] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.34, twist: 0.38, yaw: 0 }),
            armL: Object.freeze({ home: [0.24, 0.86, 0.20], startup: [0.18, 0.76, 0.04], active: [0.13, 0.76, 0.51] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.20, twist: 0.52, yaw: 0 }),
            airborne: true,
            armL: Object.freeze({ home: [0.34, 1.10, 0.10], startup: [0.30, 1.30, -0.06], active: [0.12, 1.34, 0.52] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.70, pitch: 0.46, twist: 0.30, yaw: 0 }),
            armL: Object.freeze({ home: [0.28, 1.10, 0.24], startup: [0.24, 1.24, 0.06], active: [0.16, 1.03, 0.52] })
        })
    }),

    // --- GANCHO (curvo, entra por el lado) -------------------------------
    GANCHO: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.84, pitch: 0.14, twist: 0.62, yaw: 0.30 }),
            armL: Object.freeze({ home: [0.26, 1.16, 0.24], startup: [0.36, 1.02, 0.14], active: [0.15, 1.15, 0.52] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.48, pitch: 0.38, twist: 0.54, yaw: 0.34 }),
            armL: Object.freeze({ home: [0.24, 0.86, 0.20], startup: [0.36, 0.72, 0.12], active: [0.16, 0.80, 0.52] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.88, pitch: 0.24, twist: 0.70, yaw: 0.36 }),
            airborne: true,
            armL: Object.freeze({ home: [0.34, 1.10, 0.10], startup: [0.44, 0.96, 0.08], active: [0.18, 1.10, 0.49] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.68, pitch: 0.48, twist: 0.46, yaw: 0.30 }),
            armL: Object.freeze({ home: [0.28, 1.10, 0.24], startup: [0.40, 0.96, 0.12], active: [0.19, 1.01, 0.52] })
        })
    }),

    // --- ASCENDENTE (el que rompe la guardia alta) -----------------------
    UPPERCUT: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.72, pitch: 0.06, twist: 0.22, yaw: -0.10 }),
            armL: Object.freeze({ home: [0.22, 1.20, 0.22], startup: [0.16, 0.84, 0.02], active: [0.07, 1.47, 0.44] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.38, pitch: 0.24, twist: 0.20, yaw: -0.12 }),
            armL: Object.freeze({ home: [0.24, 0.84, 0.18], startup: [0.20, 0.54, 0.00], active: [0.10, 1.09, 0.40] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.82, pitch: 0.10, twist: 0.28, yaw: -0.08 }),
            airborne: true,
            armL: Object.freeze({ home: [0.32, 1.08, 0.10], startup: [0.26, 0.85, -0.04], active: [0.08, 1.46, 0.44] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.62, pitch: 0.34, twist: 0.18, yaw: -0.06 }),
            armL: Object.freeze({ home: [0.28, 1.08, 0.22], startup: [0.20, 0.72, 0.04], active: [0.11, 1.28, 0.40] })
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
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.18, 0.36, 0.06], active: [0.02, 0.17, 0.87] })
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
            legL: Object.freeze({ home: [0.16, 0.40, 0.14], startup: [0.14, 0.62, 0.06], active: [0.04, 0.21, 0.58] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.58, pitch: 0.56, twist: -0.28, yaw: 0, hipDrop: 0.10 }),
            legL: Object.freeze({ home: [0.28, 0.06, 0.20], startup: [0.30, 0.24, 0.10], active: [0.08, 0.14, 0.84] })
        })
    }),

    // =====================================================================
    // LAS FAMILIAS DE LA MATRIZ DE DIRECCIONES
    // =====================================================================
    // POR QUE CINCO MAS Y NO UNA POR CADA GOLPE
    //   La matriz tiene 54 celdas, pero las siluetas NO son 54: el brazo llega
    //   igual de lejos en un gancho que en un gancho de la izquierda, y escribir
    //   54 tablas de poses casi iguales seria copiar cuatro veces lo mismo.
    //
    //   Lo que hace que dos golpes se VEAN distintos es de donde sale el
    //   miembro y hacia donde va: el codo entra corto y por dentro, la patada
    //   de lado sale por el costado, la alta sube por encima de la cabeza. Eso
    //   son cinco formas, no nueve, y la izquierda y la derecha de la misma
    //   forma se distinguen porque el `yaw` del torso va con signo contrario.
    //   El test de alcance de `overrides.smoke.mjs` recorre estas cinco tambien:
    //   un objetivo fuera de rango no da error, solo deja de moverse.

    // --- PUÑO DE REVÉS (hacia atrás y cruzado) ---------------------------
    BACKFIST: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.12, twist: 0.50, yaw: 0.10 }),
            armL: Object.freeze({ home: [0.24, 1.18, 0.20], startup: [0.28, 1.22, -0.04], active: [0.26, 1.24, 0.34] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.36, twist: 0.44, yaw: 0.12 }),
            armL: Object.freeze({ home: [0.24, 0.86, 0.20], startup: [0.26, 0.92, -0.02], active: [0.24, 0.92, 0.30] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.22, twist: 0.58, yaw: 0.12 }),
            airborne: true,
            armL: Object.freeze({ home: [0.32, 1.10, 0.10], startup: [0.32, 1.30, -0.08], active: [0.28, 1.30, 0.30] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.70, pitch: 0.48, twist: 0.38, yaw: 0.10 }),
            armL: Object.freeze({ home: [0.28, 1.10, 0.24], startup: [0.30, 1.26, 0.00], active: [0.26, 1.20, 0.32] })
        })
    }),

    // --- PATADA DE LADO (por el costado) --------------------------------
    SIDEKICK: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.14, twist: -0.10, yaw: 0.55, hipLift: 0.06 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.34, 0.40, -0.02], active: [0.58, 0.86, 0.18] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.38, twist: -0.08, yaw: 0.50, hipLift: 0.04 }),
            legL: Object.freeze({ home: [0.24, 0.04, 0.14], startup: [0.30, 0.28, 0.00], active: [0.48, 0.50, 0.16] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.84, pitch: 0.22, twist: -0.14, yaw: 0.60, hipLift: 0.06 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.34, 0.16], startup: [0.30, 0.54, 0.04], active: [0.54, 0.84, 0.16] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.68, pitch: 0.46, twist: -0.10, yaw: 0.50, hipDrop: 0.03 }),
            legL: Object.freeze({ home: [0.26, 0.06, 0.20], startup: [0.34, 0.32, 0.06], active: [0.50, 0.64, 0.20] })
        })
    }),

    // --- PATADA ALTA (por encima de la cabeza) ---------------------------
    HIGHKICK: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.80, pitch: 0.04, twist: -0.16, yaw: 0, hipLift: 0.10 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.14, 0.52, -0.04], active: [0.06, 1.40, 0.50] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.48, pitch: 0.30, twist: -0.14, yaw: 0, hipLift: 0.06 }),
            legL: Object.freeze({ home: [0.24, 0.04, 0.14], startup: [0.18, 0.42, 0.00], active: [0.10, 1.00, 0.44] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.12, twist: -0.22, yaw: 0, hipLift: 0.08 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.34, 0.16], startup: [0.12, 0.70, 0.02], active: [0.04, 1.36, 0.46] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.66, pitch: 0.38, twist: -0.18, yaw: 0, hipLift: 0.06 }),
            legL: Object.freeze({ home: [0.26, 0.06, 0.20], startup: [0.22, 0.48, 0.04], active: [0.14, 1.04, 0.48] })
        })
    }),

    // --- PATADA DE GIRO (todo el cuerpo gira) ----------------------------
    SPINKICK: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.86, pitch: 0.18, twist: -0.50, yaw: 0.80, hipLift: 0.06 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.24, 0.40, 0.00], active: [0.18, 0.88, 0.64] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.50, pitch: 0.42, twist: -0.44, yaw: 0.70, hipLift: 0.03 }),
            legL: Object.freeze({ home: [0.24, 0.04, 0.14], startup: [0.28, 0.30, 0.02], active: [0.20, 0.54, 0.56] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.84, pitch: 0.26, twist: -0.56, yaw: 0.85, hipLift: 0.06 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.34, 0.16], startup: [0.22, 0.56, 0.04], active: [0.14, 0.86, 0.54] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.68, pitch: 0.50, twist: -0.42, yaw: 0.70, hipDrop: 0.03 }),
            legL: Object.freeze({ home: [0.26, 0.06, 0.20], startup: [0.32, 0.34, 0.08], active: [0.24, 0.66, 0.58] })
        })
    }),

    // --- PATADA BAJA (por debajo de la cintura, sin barrer) --------------
    LOWKICK: Object.freeze({
        STAND: Object.freeze({
            base: Object.freeze({ hip: 0.74, pitch: 0.28, twist: -0.22, yaw: 0, hipDrop: 0.08 }),
            legL: Object.freeze({ home: [0.20, 0.02, 0.12], startup: [0.16, 0.30, 0.04], active: [0.04, 0.32, 0.78] })
        }),
        CROUCH: Object.freeze({
            base: Object.freeze({ hip: 0.44, pitch: 0.46, twist: -0.20, yaw: 0, hipDrop: 0.04 }),
            legL: Object.freeze({ home: [0.24, 0.04, 0.14], startup: [0.22, 0.26, 0.06], active: [0.08, 0.24, 0.70] })
        }),
        AIR: Object.freeze({
            base: Object.freeze({ hip: 0.88, pitch: 0.28, twist: -0.26, yaw: 0 }),
            airborne: true,
            legL: Object.freeze({ home: [0.16, 0.40, 0.14], startup: [0.16, 0.58, 0.04], active: [0.06, 0.34, 0.54] })
        }),
        DOWN: Object.freeze({
            base: Object.freeze({ hip: 0.62, pitch: 0.54, twist: -0.22, yaw: 0, hipDrop: 0.06 }),
            legL: Object.freeze({ home: [0.26, 0.06, 0.20], startup: [0.28, 0.28, 0.08], active: [0.14, 0.36, 0.72] })
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
    RV_FIN: 'KICK',

    // =====================================================================
    // LA MATRIZ DE DIRECCIONES (core/directionMatrix.js)
    // =====================================================================
    // De pie, puño. Los laterales y los de delante son ganchos y jabs: el brazo
    // llega igual de lejos en todos ellos, lo que los separa es hacia donde va.
    PUNO_IZQUIERDO: 'GANCHO',
    PUNO_DERECHO: 'GANCHO',
    PUNO_ADELANTE_IZQ: 'JAB',
    PUNO_ADELANTE_DER: 'JAB',
    PUNO_ATRAS_IZQ: 'BACKFIST',
    PUNO_ATRAS_DER: 'BACKFIST',
    // De pie, patada. Cada forma tiene su familia porque la direccion del pie
    // es justo lo que el jugador ve: de lado, arriba o girando no son lo mismo.
    PATADA_ATRAS: 'KICK',
    PATADA_LADO_IZQ: 'SIDEKICK',
    PATADA_LADO_DER: 'SIDEKICK',
    PATADA_ALTA_IZQ: 'HIGHKICK',
    PATADA_ALTA_DER: 'HIGHKICK',
    PATADA_SPIN_IZQ: 'SPINKICK',
    PATADA_SPIN_DER: 'SPINKICK',
    // Agachado. Los dos que SUBEN (PATADA_BAJA_ALTA_*) van con KICK y no con
    // LOWKICK a proposito: son el unico castigo por quedarse en el suelo, y
    // tienen que verse claramente mas altos que el resto del suelo.
    PUNO_AGACHADO_ADELANTE: 'JAB',
    PUNO_AGACHADO_ATRAS: 'JAB',
    PUNO_AGACHADO_IZQ: 'GANCHO',
    PUNO_AGACHADO_DER: 'GANCHO',
    PUNO_AGACHADO_ADELANTE_IZQ: 'JAB',
    PUNO_AGACHADO_ADELANTE_DER: 'JAB',
    PUNO_AGACHADO_ATRAS_IZQ: 'BACKFIST',
    PUNO_AGACHADO_ATRAS_DER: 'BACKFIST',
    PATADA_AGACHADA: 'KICK',
    PATADA_AGACHADA_ATRAS: 'KICK',
    PATADA_BAJA_IZQ: 'LOWKICK',
    PATADA_BAJA_DER: 'LOWKICK',
    PATADA_BAJA_ALTA_IZQ: 'KICK',
    PATADA_BAJA_ALTA_DER: 'KICK',
    BARRIDO_IZQ: 'SWEEP',
    BARRIDO_DER: 'SWEEP',
    // En el aire
    PUNO_AEREO_ADELANTE: 'JAB',
    PUNO_AEREO_ATRAS: 'JAB',
    PUNO_AEREO_IZQ: 'GANCHO',
    PUNO_AEREO_DER: 'GANCHO',
    PUNO_AEREO_ADELANTE_IZQ: 'JAB',
    PUNO_AEREO_ADELANTE_DER: 'JAB',
    PUNO_AEREO_ATRAS_IZQ: 'BACKFIST',
    PUNO_AEREO_ATRAS_DER: 'BACKFIST',
    PATADA_AEREA: 'KICK',
    PATADA_AEREA_ADELANTE: 'KICK',
    PATADA_AEREA_ATRAS: 'KICK',
    PATADA_AEREA_IZQ: 'SIDEKICK',
    PATADA_AEREA_DER: 'SIDEKICK',
    PATADA_AEREA_ALTA_IZQ: 'HIGHKICK',
    PATADA_AEREA_ALTA_DER: 'HIGHKICK',
    PATADA_AEREO_SPIN_IZQ: 'SPINKICK',
    PATADA_AEREO_SPIN_DER: 'SPINKICK'
});

/** La silueta de un golpe: la que declara el moveset, o la de la tabla. */
/**
 * ===========================================================================
 * LA CAPA POR GOLPE: QUE UN GESTO NO HEREDE DE SU FAMILIA
 * ===========================================================================
 *
 * EL PROBLEMA QUE ESTA TABLA RESUELVE
 *   `MOVE_SILHOUETTES` reparte 69 golpes entre 10 familias, y hay 19 jabs, 14
 *   patadas y 9 ganchos. Un costillazo, una sumision y el especial se animan
 *   EXACTAMENTE igual porque los tres son `JAB`; y `PUNO_IZQUIERDO` y
 *   `PUNO_DERECHO` son el mismo dato. No es que las animaciones esten mal
 *   afinadas: es que son la MISMA, y el jugador ve el mismo gesto donde
 *   esperaba cuatro.
 *
 *   Con eso, un editor por familia es peor que inútil: ajustar `JAB` mueve los
 *   19 jabs a la vez. Por eso esta capa existe ANTES que el editor.
 *
 * LA REGLA, Y ES UNA REGLA Y NO UNA MEZCLA
 *   Si un golpe tiene aqui su propia silueta para un contexto, ESA manda y
 *   punto: no se le mezcla la de la familia. Si no la tiene, se hereda igual
 *   que hasta ahora.
 *
 *   Podria haberse hecho una mezcla campo a campo, y es lo que se suele hacer.
 *   Aqui no, a proposito: mezclar significaria que ajustar el codo de un golpe
 *   puede moverle la cadera que heredaba, y el autor no sabria de donde sale
 *   cada numero. Con sustitucion entera, lo que ves es lo que escribiste, y
 *   `origenDe()` dice de donde. Un editor de animaciones tiene que poder
 *   explicar el numero que estas viendo; si no puede, es una caja negra con
 *   sliders.
 *
 * POR QUE VACIA
 *   Vacia significa que hoy el juego se comporta IGUAL que antes, byte a byte.
 *   Esto no arregla ni un golpe por si solo: abre la puerta. Los golpes que
 *   tengan gesto propio se anaden aqui, uno a uno, y se pueden ver uno al lado
 *   del otro sin tocar los demas.
 */
export const MOVE_POSES = Object.freeze({
    // Ejemplo commented, NO activo, para que la forma se vea sin ensuciar el
    // juego: un costillazo de verdad deberia traer el codo atras y el torso
    // girado, no el brazo del jab. Se activa escribiendo la entrada.
    //
    // COSTILLAZO: Object.freeze({
    //     STAND: Object.freeze({ ... })
    // })
});

/** De donde sale la pose de un golpe en un contexto: el, o su familia. */
export const ORIGEN = Object.freeze({ GOLPE: 'GOLPE', FAMILIA: 'FAMILIA' });

/**
 * De donde viene la silueta de este golpe en este contexto.
 *
 * ES LO QUE PERMITE ELEGIR "TRABAJO EL GESTO" O "TRABAJO LA FAMILIA"
 *   Sin esto el editor no puede honestamente ofrecer las dos cosas: si no se
 *   sabe de donde sale una pose, la unica opcion honesta es editarla donde
 *   esta, y el autor acaba moviendo 19 golpes sin querer.
 *
 * @param {string} moveKey
 * @param {string} [contexto]
 * @returns {{origen:string, familia:string, gesto:string|null}}
 */
/**
 * Los campos que `attackPoseFor` lee SIN comprobar antes de poder dibujar.
 *
 * POR QUE SON ESTOS Y NO "LA PIEZA ENTERA"
 *   La primera version pedia `base, armL, armR, legL y legR` completos, y el
 *   motor rechazaba siluetas VALIDAS: el generador envuelve cada miembro en su
 *   propio `if (S.armL)`, asi que un golpe con un solo brazo se genera bien.
 *   La guarda estaba protegiendo de un fallo imposible y, de paso, impediendo
 *   escribir gestos a medias, que es justo lo que se va a hacer.
 *
 *   La segunda version pedia solo `base`, y seguia reventando. El motivo es que
 *   `writePath` NO rellena hermanos: al escribir
 *   `MOVE_POSES.COSTILLAZO.STAND.base.hip` crea `base` con UNA clave, y el
 *   generador lee `S.base.pitch` y `S.base.twist` sin comprobar. Menos mal que
 *   el `try/catch` de la prueba lo enseño en vez de dejarlo pasar: un
 *   `undefined` en un giro no peta, sale `NaN`, y un `NaN` en el torso se ve
 *   como "el golpe va raro" tres commits mas tarde.
 *
 * O sea que la condicion minima es la que de verdad se lee sin comprobar, y
 * los miembros opcionales se dejan a `if (S.armL)` porque esos si estan
 * protegidos.
 */
const PIEZAS = ['base.hip', 'base.pitch', 'base.twist'];

/**
 * De donde viene la silueta de este golpe en este contexto.
 *
 * QUE HACE ESTA FUNCION Y POR QUE TIENE UNA COMPROBACION DENTRO
 *   Dice de donde sale la pose, y sobre todo decide si un gesto propio esta
 *   ESCRITO o solo EMPEZADO.
 *
 *   Eso no es un detalle. Al escribir un override sobre
 *   `MOVE_POSES.COSTILLAZO.STAND.base.hip`, `writePath` crea el camino que
 *   falta: queda `COSTILLAZO.STAND.base.hip` y **nada mas**. Sin `armL`. Y
 *   como la regla es "el gesto propio sustituye ENTERO a la familia", el
 *   motor se encuentra con un `S` al que le falta el brazo y revienta con
 *   `Cannot read properties of undefined (reading 'startup')`.
 *
 *   O sea: el autor mueve un slider y el juego peta. El peor sitio posible para
 *   un fallo, porque el autor no ha hecho nada malo: ha empezado a escribir.
 *
 *   Asi que un gesto se considera escrito solo si tiene las cinco piezas que
 *   el generador va a leer. Si le falta alguna, se avisa POR CONSOLA y se
 *   sigue heredando de la familia, que es lo que el autor quiere de mientras.
 *   Es mejordater la familia a medias que romper el combate.
 *
 * @param {string} moveKey
 * @param {string} [contexto]
 * @param {object} [TABLE]  la tabla YA con parches (`liveMoves()`)
 * @returns {{origen:string, familia:string, gesto:object|null, incompleto:boolean}}
 */
export function origenDe(moveKey, contexto = 'STAND', TABLE) {
    const familia = MOVE_SILHOUETTES[moveKey] || 'JAB';
    // `merge()` puede devolver null si la tabla no esta registrada todavia o no
    // tiene nada que parchear. Un `null[moveKey]` revienta con "Cannot read
    // properties of null", que no dice nada sobre el golpe que estas editando.
    const propio = (TABLE || liveMoves() || {})[moveKey];
    const bruto = propio ? (propio[contexto] || propio.STAND || null) : null;
    if (!bruto) {
        return { origen: ORIGEN.FAMILIA, familia, gesto: null, incompleto: false };
    }
    const faltan = PIEZAS.filter(p => {
        const [a, b] = p.split('.');
        return !bruto[a] || bruto[a][b] === undefined;
    });
    if (faltan.length) {
        console.warn('[gesto] ' + moveKey + ' esta a medias, le faltan ' + faltan.join(', ')
            + '. Se sigue usando la familia ' + familia + ' hasta que este entero.');
        return { origen: ORIGEN.FAMILIA, familia, gesto: null, incompleto: true };
    }
    return { origen: ORIGEN.GOLPE, familia, gesto: bruto, incompleto: false };
}

/**
 * Copia la silueta de la familia de este golpe dentro de `MOVE_POSES`, para
 * poder ajustarla sin perder de donde venia.
 *
 * POR QUE HACE FALTA Y NO BASTA CON ESCRIBIR UN NUMERO
 *   `writePath` NO crea hermanos. Al escribir
 *   `MOVE_POSES.COSTILLAZO.STAND.base.hip` sobre una tabla VACIA deja
 *   `base: { hip: 0.33 }` y nada mas: ni `pitch`, ni `twist`, ni brazos. Y como
 *   el generador lee `base.pitch` sin comprobar, el combate se rompia.
 *
 *   O sea que **no se puede inventar un gesto desde cero con un slider**. Hay
 *   que empezar copiando la familia y ajustar encima. Lo cual, dicho al reves,
 *   es exactamente el flujo que quiere un autor: "parto de lo que hay y lo
 *   cambio", no "escribo 30 numeros en un formulario".
 *
 * @param {string} moveKey
 * @param {string} [contexto]  por defecto todos los que la familia declare
 * @returns {number}  cuantos numeros se han copiado
 */
export function sembrarGesto(moveKey, contexto) {
    const familia = MOVE_SILHOUETTES[moveKey] || 'JAB';
    const sil = (merge('ATTACK_SILHOUETTES')[familia] || ATTACK_SILHOUETTES[familia]);
    if (!sil) return 0;
    const ctxs = contexto ? [contexto] : Object.keys(sil);
    let n = 0;
    for (const ctx of ctxs) {
        const S = sil[ctx];
        if (!S) continue;
        for (const ruta of numericPaths(S)) {
            const v = ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
            setOverride('MOVE_POSES.' + moveKey + '.' + ctx + '.' + ruta, v);
            n++;
        }
    }
    return n;
}

/** Las hojas numericas de un objeto, como rutas con puntos. */
function numericPaths(o, pre = '', out = []) {
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) {
        const v = o[k];
        const r = pre ? pre + '.' + k : k;
        if (typeof v === 'number') out.push(r);
        else if (Array.isArray(v)) v.forEach((x, i) => out.push(r + '.' + i));
        else if (v && typeof v === 'object') numericPaths(v, r, out);
    }
    return out;
}

export function silhouetteOf(moveKey, declared) {
    if (declared && ATTACK_SILHOUETTES[declared]) return declared;
    return MOVE_SILHOUETTES[moveKey] || 'JAB';
}

/**
 * REGISTRO PARA EL INSPECTOR (core/anim/Overrides.js).
 *
 * Las dos tablas de este archivo se registran al importarlas. A partir de ahi
 * `live*()` devuelve la tabla CON los overrides aplicados, y es la que leen
 * `attackPoseFor` y `contextOf`.
 *
 * La tabla original no se toca nunca. Eso es lo que mantiene el motor
 * EXACTAMENTE igual que en las pruebas cuando el inspector no esta abierto:
 * `merge()` no encuentra nada que parchear y devuelve la referencia original
 * intacta. La equivalencia la comprueba `tests/overrides.smoke.mjs`.
 *
 * `TABLE` opcional en los dos `live*`: sirve para pasar una silueta inventada
 * sin tocar la tabla real (testear una familia nueva antes de decidir donde
 * va).
 */
export function liveSilhouettes(TABLE) {
    return TABLE || merge('ATTACK_SILHOUETTES');
}

/** Lo mismo para las bases (cadera y guardia de cada contexto). */
export function liveBases(TABLE) {
    return TABLE || merge('ATTACK_BASES');
}

/**
 * La capa por golpe CON los overrides puestos.
 *
 * POR QUE HACE FALTA Y POR QUE NO BASTA CON LEER `MOVE_POSES`
 *   `MOVE_POSES` es la tabla ORIGINAL, y la original nunca se toca: lo que se
 *   guarda va en el parche y sale por `merge()`. Si `origenDe` leyera la
 *   original, pondrias un override sobre `MOVE_POSES.COSTILLAZO...`, lo
 *   veras mover en el inspector, y el combate seguiria usando la tabla vieja.
 *   Ese es el peor fallo posible en un editor: el control responde y no cambia
 *   nada, y el autor se va a buscar el problema al sitio equivocado.
 */
export function liveMoves(TABLE) {
    return TABLE || merge('MOVE_POSES');
}

registerTable('ATTACK_SILHOUETTES', deepFreeze(ATTACK_SILHOUETTES));
registerTable('ATTACK_BASES', deepFreeze(ATTACK_BASES));
// La capa por golpe se registra como UNA TABELA MAS, y no como una excepcion
// dentro de `liveSilhouettes()`. Motivo: asi el inspector la recorre con el
// mismo mecanismo que las otras dos, y un override sobre
// `MOVE_POSES.COSTILLAZO.STAND.armL` se guarda y se lee sin que haya que
// escribir un segundo sistema de parches. Un solo camino para las tres tablas.
registerTable('MOVE_POSES', deepFreeze(MOVE_POSES));

// Lo que se registra es la tabla YA CONGELADA EN PROFUNDO. Sin esto, los arrays
// de dentro (`armL.active`, `base.hip`...) siguen siendo escribibles: `freeze`
// no baja a los hijos, y un `= 99` en un array cambia el motor en silencio y
// para siempre. Ver la nota de `deepFreeze` en core/anim/Overrides.js.

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
    // Un contexto impuesto vale mas que la postura: es lo que usa el inspector
    // para forzar uno (ver el golpe agachado mientras el peleador esta de pie,
    // que en combate no se puede ver).
    if (snap.context && liveBases()[snap.context]) return snap.context;
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
    // Las tablas se leen por `live*()` (ver el registro mas arriba): con el
    // inspector cerrado son las originales; abierto, las parcheadas.
    const bases = liveBases(opts.bases);
    const siluetas = liveSilhouettes(opts.silhouettes);
    const ctx = bases[context] || bases.STAND;
    const silName = silhouetteOf(moveKey, opts.silhouette);
    const sil = siluetas[silName] || siluetas.JAB;
    // --- LA CAPA POR GOLPE, Y POR QUE SE LEE DESPUES DE LA FAMILIA -------
    // La familia se lee siempre (es el defecto) y el gesto propio, si existe,
    // la pisa ENTERA. Se lee aqui y no en `silhouetteOf` porque
    // `silhouetteOf` devuelve un NOMBRE de familia y esta capa devuelve una
    // silueta completa: si se mezclaran las dos cosas, la firma diria una cosa
    // y haria otra.
    //
    // Con la tabla vacia, `gestoPropio` es null y esto es exactamente lo de
    // antes. Eso es lo que comprueba la prueba de equivalencia.
    const propio = origenDe(moveKey, context, opts.moves).gesto;
    const S = propio || sil[context] || sil.STAND;
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

    // --- 2b. los pies vuelven al suelo DESPUES de mover la cadera --------
    //
    // ESTE BLOQUE ES UN ARREGLO, Y HACE FALTA PORQUE EL ORDEN ESTA MAL.
    //
    // La postura base (cine/Stances.js) clava las puntas en el suelo a una
    // cierta altura de cadera. Aqui, despues, se corrige la cadera a la del
    // contexto y a la de la silueta, y ESO MUEVE LOS PIES: bajar la cadera
    // entierra las puntas, levantarla deja al peleador de puntillas.
    //
    // Medido en el rig del contrato (TOE_L en metros, 0 = apoyado):
    //     jab        cadera 0,86 -> punta a -0,02   (2 cm enterrada)
    //     gancho     cadera 0,84 -> punta a -0,04
    //     uppercut   cadera 0,72 -> punta a -0,16   (16 cm: las dos piernas
    //                                                     bajo el suelo)
    //     jab tumbado               punta a -0,18   (la cadera SUBE)
    //
    // Ese es el fallo que hace que un golpe se vea "por debajo del suelo":
    // no es que el personaje baje, es que se hunde el suelo con el.
    //
    // POR QUE AQUI Y NO EN LA POSTURA
    //   La postura no sabe cuanto va a bajar la cadera el golpe: ese numero es
    //   de aqui (S.base.hip). Reclavar los pies es, por tanto, parte de la
    //   resolucion del golpe, no de la postura.
    //
    // POR QUE `autoDrop:false` Y `hipPasses:0`
    //   `autoDrop` baja la cadera cuando el pie no llega, que es justo lo que
    //   se quiere IMPEDIR: aqui la altura de la cadera la ha pedido la
    //   silueta. Y `hipPasses:0` deja que se corrija solo la articulacion de la
    //   cadera de ese pie, sin tocar la pelvis. Es el mismo criterio que ya
    //   usa el pie de apoyo de los golpes de pierna mas abajo.
    //
    // POR QUE NO SE HACE PARA LOS GOLPES DE PIERNA
    //   En un golpe de pierna el pie que se mueve es el de la patada, y se
    //   clava DESPUES el de apoyo (seccion 3). Clavar los dos aqui seria
    //   tirar por tierra el trabajo del paso 3.
    // Si quien llama no paso una postura, no hay ningun pie clavado todavia
    // (base.targets es undefined) y los puntos de apoyo se sacan de la
    // separacion de la base del CONTEXTO. Sin esto, una llamada sin `posture`
    // deja al peleador con los pies bajo el suelo: el mismo fallo de antes,
    // pero por no tener de donde clavar en vez de por el orden.
    const targets = base.targets
        || (ctx.planted ? footTargets(ctx.spec, 1) : null);
    if (!S.legL && context !== 'AIR' && targets) {
        placeFoot(rig, pose, state, 'L', targets.L, {
            autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
        });
        state = fk(rig, pose, state);
        placeFoot(rig, pose, state, 'R', targets.R, {
            autoDrop: false, hipPasses: 0, pole: [0, 0, 1]
        });
        state = fk(rig, pose, state);
    }

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