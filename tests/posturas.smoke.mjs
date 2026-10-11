/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/posturas.smoke.mjs
 * ----------------------------------------------------------------------------
 * AUDITORIA DE POSTURAS: lo que los estados DECLARAN y lo que el maniqui
 * ENSEÑA de verdad.
 *
 * EL PROBLEMA QUE ESTE ARCHIVO HACE VISIBLE
 * ----------------------------------------------------------------------------
 *   `posturePose` resuelve el nombre de la postura asi:
 *
 *       const limbs = LIMB_SPECS[p.limbs] ? p.limbs : 'STAND';
 *
 *   Es decir: **una postura que no exista en la tabla se convierte en STAND y
 *   no dice nada**. Ni error, ni aviso, ni un unico fallo en la consola.
 *
 *   Los estados declaran 31 nombres de postura. De esos, solo 7 tienen tabla
 *   propia. Los otros 23 salen como un peleador de pie: los dos del suelo
 *   (PRONE, SUPINE), el de_caido en el aire (JUGGLE) y las dieciocho del
 *   agarre, que son todos los estados de suelo del agarre.
 *
 *   Asi que la sensacion de "todo esta declarado pero no hay nada" no es una
 *   sensacion: es un numero, y este archivo lo lleva.
 *
 * QUE HACE ESTE TEST Y POR QUE ESTA EN VERDE SI HAY TANTA DEUDA
 * ----------------------------------------------------------------------------
 *   Fija la deuda con una lista, y AVISA si crece. Hoy se declara en una
 *   constante (`SIN_POSTURA`) a proposito: si alguien anade un estado con una
 *   postura nueva y no la implementa, este test falla en el acto, con el
 *   nombre. Un archivo que falla a proposito no sirve de nada: lo que vale es
 *   que la deudaKNOWN no pueda pasar desapercibida.
 *
 *   node tests/posturas.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

const FR = await load('src/core/entities/FighterRig.js');
const RigMod = await load('src/core/cine/Rig.js');
const { BONES } = await load('src/core/cine/CineConstants.js');
const states = await load('src/core/fsm/states/index.js');
await load('src/core/fsm/states/Movesets.js');

function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}
const rig = contractRig();

/**
 * La postura que sale por el camino REAL del motor, no una llamada aparte:
 * `posturePose` es lo que usa el combate para pintar el estado.
 *
 * @returns {string} firma de la pose (para compararEquality)
 */
function firmaDe(limbs) {
    const res = FR.posturePose(rig, { limbs, hipY: 0.86, spinePitch: 0.1 }, {});
    return JSON.stringify(res.state.p);
}

/** Todas las posturas que declara el catalogo, con los estados que las usan. */
function declaradas() {
    const mapa = new Map();
    for (const s of states.default) {
        const l = s.posture && s.posture.limbs;
        if (!l) continue;
        if (!mapa.has(l)) mapa.set(l, []);
        mapa.get(l).push(s.name || String(s.id));
    }
    return mapa;
}

// ===========================================================================
section('1 · Cuantas posturas hay declaradas y cuantas se ven');
// ===========================================================================

const DECLARADAS = declaradas();
const STAND = firmaDe('STAND');

/** Las que NO tienen animacion propia: salen como un peleador de pie. */
const SIN_POSTURA = [
    'JUGGLE', 'PRONE', 'SUPINE',
    'GRAPPLE_UKE', 'GRAPPLE_TORI', 'HITSTUN_GRAPPLE', 'ATEMI_TORI', 'UKEMI',
    'THROWN', 'THROW_TORI', 'SUBMITTED', 'SUBMIT_TORI', 'ESCAPING',
    'PRESSED', 'PRESS_TORI', 'BOTTOM', 'TOP', 'TOP_CROUCH', 'BOTTOM_HIT',
    'TOP_STRIKE', 'BOTTOM_ESCAPE', 'TOP_ESCAPE', 'SUELO_UKEMI'
];

/** Las que SI tienen tabla en `LIMB_SPECS` y se ven distintas de estar de pie. */
const CON_ANIMACION = ['STAND', 'BRACE', 'CROUCH', 'QUAD', 'KNEEL',
    'STAGGER', 'ROLL', 'FLOAT'];

run('la comparacion de poses es fiable (si no, el test no mide nada)', () => {
    ok(firmaDe('STAND') === firmaDe('STAND'), 'la misma postura da la misma pose');
    ok(firmaDe('CROUCH') !== STAND, 'y una postura de verdad se distingue de STAND');
});

run('ninguna postura nueva cae en STAND sin que nos ENTEREMOS', () => {
    // Esta es la alarma. Si alguien anade `limbs: 'NUEVA'` a un estado y no la
    // implementa, sale aqui con su nombre en vez de verse como un peleador de
    // pie en medio de una partida.
    for (const l of ['JUGGLE', 'PRONE', 'SUPINE', 'BOTTOM', 'TOP',
    'UKEMI', 'GRAPPLE_UKE', 'GRAPPLE_TORI', 'RODANDO_NUEVO']) {
        ok(firmaDe(l) === STAND,
            `${l} cae en STAND como se esperaba (y por eso hay que implementarla)`,
            'ha cambiado: revisa la lista SIN_POSTURA');
    }
});

run('la lista de las sin animar esta al dia con el catalogo', () => {
    // Si el catalogo declara una postura que no aparece ni en la lista de
    // animate ni en la deanimate, es deuda nueva: hay que decidir si se
    // implementa o si se anota aqui. Este es el aviso.
    const CON_ANIMACION = ['STAND', 'BRACE', 'CROUCH', 'QUAD', 'KNEEL',
        'STAGGER', 'ROLL', 'FLOAT'];
    const declaradasSinCubrir = [...DECLARADAS.keys()].filter(
        (l) => SIN_POSTURA.indexOf(l) === -1 && CON_ANIMACION.indexOf(l) === -1);
    ok(declaradasSinCubrir.length === 0,
        'toda postura declarada esta en una de las dos listas',
        declaradasSinCubrir.join(', '));
});

run('las siete que SI tienen animacion, la tienen de verdad', () => {
    // Estas son las que de verdad cambian la figura. Si una empieza a caer en
    // STAND, se ha roto algo en `LIMB_SPECS`.
    for (const l of CON_ANIMACION) {
        if (l === 'STAND') continue;
        ok(firmaDe(l) !== STAND, `${l} se ve distinto de estar de pie`);
    }
});

run('cada una de esas siete es DISTINTA de las otras seis', () => {
    // Si dos coinciden, el motor esta pintando la misma figura con dos
    // nombres: el nombre miente y el jugador ve dos estados iguales.
    const vistas = new Map();
    for (const l of CON_ANIMACION) {
        const f = firmaDe(l);
        ok(!vistas.has(f), `${l} no se repite con ${vistas.get(f) || ''}`);
        vistas.set(f, l);
    }
});

run('el reparto de estados: cuantos se ven y cuantos son un tronco', () => {
    // El numero que resume el problema, para que no se diluya en la lista.
    let conAnimacion = 0, sinAnimacion = 0;
    for (const [limbs, donde] of DECLARADAS) {
        if (firmaDe(limbs) === STAND && limbs !== 'STAND') sinAnimacion += donde.length;
        else conAnimacion += donde.length;
    }
    const total = conAnimacion + sinAnimacion;
    console.log(`        ${conAnimacion} de ${total} estados se ven como su postura`);
    console.log(`        ${sinAnimacion} de ${total} salen como un peleador de pie`);
    ok(total > 0, 'el catalogo no esta vacio', total);
    ok(conAnimacion > 0, 'y algo se ve', conAnimacion);
});

console.log('\n================================================================');
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
} else {
    console.log('TODO EN VERDE');
}
console.log('================================================================');
console.log(`\nresultado: ${pass} ok, ${fails.length} fallos\n`);
console.log(`POSTURAS DECLARADAS SIN ANIMACION PROPIA: ${SIN_POSTURA.length}`);
console.log('  ' + SIN_POSTURA.join(', '));
console.log('');
process.exit(fails.length ? 1 : 0);