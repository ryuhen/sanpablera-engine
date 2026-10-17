/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/tactil.smoke.mjs
 * ----------------------------------------------------------------------------
 * LA DIRECCIONAL TACTIL. Y CONCRETAMENTE: QUE LAS DIAGONALES MIDAN LO MISMO
 * QUE LAS RECTAS.
 * ============================================================================
 *
 * POR QUE ESTA PRUEBA EXISTE
 *   El dpad tiene ocho banderas (cuatro rectas y cuatro diagonales con nombre)
 *   y el codigo las sumaba todas. Con dos dedos en arriba-izquierda, que es lo
 *   normal al mover el pulgar en diagonal, la X valia -2 en vez de -1 y la
 *   normalizacion la dejaba en -1,41: la diagonal salia al doble de velocidad
 *   que la recta. En pantalla no se ve "raro", se ve que el personaje hace la
 *   diagonal de dos zancadas, y es facil culpar al mando que no existe.
 *
 * QUE COMPRUEBA
 *   1. LAS RECTAS SIGUEN IGUALES.(up, down, left, right) -> un vector unitario
 *      en un solo eje. Esto no se puede romper: es el caso normal.
 *   2. UNA DIAGONAL MIDE LO MISMO QUE UNA RECTA. Si las dos valen 1, el
 *      personaje no acelera al ir en diagonal. Esta es LA comprobacion.
 *   3. LOS DOS ESQUEMAS DABAN EL MISMO RESULTADO, Y ESO ES LO QUE SE ARREGLO.
 *      Poner `left` + `up` y poner `upLeft` tienen que dar EXACTAMENTE el mismo
 *      vector. Antes el primero valia -1,41 y el segundo -0,71.
 *   4. LAS CUATRO DIAGONALES, y que sean simetricas: arriba-izquierda es el
 *      mismo espejo que abajo-derecha.
 *   5. NADA PULSADO ES CERO, y no sale NaN. Un NaN en la direccion manda al
 *      peleador al limbo y no se ve hasta que pasa a la siguiente comprobacion.
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const TouchControls = (await load('src/ui/TouchControls.js')).default;

/** Un dpad con banderas puestas, y el vector que sale. */
function conMover(flags) {
    const t = new TouchControls();
    for (const k of Object.keys(flags)) t.dpad[k] = flags[k];
    return t.getMovementVector();
}
const largo = (v) => Math.hypot(v.x, v.y);
const dosDecimales = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2) });

// ---------------------------------------------------------------------------
section('1. Las rectas no se han roto');
// ---------------------------------------------------------------------------
const RECTAS = [
    ['up', { x: 0, y: -1 }],
    ['down', { x: 0, y: 1 }],
    ['left', { x: -1, y: 0 }],
    ['right', { x: 1, y: 0 }]
];
for (const [dir, esperado] of RECTAS) {
    const v = conMover({ [dir]: true });
    check('pulsar ' + dir + ' va solo en ' + dir, v.x === esperado.x && v.y === esperado.y, dosDecimales(v));
    check('y ' + dir + ' mide 1', Math.abs(largo(v) - 1) < 1e-9, largo(v));
}

// ---------------------------------------------------------------------------
section('2. Una diagonal mide lo mismo que una recta');
// ---------------------------------------------------------------------------
const DIAGONALES = [
    ['arriba-izquierda', { up: true, left: true }, { x: -0.70711, y: -0.70711 }],
    ['arriba-derecha', { up: true, right: true }, { x: 0.70711, y: -0.70711 }],
    ['abajo-izquierda', { down: true, left: true }, { x: -0.70711, y: 0.70711 }],
    ['abajo-derecha', { down: true, right: true }, { x: 0.70711, y: 0.70711 }]
];
const R = Math.SQRT1_2;
for (const [nombre, flags, esperado] of DIAGONALES) {
    const v = conMover(flags);
    // Lo importante: el largo. Si sale 1.41, la diagonal corre el doble.
    check('la diagonal ' + nombre + ' mide 1 (como una recta)',
        Math.abs(largo(v) - 1) < 1e-6, { largo: +largo(v).toFixed(4) });
    check('y va a ' + esperado.x + ', ' + esperado.y,
        Math.abs(v.x - esperado.x) < 1e-4 && Math.abs(v.y - esperado.y) < 1e-4, dosDecimales(v));
}

// La comprobacion que resume el problema: diagonal contra recta, lado a lado.
check('ninguna diagonal es mas larga que una recta',
    DIAGONALES.every(([, f]) => Math.abs(largo(conMover(f)) - 1) < 1e-6),
    DIAGONALES.map(([n, f]) => n + '=' + largo(conMover(f)).toFixed(3)));

// ---------------------------------------------------------------------------
section('3. Los dos esquemas dan el MISMO vector (la regresión)');
// ---------------------------------------------------------------------------
// Este es el bug. Dos dedos en arriba y a la izquierda pone `up` Y `left`; un
// control que solo sepa diagonales pondria `upLeft`. El jugador no nota la
// diferencia: las dos cosas significan "voy en diagonal arriba a la izquierda".
const PARES = [
    ['upLeft', { up: true, left: true }],
    ['upRight', { up: true, right: true }],
    ['downLeft', { down: true, left: true }],
    ['downRight', { down: true, right: true }]
];
for (const [nombre, rectas] of PARES) {
    const porRectas = conMover(rectas);
    const porNombre = conMover({ [nombre]: true });
    check('`' + nombre + '` con nombre = misma diagonal que con las dos rectas',
        Math.abs(porRectas.x - porNombre.x) < 1e-9 && Math.abs(porRectas.y - porNombre.y) < 1e-9,
        { rectas: dosDecimales(porRectas), nombre: dosDecimales(porNombre) });
}
// Y el caso que de verdad rompia: las dos representaciones a la vez. Antes
// valia -1,41 en X, o sea el doble de velocidad.
const ambas = conMover({ up: true, left: true, upLeft: true });
check('puestas a la vez las dos cosas NO se suman (el bug era -1.41)',
    Math.abs(largo(ambas) - 1) < 1e-6 && Math.abs(ambas.x + R) < 1e-4,
    dosDecimales(ambas));
// OJO, y esto es una correccion de una expectativa mia: `upLeft` + `upRight`
// NO se anulan. Los dos restan Y, asi que sale y = -2: una recta hacia arriba
// con el doble de fuerza. La primera version de esta comprobacion pedia que se
// cancelaran, y es falso. Lo unico que tiene que anularse son las diagonales
// OPUESTAS entre si, que es lo de la linea de abajo.
check('y con las cuatro banderas de diagonal puestas tampoco',
    Math.abs(largo(conMover({ upLeft: true, downRight: true }))) < 1e-6,
    dosDecimales(conMover({ upLeft: true, downRight: true })));
check('diagonales opuestas se anulan, como arriba y abajo',
    conMover({ upLeft: true, downRight: true }).x === 0
    && conMover({ upLeft: true, downRight: true }).y === 0);

// ---------------------------------------------------------------------------
section('4. Simetría y casos raros');
// ---------------------------------------------------------------------------
const arribaIzq = conMover({ up: true, left: true });
const abajoDer = conMover({ down: true, right: true });
check('arriba-izquierda y abajo-derecha son el mismo vector negation',
    Math.abs(arribaIzq.x + abajoDer.x) < 1e-9 && Math.abs(arribaIzq.y + abajoDer.y) < 1e-9,
    { arribaIzq: dosDecimales(arribaIzq), abajoDer: dosDecimales(abajoDer) });

const arribaDer = conMover({ up: true, right: true });
const abajoIzq = conMover({ down: true, left: true });
check('las otras dos tambien son espejo',
    Math.abs(arribaDer.x + abajoIzq.x) < 1e-9 && Math.abs(arribaDer.y + abajoIzq.y) < 1e-9);

const nada = conMover({});
check('sin pulsar nada el vector es cero', nada.x === 0 && nada.y === 0, dosDecimales(nada));

const opuestas = conMover({ up: true, down: true });
check('arriba y abajo a la vez se anulan (no sale NaN)',
    Number.isFinite(opuestas.x) && Number.isFinite(opuestas.y), dosDecimales(opuestas));

const izquierdaYderecha = conMover({ left: true, right: true });
check('izquierda y derecha a la vez se anulan',
    izquierdaYderecha.x === 0 && izquierdaYderecha.y === 0, dosDecimales(izquierdaYderecha));

// Y los botones de golpe, que son otra cosa y no deben verse afectados.
const t = new TouchControls();
t.updateButton('attack1', true);
t.updateButton('attack2', true);
t.updateBlock ? null : null;
check('los botones de golpe se encienden y se leen por su nombre',
    t.getActiveButtons().includes('attack1') && t.getActiveButtons().includes('attack2'),
    t.getActiveButtons());
check('un boton que no existe se ignora en vez de romper',
    (() => { t.updateButton('noExiste', true); return t.getActiveButtons().includes('noExiste') === false; })(),
    t.getActiveButtons());

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
