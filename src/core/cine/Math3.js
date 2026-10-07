/**
 * ============================================================================
 * SANPABLERA ENGINE · cine/Math3.js
 * ----------------------------------------------------------------------------
 * Matematicas minimas para la cinematica: vectores, quaternions y matrices 4x4.
 *
 * POR QUE EXISTE ESTE ARCHIVO Y NO USAR BABYLON
 *   La cinematica (rig, clips, morphs, camara, timeline) tiene que poder
 *   ejecutarse y VERIFICARSE en Node, sin navegador y sin WebGL. Si estos
 *   modulos importaran BABYLON, no habria forma de testearlos: el motor 3D es
 *   la capa de PRESENTACION, la cinematica es la de LOGICA.
 *   Por eso aqui solo hay matematica pura, en arrays planos, y el render
 *   (src/render/) es el que traduce estos numeros a BABYLON.Matrix.
 *
 * CONVENCION (la misma que Babylon, para no traducir nada al portar):
 *   Y arriba, Z adelante, X a la derecha, sistema IZQUIERDO (izquierda).
 *   Los angulos van en RADIANES. Las matrices son column-major (m[col*4+row]),
 *   que es como las espera WebGL y como las escribe Babylon.
 * ============================================================================
 */

// ===========================================================================
// VECTORES  (arrays de 3)
// ===========================================================================

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];

export const vclone = (a) => [a[0], a[1], a[2]];

export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const vcross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];

export const vlen = (a) => Math.sqrt(vdot(a, a));

export const vdist = (a, b) => vlen(vsub(a, b));

export function vnorm(a) {
    const l = vlen(a);
    return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

export const vlerp = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
];

/** Aplica una funcion componente a componente (quaternion a quaternion, etc). */
export const vmap = (a, fn) => [fn(a[0]), fn(a[1]), fn(a[2])];

// ===========================================================================
// QUATERNIONS  (arrays de 4: [x, y, z, w])
// ===========================================================================

export const qIdentity = () => [0, 0, 0, 1];

export const qclone = (q) => [q[0], q[1], q[2], q[3]];

export const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];

export function qnorm(q) {
    const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    return l > 1e-9 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : qIdentity();
}

/**
 * Conjugado = quaternion inversa de una rotacion.
 *
 * POR QUE ESTA AQUI Y NO SE CALCULA EN CADA POSE: convertir una rotacion MUNDIAL
 * en la rotacion LOCAL de un hueso es `local = qinv(padre) * mundial`. Como el
 * conjugado de un quaternion unitario es su negativo en la parte vectorial, sale
 * de multiplicar el conjugado del padre por la rotacion mundial. Sin esto, el
 * IK de las piernas no tendria forma de escribir los huesos.
 */
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qFromAxisAngle(axis, angle) {
    const a = vnorm(axis);
    const h = angle * 0.5;
    const s = Math.sin(h);
    return [a[0] * s, a[1] * s, a[2] * s, Math.cos(h)];
}

/**
 * Euler -> quaternion. El orden es YXZ (yaw, pitch, roll) y NO es arbitrario:
 * es el orden en el que se componen las articulaciones de un esqueleto humano
 * (cadera -> torso -> cabeza), y el que usan los exportadores de FBX/GLB al
 * importar animaciones. Si se cambiara, los clips importados vendrian torcidos.
 */
export function qFromEuler(rx, ry, rz) {
    const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
    const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
    const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
    return qnorm([
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz
    ]);
}

export const qFromEulerXYZ = (e) => qFromEuler(e[0], e[1], e[2]);

/** Euler YXZ -> quaternion, expando de los tres angulos del clip. */
export const qFromChannels = (c) => qFromEuler(c.RX || 0, c.RY || 0, c.RZ || 0);

export function qslerp(a, b, t) {
    let [ax, ay, az, aw] = a;
    let [bx, by, bz, bw] = b;
    let cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) {
        return qnorm([
            ax + (bx - ax) * t, ay + (by - ay) * t,
            az + (bz - az) * t, aw + (bw - aw) * t
        ]);
    }
    const theta = Math.acos(cos);
    const s = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / s;
    const wb = Math.sin(t * theta) / s;
    return [
        ax * wa + bx * wb, ay * wa + by * wb,
        az * wa + bz * wb, aw * wa + bw * wb
    ];
}

/** Quaternion -> angulo alrededor de `axis` normalizado, en radianes. */
export function qAngleAround(q, axis) {
    const a = vnorm(axis);
    const d = vdot([q[0], q[1], q[2]], a);
    return 2 * Math.atan2(d, q[3]);
}

/** Rota un vector con un quaternion. Es `v + 2 * qv x (qv x v + w * v)`. */
export function qRotateVec(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
        v[0] + w * tx + (y * tz - z * ty),
        v[1] + w * ty + (z * tx - x * tz),
        v[2] + w * tz + (x * ty - y * tx)
    ];
}

/**
 * Quaternion minimo que lleva el vector `from` al vector `to` (ambos no nulos).
 *
 * ES LA PIEZA CENTRAL DEL IK. Una articulacion de dos huesos tiene que apuntar
 * SU EJE en una direccion concreta; eso es exactamente "gira `from` hasta `to`".
 * Se usa el caso degenerado antiparalelo (from = -to), donde la formula general
 * da un quaternion degenerado y hay que elegir cualquier eje perpendicular.
 */
export function qFromTo(from, to) {
    const a = vnorm(from);
    const b = vnorm(to);
    const d = vdot(a, b);
    if (d > 0.999999) return qIdentity();
    if (d < -0.999999) {
        // Antiparalelo: cualquier giro de 180 grados vale. Se elige un eje
        // perpendicular porque en el plano de las piernas casi siempre lo hay.
        let axis = vcross(a, [1, 0, 0]);
        if (vlen(axis) < 1e-6) axis = vcross(a, [0, 0, 1]);
        return qFromAxisAngle(axis, Math.PI);
    }
    const c = vcross(a, b);
    return qnorm([c[0], c[1], c[2], 1 + d]);
}

/**
 * Convierte una rotacion MUNDIAL a la rotacion LOCAL de un hijo, dado el
 * quaternion mundial del padre. `local = qinv(padreMundial) * hijoMundial`.
 */
export const qWorldToLocal = (parentWorld, childWorld) => qmul(qinv(parentWorld), childWorld);

// ===========================================================================
// MATRICES 4x4  (column-major: m[column * 4 + row])
// ===========================================================================

export const mIdentity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Matriz de rotacion a partir de un quaternion (column-major). */
export function mFromQuat(q) {
    const [x, y, z, w] = qnorm(q);
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
        1 - (yy + zz), xy + wz, xz - wy, 0,
        xy - wz, 1 - (xx + zz), yz + wx, 0,
        xz + wy, yz - wx, 1 - (xx + yy), 0,
        0, 0, 0, 1
    ];
}

export function mFromTranslation(t) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
}

export function mFromScale(s) {
    const k = typeof s === 'number' ? [s, s, s] : s;
    return [k[0], 0, 0, 0, 0, k[1], 0, 0, 0, 0, k[2], 0, 0, 0, 0, 1];
}

export function mMul(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                a[1 * 4 + r] * b[c * 4 + 1] +
                a[2 * 4 + r] * b[c * 4 + 2] +
                a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return out;
}

export function mTransformPoint(m, p) {
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
}

export function mTransformDir(m, p) {
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2]
    ];
}

/** Rota un vector alrededor de un eje que pasa por `origin`. */
export function vrotateAround(v, axis, angle, origin = [0, 0, 0]) {
    const q = qFromAxisAngle(axis, angle);
    const m = mFromQuat(q);
    const rel = vsub(v, origin);
    return vadd(mTransformDir(m, rel), origin);
}

// ===========================================================================
// INTERPOLACION DE CURVAS
// ===========================================================================

/**
 * Curvas de interpolacion. El motor de cinematica las usa para los keyframes
 * de los clips y para las transiciones de camara.
 *
 * Se evaluan con el mismo contrato en todas: f(0) = 0 y f(1) = 1, y todas
 * crecientes. Por eso se pueden sustituir unas por otras sin tocar el codigo
 * que las usa (y por eso el blend entre dos clips no da un tirón al cambiar
 * de curva).
 */
export const Easing = Object.freeze({
    LINEAR: (t) => t,
    STEP: () => 0,
    EASE_IN: (t) => t * t,
    EASE_OUT: (t) => t * (2 - t),
    EASE_IN_OUT: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    // Rebote clasico: sirve para landed y para el aterrizaje de un golpe.
    BOUNCE: (t) => {
        const n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    },
    // Elastico: para el squash-and-stretch de los morphs.
    ELASTIC: (t) => {
        if (t === 0 || t === 1) return t;
        const p = 0.35;
        return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    },
    // Overshoot de un golpe: pasa de mas y vuelve. Es lo que da el "golpe"
    // de la camara sin necesidad de una sola particula.
    BACK: (t) => {
        const c = 1.70158;
        return t * t * ((c + 1) * t - c);
    }
});

/**
 * Interpolacion exponencial independiente del framerate.
 *
 * POR QUE NO `a + (b - a) * 0.1`: eso depende de los FPS. A 30 fps el rig
 * llegaria el doble de rapido que a 60 y la cinematica se veria distinta en
 * cada monitor. Aqui el objetivo es el mismo SIEMPRE, porque es una funcion
 * del tiempo transcurrido.
 *
 * @param {number} current  valor actual
 * @param {number} target   valor al que se tiende
 * @param {number} rate     velocidad (mayor = mas rapido). 1 = casi instantaneo
 * @param {number} dt       segundos transcurridos
 */
export const damp = (current, target, rate, dt) =>
    target + (current - target) * Math.exp(-rate * dt);

/** Igual que damp() pero para vectores. */
export const dampV = (current, target, rate, dt) => {
    const k = Math.exp(-rate * dt);
    return [
        target[0] + (current[0] - target[0]) * k,
        target[1] + (current[1] - target[1]) * k,
        target[2] + (current[2] - target[2]) * k
    ];
};

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export const clamp01 = (x) => clamp(x, 0, 1);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Aplica una curva nombrada. Si el nombre no existe, lineal (nunca revienta). */
export function ease(name, t) {
    const fn = Easing[name] || Easing.LINEAR;
    return fn(clamp01(t));
}
