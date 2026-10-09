/**
 * ============================================================================
 * SANPABLERA ENGINE · entities/HitReactions.js
 * ----------------------------------------------------------------------------
 * LAS REACCIONES A UN GOLPE: la matriz de 3 alturas x 3 potencias.
 *
 *   ALTURA   ALTO (cabeza) · MEDIO (torso) · BAJO (pierna/cadera)
 *   POTENCIA DEBIL (roce) · MEDIO (golpe normal) · FUERTE (manda al suelo)
 *
 * Son nueve reacciones, no una. Y no son nueve animaciones distintas escritas a
 * mano: son nueve FILAS DE DATOS que dicen donde cae cada parte del cuerpo, y
 * el codigo las convierte en poses con el mismo IK que el resto del motor.
 *
 * POR QUE NO BASTA CON "FUERTE" Y "NO FUERTE"
 * ----------------------------------------------------------------------------
 *   Antes de esto, flinchPose() solo miraba si el golpe era FUERTE: dos
 *   reacciones para nueve casos. Los errores que salian de ahi son los que se
 *   ven en cualquier juego de pelea con la animacion sin pulir:
 *
 *     - Un jab a la CARA y un gancho al PECHO reaccionan igual, y el jugador no
 *       ve que le han dado en la cabeza. La altura del golpe es informacion de
 *       LECTURA, no solo de dano: dice donde ha entrado.
 *     - Un barrido a la PIERNA y un jab a la CARA terminaban en la misma pose
 *       de "tambaleandose hacia atras". Un golpe bajo tiene que tumbar hacia
 *       ABAJO: si no, el barrido parece mas suave que el jab, y el jugador
 *       aprende a girar el bloqueo como si no valiera.
 *     - La potencia no solo escala el DESPLAZAMIENTO, cambia la SILUETA: un
 *       golpe fuerte dobla el torso y echa el brazo atras (se ve el esfuerzo);
 *       uno debil solo mueve la cabeza. Y si solo se escala un numero, los
 *       golpes importantes se ven igual de baratos que un jab.
 *
 * QUE GUARDA CADA FILA
 * ----------------------------------------------------------------------------
 *   hip       altura de cadera (m). El golpe fuerte hunde al que lo recibe.
 *   spine     [pitch, yaw, roll] en radianes. El yaw es lo que hace que el
 *             cuerpo GIRE al recibir el golpe, que es la mitad de la lectura.
 *   head      [pitch, yaw] del cuello: la cabeza siempre llega tarde y en
 *             sentido contrario al torso (es lo que ya decia MORPH HEAD_LAG).
 *   arms      [manoL, manoR] objetivos en espacio de personaje. El brazo que
 *             recibe el golpe se echa atras y el otro intenta taparse.
 *   legs      [pieL, pieR] donde queda cada apoyo. El golpe fuerte mete un pie
 *             atras para que el cuerpo tenga donde caer.
 *   recover   0..1, cuanto pesa la postura al terminar el hitstun. Un golpe
 *             fuerte vuelve a la guardia MUY despacio (el jugador ve que ha
 *             sido un palo); uno debil, de golpe.
 *
 * CONVENCION DE ESPACIO
 *   Y arriba, Z adelante, origen en el suelo bajo la pelvis (la de
 *   cine/Stances.js). Los objetivos de mano van en metros absolutos, igual que
 *   los de las posturas de boxeo: asi el IK los alcanza sin inventarse nada.
 * ============================================================================
 */

import {
    createPose, setEuler, setPos, clonePose, addPose
} from '../cine/Pose.js';
import { fk, solveTwoBone } from '../cine/Rig.js';
import { clamp01, lerp, ease } from '../cine/Math3.js';
import { registerTable, merge, deepFreeze } from '../anim/Overrides.js';

// ===========================================================================
// EL VOCABULARIO
// ===========================================================================

/** Altura del golpe (de donde entra). Es el `height` de MoveTable. */
export const HitHeight = Object.freeze({
    ALTO: 'ALTO',
    MEDIO: 'MEDIO',
    BAJO: 'BAJO',
    SUELO: 'SUELO'      // el que se esquiva saltando (el barrido y el remate)
});

/** Potencia del golpe (cuanto pega). Es el `power` de MoveTable. */
export const HitPower = Object.freeze({
    DEBIL: 'DEBIL',
    MEDIO: 'MEDIO',
    FUERTE: 'FUERTE'
});

/**
 * Filas de la matriz. El orden de escritura es ALTO x DEBIL/MEDIO/FUERTE, y
 * luego MEDIO, y luego BAJO: asi la tabla se lee como se ve, de arriba abajo.
 *
 * NOTA SOBRE LOS OBJETIVOS DE MANO
 *   [x, y, z] en espacio de personaje. El lado izquierdo del personaje esta en
 *   +X (ver la nota larga de Stances.js: con el personaje mirando a +Z, la
 *   mano izquierda esta en +X). Confundirlo no da error: sale un peleador con
 *   los codillos cambiados de lado, que es el fallo que no aparece en ningun
 *   log y se ve en todas las partidas.
 */
export const HIT_REACTIONS = Object.freeze({
    // =========================================================================
    // ALTO · a la cabeza
    // =========================================================================
    [HitHeight.ALTO]: Object.freeze({
        DEBIL: Object.freeze({
            hip: 0.90, spine: [-0.10, 0.16, 0.06], head: [0.30, -0.20],
            arms: [[0.30, 1.10, -0.06], [-0.22, 1.24, -0.30]],
            legs: [[0.20, 0, 0.10], [-0.18, 0, -0.10]],
            recover: 0.85,
            note: 'Un roce en la cabeza: la cabeza va sola, el cuerpo casi igual.'
        }),
        MEDIO: Object.freeze({
            hip: 0.86, spine: [-0.16, 0.34, 0.12], head: [0.46, -0.34],
            arms: [[0.38, 1.04, -0.16], [-0.26, 1.20, -0.34]],
            legs: [[0.22, 0, 0.06], [-0.24, 0, -0.18]],
            recover: 0.62,
            note: 'El clasico: cabeza atras, torso girado, un pie atras.'
        }),
        FUERTE: Object.freeze({
            hip: 0.74, spine: [-0.30, 0.56, 0.22], head: [0.62, -0.48],
            arms: [[0.46, 0.92, -0.28], [-0.30, 1.10, -0.40]],
            legs: [[0.26, 0, -0.04], [-0.30, 0, -0.34]],
            recover: 0.34,
            note: 'Cabezazo: el cuerpo entero se va de lado y cae de espaldas.'
        })
    }),

    // =========================================================================
    // MEDIO · al torso
    // =========================================================================
    [HitHeight.MEDIO]: Object.freeze({
        DEBIL: Object.freeze({
            hip: 0.91, spine: [-0.06, 0.10, 0.04], head: [0.14, -0.10],
            arms: [[0.28, 1.14, 0.02], [-0.24, 1.18, -0.26]],
            legs: [[0.20, 0, 0.10], [-0.18, 0, -0.10]],
            recover: 0.88,
            note: 'El jab de alguien que no pega fuerte: apenas se nota.'
        }),
        MEDIO: Object.freeze({
            hip: 0.87, spine: [-0.20, 0.28, 0.10], head: [0.30, -0.24],
            arms: [[0.36, 1.06, -0.10], [-0.28, 1.22, -0.32]],
            legs: [[0.24, 0, 0.04], [-0.26, 0, -0.20]],
            recover: 0.58,
            note: 'Golpe al cuerpo: el torso dobla y se gira un poco.'
        }),
        FUERTE: Object.freeze({
            hip: 0.72, spine: [-0.34, 0.50, 0.20], head: [0.48, -0.40],
            arms: [[0.44, 0.90, -0.22], [-0.32, 1.06, -0.42]],
            legs: [[0.28, 0, -0.06], [-0.32, 0, -0.36]],
            recover: 0.30,
            note: 'El que tira al suelo: postura rota, sin base.'
        })
    }),

    // =========================================================================
    // BAJO · a la pierna / la cadera
    // =========================================================================
    // LA DIFERENCIA CLAVE: el torso va HACIA DELANTE y ABAJO, no hacia atras.
    // Es lo que hace que un barrido se lea como barrido. Con la misma tabla
    // que el golpe al torso, el jugador no veria la diferencia y aprenderia a
    // no saltarlo.
    [HitHeight.BAJO]: Object.freeze({
        DEBIL: Object.freeze({
            hip: 0.84, spine: [0.10, 0.14, 0.06], head: [-0.14, -0.12],
            arms: [[0.30, 1.02, 0.14], [-0.26, 1.10, -0.24]],
            legs: [[0.30, 0, 0.16], [-0.26, 0, -0.22]],
            recover: 0.80,
            note: 'Toque bajo: se aguanta, pero la pierna tiende a fallar.'
        }),
        MEDIO: Object.freeze({
            hip: 0.72, spine: [0.26, 0.30, 0.14], head: [-0.26, -0.22],
            arms: [[0.36, 0.92, 0.22], [-0.30, 1.02, -0.30]],
            legs: [[0.34, 0, 0.20], [-0.32, 0, -0.32]],
            recover: 0.46,
            note: 'Barrido limpio: se dobla por la cintura, el pie sentado.'
        }),
        FUERTE: Object.freeze({
            hip: 0.56, spine: [0.46, 0.48, 0.24], head: [-0.40, -0.34],
            arms: [[0.42, 0.78, 0.30], [-0.34, 0.88, -0.36]],
            legs: [[0.40, 0, 0.24], [-0.38, 0, -0.44]],
            recover: 0.20,
            note: 'Barrido con fuerza: al suelo de espaldas, el torso pegado.'
        })
    })
});

// ===========================================================================
// TRADUCCION DESDE EL FRAME DATA
// ===========================================================================

/**
 * De donde `impactKind` sale, para no tener dos vocabularios.
 *
 * `CineConstants.ImpactKind` (GRAZE/LIGHT/HEAVY/CRUSH/LAUNCH/SLAM) ya existe
 * y es lo que usa el ejecutor de impactos. Aqui se mapea a la potencia de la
 * matriz, de modo que el golpe que ejecuta la camara y el que deforma el
 * cuerpo son SIEMPRE el mismo.
 */
export const IMPACT_TO_POWER = Object.freeze({
    GRAZE: HitPower.DEBIL,
    LIGHT: HitPower.DEBIL,
    HEAVY: HitPower.MEDIO,
    CRUSH: HitPower.FUERTE,
    LAUNCH: HitPower.FUERTE,
    SLAM: HitPower.FUERTE
});

/**
 * Potencia declarada por un golpe.
 *
 * POR QUE SE LEE PRIMERO `power` Y NO `hitLevel`
 *   `hitLevel` (BAJO/MEDIO/FUERTE) mezcla DOS cosas: DONDE pega y CUANTO. Un
 *   barrido es hitLevel BAJO pero puede pegar fuerte; un toque a la rodilla es
 *   hitLevel BAJO y no pega de nada. Si la potencia se sacara del hitLevel, el
 *   barrido mas debil del juego tendria la misma reaccion que el mas fuerte y
 *   la matriz no serviria de nada. Por eso el golpe declara las dos cosas por
 *   separado, y `hitLevel` solo se usa como plan B.
 */
export function powerOf(move) {
    if (!move) return HitPower.MEDIO;
    if (move.power) {
        return move.power === 'FUERTE' || move.power === 'DEBIL' ? move.power : HitPower.MEDIO;
    }
    if (move.hitLevel === 'FUERTE') return HitPower.FUERTE;
    if (move.hitLevel === 'BAJO') return HitPower.DEBIL;
    return HitPower.MEDIO;
}

/**
 * Altura declarada por un golpe.
 *
 * `SUELO` y `BAJO` comparten fila a proposito: los dos se esquivan saltando y
 * los dos tienen que tumbar hacia abajo. Separarlos solo serviria para tener
 * dos filas identicas, que es como empiezan las tablas que nadie mantiene.
 */
export function heightOf(move) {
    if (!move || !move.height) return HitHeight.MEDIO;
    return move.height;
}

/**
 * REGISTRO PARA EL INSPECTOR (core/anim/Overrides.js).
 *
 * `liveReactions()` devuelve la matriz CON los overrides aplicados. La tabla
 * original no se toca: sin parche, `merge()` devuelve la referencia intacta y
 * el motor se comporta igual que en las pruebas. Lo comprueba
 * `tests/overrides.smoke.mjs`.
 *
 * `TABLE` opcional para pasar una matriz de prueba sin tocar la real.
 */
export function liveReactions(TABLE) {
    return TABLE || merge('HIT_REACTIONS');
}

// En profundo, no solo el primer nivel: los arrays de las filas (`spine`,
// `arms`, `legs`) tienen que quedarse quietos tambien. Ver `deepFreeze`.
registerTable('HIT_REACTIONS', deepFreeze(HIT_REACTIONS));

/** La fila de la matriz para un golpe. Siempre devuelve algo valido. */
export function reactionFor(move, TABLE) {
    const T = TABLE || liveReactions();
    const h = heightOf(move);
    const p = powerOf(move);
    const row = T[h] || T[HitHeight.MEDIO];
    return row[p] || row[HitPower.MEDIO];
}

/**
 * Los MISMOS datos de un golpe, pero en el vocabulario de la cinematica
 * (ImpactKind). Es el puente entre el frame data y el ejecutor de impactos, y
 * lo consulta cine/CineConstants cuando un cuerpo recibe un golpe.
 */
export function impactKindOf(move) {
    const p = powerOf(move);
    const h = heightOf(move);
    if (move.launch && move.launch.y > 3) return 'LAUNCH';
    if (h === HitHeight.SUELO || h === HitHeight.BAJO) return p === HitPower.FUERTE ? 'SLAM' : 'LIGHT';
    if (p === HitPower.FUERTE) return 'CRUSH';
    if (p === HitPower.DEBIL) return 'GRAZE';
    return 'HEAVY';
}

// ===========================================================================
// LA POSE
// ===========================================================================

/**
 * Reaccion a un golpe en su instante `t` del hitstun.
 *
 * @param {object} rig      rig numerico (cine/Rig.js)
 * @param {object} move     el golpe recibido (frame data de MoveTable)
 * @param {number} t        0..1 dentro del hitstun
 * @param {object} [opts]   los de posturePose (style, forward, dist, time)
 * @returns {{pose, state, reaction, height, power}}
 */
export function hitReactionPose(rig, move, t, opts = {}) {
    const tt = clamp01(t);
    const height = opts.height || heightOf(move);
    const power = opts.power || powerOf(move);
    // La matriz se lee por `liveReactions()`: con el inspector cerrado es la
    // original; abierto, la parcheada.
    const T = opts.reactions || liveReactions();
    const row = T[height] || T[HitHeight.MEDIO];
    const R = row[power] || row[HitPower.MEDIO];

    // El impacto NO entra de golpe: el cuerpo primero recibe y luego se
    // desplaza. Es la diferencia entre "un golpe" y "un empujon", y se nota
    // mas de lo que parece: es lo que separa a los golpes que duelen de los
    // que solo empujan.
    const hit = ease('EASE_OUT', clamp01(tt / 0.22));
    // Y la vuelta a la guardia se tarda `recover`: un golpe fuerte vuelve
    // despacio, que es exactamente lo que el jugador lee como "me ha pegado
    // fuerte".
    const back = ease('EASE_IN_OUT', clamp01((tt - 0.35) / Math.max(0.05, 1 - 0.35)));
    const k = lerp(hit, 1 - R.recover, back);
    const w = clamp01(k);

    // --- pose del impacto -------------------------------------------
    const pose = createPose();

    // Torso. El spine lleva el giro (yaw) y el volcado (pitch); el pecho
    // repite la mitad de cada uno, como en Stances.js: si no, la columna
    // entera gira de un bloque y el personaje parece una puerta.
    //
    // OJO CON EL SIGNO DEL VOLCADO, que es lo mas facil de invertir aqui.
    // En este espacio (Y arriba, Z adelante, el personaje mirando a +Z) un rx
    // NEGATIVO lleva el torso hacia -Z, es decir hacia ATRAS. Comprobado
    // contra el rig: con rx = -0,5 la cabeza queda en z = -0,235 y con +0,5 en
    // z = +0,235. La tabla se escribe con ese criterio ("me echan hacia
    // atras" = negativo), asi que aqui NO se invierte nada.
    const [sp, sy, sr] = R.spine;
    setEuler(pose, 'SPINE', sp * w, sy * w, sr * w);
    setEuler(pose, 'CHEST', sp * 0.5 * w, sy * 0.7 * w, sr * 0.5 * w);

    // Cuello y cabeza. Aqui SI se invierte, y es a proposito: la cabeza va
    // en sentido CONTRARIO al torso (el cuello es una articulacion en
    // espejo), asi que un golpe al pecho echa el torso atras y la cabeza
    // adelante. Sin la inversion la cabeza se inclinaba hacia atras con el
    // torso, que es un cuello roto y ademas quita la lectura de "me han
    // golpeado y la cabeza sigue de largo".
    const [hp, hy] = R.head;
    setEuler(pose, 'NECK', -hp * w, hy * w, 0);
    setEuler(pose, 'HEAD', -hp * 0.45 * w, hy * 0.6 * w, 0);

    // Cadera: se hunce lo que dice la fila (un golpe fuerte encoge al que lo
    // recibe) y se compensa girando un poco hacia el lado del impacto.
    // La fila declara la ALTURA a la que queda el que recibe el golpe, no un
    // delta. `setPos` guarda un DELTA respecto al reposo, asi que hay que
    // restar la altura de reposo. Con el signo al reves un golpe fuerte hacia
    // que el peleador se ELEVARA: la cadera media salia a 1,18 m (por encima
    // de la de pie) y el torso recibia el golpe por arriba.
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.95;
    setPos(pose, 'PELVIS', [0, R.hip - restHipY, 0]);

    let state = fk(rig, pose);

    // --- brazos ------------------------------------------------------
    // El brazo que recibe el golpe se echa atras y abierto; el otro sube a
    // tapar. Los dos se resuelven con IK de dos huesos, y por eso se recalcula
    // la FK entre medias: el segundo brazo se apoya en el torso ya girado.
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L',
        target: R.arms[0], pole: [1, -0.1, -0.45]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R',
        target: R.arms[1], pole: [-1, -0.1, -0.45]
    });
    state = fk(rig, pose, state);

    // --- piernas: los apoyos NO se clavan en el suelo ----------------
    // Aqui esta la diferencia con una postura de combate. Un golpe alto no
    // clava los pies: el cuerpo sale despedido y las piernas siguen en el
    // aire un instante. Por eso aqui NO se usa placeFoot(), y en su lugar se
    // resuelven las dos piernas con IK a un objetivo en el suelo, sin la
    // compensacion de cadera que hace placeFoot (que aqui deformaria el
    // impacto justo cuando mas se nota).
    const fwd = opts.forward === undefined ? 1 : opts.forward;
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_L', lower: 'SHIN_L',
        target: R.legs[0], pole: [0.4, 0, fwd]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_R', lower: 'SHIN_R',
        target: R.legs[1], pole: [-0.4, 0, fwd]
    });
    state = fk(rig, pose, state);

    return { pose, state, reaction: R, height, power, weight: w };
}

/**
 * La reaccion encima de la postura de combate: lo que se ve de verdad.
 *
 * La postura sola no basta (el codigo se va a tapar las manos) y la reaccion
 * sola no basta (los pies se quedan en la posicion de reposo, con el cuerpo
 * torcido sobre ellos). Se mezclan con `recover` como peso, que es el dato
 * que la fila declara para eso.
 *
 * POR QUE EL PARAMETRO ES LA POSTURA YA HECHA Y NO UN `posture`
 *   La postura la construye FighterRig.posturePose(), que aplica las
 *   correcciones de estilo y la silueta de boxeo. Si aqui se volviera a pedir
 *   el `posture`, habria que duplicar esa logica y las dos copias divergirian
 *   en cuanto alguien tocara una. El llamante ya la tiene resuelta: se pasa.
 *
 * @param {object} stancePoseResult  resultado de posturePose(): { pose, state }
 * @param {object} hit              resultado de hitReactionPose()
 */
export function blendReactionOverStance(rig, stancePoseResult, hit) {
    const w = clamp01(hit.weight) * (hit.reaction ? hit.reaction.recover : 0.6);
    // Mezcla ADITIVA sobre la postura: la reaccion no sustituye a la guardia,
    // se le echa encima. Es la diferencia entre "el peleador recibe un golpe
    // sin dejar de estar en guardia" (lo que pasa de verdad) y "el peleador
    // cambia a una pose de impacto" (un muñeco de trapo).
    const out = clonePose(stancePoseResult.pose);
    addPose(out, hit.pose, w);
    return { pose: out, state: fk(rig, out, stancePoseResult.state) };
}

// ===========================================================================
// LOS GOLPES EN EL SUELO
// ===========================================================================

/**
 * Ataque contra el rival CAIDO ("castigo al del suelo", biblia 8).
 *
 * NO es un `hitLevel` mas: es una familia de golpes con su propia silueta
 * (el de arriba con un pie, o dos manos en el suelo) y su propia lectura (el
 * rival sabe que le estan pisando los dedos). Los targets estan en ESPACIO DE
 * SUELO (y a la altura del suelo), no en espacio de personaje, porque quien
 * golpea esta de pie y el que esta tumbado no comparte pelvis.
 *
 * @param {object} rig
 * @param {string} kind  'PIE' | 'MANOS' | 'SALTAR' | 'PESADO'
 * @param {string} phase 'STARTUP' | 'ACTIVE' | 'RECOVERY'
 * @param {number} t     0..1 dentro de la fase
 */
export function groundAttackPose(rig, kind, phase, t, opts = {}) {
    // LA FASE LA MANDA EL LLAMANTE. Antes se recalculaba aqui repartiendo `t`
    // en tercios, y eso hacia que `groundAttackPose(..., 'STARTUP', 1)` cayera
    // en RECOVERY: el amago y el golpe salian exactamente igual, que es
    // justo la comprobacion que falla si el golpe de suelo no tiene recorrido.
    // `t` es el progreso DENTRO de la fase que se pide.
    const st = (phase === 'STARTUP' || phase === 'ACTIVE' || phase === 'RECOVERY')
        ? phase : 'ACTIVE';
    const local = clamp01(t);

    // Cadera del que pisa: baja (apoya el peso) y adelanta (sobre el cuerpo).
    const HIP = { PIE: 0.66, MANOS: 0.46, SALTAR: 0.86, PESADO: 0.58 };
    const FOOT = {
        PIE: [0.30, 0.40, 0.52],
        MANOS: [0.24, 0.16, 0.42],
        SALTAR: [0.22, 0.62, 0.48],
        PESADO: [0.34, 0.10, 0.56]
    };
    const HANDS = {
        PIE: [[0.24, 1.16, 0.26], [-0.20, 0.66, -0.14]],
        MANOS: [[0.26, 0.42, 0.34], [-0.22, 0.40, -0.30]],
        SALTAR: [[0.30, 1.24, 0.30], [-0.26, 1.20, -0.28]],
        PESADO: [[0.30, 0.50, 0.36], [-0.28, 0.48, -0.32]]
    };
    const key = FOOT[kind] ? kind : 'PIE';

    const pose = createPose();
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.95;

    // El amago (STARTUP) es un retroceso corto: el pie sube por encima y
    // vuelve. Sin ese amago el golpe se ve como un latigazo que aparece de la
    // nada, que es el fallo clasico de la animacion de suelo.
    const k = st === 'STARTUP' ? 1 - ease('EASE_OUT', local)
        : st === 'ACTIVE' ? ease('EASE_IN', local)
            : 1 - ease('EASE_IN_OUT', local);

    // EL PIE TIENE QUE VIAJAR, no quedarse en un punto por fase: el objetivo
    // final se recorre desde la guardia (el pie en el suelo, junto al rival) y
    // no desde un sitio intermedio inventado. `ready` es el punto de partida
    // (el pie apoyado) y `windup` el punto mas alto del amago.
    const ready = [0.20, 0.04, 0.10];
    const windup = [0.30, 0.62, 0.30];
    const foot = st === 'STARTUP'
        ? lerp3(ready, windup, ease('EASE_OUT', local))
        : st === 'ACTIVE'
            ? lerp3(windup, FOOT[key], ease('EASE_IN', local))
            : lerp3(FOOT[key], ready, ease('EASE_IN_OUT', local));
    const hands = st === 'STARTUP'
        ? HANDS[key].map((h) => lerp3([h[0] * 0.6, 0.95, -0.04], h, ease('EASE_OUT', local)))
        : st === 'ACTIVE'
            ? HANDS[key].map((h) => lerp3(h, [h[0] * 1.1, h[1] * 1.05, h[2] + 0.06], ease('EASE_IN', local)))
            : HANDS[key].map((h) => lerp3(h, [h[0] * 0.6, 0.95, -0.04], ease('EASE_IN_OUT', local)));

    // La cadera baja a la altura que pide el golpe. OJO con el signo: `setPos`
    // guarda un DELTA respecto al reposo, asi que para bajar hay que restar.
    // Con el signo al reves el cuerpo se subia a 1,29 m y las piernas no
    // llegaban: el "pisoton" salia con los pies por encima de la cintura.
    setPos(pose, 'PELVIS', [0, HIP[key] - restHipY - (1 - k) * 0.14, 0]);
    setEuler(pose, 'SPINE', 0.10 + 0.16 * k, -0.18 + 0.30 * k, 0);
    setEuler(pose, 'CHEST', 0.06 + 0.10 * k, 0, 0);

    let state = fk(rig, pose);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_L', lower: 'SHIN_L', target: foot, pole: [0.5, 0, 1]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L', target: hands[0], pole: [1, -0.2, -0.4]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R', target: hands[1], pole: [-1, -0.2, -0.4]
    });
    return { pose, state: fk(rig, pose, state), kind: key };
}

/** Interpolacion lineal de un objetivo [x,y,z]. */
const lerp3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
];

/**
 * LA LEVANTADA (wakeup): de tumbado a de pie, y es la animacion mas
 * incomoda de escribir porque NO es un salto: es unlever, un levantarse.
 *
 * POR QUE NO ES "UNA POSTURA" COMO LAS DEMAS
 *   Las otras poses deciden donde esta el cuerpo ahora. Esta decide COMO SE
 *   LLEGA. El jugador ve al rival levantarse y lee de ahi si se puede volver a
 *   atacar o no, asi que tiene que ENSENAR la mecanica: se apoya en un codo, se
 *   encoge una rodilla, se empuja con el brazo, y ya esta de pie. Si sale
 *   teletransportandose del suelo a la guardia, el wakeup con invulnerabilidad
 *   parece un bug y el bucle de combos se pierde.
 *
 * @param {number} t   0..1 en la levantada (0 = tumbado, 1 = de pie)
 * @param {object} down { orientation, axis } de la caida
 */
export function wakeupPose(rig, t, down, opts = {}) {
    const tt = ease('EASE_OUT', clamp01(t));
    // El suelo de referencia: el cuerpo tumbado esta a 0,20 m y de pie a
    // ~0,92. La interpolacion entre los dos es lineal en altura: si se
    // curvara, el personaje "flotaria" al levantarse.
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.95;
    const prone = down && down.orientation === 'CABEZA_A_RIVAL';
    const axis = down && typeof down.axis === 'number' ? down.axis : 180;
    const yaw = (axis * Math.PI) / 180;

    const pose = createPose();

    // --- 1. CADERA: del suelo a la altura de pie ------------------------
    const hip = lerp(0.20, restHipY - 0.10, tt);
    setPos(pose, 'PELVIS', [0, hip - restHipY, 0]);

    // --- 2. TORSO: de tumbado a vertical -------------------------------
    // Se desenrolla con ease, no linealmente: los primeros frames son el
    // "empujarse" y el torso aun esta casi horizontal; el giro grande pasa
    // en el tramo medio, que es donde el ojo lo espera.
    const unroll = ease('EASE_IN_OUT', clamp01((tt - 0.18) / 0.62));
    const lie = prone ? 1.30 : -1.30;   // radianes de Spine en el suelo
    const pitch = lerp(lie, 0.14, unroll);
    const side = prone ? 0.45 : -0.45;
    const roll = lerp(side, 0.05, unroll);
    setEuler(pose, 'SPINE', 0, lerp(yaw, 0, ease('EASE_OUT', tt)), roll);
    setEuler(pose, 'CHEST', 0, 0, roll * 0.5);
    setEuler(pose, 'NECK', lerp(prone ? -0.55 : 0.55, 0.10, unroll), 0, 0);

    let state = fk(rig, pose);

    // --- 3. BRAZO DE APOYO: el que hace el trabajo ---------------------
    // El codo en el suelo empuja. A tt=1 el brazo esta en guardia: sin esta
    // transicion el brazo se queda clavado en el suelo y el personaje parece
    // que se apoya en el elbow para siempre.
    const push = lerp(0.30, 0.0, ease('EASE_IN_OUT', clamp01((tt - 0.25) / 0.55)));
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_L', lower: 'FOREARM_L',
        target: [lerp(0.42, 0.26, push), lerp(0.16, 1.14, push), lerp(0.10, 0.22, push)],
        pole: [1, -0.3, 0.6]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'UPPERARM_R', lower: 'FOREARM_R',
        target: [lerp(-0.40, -0.24, push), lerp(0.18, 1.16, push), lerp(0.06, -0.24, push)],
        pole: [-1, -0.3, 0.6]
    });
    state = fk(rig, pose, state);

    // --- 4. PIERNAS: de estiradas a flexionadas y a apoyo -------------
    // Primero se encojen (para impulsarse), luego se despliegan. Es el mismo
    // gesto que hace una persona y es lo que lo hace legible.
    const tuck = ease('EASE_OUT', Math.sin(clamp01(tt) * Math.PI));
    const legL = [0.14 + tuck * 0.16, 0.30 * tuck + 0.02, 0.34 + (1 - tuck) * 0.18];
    const legR = [-0.16 - tuck * 0.10, 0.22 * tuck + 0.02, -0.22 - (1 - tuck) * 0.10];
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_L', lower: 'SHIN_L', target: legL, pole: [0.5, 0, 1]
    });
    state = fk(rig, pose, state);
    solveTwoBone(rig, pose, state, {
        upper: 'THIGH_R', lower: 'SHIN_R', target: legR, pole: [-0.5, 0, 1]
    });

    return { pose, state: fk(rig, pose, state), t: tt };
}

export default {
    HitHeight, HitPower, HIT_REACTIONS, IMPACT_TO_POWER,
    powerOf, heightOf, reactionFor, impactKindOf,
    hitReactionPose, blendReactionOverStance, groundAttackPose, wakeupPose
};