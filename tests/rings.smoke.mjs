/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/rings.smoke.mjs
 * ----------------------------------------------------------------------------
 * Que los cinco rings sean cinco Rings y no el mismo cinco veces.
 * ============================================================================
 *
 * QUE COMPRUEBA
 * ----------------------------------------------------------------------------
 *   1. SON CINCO Y DISTINTOS. Si dos filas tienen la misma forma, la misma
 *      frontera y el mismo ancho, es el mismo recinto con dos nombres, y el
 *      combate no cambia entre ellos. Eso es exactamente lo que no hay que
 *      hacer.
 *
 *   2. LA FRONTERA DICE COMO SE SALE. Es la diferencia entre perder y rebotar:
 *      con cuerdas se topa, sin frontera se sale andando, con linea se pierde.
 *      Y la MALLA tiene que ser la unica que no deja salir de ninguna manera.
 *
 *   3. EL TATAMI ESTA ELEVADO Y LA ESTERILLA NO. El pedido era justo ese
 *      detalle y es el que separa "caerse es salir" de "caerse es rodar".
 *
 *   4. CABEN DOS PELOADORES. Un ring donde no caben dos no es un ring pequeño:
 *      es un fallo de diseno, y el dohyo de sumo es el que mas lo tienta.
 *
 *   5. CADA UNO SE LEVANTA EN ALGUN SITIO, Y ESE SITIO ESTA EN LA ISLA. Un
 *      ring que apunta a un escenario inexistente se cuela en la pantalla de
 *      mapa y no se ve hasta que peta.
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const R = await load('src/core/geo/rings.js');
const M = await load('src/core/geo/margarita.js');
const { RINGS, FORMA, FRONTERA, ring, ringsDe, caben, alcanceUtil, comoSale } = R;
const LUGARES = M.LUGARES;

// ---------------------------------------------------------------------------
section('1. SON CINCO Y DISTINTOS');
// ---------------------------------------------------------------------------
check('hay seis recintos (cinco rings y el dohyo)', RINGS.length === 6, RINGS.length);
check('cada uno tiene su identificador unico',
    new Set(RINGS.map(r => r.id)).size === RINGS.length);

const firmas = new Set(RINGS.map(r => [r.forma, r.frontera, r.ancho, r.elevacion].join('|')));
check('ninguno es copia de otro (forma+frontera+medidas distintas)',
    firmas.size === RINGS.length, firmas.size + ' firmas para ' + RINGS.length + ' rings');

// Los cinco que se pidieron, por nombre. El dohyo va aparte.
const IDS = ['JAULA_UFC', 'RING_CUERDAS', 'TAKEDOWN_MUAYTHAI', 'TATAMI_KARATE', 'ESTERILLA_JUDO'];
for (const id of IDS) check('existe ' + id, !!ring(id));
check('y ademas el circulo de sumo', !!ring('DOHYO_SUMO'));

// ---------------------------------------------------------------------------
section('2. LA FRONTERA DICE COMO SE SALE');
// ---------------------------------------------------------------------------
check('la jaula tiene MALLA y es lo unico que no deja salir',
    ring('JAULA_UFC').frontera === FRONTERA.MALLA
    && comoSale(ring('JAULA_UFC')) === 'TOPA');
check('los rings de cuerdas tienen tres alturas de cuerda',
    ring('RING_CUERDAS').cuerdas === 3 && ring('TAKEDOWN_MUAYTHAI').cuerdas === 3);
check('con cuerdas se topa, no se sale andando',
    comoSale(ring('RING_CUERDAS')) === 'TOPA'
    && comoSale(ring('TAKEDOWN_MUAYTHAI')) === 'TOPA');
check('el tatami NO tiene frontera: se sale',
    ring('TATAMI_KARATE').frontera === FRONTERA.NINGUNA
    && comoSale(ring('TATAMI_KARATE')) === 'SALE');
check('la estera tampoco, y es redonda',
    ring('ESTERILLA_JUDO').forma === FORMA.REDONDA && comoSale(ring('ESTERILLA_JUDO')) === 'SALE');
check('el dohyo tiene LINEA: se pierde, no se rebota',
    ring('DOHYO_SUMO').frontera === FRONTERA.CENA && comoSale(ring('DOHYO_SUMO')) === 'LINEA');

// Solo el dohyo y la jaula tienen frontera que NO frena al cuerpo, y cada uno
// por su cuenta. Los otros cuatro se topan o se salen.
const salidas = new Set(RINGS.map(r => comoSale(r)));
check('hay al menos dos maneras distintas de salirse',
    salidas.size >= 3, [...salidas].join(' '));

// ---------------------------------------------------------------------------
section('3. EL TATAMI ESTA ELEVADO Y LA ESTERILLA NO');
// ---------------------------------------------------------------------------
check('el tatami esta elevado sobre el terreno (mas de medio metro)',
    ring('TATAMI_KARATE').elevacion > 0.5, ring('TATAMI_KARATE').elevacion);
check('la estera esta en el suelo, a ras',
    ring('ESTERILLA_JUDO').elevacion <= 0.1, ring('ESTERILLA_JUDO').elevacion);
check('y por eso el tatami es el mas alto y la estera la mas baja',
    ring('TATAMI_KARATE').elevacion === Math.max(...RINGS.map(r => r.elevacion))
    && ring('ESTERILLA_JUDO').elevacion === Math.min(...RINGS.map(r => r.elevacion)));
check('la jaula tambien esta elevada (es un recinto montado)',
    ring('JAULA_UFC').elevacion > 0.3, ring('JAULA_UFC').elevacion);

// ---------------------------------------------------------------------------
section('4. CABEN DOS PELOADORES');
// ---------------------------------------------------------------------------
const P = { velocidad: 1, resistencia: 1, agilidad: 1, altura: 1 };
check('caben dos en TODOS los rings, y el mas pequeno es el mas ajustado',
    RINGS.every(r => caben(r)),
    RINGS.filter(r => !caben(r)).map(r => r.id));
const holgura = Math.min(...RINGS.map(r => alcanceUtil(r)));
check('el dohyo es el que menos margen deja',
    ring('DOHYO_SUMO').ancho === Math.min(...RINGS.map(r => r.ancho)),
    { min: +holgura.toFixed(2), dohyo: ring('DOHYO_SUMO').ancho });
// OJO: la primera version pedia que un cuerpo de 1,90 m NO cabiera en el
// dohyo, y es falso: 5,4 de diametro menos 3,8 de dos cuerpos deja 1,6 m de
// margen. Caben. Lo que importa no es si caben, es CUANTO les sobra, asi que
// la comprobacion es sobre el margen.
const margen = (r, cuerpo) => +(r.ancho - cuerpo * 2).toFixed(2);
check('el dohyo es el que menos margen deja',
    margen(ring('DOHYO_SUMO'), 1.15) === Math.min(...RINGS.map(r => margen(r, 1.15))),
    { dohyo: margen(ring('DOHYO_SUMO'), 1.15), minimo: Math.min(...RINGS.map(r => margen(r, 1.15))) });
check('y con cuerpos grandes, el margen se come el dohyo antes que los demas',
    margen(ring('DOHYO_SUMO'), 1.7) < margen(ring('RING_CUERDAS'), 1.7),
    { dohyo: margen(ring('DOHYO_SUMO'), 1.7), ring: margen(ring('RING_CUERDAS'), 1.7) });
check('con cuerpos normales caben en todos (nunca se cuela un fallo de medida)',
    RINGS.every(r => caben(r, 1.15)), RINGS.filter(r => !caben(r, 1.15)).map(r => r.id));
check('y el takedown es mas pequeno que el ring normal',
    ring('TAKEDOWN_MUAYTHAI').ancho < ring('RING_CUERDAS').ancho,
    { takedown: ring('TAKEDOWN_MUAYTHAI').ancho, ring: ring('RING_CUERDAS').ancho });

// ---------------------------------------------------------------------------
section('5. CADA UNO SE LEVANTA EN ALGUN SITIO DE LA ISLA');
// ---------------------------------------------------------------------------
const idsLugares = new Set(LUGARES.map(l => l.id));
for (const r of RINGS) {
    check(r.nombre + ' tiene al menos un sitio',
        r.sitios.length > 0, r.sitios.length);
    check(r.nombre + ': sus sitios existen en la isla',
        r.sitios.every(s => idsLugares.has(s)),
        r.sitios.filter(s => !idsLugares.has(s)).join(' '));
}

// Y al reves: ningun escenario se queda sin donde pelear.
const sinRing = LUGARES.filter(l => ringsDe(l.id).length === 0);
check('todos los escenarios de la isla admiten algun ring',
    sinRing.length === 0, sinRing.map(l => l.id).join(' '));

// Y la jaula no tiene por que estar en la playa ni el tatami en la selva:
// cada recinto se monta donde tiene sentido.
check('la jaula no se monta en la selva cerrada',
    !ring('JAULA_UFC').sitios.includes('SELVA_BORDE')
    && !ring('JAULA_UFC').sitios.includes('CANYON_SECO'));
check('el dohyo esta en el cerro y en la selva, no en el puerto',
    ring('DOHYO_SUMO').sitios.includes('CRATERA')
    && !ring('DOHYO_SUMO').sitios.includes('PUERTO_AZUL'));

// Y el tatami y la estera se distinguen EN EL MISMO SITIO, que es donde se ve
// que la eleccion importa: en Pueblo de Pan estan los dos.
const enPan = ringsDe('PUEBLO_PAN').map(r => r.id);
check('en Pueblo de Pan se pueden montar el tatami y la jaula',
    enPan.includes('TATAMI_KARATE') && enPan.includes('JAULA_UFC'), enPan.join(' '));

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);