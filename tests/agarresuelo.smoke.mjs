/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/agarresuelo.smoke.mjs
 * ----------------------------------------------------------------------------
 * Los agarres tumbados y el silencio de las posturas que no existen.
 * ============================================================================
 *
 * QUE COMPRUEBA
 * ----------------------------------------------------------------------------
 *   1. UN AGARRE DE SUELO NO ES UNO DE PIE. Los diez estados de agarre en el
 *      suelo se caian a STAND: el de abajo se levantaba y andaba por el ring
 *      con el otro tumbado al lado. Es el peor fallo visual del motor. Aqui se
 *      mide que el cuerpo TUMBA: la pelvis acaba cerca del suelo y la cabeza
 *      NO encima de la pelvis.
 *
 *   2. LOS DOS PAPELES SON DISTINTOS. El de arriba va boca abajo y el de abajo
 *      boca arriba. Si los dos dieran la misma pose, el agarre seria un bulto
 *      y no se entenderia quien esta encima de quien.
 *
 *   3. UNA POSTURA QUE NO EXISTE SE DICE. Antes la caida a STAND era muda: ni
 *      error, ni aviso. Se comprueba que avisa, y que avisa UNA VEZ por nombre
 *      (si no, un estado con la postura equivocada llena la consola de sesenta
 *      lineas por segundo).
 *
 *   4. UN AGARRE DE PIE SIGUE SIENDO UN AGARRE DE PIE. La rama nueva no puede
 *      arrastrar a los otros treinta: `GRAPPLE_UKE` de pie tiene que quedarse
 *      de pie.
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
const FighterRig = await load('src/core/entities/FighterRig.js');

const { SUELO_DE_AGARRE, posturaDeSueloDeAgarre, esAgarreDeSuelo, posturePose, posturasDesconocidas } = FighterRig;
const BONES = Cine.BONES || Cine.DEFAULT_BONES;

// --- un rig del contrato, como el de las demas suites ---------------------
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

// ---------------------------------------------------------------------------
section('1. QUE ESTA DECLARADO Y QUE NO');
// ---------------------------------------------------------------------------
const deSuelo = ['BOTTOM', 'BOTTOM_HIT', 'BOTTOM_ESCAPE', 'BOTTOM_UKEMI',
    'TOP', 'TOP_CROUCH', 'TOP_STRIKE', 'TOP_ESCAPE', 'TOP_UKEMI'];
const declarados = Object.keys(SUELO_DE_AGARRE);

check('los diez agarres de suelo estan declarados',
    deSuelo.every(n => declarados.includes(n)), deSuelo.filter(n => !declarados.includes(n)));
check('no se declara ninguno de mas', declarados.length === deSuelo.length, declarados);
check('un agarre de PIE no se declara como de suelo',
    !esAgarreDeSuelo('GRAPPLE_UKE') && !esAgarreDeSuelo('GRAPPLE_TORI') && !esAgarreDeSuelo('TOP_STRIKE_PLATO'));
check('sin `limbs` no hay agarre de suelo', posturaDeSueloDeAgarre(null) === null);

// ---------------------------------------------------------------------------
section('2. UN AGARRE DE SUELO TUMBA, NO SE LEVANTA');
// ---------------------------------------------------------------------------

/**
 * Cuanto ha bajado el cuerpo y donde ha quedado la cabeza respecto a la
 * pelvis, todo en el marco ARRIBA DEL RIG (que puede estar tumbado: ver
 * tests/glbclip.smoke.mjs, por eso se saca del propio rig y no de la Y).
 */
function medida(pose) {
    const st = Rig.fk(rig, pose);
    const pelvis = st.p.PELVIS, cabeza = st.p.HEAD, pie = st.p.FOOT_L;
    if (!pelvis || !cabeza || !pie) return null;
    const arriba = (() => {
        const h = rig.restWorld.HEAD.p, p = rig.restWorld.FOOT_L.p;
        const d = [h[0] - p[0], h[1] - p[1], h[2] - p[2]];
        const n = Math.hypot(d[0], d[1], d[2]) || 1;
        return [d[0] / n, d[1] / n, d[2] / n];
    })();
    // OJO: el origen es un ARRAY [x, y, z], no {x:..,y:..,z:..}. Con el objeto
    // salen tres `undefined`, el producto sale NaN, y como `NaN > 0.55` es
    // FALSO la comprobacion da "ok" sin haber comprobado nada. Es el peor tipo
    // de fallo de una prueba: verde y mintiendo.
    const ORIGEN = [0, 0, 0];
    const alto = (a, b) => (a[0] - b[0]) * arriba[0] + (a[1] - b[1]) * arriba[1] + (a[2] - b[2]) * arriba[2];
    return {
        alturaCadera: alto(pelvis, ORIGEN),
        cabezaSobreCadera: alto(cabeza, pelvis),
        pieSobreCadera: alto(pie, pelvis)
    };
}

// el `down` que pasaria la FSM para ese agarre
const deSueloMal = [];
const alturas = {};
for (const n of declarados) {
    const d = SUELO_DE_AGARRE[n];
    const r = FighterRig.downPose(rig, d);
    const m = medida(r.pose);
    alturas[n] = m ? +m.alturaCadera.toFixed(2) : null;
    // `isFinite` NO es opcional aqui: sin el, un NaN pasa el `>` porque
    // `NaN > 0.55` es false, y la comprobacion queda verde sin comprobar nada.
    if (!m || !isFinite(m.alturaCadera)) {
        deSueloMal.push(n + ': la medida salio ' + (m ? m.alturaCadera : 'null'));
        continue;
    }
    // tumbado: la cadera esta cerca del suelo (menos de medio cuerpo)
    if (m.alturaCadera > 0.55) {
        deSueloMal.push(n + ': la cadera queda a ' + m.alturaCadera.toFixed(2) + ' m');
        continue;
    }
    // y la cabeza NO esta encima de la pelvis: eso seria estar de pie
    if (m.cabezaSobreCadera > 0.25) {
        deSueloMal.push(n + ': la cabeza queda ' + m.cabezaSobreCadera.toFixed(2) + ' m sobre la pelvis (de pie)');
    }
}
check('los ' + declarados.length + ' agarres de suelo dejan el cuerpo tumbado',
    deSueloMal.length === 0, deSueloMal);
console.log('       (caderas: ' + Object.keys(alturas).map(k => k + ' ' + alturas[k]).join(', ') + ')');

// ---------------------------------------------------------------------------
section('3. ARRIBA Y ABAJO SON DISTINTOS');
// ---------------------------------------------------------------------------
const arribaPose = FighterRig.downPose(rig, SUELO_DE_AGARRE.TOP);
const abajoPose = FighterRig.downPose(rig, SUELO_DE_AGARRE.BOTTOM);

// el pecho: boca abajo lo lleva hacia un lado y boca arriba hacia el otro
function inclinacionPecho(pose) {
    return pose.rot.CHEST ? pose.rot.CHEST[2] : 0;
}
const iArriba = inclinacionPecho(arribaPose.pose);
const iAbajo = inclinacionPecho(abajoPose.pose);
check('el de arriba y el de abajo se inclinan al lado opuesto',
    Math.abs(iArriba - iAbajo) > 0.2,
    { arriba: +iArriba.toFixed(3), abajo: +iAbajo.toFixed(3) });
check('el de ARRIBA va boca abajo (pecho inclinado hacia un lado)',
    Math.sign(iArriba) !== 0 && iArriba !== iAbajo, +iArriba.toFixed(3));

// ---------------------------------------------------------------------------
section('4. LA POSTURA QUE NO EXISTE SE DICE, Y SE DICE UNA VEZ');
// ---------------------------------------------------------------------------
const avisos = [];
const originalWarn = console.warn;
console.warn = (...a) => { avisos.push(a.join(' ')); };

// fuerza la lectura: se generan las posturas desconocidas
const fantasmas = posturePose(rig, { limbs: 'POSTURA_FANTASMA_A', hipY: 0.95 });
const fantasmas2 = posturePose(rig, { limbs: 'POSTURA_FANTASMA_A', hipY: 0.95 });
const legitima = posturePose(rig, { limbs: 'CROUCH', hipY: 0.75 });

console.warn = originalWarn;

const delFantasma = avisos.filter(a => a.indexOf('POSTURA_FANTASMA_A') !== -1);
check('una postura inexistente avisa', delFantasma.length > 0, avisos);
check('avisa UNA VEZ por nombre, no una por frame', delFantasma.length === 1, delFantasma.length);
check('el aviso dice cual es y donde se arregla',
    delFantasma[0] && /POSTURA_FANTASMA_A/.test(delFantasma[0]) && /LIMB_SPECS/.test(delFantasma[0]),
    delFantasma[0]);
check('el aviso no se dispara por una postura que SI existe', avisos.length === 1, avisos.length);
check('la postura que no existe cae a STAND de todos modos',
    !!fantasmas.pose, null);

// y la lista de lo pendiente es consultable, que es lo que la usa el HUD
check('las posturas desconocidas quedan registradas', posturasDesconocidas().length > 0,
    posturasDesconocidas());

// ---------------------------------------------------------------------------
section('5. LO DE PIE SIGUE DE PIE');
// ---------------------------------------------------------------------------
const dePie = {};
for (const nombre of ['GRAPPLE_UKE', 'GRAPPLE_TORI', 'STAND', 'BRACE', 'CRATCH']) {
    const r = posturePose(rig, { limbs: nombre, hipY: 0.95 });
    const m = medida(r.pose);
    dePie[nombre] = m ? m.alturaCadera : null;
}
check('los agarres DE PIE no se tumban (cadera por encima de 0,7 m)',
    Object.values(dePie).every(v => typeof v === 'number' && isFinite(v) && v > 0.7),
    dePie);

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);