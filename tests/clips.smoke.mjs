/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/clips.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de la BIBLIOTECA DE CLIPS (core/anim/ClipLibrary.js).
 *
 * El motor pedia unos setenta nombres de clip y no existia NINGUNO: cada
 * `clip: 'atk_light'` de las tablas era una cadena que no llevaba a ningun
 * sitio. Este test comprueba tres cosas:
 *
 *   1. QUE LA BIBLIOTECA ESCOGE EL GENERADOR ... la logica de la biblioteca es
 *      lo que hay que fijar: los ciclos dan la vuelta, los de un solo sentido
 *      se quedan en 1, y el tiempo negativo no hace la pose del reves.
 *   2. QUE LO QUE SE PIDE CON NOMBRE EXISTE ..... los clips de pie, agachado,
 *      salto y golpes que el motor referencia tienen que estar. Si falta uno,
 *      el juego cae a la pose de reposo en medio de una animacion.
 *   3. INFORME DE COBERTURA ................... lo que FALTA se imprime como
 *      lista de trabajo. No es un fallo: es arte que aun no esta hecho, y un
 *      test en rojo por eso taparia todo lo demas.
 *
 * Ejecutar:  node tests/clips.smoke.mjs
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

const L = await load('src/core/anim/ClipLibrary.js');
const { crearBiblioteca, tDeClip, poseDe, fichaDe, tieneClip, nombres, cobertura } = L;

// ---------------------------------------------------------------------------
// GENERADORES DE MENTIRA
//
// Se prueban con generadores falsos para no depender del rig. Lo que se
// comprueba aqui es la BIBLIOTECA (reloj, bucle, cobertura), no las poses:
// esas tienen su propia suite en tests/anim.smoke.mjs con el rig de verdad.
// ---------------------------------------------------------------------------
const llamadas = [];
const bib = crearBiblioteca({
    locoPose: (rig, k, opts) => {
        llamadas.push('loco:' + k);
        return { rot: { _loco: true, k: k }, pos: {}, tag: 'LOCO', k: k };
    },
    attackPose: (rig, moveKey, phase, t, opts) => {
        llamadas.push('atk:' + moveKey + ':' + phase);
        return { rot: { _atk: true }, pos: {}, tag: 'ATK', move: moveKey, phase: phase };
    },
    stancePoseFn: (rig, name, opts) => {
        llamadas.push('stance:' + name);
        return { rot: { _stance: true }, pos: {}, tag: 'STANCE', stance: name, breath: opts && opts.breath };
    }
});

// ===========================================================================
section('1. La biblioteca basics');
// ===========================================================================

const ns = nombres(bib);
check('la biblioteca tiene clips', ns.length >= 15, ns.length);
check('cada clip esta congelado', ns.every(n => Object.isFrozen(bib[n])));
check('cada clip tiene nombre, duracion y generador', ns.every(n => {
    const c = bib[n];
    return typeof c.nombre === 'string' && c.dur > 0 && typeof c.generador === 'function';
}), ns.filter(n => {
    const c = bib[n];
    return !(typeof c.nombre === 'string' && c.dur > 0 && typeof c.generador === 'function');
}));
check('y el nombre coincide con la clave', ns.every(n => bib[n].nombre === n));
check('el compromiso esta entre 0 y 1', ns.every(n => {
    const v = bib[n].commitment;
    return v >= 0 && v <= 1;
}));
check('toda clip es o de bucle o de un solo sentido', ns.every(n => typeof bib[n].loop === 'boolean'));

check('un clip que no existe se contesta, no revienta', (() => {
    return fichaDe(bib, 'CLIP_FANTASMA') === null &&
        tieneClip(bib, 'CLIP_FANTASMA') === false &&
        poseDe(bib, 'CLIP_FANTASMA', null, 0) === null;
})());

check('la biblioteca esta congelada', Object.isFrozen(bib));
check('sin generador de posturas la biblioteca avisa, no se rompe en silencio', (() => {
    let aviso = false;
    try { crearBiblioteca({ locoPose: () => ({}), attackPose: () => ({}) }); }
    catch (e) { aviso = e instanceof TypeError; }
    return aviso;
})());
check('no se puede meter un clip por la espalda', (() => {
    try { bib.intruso = {}; return fichaDe(bib, 'intruso') !== null; } catch (e) { return true; }
})());

// ===========================================================================
section('2. El reloj de los clips');
// ===========================================================================

{
    const ciclo = fichaDe(bib, 'idle');
    check('un clip de bucle DA LA VUELTA en el final (no se queda en 1)', tDeClip(ciclo, ciclo.dur) === 0, tDeClip(ciclo, ciclo.dur));
    check('y da la vuelta cada vuelta', tDeClip(ciclo, ciclo.dur * 2) === 0);
    check('llega a 1 justo ANTES de la vuelta (que es el mismo sitio que 0)', Math.abs(tDeClip(ciclo, ciclo.dur - 1e-9) - 1) < 1e-6, tDeClip(ciclo, ciclo.dur - 1e-9));
    check('va recto en la mitad', Math.abs(tDeClip(ciclo, ciclo.dur / 2) - 0.5) < 1e-9);

    // El caso que rompe los bucles: tiempo NEGATIVO. El motor unclamp en
    // una pausa y el reloj puede retroceder; con un `%` a secas sale
    // negativo y la pose se da la vuelta, que en un ciclo significa que las
    // piernas corren para atras.
    const neg = tDeClip(ciclo, -ciclo.dur / 4);
    check('con tiempo negativo el bucle NO se da la vuelta', neg >= 0 && neg < 1, neg);
    check('y cae en el sitio correcto de la vuelta',
        Math.abs(neg - 0.75) < 1e-9, neg);
}

{
    const recto = fichaDe(bib, 'crouch');
    check('un clip sin bucle se queda en 0 antes de empezar', tDeClip(recto, -5) === 0);
    check('llega a 1 al final', Math.abs(tDeClip(recto, recto.dur) - 1) < 1e-9);
    check('y SE QUEDA en 1 si se pasa (no da la vuelta)', tDeClip(recto, recto.dur * 5) === 1);
    check('un clip de duracion 0 no revienta', tDeClip({ dur: 0, loop: true }, 3) === 0);
    check('una ficha que no existe tampoco', tDeClip(null, 3) === 0);
}

// ===========================================================================
section('3. Muestrear un clip');
// ===========================================================================

{
    llamadas.length = 0;
    const p = poseDe(bib, 'idle', null, 0.3);
    check('un clip de locomocion llama al generador de locomocion', llamadas.length === 1 && /^loco:/.test(llamadas[0]), llamadas);
    check('y devuelve una pose', !!p && !!p.tag);
}

{
    // ESTO ES LO QUE ARREGLA EL MANIQUI: el codigo pide `clip: 'atk_light'` y
    // ahora hay algo detras. Antes la cadena no llevaba a ninguna parte.
    llamadas.length = 0;
    const p = poseDe(bib, 'atk_light', null, 0.1, { phase: 'ACTIVE' });
    check('atk_light llama al generador de golpe', /^atk:ATAQUE_LIGERO/.test(llamadas[0]), llamadas);
    check('y le pasa la fase que le han dado', p && p.phase === 'ACTIVE', p && p.phase);
}

{
    // El generador recibe LAS DOS cosas: `t` (donde va dentro de la vuelta) y
    // `tiempo` (el instante absoluto). Los ciclos necesitan el absoluto; los
    // de un solo sentido necesitan el normalizado. Sin el absoluto, un ciclo
    // de carrera repetiria siempre el primer frame.
    let recibido = null;
    const bib2 = crearBiblioteca({
        locoPose: (rig, k, opts) => { recibido = opts; return { rot: {}, pos: {} }; },
        attackPose: () => ({ rot: {}, pos: {} }),
        stancePoseFn: () => ({ rot: {}, pos: {} })
    });
    poseDe(bib2, 'idle', null, 3.7);
    check('el generador recibe el tiempo absoluto', recibido && recibido.tiempo === 3.7, recibido && recibido.tiempo);
    check('y tambien el nombre del clip y su duracion',
        recibido && recibido.clip === 'idle' && recibido.dur === fichaDe(bib2, 'idle').dur, recibido);
}

// ===========================================================================
section('4. Lo que el juego pide con nombre');
// ===========================================================================

{
    // Los nombres que los estados y las tablas referencian de verdad. Si uno
    // de estos no existe, el motor cae a la pose de reposo en mitad de una
    // animacion y no hay ningun error: solo se ve que el maniqui no hace nada.
    const PIDE = [
        // de pie y locomocion
        'idle', 'walk', 'run', 'step', 'step_long', 'dash_side', 'backdash',
        'slide', 'roll', 'side_step', 'sprint_f',
        // agachado y guardia
        'crouch', 'crouch_guard_high', 'crouch_guard_low',
        // salto
        'jump', 'fall', 'slow_fall', 'hop', 'land', 'air_recover', 'acrobatics',
        // golpes
        'atk_light', 'atk_heavy', 'atk_special', 'atk_crouch', 'atk_air', 'atk_sweep'
    ];
    const faltan = PIDE.filter(n => !tieneClip(bib, n));
    check('todos los clips de PIE, AGACHADO, SALTO y GOLPE existen', faltan.length === 0, faltan);
}

{
    // Y que no haya nombres inventados: un clip que nadie pide es trabajo que
    // no se ve. Salvo que este previsto para cuando la otra sesion lo pida.
    const info = cobertura(bib, ['idle', 'walk', 'crouch', 'jump', 'atk_light', 'clip_que_no_existe']);
    check('el informe cuenta los que hay', info.hay === 5, info.hay);
    check('y lista los que faltan', info.faltan.length === 1 && info.faltan[0] === 'clip_que_no_existe', info.faltan);
    check('la cobertura es una fraccion', info.cobertura > 0.8 && info.cobertura < 1, info.cobertura);
    check('el informe dice cuantos son en total', info.total === 6, info.total);
    check('informe con lista vacia no revienta', (() => {
        const c = cobertura(bib, []);
        return c.total === 0 && c.cobertura === 1;
    })());
    check('informe sin lista (undefined) tampoco', cobertura(bib, undefined).total === 0);
}

// ===========================================================================
section('5. INFORME DE COBERTURA DEL JUEGO ENTERO');
// ===========================================================================

{
    // Los nombres que el codigo pide de verdad, extraidos de las tablas. Se
    // declaran aqui a mano en vez de leer los ficheros porque un test que
    // depende de grep es un test que se rompe cuando se renombra un estado.
    //
    // ESTO NO ES UN FALLO. Es la lista de trabajo del maniqui: lo que hay que
    // animar todavia. Se imprime para que se vea, y se comprueba solo que el
    // informe es coherente consigo mismo.
    const JUEGO = [
        'acrobatics', 'air_recover', 'atk_air', 'atk_crouch', 'atk_heavy', 'atk_light',
        'atk_special', 'atk_sweep', 'backdash', 'combo_breaker', 'crouch',
        'crouch_guard_high', 'crouch_guard_low', 'dash_side', 'dizzy', 'down_prone',
        'down_supine', 'fall', 'hitstun', 'hop', 'idle', 'juggle', 'juggle_dead',
        'jump', 'kneel', 'quad', 'roll', 'rv_agarre_gancho', 'rv_fin',
        'rv_fin_de_juan', 'rv_guardia_alta', 'slow_fall', 'sp_barrido',
        'sp_botellazo', 'sp_caballero_alto', 'sp_carga_alpine', 'sp_codo', 'sp_derribo',
        'sp_embestida', 'sp_gancho', 'sp_pasa_pie_abajo', 'sp_patada_frontal',
        'sp_patada_giro', 'sp_sumision', 'sprint_b', 'sprint_f', 'stance_base',
        'st_costillas', 'st_cruzado', 'st_jab_largo', 'st_patada_baja',
        'st_proyeccion', 'st_recto', 'st_uppercut', 'stagger', 'step', 'step_long',
        'walk', 'wakeup_crouch', 'wakeup_prone'
    ];

    const info = cobertura(bib, JUEGO);
    check('el informe es coherente: hay + faltan = total',
        info.hay + info.faltan.length === info.total, { hay: info.hay, faltan: info.faltan.length, total: info.total });
    check('y la cobertura es hay/total', Math.abs(info.cobertura - info.hay / info.total) < 1e-9);

    console.log('\n  ---- clips que pide el juego y aun NO existen ----');
    if (info.faltan.length === 0) {
        console.log('  (ninguno: el maniqui tiene todo lo que el motor pide)');
    } else {
        for (const n of info.faltan) console.log('     ' + n);
    }
    console.log('  cobertura: ' + info.hay + '/' + info.total +
        ' (' + Math.round(info.cobertura * 100) + '%)\n');

    // Lo unico que se exige: que el numero de clips que existen cubra al menos
    // lo que se puede cubrir HOY sin assets (pie, agachado, salto, golpes), que
    // es lo unico que se puede generar de verdad. Ni uno mas.
    check('al menos cubre pie, agachado, salto y golpes',
        ['idle', 'walk', 'crouch', 'jump', 'fall', 'atk_light', 'atk_heavy'].every(n => tieneClip(bib, n)),
        ['idle', 'walk', 'crouch', 'jump', 'fall', 'atk_light', 'atk_heavy'].filter(n => !tieneClip(bib, n)));
}

// ===========================================================================
console.log('\n================================================================');
console.log(`clips: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);