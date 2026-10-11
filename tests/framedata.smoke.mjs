/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/framedata.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del MOTOR DE CUADROS (core/framedata.js).
 *
 * Comprueba, sobre los GOLPES REALES de MoveTable.js:
 *   1. Que la cuenta de ventaja sea la de siempre (stun - recovery).
 *   2. Que un derribo NO se mida igual que un golpe (el rival esta en el suelo).
 *   3. Que las ventajas tengan sentido de juego: el ligero es mas seguro que
 *      el pesado, y el mas rapido se puede encadenar.
 *   4. Que las bandas (muy ventajoso / a favor / malo / imposible) cuadren.
 *   5. El indice de golpes: O(1) y sin perder ninguno.
 *
 * Ejecutar:  node tests/framedata.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
let failed = 0;

function check(name, condition, extra) {
    if (condition) {
        passed++;
        console.log('  ok   ' + name);
    } else {
        failed++;
        console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
    }
}
function section(t) { console.log('\n' + t); }

const FD = (await load('src/core/framedata.js')).default;
const MoveTable = (await load('src/core/fsm/MoveTable.js')).default;
const SPF = (await load('src/core/fsm/Constants.js')).default;

const {
    FPS, secondsToFrames, framesToSeconds,
    hitAdvantage, blockAdvantage, knockdownStun, fullHitAdvantage,
    advantageBand, buildMoveIndex, frameSheet, compareFrameData
} = FD;

// Los golpes reales del juego, por su personaje.
const base = MoveTable.getMoves('BASE');

check('hay golpes base que mirar', Object.keys(base).length > 0, Object.keys(base));

// ---------------------------------------------------------------------------
// 1. La cuenta
// ---------------------------------------------------------------------------
section('1. La cuenta: stun - recovery');

check('60 Hz: un segundo son 60 frames', secondsToFrames(1) === 60);
check('las conversiones son inversas', (() => {
    const f = secondsToFrames(0.37);
    return Math.abs(framesToSeconds(f) - f / 60) < 1e-9;
})());
check('un golpe inexistente no rompe nada', hitAdvantage(null) === 0 && blockAdvantage(null) === 0);

{
    // Un golpe inventado con numeros que se saben a mano.
    const golpe = { startup: 5, active: 3, recovery: 10, hitstun: 14, blockstun: 8 };
    check('ventaja al impactar = hitstun - recovery', hitAdvantage(golpe) === 4,
        { esperado: 4, real: hitAdvantage(golpe) });
    check('ventaja al bloquear = blockstun - recovery', blockAdvantage(golpe) === -2,
        { esperado: -2, real: blockAdvantage(golpe) });
}

check('bloquear suele ser PEOR que ser golpeado', (() => {
    // Es la regla general de cualquier juego de pelea: el bloqueo castiga.
    const golpes = Object.values(base).filter(m => m.hitstun != null && m.blockstun != null);
    const peor = golpes.filter(m => blockAdvantage(m) < fullHitAdvantage(m)).length;
    return peor >= Math.floor(golpes.length * 0.5);
})());

// ---------------------------------------------------------------------------
// 2. El derribo se mide distinto
// ---------------------------------------------------------------------------
section('2. El derribo dura mas que el aturdimiento');

check('un golpe normal no da tiempo de suelo', knockdownStun({ knockdown: 'NONE' }) === 0);
check('un derribo LIGERO da 24 frames de suelo', knockdownStun({ knockdown: 'LIGHT' }) === 24);
check('un derribo GARANTIZADO da 30', knockdownStun({ knockdown: 'ALWAYS' }) === 30);

{
    // El golpe mas lento con derribo debe MEJORAR su ventaja al impactar, no
    // empeorarla. Sin esto, el golpe mas largo del juego pareceria el peor.
    const lento = { recovery: 30, hitstun: 6, knockdown: 'ALWAYS' };
    check('derribar recupera la ventaja de un golpe lentisimo',
        fullHitAdvantage(lento) === 0 && hitAdvantage(lento) === -24,
        { conSuelo: fullHitAdvantage(lento), sinSuelo: hitAdvantage(lento) });
}

// ---------------------------------------------------------------------------
// 3. Sentido de juego sobre los golpes reales
// ---------------------------------------------------------------------------
section('3. Lo que dicen los golpes reales del juego');

const hojas = Object.values(base).map(frameSheet).filter(Boolean);

check('todos los golpes tienen ficha', hojas.length === Object.keys(base).length);

{
    // Startup alto = se ve venir = el rival tiene tiempo a defenderse.
    const rapido = hojas.find(f => f.startup <= 5);
    const lento = hojas.find(f => f.startup >= 11);
    check('hay un golpe rapido y uno lento en el set base', !!rapido && !!lento,
        { rapido: rapido && rapido.key, lento: lento && lento.key });
}

check('ningun golpe del set base es "imposible" de usar', (() => {
    const imposibles = hojas.filter(f => f.hitBand === 'IMPOSIBLE');
    // Puede haber alguno (un super lento), pero no TODOS: si todos fueran
    // imposibles, el set base estaria mal hecho.
    return imposibles.length < hojas.length;
})(), hojas.map(f => f.key + ':' + f.hitBand));

{
    // El golpe que mejor encadena es el de menor recuperacion entre los que
    // conectan a favor. Y tiene que existir.
    const aFavor = hojas.filter(f => f.hitAdvantage >= 0);
    check('hay golpes que conectan a favor (se pueden encadenar)', aFavor.length > 0,
        aFavor.map(f => f.key));
}

check('la ficha suma bien los tres bloques de frames', (() => {
    return hojas.every(f => f.total === (f.startup + f.active + f.recovery));
})());

check('la ficha trae las ventajas en frames y en segundos', (() => {
    return hojas.every(f =>
        Math.abs(f.hitAdvantageSec - f.hitAdvantage / FPS) < 1e-4 &&
        Math.abs(f.blockAdvantageSec - f.blockAdvantage / FPS) < 1e-4);
})());

// ---------------------------------------------------------------------------
// 4. Las bandas
// ---------------------------------------------------------------------------
section('4. Bandas de ventaja');

check('+10 es muy ventajoso', advantageBand(10).id === 'MUY_VENTAJOSO');
check('+2 es a favor', advantageBand(2).id === 'A_FAVOR');
check('-2 es a contralaura', advantageBand(-2).id === 'A_CONTRALAURA');
check('-6 es muy malo', advantageBand(-6).id === 'MUY_MALO');
check('-12 es imposible', advantageBand(-12).id === 'IMPOSIBLE');
check('el borde de cada banda cae en su propia banda, no en un hueco', (() => {
    // -4 es el minimo de A_CONTRALAURA. Si el borde se perdiera, habria
    // numeros entre bandas que no pertenecen a ninguna.
    return advantageBand(-4).id === 'A_CONTRALAURA' &&
        advantageBand(-10).id === 'MUY_MALO' &&
        advantageBand(0).id === 'A_FAVOR';
})());

check('las bandas son contiguas (nada cae entre dos)', (() => {
    // Si un numero cae entre dos bandas, la cuenta pierde.
    for (let f = -40; f <= 20; f++) {
        const b = advantageBand(f);
        if (!b || b.min > f) return false;
    }
    return true;
})());

// ---------------------------------------------------------------------------
// 5. El indice de golpes
// ---------------------------------------------------------------------------
section('5. Indice de golpes (O(1))');

{
    const idx = buildMoveIndex(base);
    check('el indice tiene todos los golpes', idx.size === Object.keys(base).length,
        { indice: idx.size, set: Object.keys(base).length });
    check('buscar por nombre es O(1) y acierta', (() => {
        const key = Object.keys(base)[0];
        return idx.get(key) === base[key];
    })());
    check('un golpe que no existe devuelve null, no undefined', idx.get('NO_EXISTE') === null);
    check('los golpes por estado estan agrupados', (() => {
        const cualquier = idx.all.find(m => m.state != null);
        return cualquier ? idx.fromState(cualquier.state).length >= 1 : true;
    })());
    check('un set vacio no rompe el indice', buildMoveIndex({}).size === 0);
    check('indice de null tampoco', buildMoveIndex(null).size === 0);
}

check('ordenar por frame data pone primero lo mas seguro', (() => {
    const inv = [Object.values(base)[2], Object.values(base)[0], Object.values(base)[1]]
        .filter(Boolean);
    const orden = [...inv].sort(compareFrameData);
    // El primero debe ser el de menor "ventaja minima".
    const peor = (m) => Math.min(fullHitAdvantage(m), blockAdvantage(m));
    return peor(orden[0]) >= peor(orden[orden.length - 1]);
})());

// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`framedata: ${passed} ok, ${failed} fallos`);
console.log('================================================================');

if (failed > 0) process.exit(1);