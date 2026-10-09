/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/cine.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la base de cine: Math3, CineConstants y BoneMap.
 *
 * Se ejecutan en Node a proposito (no en el navegador): los tres modulos son
 * PUROS, sin BABYLON ni DOM. Eso es lo que permite ajustar poses, curvas y
 * mapas de huesos en segundos, sin arrancar el motor grafico.
 *
 * BoneMap se prueba contra el archivo de verdad del repo
 * (assets/characters/mannequin.glb), no contra una lista inventada: si alguien
 * cambia el modelo, esta prueba avisa en vez de romperse en pantalla.
 *
 *   node tests/cine.smoke.mjs
 * ============================================================================
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    mIdentity, mMul, mFromQuat, mFromTranslation, mTransformPoint, mTransformDir,
    qFromAxisAngle, qFromEuler, qmul, qnorm, qslerp, v3, vadd, vsub, vlen,
    vnorm, vdist, vcross, vdot, vlerp, vmul, clamp, clamp01, lerp, damp,
    dampV, vrotateAround, qAngleAround, ease, Easing, vmap
} from '../src/core/cine/Math3.js';
import {
    BONES, REQUIRED_BONES, CFG, BoneGroup, Side, Channel,
    ROT_CHANNELS, TRANS_CHANNELS, SCALE_CHANNELS, ALL_CHANNELS,
    MorphId, ImpactKind, ImpactAxis, IMPACT_PRESETS, IMPACT_BONE_GAIN,
    TransitionKind, TRANSITION_DURATION, ShotSize
} from '../src/core/cine/CineConstants.js';
import {
    buildBoneMap, normalizeBoneName, resolveBone, closestContractBone, boneMeta, splitSide,
    ALIASES
} from '../src/render/BoneMap.js';
import { wrapperTransform } from '../src/render/CharacterModel.js';
import { loadGLB, loadGLTFPair } from './glb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const fails = [];

function ok(cond, name, extra) {
    if (cond) { pass++; return true; }
    fails.push(extra ? `${name} :: ${extra}` : name);
    return false;
}
const near = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol;
function vnear(a, b, tol = 1e-5) {
    return Array.isArray(a) && a.length === b.length && a.every((x, i) => near(x, b[i], tol));
}
const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) { fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n')[0] : e}`); }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

// ===========================================================================
run('Math3 · vectores', () => {
    const a = v3(1, 2, 3), b = v3(4, -5, 6);
    ok(vnear(vadd(a, b), v3(5, -3, 9)), 'vadd suma');
    ok(vnear(vsub(a, b), v3(-3, 7, -3)), 'vsub resta');
    ok(near(vdot(a, b), 1 * 4 + 2 * -5 + 3 * 6), 'vdot producto escalar');
    ok(near(vdot(a, a), 14), 'vdot consigo mismo da el cuadrado del largo');
    ok(vnear(vcross(a, b), v3(2 * 6 - 3 * -5, 3 * 4 - 1 * 6, 1 * -5 - 2 * 4)), 'vcross polares');
    ok(near(vdot(vcross(a, b), a), 0, 1e-12), 'vcross es perpendicular a a');
    ok(near(vdot(vcross(a, b), b), 0, 1e-12), 'vcross es perpendicular a b');
    ok(vnear(vcross(a, b), vcross(b, a).map((x) => -x), 1e-12), 'vcross es anti-commutativo');
    ok(near(vlen(v3(3, 4, 0)), 5), 'vlen pitagoras');
    ok(near(vdist(a, b), vlen(vsub(b, a))), 'vdist coincide con el largo del delta');
    ok(near(vlen(vnorm(v3(3, 4, 12))), 1), 'vnorm deja la unidad');
    ok(vlen(vnorm(v3(0.5, 0, 0))) === 1, 'vnorm normaliza un vector pequeno');
    ok(vnear(vnorm(v3(0, 0, 0)), v3(0, 0, 0)), 'vnorm no explota con el vector nulo');
    ok(vnear(vmul(a, 3), v3(3, 6, 9)), 'vmul escala');
    ok(vnear(vmul(a, -1), v3(-1, -2, -3)), 'vmul por negativo');
    ok(vnear(vlerp(a, b, 0), a), 'vlerp t=0 da a');
    ok(vnear(vlerp(a, b, 1), b), 'vlerp t=1 da b');
    ok(vnear(vlerp(a, b, 0.5), mid(a, b)), 'vlerp punto medio');
    ok(vnear(vmap(a, (x) => x * 2), v3(2, 4, 6)), 'vmap aplica a los tres ejes');
    ok(vnear(a, v3(1, 2, 3)), 'los vectores no se mutan al operar con ellos');
});

// ===========================================================================
run('Math3 · quaternions', () => {
    const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2);
    ok(near(vlen([q[0], q[1], q[2]]), Math.SQRT1_2, 1e-6), 'qFromAxisAngle: seno de la mitad');
    ok(near(q[3], Math.cos(Math.PI / 4), 1e-6), 'qFromAxisAngle: coseno de la mitad');
    ok(near(Math.hypot(...q), 1, 1e-9), 'el quaternion sale normalizado');
    ok(near(Math.hypot(...qnorm(v3(1, 2, 3, 4))), 1), 'qnorm deja la unidad');
    ok(vnear(qnorm([0, 0, 0, 0]), [0, 0, 0, 1]), 'qnorm del quaternion nulo da la identidad');
    ok(vnear(qFromAxisAngle(v3(3, 0, 0), Math.PI / 2), qFromAxisAngle(v3(1, 0, 0), Math.PI / 2), 1e-9),
        'qFromAxisAngle normaliza el eje');

    // qFromAxisAngle es (eje, angulo). Comprobar la rotacion con matrices es la
    // via fiable, porque aqui no hay una funcion de rotar vector.
    const R = mFromQuat(q);
    ok(vnear(mTransformPoint(R, v3(0, 0, 1)), v3(1, 0, 0), 1e-9), '90 grados en Y lleva +Z a +X');
    ok(vnear(mTransformPoint(R, v3(1, 0, 0)), v3(0, 0, -1), 1e-9), '90 grados en Y lleva +X a -Z');
    ok(vnear(mTransformPoint(R, v3(0, 1, 0)), v3(0, 1, 0), 1e-9), 'el eje de rotacion no se mueve');
    const p = v3(1, 2, 3);
    ok(near(vlen(mTransformPoint(R, p)), vlen(p), 1e-9), 'rotar no cambia el largo');

    ok(near(vlen(qmul(q, q)), 1, 1e-9), 'qmul conserva la norma');
    ok(vnear(mTransformPoint(mFromQuat(qmul(q, q)), v3(0, 0, 1)),
        mTransformPoint(mFromQuat(qmul(q, q)), v3(0, 0, 1))), 'qmul es determinista');
    const q2 = qFromAxisAngle(v3(1, 0, 0), Math.PI / 3);
    ok(vnear(mTransformPoint(mFromQuat(qmul(q, q2)), v3(0.3, 0.4, 0.5)),
        mTransformPoint(mMul(mFromQuat(q), mFromQuat(q2)), v3(0.3, 0.4, 0.5)), 1e-9),
        'qmul(a,b) == mMul(mFromQuat(a), mFromQuat(b))');

    ok(near(Math.hypot(...qslerp([0, 0, 0, 1], q, 0.5)), 1, 1e-9), 'qslerp devuelve un quaternion unitario');
    ok(near(Math.abs(qslerp([0, 0, 0, 1], q, 0.5)[3]), Math.cos(Math.PI / 8), 1e-6),
        'qslerp a la mitad son 45 grados');
    ok(vnear(qslerp(q, q, 0.37), q, 1e-9), 'qslerp de un quaternion consigo mismo no se mueve');
    ok(vnear(qslerp([0, 0, 0, 1], q, 0), [0, 0, 0, 1], 1e-9), 'qslerp t=0 da el primero');
    ok(vnear(qslerp([0, 0, 0, 1], q, 1), q, 1e-9), 'qslerp t=1 da el segundo');
    const qNeg = [-q[0], -q[1], -q[2], -q[3]];
    ok(near(qAngleAround(q, v3(0, 1, 0)), Math.PI / 2, 1e-6), 'qAngleAround mide 90 grados');
    ok(vnear(qslerp([0, 0, 0, 1], qNeg, 0.5).map(Math.abs), qslerp([0, 0, 0, 1], q, 0.5).map(Math.abs), 1e-6),
        'q y -q son el mismo giro (no hay salto al interpolar)');

    ok(vnear(qFromEuler(0, 0, 0), [0, 0, 0, 1], 1e-9), 'euler 0,0,0 = identidad');
    ok(near(Math.hypot(...qFromEuler(2, -3, 4)), 1, 1e-9), 'qFromEuler normaliza con angulos grandes');
    ok(vnear(qFromEuler(0.5, 0, 0), qFromAxisAngle(v3(1, 0, 0), 0.5), 1e-9), 'euler solo X == eje X');
    ok(vnear(qFromEuler(0, 0.5, 0), qFromAxisAngle(v3(0, 1, 0), 0.5), 1e-9), 'euler solo Y == eje Y');
    ok(vnear(qFromEuler(0, 0, 0.5), qFromAxisAngle(v3(0, 0, 1), 0.5), 1e-9), 'euler solo Z == eje Z');
    ok(vnear(qFromEuler(Math.PI, 0, 0), qFromAxisAngle(v3(1, 0, 0), Math.PI), 1e-6), '180 grados en X');
    ok(near(Math.hypot(...qFromEuler(0.3, 0, 0)), 1, 1e-9), 'qFromEuler sale unitario con un solo eje');
});

// ===========================================================================
run('Math3 · matrices', () => {
    const I = mIdentity();
    ok(Array.isArray(I) && I.length === 16, 'mIdentity son 16 numeros');
    ok(I.every((x) => typeof x === 'number'), 'mIdentity es plano (Float64Array o array)');
    ok(vnear([I[0], I[5], I[10], I[15]], [1, 1, 1, 1]), 'mIdentity es la identidad');
    ok(I.slice(12, 15).every((x) => x === 0), 'la identidad no traslada');

    // OJO: mFromTranslation recibe un VECTOR, no tres numeros sueltos. Es la
    // misma forma que usan las matrices de Babylon para no depender de el.
    const t = mFromTranslation(v3(1, 2, 3));
    ok(vnear(mTransformPoint(t, v3(0, 0, 0)), v3(1, 2, 3)), 'mFromTranslation traslada el origen');
    ok(vnear(mTransformPoint(t, v3(1, 1, 1)), v3(2, 3, 4)), 'mFromTranslation suma');
    ok(vnear(mTransformDir(t, v3(1, 0, 0)), v3(1, 0, 0)), 'traslacion no toca las direcciones');

    const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2);
    const R = mFromQuat(q);
    ok(vnear(mTransformPoint(R, v3(0, 0, 1)), v3(1, 0, 0), 1e-9), 'mFromQuat rota como el quaternion');
    ok(vnear(mTransformDir(R, v3(0, 0, 1)), v3(1, 0, 0), 1e-9), 'mTransformDir rota sin trasladar');
    ok(vnear(mTransformPoint(mMul(R, t), v3(0, 0, 0)), mTransformPoint(R, v3(1, 2, 3)), 1e-9),
        'mMul(R, t) = aplicar la traslacion y luego la rotacion');
    ok(vnear(mTransformPoint(mMul(t, R), v3(0, 0, 0)), v3(1, 2, 3), 1e-9),
        'mMul(t, R) aplica la rotacion y luego la traslacion');
    ok(vnear(mTransformPoint(mMul(R, t), v3(0, 0, 0)), mTransformPoint(R, v3(1, 2, 3)), 1e-9),
        'mMul(R, t) aplica la traslacion y luego la rotacion');
    ok(vnear(mTransformPoint(mMul(t, R), v3(1, 0, 0)), v3(1, 2, 2), 1e-9),
        'mMul(t, R) en un punto: primero rota y despues traslada');
    ok(vnear(mTransformPoint(mMul(R, I), v3(0.3, 0.4, 0.5)), mTransformPoint(R, v3(0.3, 0.4, 0.5)), 1e-9),
        'mMul por la identidad no cambia nada');
    ok(vnear(mTransformPoint(mMul(I, R), v3(0.3, 0.4, 0.5)), mTransformPoint(R, v3(0.3, 0.4, 0.5)), 1e-9),
        'mMul por la identidad por la izquierda tampoco');
});

// ===========================================================================
run('Math3 · interpolacion y curvas', () => {
    ok(clamp(5, 0, 1) === 1 && clamp(-5, 0, 1) === 0 && clamp(0.5, 0, 1) === 0.5, 'clamp acota');
    ok(clamp01(2) === 1 && clamp01(-2) === 0 && clamp01(0.5) === 0.5, 'clamp01 acota a 0..1');
    ok(near(lerp(0, 10, 0.25), 2.5), 'lerp lineal');
    ok(near(lerp(10, 0, 0.25), 7.5), 'lerp va del primer al segundo');
    ok(near(lerp(5, 5, 0.9), 5), 'lerp de valores iguales no se mueve');

    // damp debe ser independiente del framerate: mismo dt total = mismo final.
    ok(near(damp(0, 1, 5, 1 / 60), 1 - Math.exp(-5 / 60), 1e-9), 'damp es el paso 1-e^(-rate dt)');
    ok(near(damp(1, 1, 5, 1 / 60), 1), 'damp ya en el destino no se mueve');
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    for (let i = 0; i < 10; i++) b = damp(b, 1, 5, 1 / 10);
    ok(near(a, b, 1e-6), 'damp da el mismo resultado a 60 Hz que a 10 Hz tras 1 s');
    ok(damp(0, 1, 0, 1 / 60) === 0, 'damp con rate 0 no se mueve (y no da NaN)');
    ok(Number.isFinite(damp(0, 1, -1, 1 / 60)), 'damp con rate negativo no da NaN');
    ok(vnear(dampV(v3(0, 0, 0), v3(1, 2, 3), 5, 1 / 60),
        v3(1, 2, 3).map((c) => c * (1 - Math.exp(-5 / 60))), 1e-9), 'dampV hace lo mismo en los tres ejes');
    ok(vnear(dampV(v3(1, 1, 1), v3(1, 1, 1), 5, 1 / 60), v3(1, 1, 1)), 'dampV quieto se queda quieto');

    const names = Object.keys(Easing);
    ok(names.length >= 7, `hay al menos 7 curvas (hay ${names.length})`);
    for (const name of names) {
        const f = Easing[name];
        ok(typeof f === 'function', `Easing.${name} es una funcion`);
        // STEP es un escalon a proposito: no "va de 0 a 1", salta.
        if (name !== 'STEP') ok(near(f(0), 0, 1e-6) && near(f(1), 1, 1e-6), `Easing.${name} va de 0 a 1`);
        ok(Number.isFinite(f(0.5)), `Easing.${name} no da NaN en la mitad`);
    }
    ok(near(Easing.LINEAR(0.3), 0.3), 'Easing.LINEAR es la recta');
    ok(near(Easing.STEP(0.99), 0, 1e-9) && near(Easing.STEP(1), 0, 1e-9), 'Easing.STEP es un escalon (no llega a 1)');
    ok(Easing.EASE_IN(0.5) < 0.5, 'Easing.EASE_IN arranca mas despacio que la recta');
    ok(Easing.EASE_OUT(0.5) > 0.5, 'Easing.EASE_OUT llega antes que la recta');
    ok(near(ease('LINEAR', 0.4), 0.4), 'ease aplica la curva nombrada');
    ok(near(ease('NO_EXISTE', 0.4), 0.4), 'una curva inexistente cae en lineal (no revienta)');
    ok(near(ease('LINEAR', 5), 1), 'ease acota t fuera de 0..1');
    ok(near(ease('LINEAR', -5), 0), 'ease acota t negativo');
});

// ===========================================================================
run('Math3 · rotar alrededor de un punto', () => {
    const r = vrotateAround(v3(1, 0, 0), v3(0, 1, 0), Math.PI / 2);
    ok(vnear(r, v3(0, 0, -1), 1e-6), 'gira alrededor del origen');
    const r2 = vrotateAround(v3(2, 0, 0), v3(0, 1, 0), Math.PI / 2, v3(1, 0, 0));
    ok(vnear(r2, v3(1, 0, -1), 1e-6), 'gira alrededor de un punto dado');
    ok(vnear(vrotateAround(v3(3, 2, 1), v3(0, 1, 0), 0), v3(3, 2, 1)), 'angulo 0 no mueve');
    const antes = vdist(v3(3, 2, 1), v3(1, 1, 1));
    const despues = vdist(vrotateAround(v3(3, 2, 1), v3(0, 1, 0), 1.1, v3(1, 1, 1)), v3(1, 1, 1));
    ok(near(antes, despues, 1e-9), 'la distancia al centro de giro se conserva');
    ok(near(antes, vlen(v3(2, 1, 0)), 1e-9), 'el radio es |p - origen|');
});

// ===========================================================================
run('CineConstants · contrato del rig', () => {
    ok(BONES.length === 21, `el rig tiene 21 huesos (tiene ${BONES.length})`);
    ok(BONES[0].name === 'PELVIS', 'el primero es PELVIS');
    const names = new Set(BONES.map((b) => b.name));
    ok(names.size === BONES.length, 'no hay nombres de hueso repetidos');
    const roots = BONES.filter((b) => !b.parent);
    ok(roots.length === 1 && roots[0].name === 'PELVIS', 'hay exactamente una raiz, la pelvis');
    ok(BONES.every((b) => b.parent === null || names.has(b.parent)), 'todo padre existe');
    ok(BONES.every((b) => Array.isArray(b.offset) && b.offset.length === 3), 'todo hueso tiene offset [x,y,z]');
    ok(BONES.every((b) => b.offset.every(Number.isFinite)), 'los offsets son numeros reales');
    ok(BONES.every((b) => Number.isFinite(b.length) && b.length > 0), 'todo hueso tiene largo positivo');
    ok(BONES.filter((b) => b.parent).every((b) => BONES.find((p) => p.name === b.parent).length > 0),
        'todo hueso con hijos tiene un padre con largo');

    // Sin ciclos: subir por los padres tiene que terminar en la raiz.
    let aciclico = true;
    for (const bone of BONES) {
        let cur = bone, pasos = 0;
        while (cur.parent) {
            cur = BONES.find((b) => b.name === cur.parent);
            if (++pasos > 64) { aciclico = false; break; }
        }
        if (cur.name !== 'PELVIS') aciclico = false;
    }
    ok(aciclico, 'las cadenas padre -> hijo no tienen ciclos');

    ok(REQUIRED_BONES.length === 14, `hay 14 obligatorios (hay ${REQUIRED_BONES.length})`);
    ok(REQUIRED_BONES.every((b) => names.has(b)), 'los obligatorios existen en BONES');
    const bilat = ['UPPERARM_L', 'UPPERARM_R', 'FOREARM_L', 'FOREARM_R', 'HAND_L', 'HAND_R',
        'THIGH_L', 'THIGH_R', 'SHIN_L', 'SHIN_R', 'FOOT_L', 'FOOT_R'];
    ok(bilat.every((b) => names.has(b)), 'las 12 articulaciones bilaterales estan');
    const izq = BONES.filter((b) => b.side === Side.L).map((b) => b.name).sort();
    const der = BONES.filter((b) => b.side === Side.R).map((b) => b.name).sort();
    ok(izq.length === der.length && izq.length > 0, `izquierda y derecha estan simetricas (${izq.length} vs ${der.length})`);
    ok(izq.every((n, i) => der[i] === n.replace(/_L$/, '_R')), 'cada hueso _L tiene su _R');
    ok(BONES.every((b) => b.group && Object.values(BoneGroup).includes(b.group)), 'todo hueso tiene un grupo valido');
    const conLado = BONES.filter((b) => b.side === Side.L || b.side === Side.R);
    ok(conLado.every((b) => b.group === BoneGroup.ARM_L || b.group === BoneGroup.ARM_R ||
        b.group === BoneGroup.LEG_L || b.group === BoneGroup.LEG_R),
        'los huesos con lado estan en un grupo de brazo o pierna');
    ok(BONES.every((b) => b.side === Side.L || b.side === Side.R || b.side === Side.NONE),
        'todo hueso declara su lado: L, R o NONE');
    ok(BONES.filter((b) => b.side === Side.NONE).length === 5, 'los 5 huesos axiales son NONE');
    const contacto = BONES.filter((b) => b.contact);
    ok(contacto.length > 0, 'hay huesos de contacto');
    ok(['HAND_L', 'HAND_R', 'FOOT_L', 'FOOT_R'].every((n) => BONES.find((b) => b.name === n).contact),
        'manos y pies son huesos de contacto (tocan el mundo y reciben golpes)');
    const pelvis = BONES[0];
    ok(pelvis.offset[1] > 0.8 && pelvis.offset[1] < 1.1, 'la pelvis esta a la altura de la cadera (~0,95 m)');
    const cabeza = BONES.find((b) => b.name === 'HEAD');
    ok(cabeza.offset[1] > 0.05 && cabeza.offset[1] < 0.25, 'la cabeza esta por encima del cuello');
    const pie = BONES.find((b) => b.name === 'FOOT_L');
    ok(pie.offset[1] < 0, 'el pie baja desde la tibia (eje Y negativo)');
});

// ===========================================================================
run('CineConstants · canales', () => {
    ok(Channel.RX && Channel.RY && Channel.RZ, 'existen los 3 canales de rotacion');
    ok(Channel.TX && Channel.TY && Channel.TZ, 'existen los 3 de traslacion');
    ok(Channel.SX && Channel.SY && Channel.SZ, 'existen los 3 de escala');
    ok(Channel.VIS === 'VIS', 'existe el canal de visibilidad');
    ok(ROT_CHANNELS.length === 3 && ROT_CHANNELS.every((c) => c.startsWith('R')), 'los de rotacion son los 3 R*');
    ok(TRANS_CHANNELS.length === 3 && TRANS_CHANNELS.every((c) => c.startsWith('T')), 'los de traslacion son los 3 T*');
    ok(SCALE_CHANNELS.length === 3 && SCALE_CHANNELS.every((c) => c.startsWith('S')), 'los de escala son los 3 S*');
    ok(ALL_CHANNELS.length === 10, `en total son 10 canales (son ${ALL_CHANNELS.length})`);
    ok(new Set(ALL_CHANNELS).size === 10, 'no hay canales repetidos');
    ok(ALL_CHANNELS.includes(Channel.VIS), 'la visibilidad esta en la lista completa');
    ok([...ROT_CHANNELS, ...TRANS_CHANNELS, ...SCALE_CHANNELS].every((c) => ALL_CHANNELS.includes(c)),
        'los tres grupos estan dentro de la lista completa');
    ok(new Set([...Object.values(BoneGroup)]).size === 7, 'hay 7 grupos de huesos');
});

// ===========================================================================
run('CineConstants · morphs e impactos', () => {
    const morphs = Object.values(MorphId);
    ok(morphs.length >= 8, `hay al menos 8 morphs (hay ${morphs.length})`);
    ok(morphs.every((m) => typeof m === 'string' && m.length), 'los morphs son cadenas no vacias');
    ok(morphs.includes(MorphId.SQUASH) && morphs.includes(MorphId.STRETCH), 'estan aplastarse y estirarse');
    ok(morphs.includes(MorphId.HEAD_LAG) && morphs.includes(MorphId.ARM_JIGGLE), 'estan los de inercia secundaria');
    ok(morphs.includes(MorphId.BREATH), 'esta la respiracion de idle');
    ok(morphs.includes(MorphId.CONTACT_FLATTEN), 'esta el aplanado de contacto');

    const kinds = Object.values(ImpactKind);
    ok(kinds.length >= 5, `hay al menos 5 tipos de impacto (hay ${kinds.length})`);
    ok(Object.keys(IMPACT_PRESETS).length === kinds.length, 'hay un preset por cada tipo de impacto');
    for (const kind of kinds) {
        const p = IMPACT_PRESETS[kind];
        ok(!!p, `hay preset para ${kind}`);
        ok(Number.isFinite(p.severity) && p.severity > 0 && p.severity <= 1, `${kind}: severidad en 0..1`);
        ok(Number.isFinite(p.hitstop) && p.hitstop >= 0, `${kind}: hitstop es >= 0`);
        ok(Number.isFinite(p.shake) && p.shake >= 0 && p.shake <= 1, `${kind}: temblor de camara en 0..1`);
        ok(!!p.morphs && Object.keys(p.morphs).length > 0, `${kind}: deforma el cuerpo`);
        ok(Object.keys(p.morphs).every((m) => morphs.includes(m)), `${kind}: los morphs existen en MorphId`);
        ok(Object.values(p.morphs).every((v) => Number.isFinite(v) && v > 0 && v <= 1), `${kind}: morphs en 0..1`);
        ok(Object.values(p.morphs).some((v) => Number.isFinite(v) && v > 0), `${kind}: al menos un morph activo`);
    }
    const sev = kinds.map((k) => IMPACT_PRESETS[k].severity);
    ok(IMPACT_PRESETS[ImpactKind.GRAZE].severity < IMPACT_PRESETS[ImpactKind.LIGHT].severity &&
        IMPACT_PRESETS[ImpactKind.LIGHT].severity < IMPACT_PRESETS[ImpactKind.HEAVY].severity,
        'la severidad crece con el tipo de golpe');
    ok(IMPACT_PRESETS[ImpactKind.CRUSH].severity >= IMPACT_PRESETS[ImpactKind.HEAVY].severity,
        'un CRUSH es el golpe mas fuerte');
    ok(IMPACT_PRESETS[ImpactKind.LAUNCH].morphs.STRETCH > 0, 'un LAUNCH estira en vez de aplastar');
    ok(!IMPACT_PRESETS[ImpactKind.LAUNCH].morphs.SQUASH, 'un lanzamiento no aplasta el cuerpo');

    ok(Object.keys(IMPACT_BONE_GAIN).length > 0, 'hay ganancia de impacto por hueso');
    ok(IMPACT_BONE_GAIN.HEAD > IMPACT_BONE_GAIN.THIGH_L, 'la cabeza se mueve mas que un muslo');
    ok(IMPACT_BONE_GAIN.HEAD <= 1 && IMPACT_BONE_GAIN.THIGH_R >= 0, 'las ganancias estan acotadas');
    ok(Object.values(ImpactAxis).length >= 4, 'hay varios ejes de impacto');
});

// ===========================================================================
run('CineConstants · transiciones, planos y configuracion', () => {
    ok(TRANSITION_DURATION[TransitionKind.CUT] === 0, 'un corte seco no ocupa frames');
    ok(Object.keys(TRANSITION_DURATION).length === Object.values(TransitionKind).length, 'hay duracion para cada transicion');
    for (const k of Object.values(TransitionKind)) {
        ok(Number.isFinite(TRANSITION_DURATION[k]) && TRANSITION_DURATION[k] >= 0, `${k}: duracion >= 0 y finita`);
    }
    ok(TRANSITION_DURATION[TransitionKind.FADE_BLACK] > TRANSITION_DURATION[TransitionKind.CUT],
        'fundir a negro ocupa mas frames que cortar');
    ok(Object.values(ShotSize).length >= 6, 'hay varios planos de camara');
    ok(Object.values(ShotSize).includes('FULL') && Object.values(ShotSize).includes('WIDE'),
        'estan los planos de cuerpo entero');

    ok(CFG.FIXED_DT === 1 / 60, 'el paso fijo es 1/60');
    ok(CFG.FPS === 60, 'la cinematica va a 60 Hz como la FSM');
    ok(near(CFG.FIXED_DT, 1 / CFG.FPS), 'FIXED_DT es coherente con FPS');
    ok(CFG.CHARACTER_HEIGHT > 1.5 && CFG.CHARACTER_HEIGHT < 2.0, 'el humano mide entre 1,5 y 2 m');
    ok(CFG.MORPH_MAX > 0 && CFG.MORPH_MAX <= 2, 'el tope de deformacion es razonable (evita el "globo")');
    ok(CFG.MORPH_DAMPING > 0, 'los morphs se amortiguan');
    ok(CFG.MORPH_FREQ > 0 && CFG.MORPH_FREQ < 30, 'los muelles de deformacion no son infinitamente rapidos');
    ok(CFG.FOV_DEFAULT > 30 && CFG.FOV_DEFAULT < 120, 'el FOV por defecto es de camara normal');
    ok(CFG.SHAKE_MAX_DEG > 0 && CFG.SHAKE_MAX_DEG < 20, 'el temblor de camara no marea');
    ok(CFG.SHAKE_FREQ > 0 && CFG.SHAKE_DAMPING > 0, 'el temblor tiene frecuencia y amortiguacion');
    ok(CFG.HITSTOP_MAX > 0 && Number.isInteger(CFG.HITSTOP_MAX), 'el hitstop tiene tope entero');
    ok(CFG.HITSTOP_PER_SEVERITY > 0, 'el hitstop escala con la severidad');
    ok(CFG.MIN_CLIP_FRAMES >= 1, 'un clip vacio no genera un bucle infinito');
});

// ===========================================================================
run('BoneMap · normalizacion de nombres', () => {
    ok(normalizeBoneName('mixamorig:Left ForeArm') === 'mixamorigleftforearm', 'quita espacios, puntos, guiones y signos');
    ok(normalizeBoneName('Left_Fore-Arm') === 'leftforearm', 'cualquier separador da el mismo resultado');
    ok(normalizeBoneName('  Spine  ') === 'spine', 'quita espacios sobrantes');
    ok(normalizeBoneName(undefined) === '', 'undefined no rompe');
    ok(normalizeBoneName(null) === '', 'null no rompe');
    ok(normalizeBoneName('Hips') === normalizeBoneName('hips'), 'no distingue mayusculas');
});

// ===========================================================================
run('BoneMap · el mannequin real del repo', () => {
    const glbPath = join(ROOT, 'assets/characters/mannequin.glb');
    ok(existsSync(glbPath), 'assets/characters/mannequin.glb esta en el repo');
    const buf = readFileSync(glbPath);
    ok(buf.slice(0, 4).toString('ascii') === 'glTF', 'el archivo es un GLB de verdad');
    ok(buf.readUInt32LE(4) === 2, 'es glTF 2.0');
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
    ok(Array.isArray(gltf.skins) && gltf.skins.length === 1, 'tiene una skin');
    ok(!!gltf.skins[0].inverseBindMatrices, 'la skin trae las matrices inverse-bind');
    const prim = gltf.meshes[0].primitives[0];
    ok('JOINTS_0' in prim.attributes, 'la malla tiene indices de hueso');
    ok('WEIGHTS_0' in prim.attributes, 'la malla tiene pesos de hueso');
    ok(gltf.meshes[0].primitives.length === 1, 'la malla es una sola');

    const modelBones = gltf.skins[0].joints.map((i) => gltf.nodes[i].name);
    ok(modelBones.length === 19, `el mannequin tiene 19 huesos (tiene ${modelBones.length})`);
    ok(modelBones.every(Boolean), 'todos los huesos tienen nombre');
    ok(new Set(modelBones).size === 19, 'no hay nombres de hueso repetidos en el modelo');

    const idx = buildBoneMap(modelBones);
    ok(idx.duplicates.length === 0, 'ningun hueso real se reclama dos veces');
    ok(idx.playable(), 'el mannequin se puede usar para jugar');
    ok(REQUIRED_BONES.every((b) => idx.map[b]), `el mannequin tiene los ${REQUIRED_BONES.length} obligatorios`);
    ok(idx.missing.length === 2 && idx.missing.includes('CLAV_L') && idx.missing.includes('CLAV_R'),
        'lo unico que falta son las claviculas, que el modelo no tiene');
    ok(resolveBone(idx, 'PELVIS') === 'torso_joint_1', 'PELVIS -> torso_joint_1');
    ok(resolveBone(idx, 'SPINE') === 'torso_joint_2', 'SPINE -> torso_joint_2');
    ok(resolveBone(idx, 'CHEST') === 'torso_joint_3', 'CHEST -> torso_joint_3');
    ok(resolveBone(idx, 'NECK') === 'neck_joint_1', 'NECK -> neck_joint_1');
    ok(resolveBone(idx, 'HEAD') === 'neck_joint_2', 'HEAD -> neck_joint_2');
    ok(resolveBone(idx, 'UPPERARM_L') === 'arm_joint_L_1', 'UPPERARM_L -> arm_joint_L_1');
    ok(resolveBone(idx, 'FOREARM_L') === 'arm_joint_L_2', 'FOREARM_L -> arm_joint_L_2');
    ok(resolveBone(idx, 'HAND_R') === 'arm_joint_R_3', 'HAND_R -> arm_joint_R_3');
    ok(resolveBone(idx, 'THIGH_L') === 'leg_joint_L_1', 'THIGH_L -> leg_joint_L_1');
    ok(resolveBone(idx, 'SHIN_R') === 'leg_joint_R_2', 'SHIN_R -> leg_joint_R_2');
    ok(resolveBone(idx, 'FOOT_L') === 'leg_joint_L_3', 'FOOT_L -> leg_joint_L_3');
    ok(resolveBone(idx, 'TOE_R') === 'leg_joint_R_5', 'TOE_R -> leg_joint_R_5');
    ok(resolveBone(idx, 'NO_EXISTE') === null, 'un hueso del contrato inexistente da null');
    ok(idx.extras(modelBones).length === 0, 'el mannequin no deja huesos sin reclamar');
    ok(Object.keys(idx.resolved()).length === 19, 'el mapa resuelto tiene los 19 huesos');
    ok(boneMeta('FOREARM_L').group === BoneGroup.ARM_L, 'boneMeta da el grupo del hueso');
    ok(boneMeta('FOREARM_L').side === Side.L, 'boneMeta da el lado del hueso');
    ok(boneMeta('FOOT_R').group === BoneGroup.LEG_R, 'boneMeta del pie derecho');
    ok(boneMeta('PELVIS').parent === null, 'boneMeta de PELVIS no tiene padre');
    ok(boneMeta('NO_EXISTE') === null, 'boneMeta de un nombre falso da null');

    // El modelo esta en Z-up: sin la rotacion de raiz el personaje esta
    // tumbado. Si alguien cambia el archivo, esto avisa.
    const jointsAcc = gltf.accessors[gltf.meshes[0].primitives[0].attributes.JOINTS_0];
    const weightsAcc = gltf.accessors[gltf.meshes[0].primitives[0].attributes.WEIGHTS_0];
    ok(jointsAcc.count === weightsAcc.count, 'cada vertice tiene su indice y su peso');
    ok(jointsAcc.componentType === 5123, 'los indices de hueso son sin signo (UShort)');
    ok(weightsAcc.componentType === 5126, 'los pesos son en coma flotante');
});

// ===========================================================================
run('BoneMap · alias de otros modelos', () => {
    const mixamo = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head',
        'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
        'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
        'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
        'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot'];
    const m = buildBoneMap(mixamo);
    ok(m.playable(), 'un esqueleto Mixamo tambien se puede jugar');
    ok(m.map.PELVIS === 'mixamorig:Hips', 'PELVIS -> mixamorig:Hips');
    ok(m.map.THIGH_L === 'mixamorig:LeftUpLeg', 'THIGH_L -> LeftUpLeg (muslo)');
    ok(m.map.SHIELDL === undefined, 'no inventamos huesos que no existen');
    ok(m.map.FOREARM_L === 'mixamorig:LeftForeArm', 'FOREARM_L -> LeftForeArm');
    ok(m.map.SPIN === undefined && m.map.SHIELDL === undefined, 'no hay nombres inventados en el mapa');
    ok(!m.map.FOREARM_L.includes('LeftArm'), 'FOREARM_L no se confunde con LeftArm');
    ok(m.missing.every((x) => ['CLAV_L', 'CLAV_R', 'TOE_L', 'TOE_R'].includes(x)),
        `de Mixamo aqui solo faltan clavicula y punta de pie (faltan: ${m.missing.join(',')})`);
    ok(m.extras(mixamo).length === 0, 'no quedan huesos de Mixamo sin reclamar');

    // Mixamo SIN prefijo (exportaciones antiguas).
    const m2 = buildBoneMap(['Hips', 'Spine', 'Spine2', 'Neck', 'Head',
        'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
        'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
        'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
    ok(m2.playable(), 'un esqueleto Mixamo sin prefijo tambien se puede jugar');
    ok(m2.map.PELVIS === 'Hips', 'PELVIS -> Hips');

    const generico = ['Hips', 'Spine', 'Chest', 'Neck', 'Head',
        'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
        'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
        'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
    const g = buildBoneMap(generico);
    ok(g.playable(), 'un esqueleto generico (Kenney/Quaternius) tambien se puede jugar');
    ok(g.map.PELVIS === 'Hips' && g.map.HEAD === 'Head', 'nombres genericos bien interpretados');
    ok(g.map.CHEST === 'Chest', 'CHEST -> Chest (no Spine2)');
    ok(g.map.THIGH_L === 'LeftUpLeg', 'THIGH_L -> LeftUpLeg');
    ok(g.map.SHIELDL === undefined, 'nada inventado en el generico');
    ok(g.duplicates.length === 0, 'sin duplicados en el generico');

    const bpr = buildBoneMap(['hips', 'spine', 'chest', 'neck', 'head',
        'upper_arm.L', 'lower_arm.L', 'hand.L', 'upper_arm.R', 'lower_arm.R', 'hand.R',
        'thigh.L', 'calf.L', 'foot.L', 'thigh.R', 'calf.R', 'foot.R']);
    ok(bpr.playable(), 'tambien funciona con la convencion de Ready Player Me (arm.L)');
    ok(bpr.map.FOREARM_L === 'lower_arm.L', 'FOREARM_L -> lower_arm.L');
    ok(bpr.map.SHIELDL === undefined && bpr.map.CLAV_L === undefined, 'claviculas: no inventa (falta en el modelo)');
});

// ===========================================================================
run('BoneMap · cuando el modelo no sirve', () => {
    const sinBrazos = buildBoneMap(['torso_joint_1', 'torso_joint_2', 'torso_joint_3',
        'neck_joint_1', 'neck_joint_2', 'leg_joint_L_1', 'leg_joint_L_2', 'leg_joint_L_3',
        'leg_joint_R_1', 'leg_joint_R_2', 'leg_joint_R_3']);
    ok(!sinBrazos.playable(), 'un modelo sin brazos NO se puede jugar');
    ok(sinBrazos.missing.includes('FOREARM_L'), 'avisa del antebrazo que falta');
    ok(sinBrazos.missing.includes('HAND_R'), 'avisa de la mano que falta');
    ok(!sinBrazos.missing.includes('PELVIS'), 'la pelvis si esta, no se queja de ella');
    ok(REQUIRED_BONES.filter((b) => sinBrazos.missing.includes(b)).length === 6,
        `faltan los 6 obligatorios de los brazos (faltan ${REQUIRED_BONES.filter((b) => sinBrazos.missing.includes(b)).length})`);

    const vacio = buildBoneMap([]);
    ok(!vacio.playable(), 'un modelo sin huesos no se puede jugar');
    ok(vacio.missing.length === BONES.length, 'faltan todos los huesos del contrato');
    ok(vacio.duplicates.length === 0, 'sin duplicados en un modelo vacio');
    ok(vacio.extras([]).length === 0, 'extras de un modelo vacio esta vacio');

    const deUnaPierna = buildBoneMap(['torso_joint_1', 'torso_joint_2', 'torso_joint_3',
        'neck_joint_1', 'neck_joint_2',
        'arm_joint_L_1', 'arm_joint_L_2', 'arm_joint_L_3',
        'arm_joint_R_1', 'arm_joint_R_2', 'arm_joint_R_3',
        'leg_joint_L_1', 'leg_joint_L_2', 'leg_joint_L_3', 'leg_joint_R_1']);
    ok(!deUnaPierna.playable(), 'un modelo con una sola pierna no se puede jugar');
    ok(deUnaPierna.missing.includes('FOOT_R'), 'avisa del pie derecho que falta');

    // Esqueleto con dos huesos que caen en el mismo sitio: hay que avisar, no
    // elegir en silencio (elegir mal deja al personaje doblado sin error visible).
    const fusionado = buildBoneMap(['torso_joint_1', 'torso_joint_3', 'neck_joint_1', 'neck_joint_2',
        'arm_joint_L_1', 'arm_joint_L_2', 'arm_joint_L_3',
        'arm_joint_R_1', 'arm_joint_R_2', 'arm_joint_R_3',
        'leg_joint_L_1', 'leg_joint_L_2', 'leg_joint_L_3',
        'leg_joint_R_1', 'leg_joint_R_2', 'leg_joint_R_3']);
    ok(fusionado.missing.includes('SPINE'), 'un spine ausente se reporta');
    ok(fusionado.duplicates.length === 0, 'una articulacion fusionada no genera duplicados, sino un hueco');
    ok(fusionado.playable(), 'sin SPINE el rig sigue siendo jugable: SPINE no es obligatorio por contrato');
    ok(fusionado.missing.includes('SPINE'), 'pero avisa de que la columna no se puede animar');
});

// ===========================================================================
run('BoneMap · prioridad y tablas a medida', () => {
    const mixto = ['torso_joint_1', 'torso_joint_2', 'torso_joint_3', 'neck_joint_1', 'neck_joint_2',
        'arm_joint_L_1', 'arm_joint_L_2', 'arm_joint_L_3',
        'arm_joint_R_1', 'arm_joint_R_2', 'arm_joint_R_3',
        'leg_joint_L_1', 'leg_joint_L_2', 'leg_joint_L_3',
        'leg_joint_R_1', 'leg_joint_R_2', 'leg_joint_R_3'];
    const soloCesium = buildBoneMap(mixto, [ALIASES.CESIUM]);
    ok(soloCesium.map.PELVIS === 'torso_joint_1', 'con solo la tabla CESIUM encuentra el mannequin');
    ok(soloCesium.playable(), 'el mannequin se juega solo con la tabla CESIUM');
    const genericoPrimero = buildBoneMap(['Spine', 'Spine1'], [ALIASES.GENERIC, ALIASES.CESIUM]);
    ok(genericoPrimero.map.SPINE === 'Spine', 'gana la primera tabla que coincide');
    const personal = buildBoneMap(['mi_cadera'], [{ PELVIS: ['mi_cadera'] }]);
    ok(personal.map.PELVIS === 'mi_cadera', 'se puede pasar una tabla propia');
    ok(!personal.playable(), 'una tabla propia sin el resto no da un modelo jugable');
    ok(personal.missing.length === 20, 'la tabla propia cubre solo lo que dice');
});

// ===========================================================================
run('BoneMap · helper de depuracion', () => {
    ok(closestContractBone('Spine2').name === 'SPINE', 'Spine2 sugiere SPINE');
    ok(closestContractBone('Spine').name === 'SPINE', 'Spine sugiere SPINE');
    ok(closestContractBone('mixamorig:LeftForeArm').name === 'FOREARM_L', 'LeftForeArm con prefijo sugiere FOREARM_L');
    ok(closestContractBone('RightHand').name === 'HAND_R', 'RightHand (lado delante) sugiere HAND_R');
    ok(closestContractBone('lfoot').name === 'FOOT_L', 'lfoot (prefijo de una letra) sugiere FOOT_L');
    ok(closestContractBone('upper_arm.R').name === 'UPPERARM_R', 'upper_arm.R (con punto) sugiere UPPERARM_R');
    ok(splitSide('leftforearm').core === 'forearm' && splitSide('leftforearm').side === 'L', 'splitSide quita el lado por delante');
    ok(splitSide('forearml').core === 'forearm' && splitSide('forearml').side === 'L', 'splitSide quita el lado por detras');
    ok(splitSide('pelvis').side === 'NONE', 'splitSide deja NONE en un hueso axial');
    ok(closestContractBone('PELVIS').name === 'PELVIS', 'un nombre del contrato devuelve el mismo');
    ok(closestContractBone('basura_total_123') === null, 'un nombre sin relacion devuelve null');
    ok(closestContractBone(undefined) === null, 'undefined no rompe el depurador');
    ok(closestContractBone('') === null, 'cadena vacia no rompe el depurador');
});

// ===========================================================================
// EL PUENTE RIG -> BABYLON
// ---------------------------------------------------------------------------
// applyPose escribe un LOCAL en cada hueso y Babylon compone encima los padres
// que haya en el archivo. Para el hueso raiz del rig, el mundo que sale es
//     W * (rootFix * localT)
// y el que el rig cree haber puesto es
//     rootFix * localT
// Si W no es la identidad, no coinciden. Este bloque comprueba, contra los dos
// modelos REALES del repo, que el puente coloca la cadera donde el rig dice.
run('Puente rig->Babylon · el envoltorio del archivo no se cuenta dos veces', () => {
    const recsDe = (nodes) => nodes.map((n) => ({
        name: n.name,
        parentName: n.parent === undefined ? null : nodes[n.parent].name,
        localT: n.translation || [0, 0, 0],
        localQ: n.rotation || [0, 0, 0, 1]
    }));
    const qmul = (a, b) => [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
    const qrot = (q, v) => {
        const [x, y, z, w] = q, [vx, vy, vz] = v;
        const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
        return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const Z_UP = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

    const comprobar = (label, nodes) => {
        const recs = recsDe(nodes);
        const byName = new Map(recs.map((r) => [r.name, r]));
        const boneMap = buildBoneMap(recs.map((r) => r.name));
        ok(boneMap.playable(), `${label}: el modelo cumple el contrato`);

        const pelvis = byName.get(boneMap.map.PELVIS);
        ok(!!pelvis, `${label}: existe el hueso de la pelvis`);

        const W = wrapperTransform(recs, boneMap.map.PELVIS);
        const n = W[0] * W[0] + W[1] * W[1] + W[2] * W[2] + W[3] * W[3];
        const Winv = [-W[0] / n, -W[1] / n, -W[2] / n, W[3] / n];
        const identidad = Math.abs(W[3]) > 0.9999;

        // Lo que el RIG calcula para la pelvis: rootFix * localT.
        const rig = qrot(Z_UP, pelvis.localT);

        // SIN la correccion el mundo real es W * (rootFix * localT): el
        // envoltorio del archivo se SUMA al rootFix. Con envoltorio identidad no
        // pasa nada (por eso el mannequin nunca lo noto); con uno de 90 grados
        // la pelvis se va mas de un metro y la malla sale retorcida.
        const sinCorregir = qrot(W, rig);
        // CON la correccion el local escrito lleva W^-1 y el mundo sale exacto:
        // W * (W^-1 * rig) == rig.
        const conCorreccion = qrot(W, qrot(Winv, rig));

        ok(dist(conCorreccion, rig) < 1e-4,
            `${label}: con la correccion la pelvis cae donde dice el rig`,
            `error ${dist(conCorreccion, rig).toFixed(4)} m`);

        if (identidad) {
            ok(dist(sinCorregir, rig) < 1e-4,
                `${label}: envoltorio identidad, la correccion no cambia nada`);
        } else {
            const err = dist(sinCorregir, rig);
            ok(err > 0.05,
                `${label}: sin corregir el error seria real y grande`,
                `error ${err.toFixed(4)} m`);
            ok(err > 1,
                `${label}: el error sin corregir pasa de un metro`,
                `error ${err.toFixed(4)} m`);
        }

        return { W, identidad };
    };

    // El mannequin: envoltorio identidad. Por eso el bug nunca se vio aqui.
    const m = comprobar('mannequin', loadGLB(join(ROOT, 'assets/characters/mannequin.glb')).nodes);
    ok(m.identidad,
        'mannequin: su cadena (Z_UP -> Armature) es identidad, y por eso el bug no lo afectaba',
        `W = [${m.W.map((v) => v.toFixed(4)).join(', ')}]`);

    // Quaternius: envoltorio de 90 grados. ESTE es el que sale hecho una bola.
    const base = join(ROOT, 'assets/characters/quaternius-superhero-male/Superhero_Male_FullBody');
    ok(existsSync(base + '.gltf'), 'el .gltf de Quaternius esta en el repo');
    ok(existsSync(base + '.bin'), 'el .bin de Quaternius esta en el repo');
    if (existsSync(base + '.gltf') && existsSync(base + '.bin')) {
        const { gltf, bones, bounds } = loadGLTFPair(base);
        ok(gltf.skins.length === 1, 'Quaternius: tiene una skin');
        ok(bones.length === 65, `Quaternius: 65 huesos en la skin (tiene ${bones.length})`);
        ok(Math.abs(bounds.size[1] - 1.82) < 0.05,
            'Quaternius: la malla mide 1,82 m en Y', `Y = ${bounds.size[1].toFixed(3)}`);
        const q = comprobar('Quaternius', gltf.nodes);
        ok(!q.identidad,
            'Quaternius: su envoltorio `root` SI gira, que es justo lo que rompia la postura',
            `W = [${q.W.map((v) => v.toFixed(4)).join(', ')}]`);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(q.W[3]))) * 180 / Math.PI;
        ok(ang > 89 && ang < 91, `Quaternius: el envoltorio son 90 grados (son ${ang.toFixed(1)})`);
    }
});

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (fails.length === 0) {
    console.log(`resultado: ${pass} ok, 0 fallos`);
    console.log('='.repeat(64));
} else {
    console.log(`resultado: ${pass} ok, ${fails.length} FALLOS`);
    fails.forEach((f) => console.log('  x ' + f));
    console.log('='.repeat(64));
    process.exit(1);
}