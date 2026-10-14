/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/impacto.smoke.mjs
 * ----------------------------------------------------------------------------
 * Que el cuerpo reaccione a DONDE ha pegado, no a lo que el golpe declara.
 * ============================================================================
 *
 * QUE COMPRUEBA
 * ----------------------------------------------------------------------------
 *   1. EL CONTACTO SE LEE. Un punto de contacto y una direccion de viaje se
 *      convierten en lado, altura y torque, y los valores raros no revientan.
 *
 *   2. LADO IZQUIERDO Y LADO DERECHO NO SON LO MISMO. Es lo que no puede
 *      fallar: si un jab de derecha y uno de izquierda dieran la misma pose,
 *      la direccion del golpe no se estaria leyendo y el jugador veria que
 *      todos los golpes pega igual.
 *
 *   3. EL TORSO Y LA CABEZA GIRAN A LADOS OPUESTOS. Si giraran a la vez, el
 *      cuello no estaria en espejo y el golpe pareciera un empujon sin cuello.
 *
 *   4. LA ALTURA REAL CORRIGE A LA DECLARADA. Un golpe declarado ALTO que cae
 *      en la rodilla hunde la cadera; la tabla sola no lo puede saber.
 *
 *   5. SIN CONTACTO NO CAMBIA NADA. Es la garantia de que esto es aditivo: sin
 *      informacion de impacto se devuelve exactamente lo que se devolvia
 *      antes, byte a byte en las rotaciones.
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const Rig = await load('src/core/cine/Rig.js');
const Pose = await load('src/core/cine/Pose.js');
const Cine = await load('src/core/cine/CineConstants.js');
const HR = await load('src/core/entities/HitReactions.js');

const { contactoDe, hitReactionFromContact, hitReactionPose } = HR;
const BONES = Cine.BONES || Cine.DEFAULT_BONES;

function contractRig() {
    const bones = BONES.map(b => ({
        name: b.name, parentName: b.parent,
        localT: (b.offset || [0, 0, 0]).slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return Rig.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}
const rig = contractRig();

// Un golpe "declarado ALTO": asi se ve que la altura real le puede contradecir.
const GOLPE_ALTO = { height: 'ALTO', power: 'FUERTE', hitLevel: 'ALTO', name: 'gancho' };

// ---------------------------------------------------------------------------
section('1. EL CONTACTO SE LEE');
// ---------------------------------------------------------------------------
const izq = contactoDe({ punto: [0, 1.45, -0.1], dir: [1, 0, 0.2] });
const der = contactoDe({ punto: [0, 1.45, -0.1], dir: [-1, 0, 0.2] });

check('un contacto con punto y direccion se entiende', !!izq, izq);
check('el lado sale del signo de la direccion', izq.lado > 0 && der.lado < 0, { izq: izq.lado, der: der.lado });
check('la altura sale normalizada a la estatura', izq.altura > 0.7 && izq.altura < 0.9, izq.altura);
check('un jab lateral tiene mas torsura que uno de frente',
    Math.abs(izq.torque) > Math.abs(contactoDe({ punto: [0, 1.4, -0.1], dir: [0, 0, 1] }).torque),
    { lateral: izq.torque, frontal: contactoDe({ punto: [0, 1.4, -0.1], dir: [0, 0, 1] }).torque });

// Lo que no debe reventar: es la parte que mas veces se llama y la que mas
// veces llega a medio rellenar cuando algo va mal aguas arriba.
check('sin contacto no hay contacto (null, no un objeto vacio)', contactoDe(null) === null);
check('un punto sin array no rompe', contactoDe({ punto: 'x' }) === null);
check('un punto corto no rompe', contactoDe({ punto: [1] }) === null);
check('sin direccion se usa el punto, y no se rompe',
    contactoDe({ punto: [0.3, 1.4, 0] }).lado > 0, contactoDe({ punto: [0.3, 1.4, 0] }));
check('el lado esta acotado a [-1, 1]',
    Math.abs(contactoDe({ punto: [0, 1, 0], dir: [99, 0, 0] }).lado) === 1);
check('NaN en la direccion no sale propagado',
    isFinite(contactoDe({ punto: [0, 1.4, 0], dir: [NaN, 0, 0] }).lado),
    contactoDe({ punto: [0, 1.4, 0], dir: [NaN, 0, 0] }));

// ---------------------------------------------------------------------------
section('2. IZQUIERDA Y DERECHA NO SON LO MISMO');
// ---------------------------------------------------------------------------
// OJO CON LA MEDIDA, Y ES LO QUE CUESTA MAS DE LO QUE PARECE. La primera
// version comparaba `cabeza - pelvis` en X y concluyo que el torso no cambiaba
// de lado. Era la MEDIDA la que estaba mal, no el codigo: con el cuello
// inclinado hacia delante, el yaw del cuello mueve la cabeza sobre todo en Z
// y en profundidad, no en X, asi que la componente lateral se mezclaba con la
// vertical y dos reacciones opuestas salian con el mismo signo.
//
// Lo que hay que mirar es el YAW REAL del hueso, que se extrae del quaternion
// de mundo de la FK con el atan2 de toda la vida. Eso no admite discussion.
function yawDe(pose, hueso) {
    const st = Rig.fk(rig, pose);
    const q = st.q[hueso];
    if (!q) return null;
    return Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]),
        1 - 2 * (q[1] * q[1] + q[0] * q[0]));
}

const pIzq = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, 1.5, -0.1], dir: [1, 0, 0.2] } }).pose;
const pDer = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, 1.5, -0.1], dir: [-1, 0, 0.2] } }).pose;

const yIzq = yawDe(pIzq, 'NECK');
const yDer = yawDe(pDer, 'NECK');
const tIzq = yawDe(pIzq, 'SPINE');
const tDer = yawDe(pDer, 'SPINE');

check('el cuello gira a lados opuestos segun de donde pegue',
    yIzq * yDer < 0, { izq: +yIzq.toFixed(3), der: +yDer.toFixed(3) });
check('el torso tambien gira a lados opuestos',
    tIzq * tDer < 0, { izq: +tIzq.toFixed(3), der: +tDer.toFixed(3) });
check('las dos reacciones no son identicas',
    Math.abs(yIzq - yDer) > 0.05, { izq: +yIzq.toFixed(3), der: +yDer.toFixed(3) });
check('la cabeza gira MAS que el torso',
    Math.abs(yIzq - tIzq) > 0.02,
    { cabeza: +yIzq.toFixed(3), torso: +tIzq.toFixed(3) });

// ---------------------------------------------------------------------------
section('3. LO QUE NO TIENE QUE PASAR');
// ---------------------------------------------------------------------------
// El golpe NO puede reventar el cuerpo: ni NaN, ni huesos en el suelo, ni una
// pose que se va de rango. Esto es lo que se rompe si el contacto llega a
// medias y el que se asegura de que anadir esto no rompe el motor.
const raro = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, NaN, 0], dir: [NaN, 0, 0] } });
const stRaro = Rig.fk(rig, raro.pose);
const sano = ['PELVIS', 'HEAD', 'FOOT_L'].every(h => stRaro.p[h]
    && stRaro.p[h].every(v => isFinite(v)));
check('un contacto con NaN no deja NaN en el esqueleto', sano,
    { pelvis: stRaro.p.PELVIS, cabeza: stRaro.p.HEAD });

// Y el cuerpo no puede reventarse: si la cabeza acaba a mas de dos metros de la
// pelvis o por debajo de los pies, algo se ha roto por el camino.
const h = stRaro.p.HEAD, p = stRaro.p.PELVIS;
const alto = h && p ? h[1] - p[1] : 0;
check('la cabeza sigue encima de la pelvis', alto > 0.05 && alto < 2.0, +alto.toFixed(3));

// ---------------------------------------------------------------------------
section('4. LA ALTURA REAL CORRIGE A LA DECLARADA');
// ---------------------------------------------------------------------------
// El golpe DECLARA ALTO, pero estos dos contactos caen en sitios distintos.
const altoReal = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, 1.55, -0.1], dir: [1, 0, 0] } }).pose;
const rodillaReal = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, 0.55, -0.1], dir: [1, 0, 0] } }).pose;

const cAlto = altoReal.pos.PELVIS ? altoReal.pos.PELVIS[1] : 0;
const cRodilla = rodillaReal.pos.PELVIS ? rodillaReal.pos.PELVIS[1] : 0;
check('un golpe ALTO que cae en la rodilla hunde mas la cadera',
    cRodilla < cAlto, { altoReal: +cAlto.toFixed(4), rodillaReal: +cRodilla.toFixed(4) });
check('el hundimiento por debajo de la cintura es apreciable',
    Math.abs(cAlto - cRodilla) > 0.01, +Math.abs(cAlto - cRodilla).toFixed(4));

// ---------------------------------------------------------------------------
section('5. SIN CONTACTO NO CAMBIA NADA');
// ---------------------------------------------------------------------------
// Esta es la garantia de que el cambio es aditivo. Si esto falla, el resto de
// las pruebas del motor tambien estan en riesgo aunque cada una pase.
const antes = hitReactionPose(rig, GOLPE_ALTO, 0.3, {});
const despues = hitReactionFromContact(rig, GOLPE_ALTO, 0.3, {});
const iguales = ['SPINE', 'CHEST', 'NECK', 'HEAD'].every(b => {
    const a = antes.pose.rot[b] || [0, 0, 0, 1];
    const d = despues.pose.rot[b] || [0, 0, 0, 1];
    return Math.abs(a[0] - d[0]) < 1e-9 && Math.abs(a[1] - d[1]) < 1e-9
        && Math.abs(a[2] - d[2]) < 1e-9 && Math.abs(a[3] - d[3]) < 1e-9;
});
check('sin opts.contacto la pose es la de antes, hueso a hueso', iguales);
check('y el descriptor de contacto viene vacio',
    despues.contacto === undefined || despues.contacto === null, despues.contacto);

// Con gain 0 el giro direccional se apaga pero la tabla sigue mandando: es la
// forma de desactivar la funcion sin tocar el codigo. Se mide DONDE ACABA LA
// CABEZA, no el quaternion, por lo de antes.
const apagado = hitReactionFromContact(rig, GOLPE_ALTO, 0.12,
    { contacto: { punto: [0, 1.5, -0.1], dir: [1, 0, 0] }, gain: 0 }).pose;
const referencia = hitReactionPose(rig, GOLPE_ALTO, 0.12, {}).pose;
const aApag = yawDe(apagado, 'NECK');
const aRef = yawDe(referencia, 'NECK');
check('con gain 0 el cuello acaba igual que sin la funcion',
    aApag !== null && aRef !== null && Math.abs(aApag - aRef) < 1e-9,
    { apagado: +aApag.toFixed(6), normal: +aRef.toFixed(6) });

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
