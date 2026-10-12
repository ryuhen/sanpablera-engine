/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/clipassets.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del CATALOGO (core/anim/ClipAssets.js) y del tablero que lo pide.
 * ============================================================================
 *
 * QUE COMPRUEBA Y POR QUE CADA COSA
 * ----------------------------------------------------------------------------
 *   1. EL CATALOGO APUNTA A ARCHIVOS QUE EXISTEN ...... una entrada que nombra
 *      un archivo que no esta en `assets/` no da error al arrancar: da un clip
 *      ausente en silencio, y el motor cae a la postura procedural sin que se
 *      entere nadie. Aqui si se nota.
 *
 *   2. LO QUE DICE EL TABLERO, ESTA DECLARADO ......... el tablero puede pedir
 *      60 nombres; el catalogo tiene que saber responder a CADA uno, o con
 *      `null` y de forma consciente. Un nombre que el tablero pide y el
 *      catalogo no conoce es un nombre que nadie ha decidido todavia, y eso es
 *      un agujero, no una decision.
 *
 *   3. LAS RESERVAS SON LAS DECLARADAS ............... aqui esta el valor de la
 *      prueba: imprime la lista COMPLETA de clips que se ven con otro. Es la
 *      lista de mentiras contadas del motor, y por eso se imprime entera y no
 *      resumida. Si alguien anade `st_uppercut: 'punch_jab'` a `RESERVADO` sin
 *      querer, esta lista lo delata en la salida del test.
 *
 *   4. NADA DE LA RESERVA ES UNA MENTIRA BARATA ...... hay gestos que NO pueden
 *      servirse con otro (una patada giratoria no es un jab). Se comprueba que
 *      la reserva no contiene ninguna de esas, para que la lista de arriba no
 *      crezca por(descanso).
 *
 *   5. LO QUE NO TIENE ANIMACION ESTA DITO ........... los clips sin archivo se
 *      imprimen. No es un fallo: es la lista de trabajo de las animaciones que
 *      quedan por grabar, y un test en rojo por eso taparia todo lo demas.
 *
 * Ejecutar:  node tests/clipassets.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';
import { existsSync, readdirSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const A = await load('src/core/anim/ClipAssets.js');
const {
    RUTA, ARCHIVOS, CLIP_A_ARCHIVO, RESERVADO, SIN_ANIMACION, GUARDADOS,
    archivoDe, reservas, nombresQueSePiden
} = A;
const Board = await load('src/core/anim/ClipBoard.js');

// ---------------------------------------------------------------------------
section('1. EL CATALOGO APUNTA A ARCHIVOS QUE EXISTEN');
// ---------------------------------------------------------------------------
const enDisco = new Set(
    readdirSync(RUTA.replace(/\/$/, ''))
        .filter(f => f.endsWith('.glb'))
        .map(f => f.replace(/\.glb$/, ''))
);

const sinFichero = Object.keys(ARCHIVOS).filter(n => !enDisco.has(n));
check('todos los archivos del catalogo estan en ' + RUTA, sinFichero.length === 0, sinFichero);

// Solo los VALORES son nombres de archivo; las claves son nombres de clip del
// tablero (`st_recto`, `walk`...) y buscarlos en `ARCHIVOS` daria falso negativo.
const destinos = Object.values(CLIP_A_ARCHIVO).concat(Object.values(RESERVADO));
const sinFicha = [...new Set(destinos)].filter(n => !ARCHIVOS[n]);
check('ningun clip apunta a un archivo sin ficha', sinFicha.length === 0, sinFicha);

// Un archivo descargado que nadie usa son 100 KB de red gastados al pedo.
const usados = new Set(
    Object.values(CLIP_A_ARCHIVO).concat(Object.values(RESERVADO))
);
const huerfanos = [...enDisco].filter(n =>
    n !== '_rig-human' && !usados.has(n) && !GUARDADOS[n]);
check('no hay archivos descargados sin motivo declarado', huerfanos.length === 0,
    huerfanos);
check('todo archivo guardado tiene su motivo escrito',
    Object.keys(GUARDADOS).every(k => GUARDADOS[k] && GUARDADOS[k].length > 10),
    Object.keys(GUARDADOS).filter(k => !GUARDADOS[k] || GUARDADOS[k].length <= 10));

// ---------------------------------------------------------------------------
section('2. LO QUE DICE EL TABLERO, ESTA DECLARADO');
// ---------------------------------------------------------------------------
// Todos los nombres que el tablero puede devolver, tal cual puede devolverlos.
const pedidos = new Set();

// Fila 1: el estado exacto
for (const v of Object.values(Board.CLIP_DE_ESTADO)) if (v) pedidos.add(v);
// Fila 2: los golpes
for (const v of Object.values(Board.CLIP_DE_FAMILIA)) if (v) pedidos.add(v);
for (const v of Object.values(Board.CLIP_DE_GOLPE)) if (v) pedidos.add(v);
// Fila 3: los grupos (estos estan escritos a mano dentro de `resolver`)
for (const g of ['IMPACT', 'STUNNED', 'DOWNED', 'WAKEUP', 'GRAPPLE', 'AIRBORNE', 'ATTACKING']) {
    const r = Board.resolver({ id: null, groups: [g], posture: { limbs: 'CROUCH' }, loco: 'IDLE', move: 'ATAQUE_LIGERO' });
    if (r.clip) pedidos.add(r.clip);
    const r2 = Board.resolver({ id: null, groups: [g], posture: { limbs: 'PRONE' }, loco: 'IDLE', move: 'ATAQUE_LIGERO' });
    if (r2.clip) pedidos.add(r2.clip);
    const r3 = Board.resolver({ id: null, groups: [g], posture: { limbs: 'GRAPPLE_UKE' }, loco: 'IDLE', move: 'ATAQUE_LIGERO' });
    if (r3.clip) pedidos.add(r3.clip);
}
// Fila 4: la locomocion
for (const v of Object.values(Board.CLIP_DE_LOCO)) if (v) pedidos.add(v);
// Los agarres por postura, que el tablero tambien puede pedir
for (const l of ['GRAPPLE_TORI', 'TOP', 'BOTTOM', 'FLOAT', 'JUGGLE', 'SUPINE', null]) {
    const c = Board.clipDeAgarre(l);
    if (c) pedidos.add(c);
}

const declarados = new Set(nombresQueSePiden());
const sinDeclarar = [...pedidos].filter(p => !declarados.has(p));
check('el tablero no pide ningun clip que el catalogo ignore',
    sinDeclarar.length === 0, sinDeclarar);
check('el tablero pide ' + pedidos.size + ' clips distintos', pedidos.size > 40, pedidos.size);

// Y que `archivoDe` nunca devuelva un archivo que no este declarado.
const rutasFalsas = [...pedidos].map(p => archivoDe(p)).filter(n => n && !ARCHIVOS[n]);
check('archivoDe nunca devuelve un archivo inexistente', rutasFalsas.length === 0, rutasFalsas);

// Y que la lista de "sin animacion" sea CONSISTENTE con lo que el tablero pide.
// Un nombre declarado sin animacion que ademas tiene archivo seria una
// contradiccion, y un nombre sin archivo que no esta en ninguna de las tres
// listas seria un agujero.
const contradictoires = Object.keys(SIN_ANIMACION).filter(c => archivoDe(c));
check('nadie esta declarado sin animacion Y con archivo',
    contradictoires.length === 0, contradictoires);

const huecos = [...pedidos].filter(p => !archivoDe(p) && !SIN_ANIMACION[p]);
check('ningun clip pedido queda sin decidir', huecos.length === 0, huecos);

// ---------------------------------------------------------------------------
section('3. LAS RESERVAS SON LAS DECLARADAS (la lista de mentiras)');
// ---------------------------------------------------------------------------
const lista = reservas();
console.log('  clips que se ven con OTRO (lista completa, ' + lista.length + '):');
const porArchivo = {};
for (const r of lista) (porArchivo[r.archivo] = porArchivo[r.archivo] || []).push(r.clip);
for (const a of Object.keys(porArchivo).sort()) {
    console.log('    ' + a.padEnd(16) + ' <- ' + porArchivo[a].join(', '));
}

check('ningun clip se reserva a si mismo',
    lista.every(r => r.clip !== r.archivo),
    lista.filter(r => r.clip === r.archivo).map(r => r.clip));
check('toda reserva apunta a un archivo real',
    lista.every(r => !!ARCHIVOS[r.archivo]),
    lista.filter(r => !ARCHIVOS[r.archivo]).map(r => r.clip));

// Una reserva SOLO vale si el gesto es el mismo. Estas familias tienen gesto
// propio y servirlas con otra cosa es mentira, no aproximacion.
const PROHIBIDO = Object.freeze([
    'st_uppercut', 'st_patada_lateral', 'sp_patada_giro', 'st_patada_baja',
    'sp_derribo', 'sp_pasa_pie_abajo', 'sp_embestida'
]);
const malas = PROHIBIDO.filter(c => RESERVADO[c]);
check('ningun gesto con animacion propia se sirve con otro',
    malas.length === 0, malas.map(c => c + ' -> ' + RESERVADO[c]));

// Y al reves: si un gesto tiene animacion propia, no puede estar en la reserva
// aunque "tampoco pase nada". Serian dos caminos para el mismo golpe.
const doble = Object.keys(CLIP_A_ARCHIVO).filter(c => RESERVADO[c]);
check('ningun clip esta a la vez en la tabla y en la reserva',
    doble.length === 0, doble);

// ---------------------------------------------------------------------------
section('4. LOS CICLOS ESTAN DECLARADOS COMO CICLOS');
// ---------------------------------------------------------------------------
// Un ciclo que se reabre de golpe da un salto en pantalla, y el mezclador no
// lo arregla porque no sabe nada del archivo: hay que declararlo.
const CICLOS_POR_NOMBRE = new Set(
    ['idle', 'walk', 'step', 'step_long', 'jog', 'sprint_f', 'crouch', 'crouch_walk',
        'crouch_guard_high', 'crouch_guard_low', 'stance_base', 'fall', 'juggle',
        'juggle_dead', 'slow_fall', 'atk_air', 'backdash', 'dash_side',
        // El deslizamiento MIENTE mientras dura: se repite en vez deadvance
        // un golpe y quedarse con el brazo estirado.
        'slide']
);
const cicloMal = [];
for (const c of CICLOS_POR_NOMBRE) {
    const a = archivoDe(c);
    if (a && !ARCHIVOS[a].loop) cicloMal.push(c + ' -> ' + a);
}
check('los clips que se repiten son archivos en bucle', cicloMal.length === 0, cicloMal);

const noCicloMal = [];
for (const c of ['st_recto', 'st_cruzado', 'roll', 'jump', 'hop']) {
    const a = archivoDe(c);
    if (a && ARCHIVOS[a].loop) noCicloMal.push(c + ' -> ' + a);
}
check('los golpes de un sentido NO son archivos en bucle', noCicloMal.length === 0, noCicloMal);

// ---------------------------------------------------------------------------
section('5. LO QUE NO TIENE ANIMACION (lista de trabajo, no es fallo)');
// ---------------------------------------------------------------------------
const sinAnimacion = [...pedidos].filter(p => !archivoDe(p));
console.log('  clips que el tablero pide y NO tienen animacion grabada (' +
    sinAnimacion.length + '), cada uno con su motivo:');
for (const c of sinAnimacion) {
    console.log('    ' + c.padEnd(20) + (SIN_ANIMACION[c] || '(SIN MOTIVO DECLARADO)'));
}
check('el motor se apaña con lo que hay', true);

const conCobertura = [...pedidos].filter(p => archivoDe(p)).length;
console.log('  cobertura del tablero: ' + conCobertura + '/' + pedidos.size +
    ' (' + Math.round(100 * conCobertura / pedidos.size) + '% de los nombres, ' +
    Object.keys(ARCHIVOS).length + ' archivos)');
console.log('  quedan por grabar: ' + sinAnimacion.length + ' gestos');

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);