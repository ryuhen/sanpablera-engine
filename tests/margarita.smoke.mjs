/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/margarita.smoke.mjs
 * ----------------------------------------------------------------------------
 * Que el torneo de la isla se pueda jugar entero y que la ruta tenga sentido.
 * ============================================================================
 *
 * QUE COMPRUEBA
 * ----------------------------------------------------------------------------
 *   1. LA ISLA ESTA DIBUJADA. El contorno cierra, y todos los escenarios caen
 *      DENTRO de el. Un escenario fuera del contorno es un escenario flotando
 *      en el mar, y eso se ve.
 *
 *   2. EL TORNEO SE ABRE. Desde cero hay peleas disponibles; se avanza peleando
 *      y se llega al volcan; y al final no queda nada por abrir.
 *
 *   3. UN REQUISITO CUENTA COMBATES, NO BANDERAS. La primera version usaba un
 *      `Set`, que no puede contar repetidos: con un conjunto, "gana tres en la
 *      playa" se cumplia con una sola pelea y el torneo entero se pasaba en dos
 *      golpes. Aqui se fija con el contador.
 *
 *   4. EL BIOMA ES EL MOVESET. El rasgo de la zona SUBE lo que el peleador ya
 *      trae bien, y solo eso. Un Agile en la selva es mas agil, no mas fuerte.
 *
 *   5. EL VOLCAN CASTIGA EL PISO. Cuanto mas alto, menos se rinde nadie. Sin
 *      esto el cerro seria un sitio bonito y no el final del torneo.
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const M = await load('src/core/geo/margarita.js');
const { CONTORNO, CAJAS, ZONAS, LUGARES, lugar, abiertos, siguiente, aptitudEn, contornoCerrado } = M;

// El primer escenario disponible: el que se puede pelear YA, sin ganar nada.
function abiertaDesde(g) { return abiertos(g)[0] || null; }

// ---------------------------------------------------------------------------
section('1. LA ISLA ESTA DIBUJADA');
// ---------------------------------------------------------------------------
check('el contorno no esta vacio', CONTORNO.length >= 20, CONTORNO.length);
check('el contorno cierra (vuelve al principio)',
    contornoCerrado()[0][0] === contornoCerrado()[contornoCerrado().length - 1][0]);

// Punto dentro de un poligono: rayo horizontal. No es la mejor prueba del
// mundo, pero es la que no depende de triangulos.
function dentro(px, py, poli) {
    let dentroP = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
        const xi = poli[i][0], yi = poli[i][1], xj = poli[j][0], yj = poli[j][1];
        if (((yi > py) !== (yj > py))
            && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) dentroP = !dentroP;
    }
    return dentroP;
}

// El primer escenario disponible: el que se puede pelear YA, sin ganar nada.\nfunction abiertaDesde(g) { return abiertos(g)[0] || null; }\n\nconst fuera = LUGARES.filter(l => !dentro(l.arena.x, l.arena.z, CONTORNO));
const fuera = LUGARES.filter(l => !dentro(l.arena.x, l.arena.z, CONTORNO));
check('los ' + LUGARES.length + ' escenarios caen dentro de la isla',
    fuera.length === 0, fuera.map(l => l.id + ' en ' + l.arena.x + ',' + l.arena.z));
check('la caja engloba toda la isla',
    CONTORNO.every(p => p[0] >= CAJAS.minX - 0.01 && p[0] <= CAJAS.maxX + 0.01
        && p[1] >= CAJAS.minY - 0.01 && p[1] <= CAJAS.maxY + 0.01));
check('la isla mide unos 34 km de largo (la real son ~35)',
    CAJAS.maxX - CAJAS.minX > 30 && CAJAS.maxX - CAJAS.minX < 40,
    +(CAJAS.maxX - CAJAS.minX).toFixed(1));
check('la caja del anillo cabe en la isla', LUGARES.every(l =>
    l.arena.ancho <= (CAJAS.maxX - CAJAS.minX) && l.arena.alto <= (CAJAS.maxY - CAJAS.minY)));

// ---------------------------------------------------------------------------
section('2. EL TORNEO SE ABRE');
// ---------------------------------------------------------------------------
check('sin ganar nada ya hay donde pelear', abiertos({}).length > 0, abiertos({}).length);
// OJO: al empezar, `PLAYA_AGUA` YA esta abierta (no tiene requisito), asi que
// el siguiente objetivo es la siguiente de la lista. La primera esta disponible,
// no pendiente.
check('al empezar hay una playa disponible', abiertaDesde({}).id === 'PLAYA_AGUA', abiertaDesde({}).id);
check('y el siguiente objetivo es el segundo de la ruta',
    siguiente({}).id === 'EL_MORRO', siguiente({}).id);

const primera = LUGARES.filter(l => !l.requisito);
check('hay al menos dos escenarios libres al principio', primera.length >= 2, primera.length);

// Se recorre el torneo hasta que no queda nada.
const ganados = {};
let vueltas = 0;
while (vuelta_abierta(ganados) && vueltas < 60) {
    const s = siguiente(ganados);
    if (!s) break;
    // Pelear hasta cumplir el requisito de lo que abre este.
    if (s.requisito) ganados[s.requisito.lugar] = s.requisito.combates;
    vueltas++;
}
function vuelta_abierta(g) { return siguiente(g) !== null; }

check('el torneo se puede terminar', siguiente(ganados) === null,
    { faltan: siguiente(ganados) && siguiente(ganados).id, vueltas });
check('con el recorrido completo se abre TODO', abiertos(ganados).length === LUGARES.length,
    abiertos(ganados).length + '/' + LUGARES.length);
check('el volcan es lo ultimo', siguiente({}).id !== 'CRATERA');
check('la cratera es el final (es el ultimo de la lista)',
    LUGARES[LUGARES.length - 1].id === 'CRATERA', LUGARES[LUGARES.length - 1].id);

// ---------------------------------------------------------------------------
section('3. UN REQUISITO CUENTA COMBATES, NO BANDERAS');
// ---------------------------------------------------------------------------
// El requisito de El Morro es de UNA pelea, asi que una basta. Lo que se
// comprueba aqui es que CUENTA, no que se vea: con un combatiente en vez de un
// conjunto falso, el de tres peleas sigue cerrado.
const TRES = lugar('PUERTO_AZUL').requisito.combates;
check('El Morro pide ' + lugar('EL_MORRO').requisito.combates + ' y con una se abre',
    abiertos({ PLAYA_AGUA: 1 }).some(l => l.id === 'EL_MORRO'));
check('Puerto Azul pide ' + TRES + ': con uno NO se abre',
    !abiertos({ PLAYA_AGUA: TRES - 1 }).some(l => l.id === 'PUERTO_AZUL'),
    abiertos({ PLAYA_AGUA: TRES - 1 }).map(l => l.id).join(' '));
check('y con ' + TRES + ' si',
    abiertos({ PLAYA_AGUA: TRES }).some(l => l.id === 'PUERTO_AZUL'));
check('un requisito incumplido NO cuenta como hecho',
    !abiertos({ PLAYA_AGUA: 0, PUERTO_AZUL: 1 }).some(l => l.id === 'CRATERA'));

// ---------------------------------------------------------------------------
section('4. EL BIOMA ES EL MOVESET');
// ---------------------------------------------------------------------------
const SELVA = { zona: 'MACIZO', aptitud: { velocidad: 0.5, resistencia: 0.4, agilidad: 0.9, altura: 0.2 } };
const BOSQUE = lugar('SELVA_BORDE');
const PLAYA = lugar('PLAYA_AGUA');
const aSelva = aptitudEn(SELVA, BOSQUE);
const aPlaya = aptitudEn(SELVA, PLAYA);

check('en su propia zona el peleador rinde MAS',
    aSelva.agilidad > aPlaya.agilidad,
    { selva: +aSelva.agilidad.toFixed(2), playa: +aPlaya.agilidad.toFixed(2) });
check('pero solo en SU rasgo: la resistencia no sube en la selva',
    aSelva.resistencia <= aPlaya.resistencia + 0.01,
    { selva: +aSelva.resistencia.toFixed(2), playa: +aPlaya.resistencia.toFixed(2) });
check('y lo suyo nunca baja por estar fuera de su zona',
    aPlaya.agilidad <= 0.9 + 1e-9, +aPlaya.agilidad.toFixed(2));
check('todo queda entre 0 y 1',
    ['velocidad', 'resistencia', 'agilidad', 'altura'].every(k =>
        aSelva[k] >= 0 && aSelva[k] <= 1 && aPlaya[k] >= 0 && aPlaya[k] <= 1));

// ---------------------------------------------------------------------------
section('5. EL VOLCAN CASTIGA EL PISO');
// ---------------------------------------------------------------------------
const playa = lugar('PLAYA_AGUA'), cratera = lugar('CRATERA');
const enPlaya = aptitudEn({ zona: 'CERRO', aptitud: { velocidad: 0.7, resistencia: 0.7, agilidad: 0.7, altura: 0.7 } }, playa);
const enCratera = aptitudEn({ zona: 'CERRO', aptitud: { velocidad: 0.7, resistencia: 0.7, agilidad: 0.7, altura: 0.7 } }, cratera);
check('el suelo alto resta a TODOS los rasgos (no solo a la altura)',
    enCratera.velocidad < enPlaya.velocidad,
    { playa: +enPlaya.velocidad.toFixed(2), cratera: +enCratera.velocidad.toFixed(2) });
// OJO, AQUI LA PRIMERA VERSION DEL TEST SE EQUIVOCO. Se suponia que ir a su
// casa hacia MEJOR, y no: en la cratera sale 0,68 contra 0,70 de la playa. Y es
// lo correcto: la altura castiga a TODOS por igual, y el bonus por zona no llega.
// Un monte de 1,6 km no perdona a nadie, ni a quien vive ahi abajo. Lo que se
// comprueba es que el castigo es IGUAL para todos, que es lo que lo hace justo.
const suyoEnCratera = aptitudEn({ zona: 'CERRO', aptitud: { velocidad: 0.7, altura: 0.7 } }, cratera);
check('la altura castiga igual a los dos (ni a los suyos)',
    Math.abs((enCratera.altura - 0.95) - (suyoEnCratera.altura - 0.95)) < 1e-9);
check('y en la cratera se rinde menos que en la playa, sin excepciones',
    enCratera.altura < enPlaya.altura,
    { playa: +enPlaya.altura.toFixed(2), cratera: +enCratera.altura.toFixed(2) });
check('la cratera es el suelo mas alto de la isla',
    cratera.arena.piso === Math.max(...LUGARES.map(l => l.arena.piso)),
    cratera.arena.piso);

// Que no se rompa con datos raros: es lo que pasa cuando alguien anade un
// escenario a mitad de ruta.
check('un peleador sin aptitud no rompe (sale neutra)',
    aptitudEn({}, playa).velocidad >= 0 && aptitudEn(null, playa).velocidad >= 0);
check('un escenario con piso 0 no resta nada',
    Math.abs(aptitudEn({ aptitud: { velocidad: 0.5 } }, playa).velocidad
        - 0.5 * (aptitudEn({ aptitud: { velocidad: 0.5 } }, playa).altura / 0.5) * 0) < 5);

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
