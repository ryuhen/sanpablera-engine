/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/diorama.smoke.mjs
 * ----------------------------------------------------------------------------
 * Los datos de la maqueta, sin BABYLON y sin DOM.
 * ============================================================================
 *
 * QUE COMPRUEBA
 *   Que la maqueta sale de los datos REALES de margarita.js (9 hitos, 4 zonas,
 *   contorno cerrado), que el estado del torneo se traduce a abierto/siguiente,
 *   que el pick elige el hito mas cercano, que el zoom da numeros usables y que
 *   la paleta sale en hexadecimal. Y que todo es determinista: si dos llamadas
 *   iguales dieran cosas distintas, el render y el mapa podria discutir.
 *
 *   node tests/diorama.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const D = await load('src/core/geo/diorama.js');
const M = await load('src/core/geo/margarita.js');

const data = D.buildDioramaData();
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
section('1. LA MAQUETA SALE DE LOS DATOS REALES');
// ---------------------------------------------------------------------------
check('el contorno tiene mas de 20 vertices',
    data.isla.vertices.length > 20, data.isla.vertices.length);
check('el contorno cierra (el ultimo repite al primero)',
    data.isla.vertices[0][0] === data.isla.vertices[data.isla.vertices.length - 1][0]
    && data.isla.vertices[0][1] === data.isla.vertices[data.isla.vertices.length - 1][1]);
check('hay 9 hitos', data.hitos.length === M.LUGARES.length && data.hitos.length === 9,
    data.hitos.length);
check('hay 4 zonas', data.zonas.length === Object.keys(M.ZONAS).length && data.zonas.length === 4,
    data.zonas.length);
check('cada zona trae un color hexadecimal',
    data.zonas.every(z => HEX.test(z.color)), data.zonas.map(z => z.color));
check('cada hito trae nombre, zona y color',
    data.hitos.every(h => h.nombre && h.zona && HEX.test(h.color)));
check('la escala esta en meta y es la usada',
    data.meta.escala === D.ESCALA_POR_DEFECTO && data.escala === data.meta.escala,
    [data.escala, data.meta.escala]);
check('la caja es cuadrada y positiva',
    data.caja.ancho > 0 && data.caja.alto > 0 && data.caja.centro[0] === 0,
    data.caja);
check('todos los hitos caen dentro de la caja',
    data.hitos.every(h => h.x >= data.caja.minX && h.x <= data.caja.maxX
        && h.z >= data.caja.minZ && h.z <= data.caja.maxZ));

// ---------------------------------------------------------------------------
section('2. EL ESTADO DEL TORNEO SE TRADUCE');
// ---------------------------------------------------------------------------
const vacio = D.buildDioramaData({ ganados: {} });
check('con ganados vacio el siguiente es EL_MORRO',
    D.siguienteHito(vacio) && D.siguienteHito(vacio).id === 'EL_MORRO',
    D.siguienteHito(vacio) && D.siguienteHito(vacio).id);
check('solo un hito lleva la marca de siguiente',
    vacio.hitos.filter(h => h.siguiente).length === 1);
check('PLAYA_AGUA esta abierta al empezar',
    D.hitosAbiertos(vacio).some(h => h.id === 'PLAYA_AGUA'));
check('la CRATERA esta cerrada al empezar',
    !D.hitosAbiertos(vacio).some(h => h.id === 'CRATERA'));
check('hitosAbiertos devuelve solo abiertos',
    D.hitosAbiertos(vacio).every(h => h.abierto)
    && D.hitosAbiertos(vacio).length === vacio.meta.abiertos);
const conUna = D.buildDioramaData({ ganados: { PLAYA_AGUA: 1 } });
check('ganar una en la playa abre EL_MORRO',
    conUna.hitos.find(h => h.id === 'EL_MORRO').abierto);
check('y el siguiente pasa a ser PUEBLO_PAN o posterior (no EL_MORRO)',
    !(D.siguienteHito(conUna) && D.siguienteHito(conUna).id === 'EL_MORRO'),
    D.siguienteHito(conUna) && D.siguienteHito(conUna).id);

// ---------------------------------------------------------------------------
section('3. PICK, ZOOM Y PALETA');
// ---------------------------------------------------------------------------
const morro = vacio.hitos.find(h => h.id === 'EL_MORRO');
const playa = vacio.hitos.find(h => h.id === 'PLAYA_AGUA');
check('hitoEn devuelve el mas cercano (El Morro)',
    D.hitoEn(vacio, morro.x + 0.1, morro.z, 0.5).id === 'EL_MORRO',
    D.hitoEn(vacio, morro.x + 0.1, morro.z, 0.5));
check('hitoEn no caza un punto lejano',
    D.hitoEn(vacio, playa.x + 10, playa.z + 10, 1.2) === null);
const zoom = D.zoomPara(vacio, 'EL_MORRO');
check('zoomPara da radio > 0', zoom.radius > 0, zoom);
check('y el target cae encima del hito',
    zoom.target[0] === morro.x && zoom.target[2] === morro.z, zoom.target);
check('zoomPara sin id da una vista general',
    D.zoomPara(vacio, null).radius > 0 && D.zoomPara(vacio, null).target[0] === 0);
const paleta = D.aPaleta(morro);
check('aPaleta devuelve colores hexadecimales',
    ['suelo', 'tatami', 'borde', 'acento'].every(k => HEX.test(paleta[k])), paleta);
check('la paleta sale de la zona del hito',
    paleta.zona === 'COSTA' && paleta.suelo === M.ZONAS.COSTA.color,
    [paleta.zona, paleta.suelo]);
check('aPaleta tolera un id de zona suelto',
    HEX.test(D.aPaleta('MACIZO').suelo));

// ---------------------------------------------------------------------------
section('4. DETERMINISMO');
// ---------------------------------------------------------------------------
check('dos llamadas identicas dan el MISMO dato',
    JSON.stringify(D.buildDioramaData()) === JSON.stringify(D.buildDioramaData()));
check('y lo mismo con el mismo estado de ganados',
    JSON.stringify(D.buildDioramaData({ ganados: { PLAYA_AGUA: 2 } }))
    === JSON.stringify(D.buildDioramaData({ ganados: { PLAYA_AGUA: 2 } })));
check('una escala distinta cambia los datos a proposito',
    D.buildDioramaData({ escala: 1 }).escala === 1
    && D.buildDioramaData({ escala: 1 }).hitos[0].x !== data.hitos[0].x);

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
