/**
 * ============================================================================
 * SANPABLERA ENGINE · cine/Rig.js
 * ----------------------------------------------------------------------------
 * El esqueleto VIVO de un personaje: mide el modelo real, hace cinematica
 * directa (FK), resuelve cinematica inversa (IK) y recuerda donde tiene los
 * pies plantados.
 *
 * POR QUE NO SE USA EL RIG DE BABYLON PARA ESTO
 *   El esqueleto de Babylon sirve para REPRODUCIR clips ya grabados. Para una
 *   animacion procedural hacen falta tres cosas que no da:
 *     1. MEDIR el modelo: longitudes reales de femur y tibia. El contrato de
 *        CineConstants dice "muslo 0,45 m", pero el mannequin mide 0,33 y un
 *        rig de Mixamo 0,44. El IK con longitudes equivocadas deja el pie
 *        flotando o enterrado, y no hay forma de arreglarlo desde el codigo.
 *     2. FK desde una POSE de deltas (Pose.js), para poder sumar capas.
 *     3. IK que escriba DEFORMACION, no que mueva el hueso entero: el pie se
 *        queda quieto en el suelo mientras la cadera baja de altura.
 *
 * UN RIG ES UN MODELO, LOS DATOS SON DEL MODELO
 *   buildRig() se ejecuta con los huesos del .glb que se ha cargado. Si manana
 *   se cambia a un personaje de Mixamo, se vuelve a construir el rig y todo lo
 *   de arriba (stances, footwork, acciones) sigue funcionando sin cambios.
 *
 * ESPACIO DE COORDENADAS
 *   Todo el rig trabaja en "espacio de personaje": Y arriba, Z adelante, origen
 *   en el suelo bajo el centro de la pelvis. Ni la posicion en el mundo ni la
 *   rotacion de la raiz (hacia donde mira) entran aqui: eso es de la entidad
 *   Fighter. Asi el mismo rig sirve para el peleador 1 y para una IA quethink
 *   el combate desde el otro lado sin espejar una sola linea.
 * ============================================================================
 */

import { BONES, REQUIRED_BONES, CFG } from './CineConstants.js';
import {
    qIdentity, qnorm, qmul, qinv, qFromTo, qRotateVec, qFromAxisAngle,
    vadd, vsub, vmul, vlen, vnorm, vcross, clamp
} from './Math3.js';
import { rotOf, posOf, setRot, setPos } from './Pose.js';

/** contractName -> { name, parent, length, dir, child } */
function contractTable() {
    const t = Object.create(null);
    for (const b of BONES) t[b.name] = { name: b.name, parent: b.parent, nominalLength: b.length };
    return t;
}

/**
 * Construye un rig a partir de los huesos reales del modelo.
 *
 * @param {Object} boneMap     resultado de BoneMap.buildBoneMap()
 * @param {Array}  modelBones  [{ name, parentName, localT:[3], localQ:[4] }]
 *                             en el espacio del archivo, sin escalar
 * @param {Object} opts
 *   scale      factor para llegar a CFG.CHARACTER_HEIGHT (si se omite, se
 *             calcula con el alto medido del modelo)
 *   rootFix    quaternion o 'Z_UP' para convertir el archivo a Y arriba
 *   groundY    altura del suelo en espacio de personaje (0 por defecto)
 */
export function buildRig(boneMap, modelBones, opts = {}) {
    const contract = contractTable();
    const rootFix = resolveRootFix(opts.rootFix);
    const byName = new Map(modelBones.map((b) => [b.name, b]));
    // Inverso del BoneMap: nombre real -> nombre del CONTRATO.
    const toContract = Object.create(null);
    for (const cb of BONES) {
        if (boneMap.map[cb.name]) toContract[boneMap.map[cb.name]] = cb.name;
    }

    // --- 1. Estructura local -------------------------------------------
    const bones = [];                       // en orden de jerarquia (FK lineal)
    const index = Object.create(null);      // contractName -> indice en bones
    const missing = [];

    for (const cb of BONES) {
        const realName = boneMap.map[cb.name];
        if (!realName || !byName.has(realName)) { missing.push(cb.name); continue; }
        index[cb.name] = bones.length;
        const node = byName.get(realName);
        bones.push({
            contract: cb.name,
            model: node,
            parentIndex: -1,
            localT: node.localT.slice(),
            localQ: qnorm(node.localQ)
        });
    }

    // --- 2. Jerarquia (padre = el padre en el archivo, mapeado al contrato) -
    for (const b of bones) {
        const parentContract = contract[b.contract].parent;
        // Se sube por el modelo hasta encontrar un ancestro que este mapeado.
        let p = parentContract ? b.model.parentName : null;
        while (p) {
            if (toContract[p] === parentContract) {
                b.parentIndex = index[parentContract];
                break;
            }
            p = byName.has(p) ? byName.get(p).parentName : null;
        }
        if (b.parentIndex < 0) {
            // El padre declarado en el CONTRATO no existe en el modelo (Cesium
            // no tiene claviculas, por ejemplo). Se cuelga del primer ancestro
            // mapeado que exista, para no romper la cadena.
            let anc = b.model.parentName;
            while (anc) {
                const c = toContract[anc];
                if (c !== undefined && index[c] !== undefined) { b.parentIndex = index[c]; break; }
                anc = byName.has(anc) ? byName.get(anc).parentName : null;
            }
        }
    }

    // --- 3. Orden topologico + pose de reposo en espacio de personaje ----
    const ordered = topoSort(bones);

    // topoSort ha reordenado `bones`: los indices de padre hay que reapuntar a
    // las nuevas posiciones o la FK recorreria la cadena equivocada.
    const slot = new Map(ordered.map((b, i) => [b, i]));
    for (const b of ordered) {
        if (b.parentIndex >= 0) b.parentIndex = slot.get(bones[b.parentIndex]);
        b.index = slot.get(b);
        // `index` debe apuntar a `rig.bones` (ya ordenado por jerarquia), no al
        // array de partida: el IK busca por indice y un desajuste de una sola
        // posicion devuelve la articulacion de otro hueso sin avisar.
        index[b.contract] = b.index;
    }

    const rest = Object.create(null);
    const restWorld = Object.create(null);

    for (const b of ordered) {
        const lt = vmul(b.localT, opts.scale || 1);
        const lq = qnorm(b.localQ);
        b.localT = lt; b.localQ = lq;
        b.parentContract = b.parentIndex >= 0 ? bones[b.parentIndex].contract : null;
        if (b.parentIndex < 0) {
            // El nodo raiz del archivo puede venir tumbado (Z arriba). El
            // rootFix lo pone en pie y de paso deja todo el rig en Y arriba.
            restWorld[b.contract] = {
                p: qRotateVec(rootFix, lt),
                q: qnorm(qmul(rootFix, lq))
            };
        } else {
            const P = restWorld[b.parentContract];
            restWorld[b.contract] = {
                p: vadd(P.p, qRotateVec(P.q, lt)),
                q: qnorm(qmul(P.q, lq))
            };
        }
        rest[b.contract] = { t: lt, q: lq };
    }

    // --- 4. Medidas reales: longitud y direccion hacia el hijo -----------
    for (const b of ordered) {
        const here = restWorld[b.contract].p;
        let child = null;
        for (const o of ordered) {
            if (o.parentIndex === b.index) { child = o; break; }
        }
        if (child) {
            const d = vsub(restWorld[child.contract].p, here);
            const l = vlen(d);
            b.length = l;
            b.dir = l > 1e-6 ? vmul(d, 1 / l) : [0, 1, 0];
            b.child = child.contract;
        } else {
            b.length = contract[b.contract].nominalLength;
            b.dir = [0, 1, 0];
            b.child = null;
        }
    }

    const heights = ordered.map((b) => restWorld[b.contract].p[1]);
    const measured = Math.max(...heights);

    // --- 5. Raices de contacto ----------------------------------------
    const roots = Object.create(null);
    for (const b of ordered) {
        if (isContact(b.contract)) {
            roots[b.contract] = { p: restWorld[b.contract].p.slice(), planted: true };
        }
    }

    // --- 6. Offset tobillo -> punta en el marco local del pie ----------
    //
    // Es lo que permite clavar la PUNTA en un punto del suelo en vez de clavar
    // el tobillo. Se guarda en local porque al girar el pie (puntera arriba,
    // talón arriba) este vector tiene que girar con el, no quedarse clavado en
    // el mundo.
    const footOffsetLocal = Object.create(null);
    for (const side of ['L', 'R']) {
        const foot = side === 'R' ? 'FOOT_R' : 'FOOT_L';
        const toe = side === 'R' ? 'TOE_R' : 'TOE_L';
        if (!restWorld[foot] || !restWorld[toe]) continue;
        const d = vsub(restWorld[toe].p, restWorld[foot].p);
        footOffsetLocal[foot] = qRotateVec(qinv(restWorld[foot].q), d);
    }

    const rig = {
        bones: ordered,
        names: ordered.map((b) => b.contract),
        index,
        rest,
        restWorld,
        roots,
        footOffsetLocal,
        rootFix,
        measuredHeight: measured,
        height: measured,
        // Multiplicador REAL aplicado a las medidas del archivo. Se guarda
        // porque el render lo necesita para pasar de "metros de personaje" a
        // "metros de escena" (ver render/CharacterModel.js).
        scale: opts.scale || 1,
        groundY: opts.groundY || 0,
        missing,
        playable: missing.every((b) => !REQUIRED_BONES.includes(b)) && ordered.filter((b) => b.parentIndex < 0).length === 1,
        byGroup: groupIndex(ordered)
    };

    rig.fk = (pose, out) => fk(rig, pose, out);
    rig.solveTwoBone = (pose, fkState, req) => solveTwoBone(rig, pose, fkState, req);
    rig.footTarget = (bone) => (rig.roots[bone] ? rig.roots[bone].p.slice() : null);
    rig.plantFoot = (bone, p) => { if (rig.roots[bone]) { rig.roots[bone].p = p.slice(); rig.roots[bone].planted = true; } };
    rig.releaseFoot = (bone) => { if (rig.roots[bone]) rig.roots[bone].planted = false; };
    rig.footPlanted = (bone) => !!(rig.roots[bone] && rig.roots[bone].planted);
    return rig;
}

// ===========================================================================
// CONSTRUCCION
// ===========================================================================

function resolveRootFix(rootFix) {
    if (!rootFix) return qIdentity();
    if (rootFix === 'Z_UP') {
        // (x, y, z) -> (x, z, -y): el archivo esta en Z arriba y el motor en
        // Y arriba. Son -90 grados sobre X, NO +90: con el signo equivocado el
        // personaje queda de pie pero mirado hacia el techo y con los brazos
        // hacia atras. Es la matriz del nodo "Z_UP" del .glb de Khronos.
        return qnorm([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    }
    return qnorm(rootFix);
}

function topoSort(bones) {
    const out = [];
    const seen = new Set();
    const visit = (b) => {
        if (seen.has(b)) return;
        seen.add(b);
        if (b.parentIndex >= 0) visit(bones[b.parentIndex]);
        out.push(b);
    };
    bones.forEach((b, i) => { b.index = i; visit(b); });
    return out;
}

function isContact(contract) {
    const b = BONES.find((x) => x.name === contract);
    return !!(b && b.contact);
}

function groupIndex(ordered) {
    const g = Object.create(null);
    for (const b of ordered) {
        const meta = BONES.find((x) => x.name === b.contract);
        const key = meta ? meta.group : 'ROOT';
        (g[key] || (g[key] = [])).push(b.contract);
    }
    return g;
}

// ===========================================================================
// CINEMATICA DIRECTA
// ===========================================================================

/**
 * Recorre la jerarquia aplicando la pose de deltas y devuelve la posicion y
 * rotacion MUNDIALES de cada hueso, en espacio de personaje.
 *
 * @param pose    Pose de deltas (Pose.js)
 * @param out     opcional, para no crear objetos por frame
 * @returns { p: {bone:[3]}, q: {bone:[4]} }
 */
export function fk(rig, pose, out) {
    const res = out || { p: Object.create(null), q: Object.create(null) };
    for (const b of rig.bones) {
        const dq = rotOf(pose, b.contract);
        const dp = posOf(pose, b.contract);
        // El repositorio YA viene escalado por buildRig, asi que el delta de
        // traslacion va en metros de espacio de personaje y no se reescala.
        const lt = (dp[0] || dp[1] || dp[2]) ? vadd(b.localT, dp) : b.localT;
        const lq = qnorm(qmul(b.localQ, dq));

        if (b.parentIndex < 0) {
            // El nodo raiz del archivo puede venir tumbado (Z arriba). El
            // rootFix lo pone en pie: sin esto la FK daria una pose que no
            // coincide con restWorld y el IK apuntaria al sitio equivocado.
            res.q[b.contract] = qnorm(qmul(rig.rootFix, lq));
            // El delta se suma DESPUES del rootFix a proposito. Los deltas de
            // Pose.js estan en espacio de personaje (Y arriba), y el rootFix
            // intercambia Y por Z: aplicarlo antes haria que "bajar la cadera"
            // empujara al cuerpo hacia delante en vez de hacia el suelo.
            res.p[b.contract] = vadd(qRotateVec(rig.rootFix, lt), dp);
        } else {
            const P = rig.bones[b.parentIndex];
            const pq = res.q[P.contract];
            res.q[b.contract] = qnorm(qmul(pq, lq));
            res.p[b.contract] = vadd(res.p[P.contract], qRotateVec(pq, lt));
        }
    }
    return res;
}

// ===========================================================================
// CINEMATICA INVERSA DE DOS HUESOS
// ===========================================================================

/**
 * Resuelve la articulacion de dos huesos para que el extremo llegue a `target`.
 *
 * EL PORQUE DEL CALCULO. Un brazo o una pierna son dos barras rigidas de largo
 * L1 y L2 unidas por una rodilla. El conjunto de puntos alcanzables es una
 * ESFERA de centro en la cadera, y dentro de ella la postura no es unica: hay
 * una circunferencia de soluciones, y por eso hace falta un `pole` (la rodillera
 * que marca hacia donde dobla). Con el triangulo del IK clasico:
 *
 *      d = |objetivo - cadera|          (recorrido)
 *      a = angulo en la cadera           = acos((L1^2 + d^2 - L2^2) / 2*L1*d)
 *      b = angulo en la rodilla          = acos((L1^2 + L2^2 - d^2) / 2*L1*L2)
 *      angulo de la rodilla             = PI - b
 *
 * y el hueso superior se coloca a `a` radianes del vector objetivo alrededor
 * del eje del plano de flexion (normal al `pole`).
 *
 * @param req = { upper, lower, target:[3], pole:[3], clampToReach:true }
 * @returns { [bone]: quaternion-delta }  para aplicar con Pose.setRot
 */
export function solveTwoBone(rig, pose, fkState, req) {
    const up = req.upper;
    const lo = req.lower;
    const ub = rig.index[up];
    const lb = rig.index[lo];
    if (ub === undefined || lb === undefined) return null;

    const P0 = fkState.p[up];
    const L1 = rig.bones[ub].length;
    const L2 = rig.bones[lb].length;
    if (!(L1 > 1e-5) || !(L2 > 1e-5)) return null;

    const toTarget = vsub(req.target, P0);
    let d = vlen(toTarget);
    const reachMax = (L1 + L2) * 0.9995;
    const reachMin = Math.abs(L1 - L2) + 1e-4;
    let clamped = false;
    if (d > reachMax) { d = reachMax; clamped = true; }
    else if (d < reachMin) { d = reachMin; clamped = true; }

    // Si el objetivo es inalcanzable se apunta recto hacia el, y el IK
    // "estira" la pierna en vez de dejar el pie en el aire.
    const u = d > 1e-6 ? vmul(toTarget, 1 / d) : [0, -1, 0];
    const dirTarget = vlen(toTarget) > 1e-6 ? vnorm(toTarget) : u;

    const pole = vnorm(req.pole || [0, 0, 1]);
    // Eje de flexion: perpendicular al objetivo y dentro del plano que marca el
    // pole. Si el pole es paralelo al objetivo, se cae al plano frontal.
    let axis = vcross(u, pole);
    if (vlen(axis) < 1e-4) axis = vcross(u, [0, 1, 0]);
    if (vlen(axis) < 1e-4) axis = vcross(u, [1, 0, 0]);
    axis = vnorm(axis);

    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a = Math.acos(cosA);

    // Eje del hueso en SU marco local. Es el mismo en reposo y en pose porque
    // la longitud del hueso no cambia: solo cambia hacia donde apunta.
    const axisLocal = qRotateVec(qinv(rig.restWorld[up].q), rig.bones[ub].dir);

    const swung = qRotateVec(qFromAxisAngle(axis, -a), u);
    const qUpperWorld = qFromTo(axisLocal, swung);

    // Posicion de la rodilla con la nueva rotacion del hueso superior.
    const midWorld = vadd(P0, vmul(qRotateVec(qUpperWorld, axisLocal), L1));

    // El hueso inferior solo tiene que apuntar de la rodilla al objetivo.
    const toEnd = vsub(req.target, midWorld);
    const dEnd = vlen(toEnd);
    const axisLocalLo = qRotateVec(qinv(rig.restWorld[lo].q), rig.bones[lb].dir);
    const qLowerWorld = dEnd > 1e-6
        ? qFromTo(axisLocalLo, vmul(toEnd, 1 / dEnd))
        : qFromTo(axisLocalLo, dirTarget);

    // De mundo a delta de pose.
    //
    // OJO: el delta se aplica ENCIMA de la rotacion local de reposo del hueso,
    // y esa local se apoya en el padre. Si el padre ya esta en pose (la cadera
    // bajada, el torso girado), la base no es `restWorld` sino la cadena YA
    // calculada en este frame. Usar el reposo aqui es el error clasico: el IK
    // acertaba en reposo y se descolocaba en cuanto la postura se movia.
    const parentUp = rig.bones[ub].parentIndex >= 0
        ? fkState.q[rig.bones[ub].parentContract] : qIdentity();
    const upperLocalBase = qmul(parentUp, rig.rest[up].q);
    const deltaUpper = qmul(qinv(upperLocalBase), qUpperWorld);

    const lowerLocal2World = qmul(qmul(qUpperWorld, rig.rest[lo].q), qIdentity());
    const deltaLower = qmul(qinv(lowerLocal2World), qLowerWorld);

    setRot(pose, up, deltaUpper);
    setRot(pose, lo, deltaLower);
    return {
        [up]: deltaUpper,
        [lo]: deltaLower,
        // Rotaciones en mundo ya resueltas. placeFoot las necesita para
        // compensar despues la orientacion del pie: el hueso del pie es hijo de
        // la tibia, asi que si no se corrige arrastra el giro de la rodilla y la
        // punta se va del punto pedido.
        worldRot: { upper: qUpperWorld, lower: qLowerWorld },
        reachable: !clamped,
        kneeAngle: Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1))
    };
}

// ===========================================================================
// APOYO PARA LOS PIES
// ===========================================================================

/**
 * Coloca el PUNTO DE APOYO de un pie (la punta, no el tobillo) en el suelo
 * doblando la pierna, y deja el resto del cuerpo intacto.
 *
 * POR QUE NO SE PASA EL TOBILLO DIRECTAMENTE: la cadena del IK de la pierna es
 * muslo -> tibia -> TOBILLO. El objetivo del triangulo es el final de la cadena,
 * o sea el tobillo. Pero lo que toca el suelo es la punta del pie, y va 8 cm por
 * delante y 4 cm por debajo. Si se pide "pon el tobillo en (0.16, 0, 0.34)" el
 * resultado es un pie enterrado 4 cm en el suelo. Asi que se recibe el punto de
 * contacto y se retrocede el offset de reposo del pie para obtener el tobillo.
 *
 * @param side      'L' | 'R'
 * @param contact   [x, y, z] donde debe quedar la punta del pie
 * @param opts.pole direccion hacia la que drena la rodilla (adelante por defecto)
 * @param opts.footPitch  giro del pie alrededor de X (rad). >0 = puntera arriba
 * @param opts.heelLift   altura extra del talon, para erguir la puntera
 */
export function placeFoot(rig, pose, fkState, side, contact, opts = {}) {
    const leg = side === 'R' ? 'THIGH_R' : 'THIGH_L';
    const shin = side === 'R' ? 'SHIN_R' : 'SHIN_L';
    const foot = side === 'R' ? 'FOOT_R' : 'FOOT_L';
    const toe = side === 'R' ? 'TOE_R' : 'TOE_L';

    // Orientacion deseada del pie: la de reposo (planta plana en el suelo) mas
    // el arrastre opcional. `opts.footRotation` permite dar una orientacion
    // absoluta en vez de un giro relativo.
    const footRestQ = rig.restWorld[foot] ? rig.restWorld[foot].q : qIdentity();
    const footWorld = opts.footRotation
        || qmul(footRestQ, qFromAxisAngle([1, 0, 0], opts.footPitch || 0));

    // Vector tobillo -> punta, en el marco local del pie y con la orientacion
    // deseada. Es lo que hay que retroceder desde el punto de contacto.
    const offsetLocal = rig.footOffsetLocal && rig.footOffsetLocal[foot];
    const anchor = offsetLocal ? qRotateVec(footWorld, offsetLocal) : toeOffset(rig, foot, toe);
    const offset = vadd(vmul(anchor, -1), [0, opts.heelLift || 0, 0]);
    const target = vadd(contact, offset);
    const pole = opts.pole || [0, 0, 1];

    // Estado de trabajo PROPIO. Recalcular la FK no puede escribirse encima del
    // `fkState` que paso el llamante: si lo hiciera, volveria con una pose a
    // medio aplicar y el siguiente pie partira de una postura que no es la que
    // creia.
    let state = fkState;
    let owned = false;
    const own = () => {
        if (!owned) {
            state = {
                p: Object.assign(Object.create(null), fkState.p),
                q: Object.assign(Object.create(null), fkState.q)
            };
            owned = true;
        }
        return state;
    };
    const rebuild = () => { state = fk(rig, pose, own()); return state; };

    let solved = solveTwoBone(rig, pose, state, { upper: leg, lower: shin, target, pole });
    // El hueso del pie es hijo de la tibia y arrastra su giro. Hay que
    // devolverle la orientacion pedida o la punta no cae donde se le ha dicho.
    if (solved) applyFootRotation(rig, pose, solved, foot, footWorld);

    // -----------------------------------------------------------------------
    // 1. COMPENSACION DE CADERA (altura)
    // -----------------------------------------------------------------------
    //
    // Si la cadera esta alta y el pie tiene que llegar lejos, la pierna se queda
    // corta: no es un fallo del IK, es que la postura es imposible. Con la
    // cadera a 0,76 m y una pierna de 0,67 m, el pie llega como mucho 15 cm por
    // delante; para un paso de 35 cm hay que flexionar las rodillas, y flexionar
    // las rodillas BAJA la cadera. Por eso un peleador que adelanta el pie antes
    // de tiempo se ve "sentarse" un poco: es exactamente eso.
    //
    // En vez de dejar el pie en el aire, se baja la cadera lo justo y se repite
    // el IK. El factor 0,9 evita oscilar entre dos alturas y tres o cuatro
    // pasadas bastan.
    if (opts.autoDrop !== false) {
        const pelvis = opts.pelvis || 'PELVIS';
        const maxIter = opts.autoDropPasses || 4;
        for (let i = 0; i < maxIter && solved && !solved.reachable; i++) {
            const L1 = rig.bones[rig.index[leg]].length;
            const L2 = rig.bones[rig.index[shin]].length;
            const P0 = state.p[leg];
            const d = Math.hypot(target[0] - P0[0], target[1] - P0[1], target[2] - P0[2]);
            const deficit = d - (L1 + L2) * 0.999;
            if (deficit <= 1e-4) break;
            const cur = posOf(pose, pelvis);
            setPos(pose, pelvis, [cur[0], cur[1] - deficit * 0.9, cur[2]]);
            rebuild();
            solved = solveTwoBone(rig, pose, state, { upper: leg, lower: shin, target, pole });
            if (solved) applyFootRotation(rig, pose, solved, foot, footWorld);
        }
    }

    // -----------------------------------------------------------------------
    // 2. CIERRE EXACTO CON DESPLAZAMIENTO DE CADERA (lado)
    // -----------------------------------------------------------------------
    //
    // Un hueso con dos rotaciones tiene solo DOS grados de libertad: la punta
    // del pie recorre un CIRCULO alrededor de la cadera, no una esfera. Ponerla
    // en un punto cualquiera del suelo es, en general, imposible solo con
    // rotaciones, y ahi es donde se perdian los 4-10 cm del pie trasero.
    //
    // Lo que hace el IK de cualquier juego de verdad es dar dos pasos: resolver
    // lo que se puede con las rotaciones y MOVER LA ARTICULACION lo justo para
    // tapar lo que faltaba. Ese segundo movimiento es el "hip offset".
    //
    // POR QUE NO SE VE MAL. El desplazamiento va en la articulacion de la
    // cadera de ESE pie, no en la pelvis: la pelvis se queda quieta, el muslo se
    // estira un centimetro y el otro pie no se entera. En una estocada larga un
    // character's pelvis SI se mueve, pero ahi la baja la altura, no un lado.
    const hipPasses = opts.hipPasses === undefined ? 3 : opts.hipPasses;
    const legBone = rig.bones[rig.index[leg]];
    let lastErr = Infinity;
    for (let i = 0; i < hipPasses; i++) {
        rebuild();
        const ankle = state.p[foot];
        const e = vsub(target, ankle);
        const err = vlen(e);
        if (err < 1e-5) break;
        // Sin esto el bucle se quedaria moviendo la cadera sin parar cuando el
        // punto es fisicamente inalcanzable (una pierna estirandose al maximo).
        if (err > lastErr - 1e-6 && i > 0) break;
        lastErr = err;

        // El delta de traslacion de un hueso va en el marco del PADRE, y el
        // error se ha medido en mundo: hay que girarlo o el pie se corrige en
        // la direccion equivocada.
        const parentQ = legBone.parentIndex >= 0
            ? state.q[legBone.parentContract]
            : rig.rootFix;
        const d = qRotateVec(qinv(parentQ), vmul(e, -1));
        const cur = posOf(pose, leg);
        setPos(pose, leg, [cur[0] + d[0], cur[1] + d[1], cur[2] + d[2]]);

        rebuild();
        solved = solveTwoBone(rig, pose, state, { upper: leg, lower: shin, target, pole });
        if (!solved) break;
        applyFootRotation(rig, pose, solved, foot, footWorld);
    }
    rebuild();

    // OJO: `solved` es el resultado del IK, no el estado de la FK. Si se
    // mezclaran, `reachable` y `kneeAngle` desaparecerian sin avisar.
    solved.target = target;
    solved.contact = contact;
    solved.foot = foot;
    solved.toe = toe;
    solved.footWorld = footWorld;
    solved.hipOffset = posOf(pose, leg);
    solved.footError = vlen(vsub(target, state.p[foot]));
    return solved;
}

/**
 * Devuelve al hueso del pie la orientacion que se le pidio.
 *
 * El hueso del pie es hijo de la tibia y hereda su giro entero. Sin esto, clavar
 * la punta en un sitio es incompatible con tener el pie plano: gana uno de los
 * dos y el otro sale 5 cm desviado.
 */
function applyFootRotation(rig, pose, solved, foot, footWorld) {
    if (!solved || !solved.worldRot) return;
    const footLocalWanted = qmul(qinv(solved.worldRot.lower), footWorld);
    setRot(pose, foot, qmul(qinv(rig.rest[foot].q), footLocalWanted));
}

/**
 * Desplazamiento, en espacio de personaje y en la pose de reposo, entre el
 * hueso del pie y su punta. Es la "planta" del pie: lo que hay que retroceder
 * para clavar la puntera en un punto concreto del suelo.
 */
export function toeOffset(rig, foot, toe) {
    if (!rig.toeOffsetCache) rig.toeOffsetCache = Object.create(null);
    const key = `${foot}|${toe}`;
    if (rig.toeOffsetCache[key]) return rig.toeOffsetCache[key];
    const a = rig.restWorld[foot] ? rig.restWorld[foot].p : [0, 0, 0];
    const b = rig.restWorld[toe] ? rig.restWorld[toe].p : a;
    const d = vsub(b, a);
    rig.toeOffsetCache[key] = d;
    return d;
}

/**
 * Ajusta la altura de la cadera para que el pie más bajo apoye en el suelo.
 *
 * POR QUE HAY QUE HACERLO: doblar las rodillas sube la cadera. Si la postura
 * baja las piernas y la pelvis se queda donde estaba, el personaje atraviesa el
 * suelo. La cinematica directa no resuelve eso sola, porque el pie se define
 * DESPUES de la cadera. Se calcula el deficit y se corrige la pelvis.
 */
export function dropPelvisToFeet(rig, pose, fkState, footBones, opts = {}) {
    let lowest = Infinity;
    for (const b of footBones) {
        const idx = rig.index[b];
        if (idx === undefined) continue;
        const end = rig.bones[idx].child;
        const p = end ? fkState.p[end] : fkState.p[b];
        if (p[1] < lowest) lowest = p[1];
    }
    if (!isFinite(lowest)) return 0;
    const want = opts.groundY !== undefined ? opts.groundY : rig.groundY;
    const delta = want - lowest;
    if (Math.abs(delta) < 1e-6) return 0;
    const pelvis = opts.pelvis || 'PELVIS';
    const cur = posOf(pose, pelvis);
    setPos(pose, pelvis, [cur[0], cur[1] + delta, cur[2]]);
    return delta;
}

export function footHeight(rig, fkState, bone) {
    const idx = rig.index[bone];
    if (idx === undefined) return null;
    const end = rig.bones[idx].child;
    return (end ? fkState.p[end] : fkState.p[bone])[1];
}

export function footPosition(rig, fkState, bone) {
    const idx = rig.index[bone];
    if (idx === undefined) return null;
    const end = rig.bones[idx].child;
    return (end ? fkState.p[end] : fkState.p[bone]).slice();
}

export default { buildRig, fk, solveTwoBone, placeFoot, dropPelvisToFeet, footHeight, footPosition };
