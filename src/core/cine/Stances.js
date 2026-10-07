/**
 * ============================================================================
 * SANPABLERA ENGINE · cine/Stances.js
 * ----------------------------------------------------------------------------
 * Las POSTURAS de combate: como se planta un peleador cuando no esta haciendo
 * nada (o casi nada).
 *
 * POR QUE UNA POSTURA NO ES UNOS NUMEROS FIJOS
 * ----------------------------------------------------------------------------
 *   Un pelea de boxeo a medio metro del rival no se parece en nada a una en la
 *   esquina, y no solo por los brazos: los PIES son distintos. Si se escribe un
 *   numero de rotacion por hueso y ya, en cuanto dos peleadores se acercan o se
 *   alejan se acaba viendo que los pies no apoyan en el sitio o que el cuerpo se
 *   va para un lado.
 *
 *   Por eso una postura aqui se describe con PARAMETROS (distancia al rival,
 *   altura de la guardia, apertura de piernas) y el codigo deduce de ahi donde
 *   tiene que poner cada pie. La deduccion es la que hace el trabajo pesado:
 *
 *      1. El combate mide una DISTANCIA entre los dos peleadores.
 *      2. De ahi salen dos PUNTOS DE APOYO en el suelo, uno por pie, derivados
 *         de la apertura de piernas y del angulo con que se mira al rival.
 *      3. El IK clava cada punta en su punto (cine/Rig.js: placeFoot).
 *      4. Con los pies ya clavados, la cadera se baja lo justo para que ambos
 *         toquen el suelo: la flexion sale sola, no inventada.
 *
 *   Asi el unico numero que hay que acertar es la DISTANCIA, y esa la pone el
 *   combate, no el animador.
 *
 * QUE NO HACE ESTE ARCHIVO
 *   No mueve al peleador por el mundo ni decide pasos: de eso se ocupa
 *   Footwork.js. Aqui solo hay quietlyo y, como mucho, el media paso de ajuste.
 * ============================================================================
 */

import { createPose, setRot, setPos } from './Pose.js';
import { fk, placeFoot, solveTwoBone } from './Rig.js';
import { qFromAxisAngle } from './Math3.js';

/**
 * Catalogo de posturas.
 *
 * Cada una dice COMO esta el cuerpo de forma relativa (no en angulos absolutos):
 *   spread   separacion de los pies en metros
 *   lead     cuanto avanza el pie delantero respecto al centro
 *   lean     inclinacion del torso hacia el rival, en grados a favor
 *   guard    altura de la guardia: 0 = manos caidas, 1 = manos a la cara
 *   crouch   bajada de cadera sobre el reposo, en metros
 *   hands    [manoL, manoR] cada uno [adelante, arriba, abertura]
 */
export const STANCES = Object.freeze({
    /** Reposo de combate: piernas abiertas, manos a media altura. */
    IDLE: Object.freeze({
        spread: 0.46, lead: 0.09, lean: 4, guard: 0.55, crouch: 0.055,
        hands: [[0.14, 0.62, 0.30], [0.12, 0.58, -0.30]]
    }),

    /** Guardia alta, la de verdad: mano delante de la cara, codillos recogidos. */
    GUARD: Object.freeze({
        spread: 0.40, lead: 0.12, lean: 6, guard: 1.0, crouch: 0.085,
        hands: [[0.20, 0.95, 0.55], [0.22, 1.00, -0.50]]
    }),

    /** Pie atras y"": el que se pone a defenderse cediendo terreno. */
    DEFENSIVE: Object.freeze({
        spread: 0.52, lead: -0.02, lean: -3, guard: 1.0, crouch: 0.115,
        hands: [[0.16, 1.02, 0.70], [0.18, 1.05, -0.65]]
    }),

    /** Avance con el peso delante: el que carga antes de golpear. */
    PRESSING: Object.freeze({
        spread: 0.44, lead: 0.15, lean: 9, guard: 0.85, crouch: 0.100,
        hands: [[0.26, 0.80, 0.40], [0.20, 0.74, -0.35]]
    })
});

/** Giro de una pose en un eje, en grados, como delta local. */
function bend(pose, bone, axis, degrees) {
    setRot(pose, bone, qFromAxisAngle(axis, (degrees * Math.PI) / 180));
}

/**
 * Donde apoya cada pie, en espacio de personaje (origen bajo la pelvis, Z
 * hacia delante) y con el suelo en y = 0.
 *
 * LADO IZQUIERDO = +X
 *   En el espacio del motor (Y arriba, Z adelante, zurdo) un personaje que mira
 *   a +Z tiene su mano izquierda en +X. El mannequin viene de Blender y sus
 *   "_L" tambien estan en +x, asi que los dos.tile siguen siendo el mismo lado.
 *   Confundirlo aqui no da ningun error: solo un peleador con los pies y los
 *   codillos cambiados de lado, que es el tipo de fallo que no aparece en un
 *   log.
 *
 * `forward` es el sentido en el que mira el peleador en espacio local (+1 hacia
 * delante). Se mantiene como parametro y no se hornea ahi porque un peleador
 * puede estar girado de lado sin girar los pies.
 *
 * @param spec    una entrada de STANCES
 * @param forward +1 mira hacia +Z, -1 mira hacia -Z
 * @returns { L:[3], R:[3] }
 */
export function footTargets(spec, forward = 1) {
    const half = spec.spread / 2;
    // El pie que va delante es el que mas se adelanta; el otro se queda a la
    // altura de la cadera o un poco atras. En boxeo el pie delantero es el
    // izquierdo, pero se decide por lado para que se pueda espejar.
    const front = spec.lead;
    return {
        L: [half, 0, forward * front],
        R: [-half, 0, forward * (-front)]
    };
}

/**
 * Construye la Pose de una postura, con los pies ya clavados en el suelo.
 *
 * @param rig   el rig del peleador (cine/Rig.js)
 * @param name  clave de STANCES
 * @param opts
 *   forward  +1/-1, hacia donde mira en espacio local
 *   height   altura de la cadera IMPUESTA por el combate (si se da, manda sobre
 *            la flexion de la postura: es el combate quien manda)
 * @returns { pose, state }  la Pose y el fkState ya calculado
 */
export function stancePose(rig, name = 'IDLE', opts = {}) {
    const spec = typeof name === 'string' ? (STANCES[name] || STANCES.IDLE) : name;
    const forward = opts.forward === undefined ? 1 : opts.forward;
    const pose = createPose();

    // --- 1. Columna y cadera --------------------------------------------
    // El torso se inclina hacia delante en proportion al peso que va delante.
    // Va en el eje del TILT lateral, no en el de balanceo, porque inclinar el
    // torso hacia el rival no es twisting sino lean.
    bend(pose, 'SPINE', [0, 0, 1], -spec.lean);
    bend(pose, 'CHEST', [0, 0, 1], -spec.lean * 0.6);
    bend(pose, 'NECK', [0, 0, 1], spec.lean * 0.5);
    bend(pose, 'HEAD', [0, 0, 1], spec.lean * 0.3);
    // La cadera se opone al torso: si el pecho va adelante, la pelvis echa el
    // projects atras. Sin esto el personaje se arquea como una silla.
    bend(pose, 'PELVIS', [0, 0, 1], spec.lean * 0.35);

    // --- 2. Guardia de manos ---------------------------------------------
    // Cada mano va [adelante, arriba, abertura] en ESPACIO DE PERSONAJE, asi que
    // se traduce a una cadena de dos huesos con el IK del brazo: hombro y codo.
    applyGuard(pose, rig, spec, forward);

// --- 3. Cadera baja y pies clavados ---------------------------------
    //
    // EL ORDEN IMPORTA Y NO ES EL INTUITIVO.
    //
    // Lo natural es "clavar los pies y luego bajar la cadera hasta que toquen".
    // Es justo lo que hay que hacer NO hacer: bajar la cadera despues MUEVE los
    // pies que ya estaban clavados y se quedan flotando a la nueva altura. Con
    // los dos pies a la vez el problema es doble, porque cada pie corrige la
    // cadera y deshace al otro.
    //
    // Aqui se hace al reves: la postura DECIDE la altura de la cadera y luego se
    // clavan los pies. La flexion de la rodilla no se inventa, sale de que el
    // pie tiene que llegar al suelo desde una cadera baja.
    const targets = footTargets(spec, forward);
    const restHipY = rig.restWorld.PELVIS ? rig.restWorld.PELVIS.p[1] : 0.852;
    const hipY = opts.height !== undefined ? opts.height : restHipY - spec.crouch;
    setPos(pose, 'PELVIS', [0, hipY - restHipY, 0]);
    let state = fk(rig, pose);

    // El pie izquierdo primero: es el delantero y el que marca el angulo con el
    // rival. Cada pie lleva su propio desplazamiento de cadera, asi que poner
    // el segundo no deshace el primero.
    placeFoot(rig, pose, state, 'L', targets.L, { pole: [0, 0, forward] });
    state = fk(rig, pose, state);
    placeFoot(rig, pose, state, 'R', targets.R, { pole: [0, 0, forward] });
    state = fk(rig, pose, state);

    return { pose, state, spec, targets, hipY: state.p.PELVIS[1] };
}

/**
 * Coloca las dos manos en la guardia con el IK del brazo.
 *
 * POR QUE IK Y NO ANGULOS FIJOS
 *   La guardia alta depende de la distancia: con el rival cerca el codo tiene
 *   que cerrar mas; con el rival lejos, mas. Con angulos fijos las manos se
 *   atraviesan el cuerpo o se quedan colgando. Con dos huesos y un punto de
 *   destino, la guardia se adapta sola.
 */
function applyGuard(pose, rig, spec, forward) {
    const g = spec.guard;
    const shoulders = spec.hands;
    for (const side of ['L', 'R']) {
        const up = side === 'R' ? 'UPPERARM_R' : 'UPPERARM_L';
        const lo = side === 'R' ? 'FOREARM_R' : 'FOREARM_L';
        const hand = side === 'R' ? 'HAND_R' : 'HAND_L';
        const [fwd, up_, open] = shoulders[side === 'R' ? 1 : 0];

        // Punto de destino de la mano, en espacio de personaje.
        const sx = side === 'R' ? -1 : 1;
        const target = [
            sx * (0.16 + g * 0.10 + open * 0.06),
            1.22 - (1 - g) * 0.55,
            forward * fwd
        ];
        // El codo mira hacia afuera y un poco hacia atras: si no, los codillos
        // se juntan en el centro del pecho.
        const pole = [sx * 1.0, -0.15, -forward * 0.35];

        // solveTwoBone necesita el estado actual; se calcula aqui de forma
        // puntual porque la guardia se escribe una vez por postura, no por frame.
        solveTwoBone(rig, pose, fk(rig, pose), {
            upper: up, lower: lo, target, pole
        });
    }
}

export default { STANCES, stancePose, footTargets };