/**
 * ============================================================================
 * SANPABLERA ENGINE · tests\tips.smoke.mjs
 * ----------------------------------------------------------------------------
 * QUE LOS TIPS NO SEAN MENTIRA.
 * ============================================================================
 *
 * POR QUE ESTA PRUEBA EXISTE
 *   Un tip dice un numero, y un numero puede quedarse viejo. Si el tip dice
 *   "hay 24 golpes" y el dia que se anaden cuatro son 28, el tip no es una
 *   pista: es una CONTRADICCION, y el jugador que la cuenta pierde la
 *   confianza en los otros veinte.
 *
 *   Los tips de `core/Tips.js` se construyen leyendo las tablas, asi que el
 *   numero sale bien por construccion. Eso NO es suficiente: basta con que
 *   alguien edite el texto de un tip y deje el numero a mano, y volveria a
 *   mentir. Esta prueba comprueba que lo que DICE el tip es lo que dicen las
 *   tablas, ahora y aqui.
 *
 * QUE COMPRUEBA
 *   1. HAY TIPS, Y NO ESTAN VACIOS. Una lista vacia hace que la rueda no
 *      arranque y nadie se entere: es el fallo que no se ve.
 *   2. CADA NUMERO QUE DICE UN TIP ESTA EN SU TABLA. Se cuentan los golpes, las
 *      familias, los escenarios, los recintos y los lugares, y se busca ese
 *      numero DENTRO del texto del tip que le corresponde.
 *   3. LA RUEDA DA LA VUELTA ENTERA Y NO SE SALE. Un indice fuera de rango es
 *      un `undefined` en pantalla.
 *   4. NINGUN TIP DICE UNA FRASE VACIA O SIN ACENTOS ROTOS. Un tip con un
 *      caracter raro se ve roto en la pantalla de carga, que es lo primero que
 *      ve el jugador.
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const T = await load('src/core/Tips.js');
const AT = await load('src/core/entities/AttackPoses.js');
const BX = await load('src/core/boxing.js');
const ES = await load('src/core/geo/escenarios.js');
const RG = await load('src/core/geo/rings.js');
const MG = await load('src/core/geo/margarita.js');

const { TIPS, CADA_TIP, tip } = T;

/** El tip cuyo texto habla de `clave`. */
function elQueHablaDe(clave) {
    return TIPS.find(t => t.texto.includes(clave));
}

// ---------------------------------------------------------------------------
section('1. Hay tips, y la rueda puede girar');
// ---------------------------------------------------------------------------
check('hay tips', TIPS.length > 0, TIPS.length);
check('son suficientes para que la rueda no se repita cada dos segundos',
    TIPS.length >= 8, TIPS.length);
check('cada uno tiene titulo y texto', TIPS.every(t => t.titulo && t.texto),
    TIPS.filter(t => !t.titulo || !t.texto).map(t => t.titulo));
check('los titulos son distintos (dos tips con el mismo nombre no se distinguen)',
    new Set(TIPS.map(t => t.titulo)).size === TIPS.length);
check('los textos son distintos',
    new Set(TIPS.map(t => t.texto)).size === TIPS.length);
check('cambian cada cinco segundos, que es lo pedido',
    CADA_TIP === 5000, CADA_TIP);
check('la rueda esta en positivo (un intervalo negativo no gira, rompe)',
    CADA_TIP > 0 && Number.isFinite(CADA_TIP));

// ---------------------------------------------------------------------------
section('2. Los numeros de cada tip estan en su tabla');
// ---------------------------------------------------------------------------
const golpes = Object.keys(AT.MOVE_SILHOUETTES).length;
const familias = new Set(Object.values(AT.MOVE_SILHOUETTES)).size;
const jab = Object.values(AT.MOVE_SILHOUETTES).filter(f => f === 'JAB').length;

const tGolpes = elQueHablaDe('golpes repartidos');
check('existe el tip de los golpes compartidos', !!tGolpes);
if (tGolpes) {
    check('dice los ' + golpes + ' golpes que hay de verdad',
        tGolpes.texto.includes(String(golpes)), golpes);
    check('dice las ' + familias + ' familias que hay de verdad',
        tGolpes.texto.includes(String(familias)), familias);
    check('y que el jab lo comparten ' + jab,
        tGolpes.texto.includes(String(jab)), jab);
}

const tStance = TIPS.find(t => t.texto.includes('moveset'));
check('existe el tip de las posturas', !!tStance);
if (tStance) {
    check('dice las ' + BX.STANCE_CYCLE.length + ' del abanico',
        tStance.texto.includes(String(BX.STANCE_CYCLE.length)), BX.STANCE_CYCLE.length);
}
const tStance2 = elQueHablaDe('posturas en total');
if (tStance2) {
    check('dice las ' + BX.ALL_STANCES.length + ' posturas en total',
        tStance2.texto.includes(String(BX.ALL_STANCES.length)), BX.ALL_STANCES.length);
}

const tEsc = elQueHablaDe('escenarios cruzando');
if (tEsc) {
    check('dice los ' + ES.ESCENARIOS.length + ' escenarios',
        tEsc.texto.includes(String(ES.ESCENARIOS.length)), ES.ESCENARIOS.length);
}
const tRing = elQueHablaDe('recintos');
if (tRing) {
    check('dice los ' + RG.RINGS.length + ' recintos',
        tRing.texto.includes(String(RG.RINGS.length)), RG.RINGS.length);
}
const tIsla = elQueHablaDe('lugares y no estan todos abiertos');
if (tIsla) {
    check('dice los ' + MG.LUGARES.length + ' lugares',
        tIsla.texto.includes(String(MG.LUGARES.length)), MG.LUGARES.length);
}

// Y los cuatro modos de ring out, que el tip los enumera por nombre.
const tRO = elQueHablaDe('modo');
if (tRO) {
    for (const m of Object.values(ES.RING_OUT)) {
        check('el tip de ring out menciona el modo ' + m, tRO.texto.includes(m), m);
    }
}

// ---------------------------------------------------------------------------
section('3. La rueda da la vuelta y no se sale');
// ---------------------------------------------------------------------------
const recorrido = [];
for (let i = -3; i < TIPS.length + 3; i++) recorrido.push(tip(i));
check('con indices negativos tambien sale un tip (un % sin signo rompe)',
    recorrido.every(t => t && t.texto), recorrido.filter(t => !t).length);
check('y no sale ninguno de fuera',
    recorrido.every(t => TIPS.includes(t)));
check('da la vuelta entera y vuelve al primero',
    tip(-1) === tip(TIPS.length - 1) && tip(TIPS.length) === TIPS[0]);

// ---------------------------------------------------------------------------
section('4. Nada de caracteres rotos en lo primero que ve el jugador');
// ---------------------------------------------------------------------------
// Un caracter roto en la pantalla de carga no es un detalle: es la primera
// frase del juego, y se ve antes que el menu.
const sucios = TIPS.filter(t => /[\u4e00-\u9fff\ufffd]/.test(t.titulo + t.texto));
check('ningun tip tiene caracteres rotos', sucios.length === 0,
    sucios.map(t => t.titulo));
// El titulo se imprime en MAYUSCULAS, asi que tiene que survive a ese viaje.
// Lo que no puede pasar es que se imprima vacio o con un caracter raro, que es
// lo que se veria en pantalla. La primera version de esta comprobacion pedia
// que el titulo ya llegara en mayusculas, y es una exigencia falsa: el titulo
// se escribe en normale y lo convierte el codigo al imprimir.
const raros = TIPS.filter(t => !t.titulo.toUpperCase() || /[\u4e00-\u9fff\ufffd]/.test(t.titulo.toUpperCase()));
check('todos los titulos sobreviven a ponerse en mayusculas',
    raros.length === 0, raros.map(t => t.titulo));
const largos = TIPS.filter(t => t.texto.length > 150);
check('ningun texto es tan largo que no quepa en la tarjeta',
    largos.length === 0, largos.map(t => t.titulo + ': ' + t.texto.length));

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
