/**
 * ============================================================================
 * SANPABLERA ENGINE · cine/Pose.js
 * ----------------------------------------------------------------------------
 * Una POSE es el conjunto de deltas de articulacion de un personaje en un
 * instante. No es un clip: no tiene tiempo, no tiene keyframes, no se interpola
 * entre dos estados guardados. Es "cuanto se ha girado este hueso desde la pose
 * de reposo".
 *
 * POR QUE DELTAS Y NO POSES ABSOLUTAS
 *   El repositorio de un modelo 3D nunca es una T-pose limpia: el mannequin de
 *   Khronos viene en A-pose con los brazos a 45 grados y unas rotaciones de
 *   reposo que el exportador de Blender escribio a mano. Si las poses fueran
 *   absolutas habria que recalibrarlas a mano para cada modelo, y peonar con
 *   un rig de Mixamo (T-pose, nombres distintos, proporciones distintas)
 *   obligaria a rehacer el motor.
 *
 *   Con deltas, TODO vale cero por defecto, que es exactamente la pose de
 *   reposo de cualquier modelo. Una guardia se declara como "el antebrazo se
 *   dobla 95 grados y el codo mira hacia -Z", sin importar como venga el
 *   esqueleto. Y el mismo motor sirve para Mixamo, Quaternius o Ready Player Me
 *   porque BoneMap ya traduce los nombres al CONTRATO.
 *
 * QUE GUARDA
 *   rot : { [nombreContrato]: quaternion [x,y,z,w] }  giro LOCAL respecto a la
 *         rotacion de reposo del hueso
 *   pos : { [nombreContrato]: [x,y,z] }                desplazamiento LOCAL en
 *         metros, en el marco del padre (para la cadera y las raices de pie)
 *
 * CONVENCION
 *   Y arriba, Z adelante, zurdo (igual que Babylon y que Math3).
 * ============================================================================
 */

import {
    qIdentity, qclone, qmul, qnorm, qslerp, qFromEuler,
    vadd, vmul, vlerp
} from './Math3.js';

/** Pose vacia: todos los huesos en su posicion de reposo. */
export function createPose() {
    return { rot: Object.create(null), pos: Object.create(null) };
}

/** Copia profunda. Las poses se cachean y se reutilizan; nunca se comparten. */
export function clonePose(pose) {
    const out = createPose();
    for (const b in pose.rot) out.rot[b] = qclone(pose.rot[b]);
    for (const b in pose.pos) out.pos[b] = pose.pos[b].slice();
    return out;
}

/** Vacia la pose en el sitio (para no crear basura por frame en el bucle). */
export function resetPose(pose) {
    for (const b in pose.rot) delete pose.rot[b];
    for (const b in pose.pos) delete pose.pos[b];
    return pose;
}

/** Rotacion actual de un hueso. Si no esta en la pose, la identidad = reposo. */
export function rotOf(pose, bone) {
    return pose.rot[bone] || qIdentity();
}

/** Desplazamiento actual de un hueso. Si no esta, el origen. */
export function posOf(pose, bone) {
    return pose.pos[bone] || [0, 0, 0];
}

export function setRot(pose, bone, q) {
    pose.rot[bone] = qnorm(q);
    return pose;
}

export function setPos(pose, bone, t) {
    pose.pos[bone] = [t[0], t[1], t[2]];
    return pose;
}

/**
 * AUTORADO. Declara el giro de un hueso en angulos.
 *
 * El motor guarda quaternions porque multiplicarlos es correcto y blends
 *angulares no, pero escribir `[-0.4, 0.9, 0]` es mucho mas legible que
 * `[-0.19, 0.43, 0.07, 0.87]`. Este helper es la frontera entre las dos cosas:
 * las posturas se escriben en euler, se guardan en quaternion.
 *
 * Orden YXZ (yaw, pitch, roll), el mismo que usan Math3 y los exportadores.
 */
export function setEuler(pose, bone, rx, ry, rz) {
    pose.rot[bone] = qFromEuler(rx, ry, rz);
    return pose;
}

/** Igual que setEuler pero acepta el array [rx, ry, rz] directamente. */
export const setEulerV = (pose, bone, e) => setEuler(pose, bone, e[0], e[1], e[2]);

/** Suma un desplazamiento al que ya tuviera el hueso. */
export function addPos(pose, bone, x, y, z) {
    const p = pose.pos[bone] || (pose.pos[bone] = [0, 0, 0]);
    p[0] += x; p[1] += y; p[2] += z;
    return pose;
}

// ===========================================================================
// MEZCLA
// ===========================================================================

/** Nombres de huesos que aparecen en alguna de las dos poses. */
function touched(a, b) {
    const s = new Set(Object.keys(a.rot));
    for (const k in b.rot) s.add(k);
    for (const k in a.pos) s.add(k);
    for (const k in b.pos) s.add(k);
    return s;
}

/**
 * MEZCLA SUSTITUTIVA (la normal). Devuelve una pose nueva donde cada hueso va de
 * `a` a `b` con peso `t`. Es lo que se usa para pasar de una guardia a otra, o
 * de un estado de la FSM a su vecino.
 *
 * OJO con el orden de los operands: las quaternions tienen signo, y slerp entre
 * `q` y `-q` (el mismo giro) describe la mitad de la esfera. Math3 ya lo
 * neutraliza, pero el peso importa: `t=0` debe devolver EXACTAMENTE `a`.
 */
export function blendPose(a, b, t) {
    const out = createPose();
    if (t <= 0) return clonePose(a);
    if (t >= 1) return clonePose(b);
    for (const bone of touched(a, b)) {
        out.rot[bone] = qslerp(rotOf(a, bone), rotOf(b, bone), t);
        out.pos[bone] = vlerp(posOf(a, bone), posOf(b, bone), t);
    }
    return out;
}

/**
 * MEZCLA ADITIVA (capas). `layer` se APLICA ENCIMA de `base` y `weight` es su
 * influencia. Las rotaciones se multiplican (composicion) y los
 * desplazamientos se suman escalados.
 *
 * POR QUE HACE FALTA: hay capas que solo tienen sentido como correccion sobre
 * una postura. La respiracion no es una postura, es un +/- en el pecho; el paso
 * del pie no es una postura, es un desplazamiento de la cadera. Si estas capas
 * se mezclaran de forma sustitutiva, la respiracion se comeria la guardia y el
 * personaje se quedaria tieso.
 */
export function addPose(base, layer, weight = 1) {
    if (weight <= 0) return base;
    const w = weight > 1 ? 1 : weight;
    for (const bone in layer.rot) {
        const q = layer.rot[bone];
        base.rot[bone] = w >= 1 ? qnorm(qmul(rotOf(base, bone), q))
            : qnorm(qmul(rotOf(base, bone), qslerp(qIdentity(), q, w)));
    }
    for (const bone in layer.pos) {
        const d = vmul(layer.pos[bone], w);
        base.pos[bone] = vadd(posOf(base, bone), d);
    }
    return base;
}

/** Igual que addPose pero escribe en una pose destino (para no tocar `base`). */
export function overlayPose(dst, layer, weight = 1) {
    return addPose(dst, layer, weight);
}

const clampW = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Aplica la mezcla en el sitio, sin crear una pose nueva.
 *
 * Se usa en el bucle de render: crear tres objetos por frame y por peleador
 * son cientos por segundo de basura, y el recolector de basura se nota en el
 * movil como tirones a la hora de un golpe.
 */
export function blendPoseInto(dst, a, b, t) {
    if (t <= 0) { for (const k in a.rot) dst.rot[k] = qclone(a.rot[k]); for (const k in a.pos) dst.pos[k] = a.pos[k].slice(); return dst; }
    if (t >= 1) { for (const k in b.rot) dst.rot[k] = qclone(b.rot[k]); for (const k in b.pos) dst.pos[k] = b.pos[k].slice(); return dst; }
    for (const bone of touched(a, b)) {
        dst.rot[bone] = qslerp(rotOf(a, bone), rotOf(b, bone), t);
        dst.pos[bone] = vlerp(posOf(a, bone), posOf(b, bone), t);
    }
    return dst;
}

/**
 * Mezcla varias poses con pesos, de forma sustitutiva, normalizando los pesos.
 * Es lo que hace el animador al final del frame: la postura base, la del estado
 * y la de transicion se combinan aqui segun cuanto pesa cada una.
 */
export function blendWeighted(layers) {
    let total = 0;
    for (const l of layers) total += Math.max(0, l.weight || 0);
    if (total <= 0) return createPose();
    let out = null;
    for (const l of layers) {
        const w = Math.max(0, l.weight || 0);
        if (w <= 0 || !l.pose) continue;
        if (out === null) { out = clonePose(l.pose); continue; }
        out = blendPose(out, l.pose, clampW(w / total));
    }
    return out || createPose();
}

// ===========================================================================
// UTILIDADES
// ===========================================================================

/** Cuenta huesos tocados. Lo usan las pruebas y el depurador del HUD. */
export function poseSize(pose) {
    const r = Object.keys(pose.rot).length;
    const p = Object.keys(pose.pos).length;
    return { rot: r, pos: p };
}

/**
 * Mezcla dos poses limitando la mezcla a un grupo de huesos.
 *
 * Sirve para el caso "la capa de las piernas no debe tocar la guardia": se
 * mezclan solo LEG_L/LEG_R y el resto se queda como estaba `a`.
 */
export function blendPoseMasked(a, b, t, bones) {
    const out = clonePose(a);
    for (const bone of bones) {
        out.rot[bone] = qslerp(rotOf(a, bone), rotOf(b, bone), t);
        out.pos[bone] = vlerp(posOf(a, bone), posOf(b, bone), t);
    }
    return out;
}

export default {
    createPose, clonePose, resetPose, rotOf, posOf, setRot, setPos, setEuler,
    setEulerV, addPos, blendPose, addPose, overlayPose, blendWeighted,
    poseSize, blendPoseMasked
};
