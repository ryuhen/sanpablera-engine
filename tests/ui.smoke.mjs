/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/ui.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de los DATOS de las pantallas de menu:
 *
 *   1. El LEXICONARIO de jerga del muro (ui/graffiti/lexicon.js): que no haya
 *      palabras rotas, rollos desconocidos ni jerga repetida.
 *   2. Los GRAFITEROS (ui/graffiti/writers.js): que cada uno tenga paleta,
 *      rollo, jerga y brocha, y que el del dia sea estable.
 *   3. El VESTUARIO (ui/wardrobe.js): que el catalogo este sano, que el ciclo
 *      de ropa cierre, y que las piezas soltables digan con que arma se usan.
 *
 * Son modulos PUROS: sin DOM ni BABYLON, asi que se ejecutan en Node. Eso es
 * justo lo que permite ajustar el contenido del juego sin arrancar el motor.
 *
 * Ejecutar:  node tests/ui.smoke.mjs
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

function section(title) {
    console.log('\n' + title);
}

const lex = await load('src/ui/graffiti/lexicon.js');
const writers = await load('src/ui/graffiti/writers.js');
const wardrobe = await load('src/ui/wardrobe.js');

// ---------------------------------------------------------------------------
section('1. Lexiconario · la jerga del muro');
// ---------------------------------------------------------------------------
{
    const problemas = lex.validate();
    check('el diccionario no tiene ni un problema', problemas.length === 0, problemas);

    check('hay palabras de calle', lex.count() > 50, lex.count());
    check('estan los paises del Caribe', ['PR', 'RD', 'CU', 'JM'].every((p) => lex.REGION_WORDS[p]));
    check('esta Latinoamerica tambien',
        ['MX', 'CO', 'AR', 'PE', 'EC', 'GT'].every((p) => lex.REGION_WORDS[p]));

    // Toda palabra tiene que ser usable: rollo conocido, sin acentos rotos.
    const todas = lex.allWords();
    check('toda palabra tiene rollo valido',
        todas.every((w) => lex.ROLLS.includes(w.roll)));
    check('toda palabra tiene tono valido',
        todas.every((w) => lex.TONES.includes(w.tone)));
    check('ninguna palabra se queda con la tilde de escape',
        todas.every((w) => !lex.unescapeTag(w.word).includes('~')));
    check('ninguna palabra queda vacia',
        todas.every((w) => lex.unescapeTag(w.word).trim().length > 0));

    // La palabra con "Co~Niza" tiene que salir con la o acentuada de verdad:
    // es lo que la brocha pinta.
    // Se comparan los CODEPOINTS, no los literales: este archivo se lee como
    // CP1252 en algunos editores de Windows, y un "Ñ" escrito a mano llega al
    // Node como otra cosa y el test falla sin que el codigo este mal. Con los
    // codepoints no hay forma de que se confunda.
    const cp = (s) => Array.from(s).map((c) => c.codePointAt(0).toString(16)).join(' ');
    check('CO~NIZA sale con enye MAYUSCULA (codepoint d1), no minuscula',
        cp(lex.unescapeTag('CO~NIZA')) === '43 4f d1 49 5a 41', cp(lex.unescapeTag('CO~NIZA')));
    check('PA~NANO sale con enye mayuscula',
        cp(lex.unescapeTag('PA~NANO')) === '50 41 d1 41 4e 4f', cp(lex.unescapeTag('PA~NANO')));
    check('una vocal en minuscula sale acentuada en minuscula (f3 = o)',
        cp(lex.unescapeTag('c~o')) === '63 f3', cp(lex.unescapeTag('c~o')));
    check('el escape ~a en mayusculas da A mayuscula acentuada (c1)',
        cp(lex.unescapeTag('E~A~DE')) === '45 c1 44 45', cp(lex.unescapeTag('E~A~DE')));
    // `~N` es enye, NO una N acentuada: por eso "NO~PE" no lleva tilde ninguna,
    // es un caso de paso (el `~` se come y la palabra queda "NOPE").
    check('NO~PE se queda sin tilde (la ~N era una enye, no una N acentuada)',
        cp(lex.unescapeTag('NO~PE')) === '4e 4f 50 45', cp(lex.unescapeTag('NO~PE')));
    check('MALA~E se acentua aunque la letra no sea vocal',
        cp(lex.unescapeTag('MALA~E')) === '4d 41 4c 41 c9', cp(lex.unescapeTag('MALA~E')));
    check('una tilde suelta se quita y no rompe la palabra',
        cp(lex.unescapeTag('A~QUI')) === '41 51 55 49', cp(lex.unescapeTag('A~QUI')));
    check('una tilde suelta se quita sin romper nada',
        lex.unescapeTag('A~QUI') === 'AQUI', lex.unescapeTag('A~QUI'));

    // El墙上 picking tiene que ser determinista (mismo seed = mismo muro) y sin
    // repetir, que es lo que hace que el muro no baile mientras carga.
    const a = lex.pickWords({ seed: 42, count: 9 });
    const b = lex.pickWords({ seed: 42, count: 9 });
    check('pickWords con la misma semilla da lo mismo',
        JSON.stringify(a) === JSON.stringify(b));
    check('pickWords no repite palabra',
        new Set(a.map((w) => w.word)).size === a.length);
    check('pickWords pide 9 y entrega 9', a.length === 9, a.length);

    const otro = lex.pickWords({ seed: 43, count: 9 });
    check('distinta semilla da otro muro',
        JSON.stringify(a) !== JSON.stringify(otro));

    // Restringir a paises: un grafitero de la isla no habla de Mexico.
    const isla = lex.pickWords({ seed: 7, count: 5, paises: ['PR', 'RD', 'CU'] });
    check('con paises, solo sale jerga de esos paises',
        isla.every((w) => ['PR', 'RD', 'CU'].includes(w.pais)),
        isla.map((w) => w.pais));

    // Los pesos del rollo tienen que ganar: quien solo hace throwies no
    // puede salir con cinco wildstyles.
    const soloThrowie = lex.pickWords({
        seed: 9, count: 12,
        weights: { throwie: 100, wildstyle: 0, sticker: 0, chrome: 0, slab: 0, stencil: 0 }
    });
    check('los pesos tiran hacia el rollo pedido',
        soloThrowie.filter((w) => w.roll === 'throwie').length >= 10,
        soloThrowie.map((w) => w.roll));

    // La palabra grande del centro tiene que ser de los rollos que mandan.
    const palabras = lex.pickWords({ seed: 5, count: 12 });
    const heroe = lex.pickHeroWord({ seed: 5, words: palabras });
    check('hay palabra heroe', !!heroe);
    check('la heroe es grande (slab, wildstyle o stencil)',
        heroe && ['slab', 'wildstyle', 'stencil'].includes(heroe.roll), heroe && heroe.roll);

    // Pocas palabras por grafitero: si pide mas de las que hay, no debe reventar.
    // Pedir mas de las que hay: tiene que devolver TODAS las del diccionario
    // (las palabras del juego van aparte), ni una mas ni una menos.
    // Pedir mas de las que hay tiene que devolver TODAS, ni una mas ni una menos.
    // SIN paises, `pickWords` saca de `allWords()` (calle + juego), asi que el
    // tope es `allWords().length`. Con `juego: false` sale solo de la calle y el
    // tope pasa a ser `count()`. Los dos caminos se comprueban.
    const tope = lex.allWords().length;
    check('el conjunto completo cabe en el tope',
        tope === lex.count() + lex.GAME_WORDS.length,
        { allWords: tope, calle: lex.count(), juego: lex.GAME_WORDS.length });

    const todas2 = lex.pickWords({ seed: 1, count: 9999 });
    check('pedir de mas devuelve el conjunto entero, sin pasarse',
        todas2.length === tope, { recibidas: todas2.length, tope });
    check('y no repite ninguna',
        new Set(todas2.map((w) => w.word)).size === todas2.length);

    const soloCalle = lex.pickWords({ seed: 1, count: 9999, juego: false });
    check('con juego:false sale solo la calle',
        soloCalle.length === lex.count(),
        { recibidas: soloCalle.length, calle: lex.count() });
    check('y ninguna es palabra del juego',
        soloCalle.every((w) => !lex.GAME_WORDS.some((g) => g.word === w.word)));

    // El bucle tiene que terminar siempre: el `i < objetivo*6 + pool.length` es
    // lo que evita que pedir 9999 cuelgue el proceso.
    check('el tope no se pasa con ninguna semilla',
        [0, 1, 7, 42, 999].every((s) => lex.pickWords({ seed: s, count: 9999 }).length <= tope));
    check('sin palabras de ese pais devuelve vacio', lex.pickWords({ seed: 1, count: 5, paises: ['ZZ'] }).length === 0);
}

// ---------------------------------------------------------------------------
section('2. Grafiteros · quien pinta el muro');
// ---------------------------------------------------------------------------
{
    check('hay entre 5 y 6 grafiteros',
        writers.WRITERS.length >= 5 && writers.WRITERS.length <= 6,
        writers.WRITERS.length);

    // Toda paleta declarada tiene que existir de verdad. Antes `paletteOf` caia
    // a una paleta por defecto y un typo en la clave pasaba desapercibido.
    for (const w of writers.WRITERS) {
        check(`${w.id}: la paleta "${w.paleta}" existe de verdad`,
            writers.paletteOf(w) !== null);
    }
    check('una paleta inexistente devuelve null en vez de callarse',
        writers.paletteOf({ id: 'X', paleta: 'NO_EXISTE' }) === null);

    for (const w of writers.WRITERS) {
        check(`${w.id}: tiene id, nombre, de y bio`,
            !!(w.id && w.nombre && w.de && w.bio));
        check(`${w.id}: el rollo es del vocabulario`,
            Object.keys(w.rolls || {}).every((r) => lex.ROLLS.includes(r)),
            Object.keys(w.rolls || {}));
        check(`${w.id}: todos sus rolls tienen peso > 0`,
            Object.values(w.rolls || {}).every((n) => n > 0));
        check(`${w.id}: usa paises que existen en el diccionario`,
            (w.paises || []).every((p) => lex.REGION_WORDS[p]),
            w.paises);
        check(`${w.id}: tiene firma`, !!w.firma);
        check(`${w.id}: pinta encima o debajo`, ['encima', 'debajo'].includes(w.capa));
    }

    // La brocha tiene que tener los cuatro parametros que usa la pintura.
    for (const w of writers.WRITERS) {
        const b = writers.brushFor(w);
        check(`${w.id}: la brocha tiene speed, hold, jitter, drip y spray`,
            ['speed', 'hold', 'jitter', 'drip', 'spray'].every((k) => typeof b[k] === 'number'),
            b);
    }

    // El del dia: mismo dia = mismo grafitero. Es lo que hace que el muro sea
    // coherente dentro de la misma sesion y cambie al dia siguiente.
    const hoy = writers.writerOfTheDay(20261009);
    const hoy2 = writers.writerOfTheDay(20261009);
    check('el grafitero del dia es estable', hoy.id === hoy2.id, [hoy.id, hoy2.id]);

    const manana = writers.writerOfTheDay(20261010);
    check('cambia de dia a dia', hoy.id !== manana.id, [hoy.id, manana.id]);

    // Con una semilla rara, el grafitero tiene que caer dentro de la lista.
    for (let s = 0; s < 40; s++) {
        const w = writers.writerOfTheDay(s);
        if (!w || !writers.WRITERS.find((x) => x.id === w.id)) {
            check('semilla ' + s + ' cae en un grafitero real', false, w && w.id);
            break;
        }
    }
    check('todas las semillas caen en un grafitero real', true);

    // La paleta tiene que tener los colores que la pintura busca.
    for (const w of writers.WRITERS) {
        const p = writers.paletteOf(w);
        check(`${w.id}: la paleta tiene from, to, halo, accent, drips, bg`,
            ['from', 'to', 'halo', 'accent', 'drips', 'bg'].every((k) => /^#[0-9a-fA-F]{6}$/.test(p[k] || '')),
            p);
    }

    check('byId devuelve null si no existe', writers.byId('NO_EXISTE') === null);
    check('writerIds lista a todos',
        writers.writerIds().length === writers.WRITERS.length);
}

// ---------------------------------------------------------------------------
section('3. Vestuario · los atuendos');
// ---------------------------------------------------------------------------
{
    const problemas = wardrobe.validate();
    check('el catalogo no tiene ni un problema', problemas.length === 0, problemas);

    check('hay al menos 6 atuendos', wardrobe.OUTFITS.length >= 6, wardrobe.OUTFITS.length);

    // El ciclo de ropa: la pieza clave del boton de patada.
    for (const fighter of ['PEDRO', 'JUAN', 'JOSE', 'MARIA', 'JOHN', 'JANE', 'CARLOS', 'ANA']) {
        const lista = wardrobe.outfitsFor(fighter);
        check(`${fighter}: tiene atuendos para elegir`, lista.length >= 4, lista.length);
        check(`${fighter}: el suyo va primero`,
            wardrobe.defaultFor(fighter).id === lista[0].id,
            [wardrobe.defaultFor(fighter).id, lista[0].id]);
    }

    // El ciclo tiene que dar la vuelta completa y volver al principio.
    for (const fighter of ['PEDRO', 'JANE']) {
        const lista = wardrobe.outfitsFor(fighter);
        let actual = lista[0].id;
        const vistos = [actual];
        for (let i = 0; i < lista.length - 1; i++) {
            actual = wardrobe.nextOutfit(fighter, actual);
            vistos.push(actual);
        }
        check(`${fighter}: el ciclo recorre todos los atuendos sin repetir`,
            new Set(vistos).size === lista.length, vistos);
        check(`${fighter}: el ciclo vuelve al principio`,
            wardrobe.nextOutfit(fighter, actual) === lista[0].id,
            [actual, lista[0].id]);
    }

    // Un atuendo desconocido no puede romper el ciclo.
    check('nextOutfit con algo desconocido arranca por el primero',
        wardrobe.nextOutfit('PEDRO', 'NO_EXISTE') === wardrobe.outfitsFor('PEDRO')[0].id);

    // El color de cada grupo: el torso es el color de reserva.
    const o = wardrobe.outfitById('CANCHA');
    check('el torso tiene color', !!wardrobe.colorOf(o, 'torso'));
    check('los pies tienen color propio', wardrobe.colorOf(o, 'pies') === '#ffd23f');
    check('un grupo desconocido cae al torso',
        wardrobe.colorOf(o, 'INVENTADO') === wardrobe.colorOf(o, 'torso'));
    check('la cabeza cae a la piel base si no la pone',
        wardrobe.colorOf(wardrobe.outfitById('CANCHA'), 'cabeza') === '#c8a58a');

    // Las piezas soltables: el futuro desarme de la fase 4 depende de esto.
    const oro = wardrobe.outfitById('ORO');
    const sueltos = wardrobe.loosePiecesOf(oro);
    check('ORO tiene una pieza que se puede quitar', sueltos.length === 1, sueltos.length);
    check('la pieza suelta dice con que arma se usa', !!sueltos[0].arma, sueltos[0]);
    check('la pieza suelta es de las que se pueden sacar', sueltos[0].soltable === true);

    // Todos los extras del catalogo tienen que estar vivos.
    let extrasTotales = 0;
    for (const at of wardrobe.OUTFITS) {
        extrasTotales += wardrobe.extrasOf(at).length;
        for (const e of wardrobe.extrasOf(at)) {
            if (e.soltable && !e.arma) {
                check(at.id + ': "' + e.tipo + '" es soltable pero no dice arma', false);
            }
        }
    }
    check('hay adornos en el catalogo', extrasTotales > 0, extrasTotales);

    check('outfitById de algo falso da null', wardrobe.outfitById('NO_EXISTE') === null);
    check('outfitIds lista a todos', wardrobe.outfitIds().length === wardrobe.OUTFITS.length);

    // Todos los peleadores del roster tienen que tener un atuendo real.
    const roster = await load('src/core/roster.js');
    const peleadores = roster.ROSTER || [];
    check('el roster tiene peleadores', peleadores.length > 0, peleadores.length);
    for (const f of peleadores) {
        const at = wardrobe.defaultFor(f.id);
        check(`${f.id} (${f.name}): tiene un atuendo que existe`, !!at && !!at.id, at && at.id);
    }
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(64));
console.log(`resultado: ${passed} ok, ${failed} fallos`);
console.log('='.repeat(64));
if (failed > 0) process.exit(1);
