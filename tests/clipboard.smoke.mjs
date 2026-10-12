/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/clipboard.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del TABLERO DE CLIPS (core/anim/ClipBoard.js) y del RELOJ
 * (core/anim/ClipPlayer.js), mas la cobertura real de la biblioteca.
 *
 * QUE COMPRUEBA, Y POR QUE CADA COSA
 * ----------------------------------------------------------------------------
 *   1. LOS 71 ESTADOS TIENEN CLIP ..... el tablero es el unico sitio donde se
 *      decide que animacion es cada estado. Si un estado nuevo se registra y no
 *      se anade aqui, cae al idle en mitad de una animacion y no hay ningun
 *      error: solo un maniqui que no hace nada.
 *   2. LA JERARQUIA SE RESPETA ........ un estado puede estar en varios grupos
 *      a la vez (JUGGLER esta en AIRBORNE, IMPACT y STUNNED). El orden decide
 *      que se ve, y si el orden se rompe el peleador se queda flotando con la
 *      cara de reposo mientras le barren.
 *   3. EL GOLPE MANDA SOBRE EL ESTADO . es lo que hace que la matriz de
 *      direcciones se vea: el mismo ATAQUE_LIGERO sale con silueta de gancho
 *      si la cruceta dice gancho.
 *   4. NO HAY NINGUN HUECO ............. la union del tablero y la biblioteca
 *      tiene que cubrir cada clip que el tablero puede pedir. Un clip pedido y
 *      ausente es un "cae a reposo" silencioso.
 *   5. EL RELOJ ...................... un clip nuevo arranca en cero, un ciclo
 *      acumula, y volver al mismo clip NO reinicia el paso a mitad.
 *   6. LA MESA REDONDA ................ la respuesta es TOTAL: ni un estado, ni
 *      un grupo, ni un nombre de clip raro pueden devolver `undefined`.
 *
 * Ejecutar:  node tests/clipboard.smoke.mjs
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

const SPF = (await load('src/core/fsm/Constants.js')).default;
const Cat = await load('src/core/fsm/StateCatalog.js');
await load('src/core/fsm/states/index.js');
const B = await load('src/core/anim/ClipBoard.js');
const L = await load('src/core/anim/ClipLibrary.js');
const P = await load('src/core/anim/ClipPlayer.js');
const { ClipPlayer } = P;

const ESTADOS = Cat.allStates();

const bib = L.crearBiblioteca({
    locoPose: () => ({ rot: {}, pos: {} }),
    attackPose: () => ({ rot: {}, pos: {} }),
    stancePoseFn: () => ({ rot: {}, pos: {} })
});

// ===========================================================================
section('1. LOS 71 ESTADOS TIENEN CLIP');
// ===========================================================================

check('el catalogo tiene estados que probar', ESTADOS.length >= 60, ESTADOS.length);

// Cada estado, con la locomocion en cada posture, tiene que resolver a un
// clip REAL. Se prueban las tres locomociones porque un estado sin fila propia
// (NORMAL_A) cae ahi, y si la tabla de locomocion tuviera un hueco, ese estado
// seria el que se quedaria quieto.
const huerfanos = [];
for (const s of ESTADOS) {
    for (const loco of ['IDLE', 'WALK', 'RUN']) {
        const r = B.resolver({
            id: s.id, groups: s.groups, posture: s.posture, loco: loco, move: 'ATAQUE_LIGERO'
        });
        if (!r || !r.clip || typeof r.clip !== 'string') {
            huerfanos.push(s.name + '@' + loco + ' -> ' + JSON.stringify(r));
        }
    }
}
check('ningun estado se queda sin clip en ningun estado de locomocion',
    huerfanos.length === 0, huerfanos);

// El origen tambien tiene que ser uno de los cinco declarados: un origen
// inventado significa que alguien metio una rama nueva sin documentarla.
const origenes = new Set(ESTADOS.map(s =>
    B.resolver({ id: s.id, groups: s.groups, posture: s.posture, loco: 'IDLE', move: 'ATAQUE_LIGERO' }).origen));
check('el origen de cada estado es uno de los cinco del tablero',
    [...origenes].every(o => Object.values(B.ORIGEN).includes(o)), [...origenes]);

// `sinClip` es el informe: tiene que salir vacio.
check('el informe de estados sin clip sale vacio', B.sinClip(ESTADOS).length === 0, B.sinClip(ESTADOS));

// ===========================================================================
section('2. LA JERARQUIA SE RESPETA');
// ===========================================================================

const buscar = (nombre) => ESTADOS.find(s => s.name === nombre);
const ctx = (s, extra = {}) => ({
    id: s.id, groups: s.groups, posture: s.posture, loco: 'IDLE',
    move: 'ATAQUE_LIGERO', ...extra
});

check('el impacto gana al aire (JUGGLER esta en los dos grupos)',
    B.resolver(ctx(buscar('JUGGLER'))).clip === 'juggle',
    B.resolver(ctx(buscar('JUGGLER'))));
check('y SIN_AIRE tambien es reaccion, no caida',
    B.resolver(ctx(buscar('SIN_AIRE'))).clip === 'juggle_dead',
    B.resolver(ctx(buscar('SIN_AIRE'))));

check('un estado de guardia NO es el idle', (() => {
    const r = B.resolver(ctx(buscar('AGACHADO_GUARDIA_ALTA')));
    return r.clip === 'crouch_guard_high';
})());

check('boca abajo y boca arriba se ven distinto', (() => {
    const prone = B.resolver(ctx(buscar('SUELO_TUMBADO_BOCA_ABAJO'))).clip;
    const supine = B.resolver(ctx(buscar('SUELO_TUMBADO_BOCA_ARRIBA'))).clip;
    return prone === 'down_prone' && supine === 'down_supine';
})());

check('levantarse de agachado y del suelo son clips distintos', (() => {
    const a = B.resolver(ctx(buscar('LEVANTANDOSE_DESDE_AGACHADO'))).clip;
    const b = B.resolver(ctx(buscar('LEVANTANDOSE_DESDE_PECHO_TIERRA'))).clip;
    return a === 'wakeup_crouch' && b === 'wakeup_prone';
})());

check('PECHO_TIERRA y BOCA_ABAJO comparten clip (son el mismo cuerpo)', (() => {
    const a = B.resolver(ctx(buscar('PECHO_TIERRA'))).clip;
    const b = B.resolver(ctx(buscar('SUELO_TUMBADO_BOCA_ABAJO'))).clip;
    return a === b;
})());

// Los treinta estados de agarre tienen que verse de MAS DE UNA forma. Si todos
// salieran al mismo clip, el suelo no tendria dueno y la posicion seria
// decoracion: es exactamente el fallo que `ground/position.js` vino a evitar.
const agarres = ESTADOS.filter(s => s.groups.includes('GRAPPLE'));
const clipsAgarre = new Set(agarres.map(s => B.resolver(ctx(s)).clip));
check('los ' + agarres.length + ' estados de agarre se ven de varias maneras',
    clipsAgarre.size >= 8, { estados: agarres.length, clips: [...clipsAgarre] });

// Y el de arriba y el de abajo TIENEN que verse distintos: si no, no hay suelo.
check('el de arriba del suelo NO se ve como el de abajo', (() => {
    const uke = B.resolver(ctx(buscar('AGARRE_SUELO_UKE'))).clip;
    const tori = B.resolver(ctx(buscar('AGARRE_SUELO_TORI'))).clip;
    return uke !== tori && uke.startsWith('rv_bottom') && tori.startsWith('rv_top');
})(), { uke: B.resolver(ctx(buscar('AGARRE_SUELO_UKE'))).clip, tori: B.resolver(ctx(buscar('AGARRE_SUELO_TORI'))).clip });

// ===========================================================================
section('3. EL GOLPE MANDA SOBRE EL ESTADO');
// ===========================================================================

const atkLight = buscar('ATAQUE_LIGERO');
check('el estado ATAQUE_LIGERO NO tiene clip propio (el golpe lo decide)',
    B.CLIP_DE_ESTADO[atkLight.id] === null, B.CLIP_DE_ESTADO[atkLight.id]);

const porGolpe = {};
for (const g of ['ATAQUE_LIGERO', 'GANCHO', 'UPPERCUT', 'PUNO_ADELANTE_DER',
    'PATADA_FRONTAL', 'PATADA_SPIN_IZQ', 'BARRIDO_DER', 'PUNO_AEREO_IZQ']) {
    porGolpe[g] = B.resolver(ctx(atkLight, { move: g })).clip;
}
check('el mismo ATAQUE_LIGERO sale con siluetas distintas segun el golpe',
    new Set(Object.values(porGolpe)).size >= 5, porGolpe);
check('y sale por la fila GOLPE de la jerarquia',
    B.resolver(ctx(atkLight, { move: 'GANCHO' })).origen === B.ORIGEN.GOLPE);

// Un golpe de aire nunca puede salir con el clip de un golpe de pie.
check('un golpe en el aire no usa el clip de un golpe de pie', (() => {
    const aire = B.clipDeGolpe('PUNO_AEREO_ADELANTE_IZQ');
    const pie = B.clipDeGolpe('ATAQUE_LIGERO');
    return aire === 'atk_air' && pie !== aire;
})());

// La familia se deduce del nombre, y el orden de los patrones importa:
// `PATADA_SPIN_*` tiene que ganar a `PATADA_*`.
check('PATADA_SPIN es giro, no frontal', B.familiaDe('PATADA_SPIN_IZQ') === B.FAMILIA.GIRO, B.familiaDe('PATADA_SPIN_IZQ'));
check('PATADA_BAJA es baja, no lateral', B.familiaDe('PATADA_BAJA_ALTA_IZQ') === B.FAMILIA.BAJA, B.familiaDe('PATADA_BAJA_ALTA_IZQ'));
check('un golpe desconocido cae en el recto y NO rompe',
    B.clipDeGolpe('NO_EXISTE') === B.clipDeGolpe('ATAQUE_LIGERO'));

// Dos golpes de la misma familia se ven igual a proposito: la familia ES la
// lectura visual. Comprobado para que nadie "arregle" la tabla rompiendo esto.
const par = B.clipDeGolpe('PUNO_ADELANTE_IZQ');
const par2 = B.clipDeGolpe('PUNO_ATRAS_DER');
check('los golpes de una familia comparten clip (es lo que significa familia)',
    par === par2, { par, par2 });

// ===========================================================================
section('4. NO HAY NINGUN HUECO: EL TABLERO Y LA BIBLIOTECA CUADRAN');
// ===========================================================================

// TODO lo que el tablero puede pedir, en las tres entradas: estados, golpes y
// locomocion. Si un nombre sale aqui y no existe en la biblioteca, el motor
// cae a reposo sin decir nada.
const pedidos = new Set();
for (const s of ESTADOS) {
    pedidos.add(B.resolver({ id: s.id, groups: s.groups, posture: s.posture, loco: 'IDLE', move: 'ATAQUE_LIGERO' }).clip);
}
for (const l of Object.keys(B.CLIP_DE_LOCO)) pedidos.add(B.CLIP_DE_LOCO[l]);
for (const g of ['ATAQUE_LIGERO', 'ATAQUE_PESADO', 'ATAQUE_ESPECIAL', 'ATAQUE_AEREO',
    'ATAQUE_AGACHADO', 'ATAQUE_BARRIDO', 'GANCHO', 'GOLPE_CODO', 'UPPERCUT',
    'EMBESTIDA', 'DERIBO', 'SP_GANCHO', 'SP_BOTELLAZO', 'ST_COSTILLAS',
    'ST_PROYECCION', 'RUN_CHARGE_PUNCH', 'RUN_TAKEDOWN_RUN']) {
    pedidos.add(B.clipDeGolpe(g));
}

const ausentes = [...pedidos].filter(n => !L.tieneClip(bib, n)).sort();
check('los ' + pedidos.size + ' clips que pide el tablero existen en la biblioteca',
    ausentes.length === 0, ausentes);

// La cobertura del informe tiene que dar 100% sobre lo que el juego pide.
const cov = L.cobertura(bib, [...pedidos]);
check('el informe dice 100% de cobertura', cov.cobertura === 1,
    { hay: cov.hay, faltan: cov.faltan, total: cov.total });

// Y ningun clip de la biblioteca puede quedarse sin generador.
const sinGenerador = L.nombres(bib).filter(n => typeof bib[n].generador !== 'function');
check('ningun clip registrado sin generador', sinGenerador.length === 0, sinGenerador);

// Todo lo que el motor pedia antes (la lista de `clips.smoke.mjs`) tiene que
// seguir existiendo: la tabla nueva no puede romper la vieja.
const VIEJOS = ['idle', 'walk', 'run', 'step', 'step_long', 'dash_side', 'backdash',
    'slide', 'roll', 'side_step', 'sprint_f', 'crouch', 'crouch_guard_high',
    'crouch_guard_low', 'jump', 'fall', 'slow_fall', 'hop', 'land', 'air_recover',
    'acrobatics', 'atk_light', 'atk_heavy', 'atk_special', 'atk_crouch', 'atk_air', 'atk_sweep'];
const perdidos = VIEJOS.filter(n => !L.tieneClip(bib, n));
check('los 26 clips de antes siguen existiendo', perdidos.length === 0, perdidos);

// ===========================================================================
section('5. EL RELOJ DE LOS CLIPS');
// ===========================================================================

const reloj = new ClipPlayer();
check('un reloj nuevo no tiene clip', reloj.clip === null);

reloj.avanzar('idle', 1 / 60, 0);
check('el primer clip arranca en el frame en que se ve, no en el siguiente',
    reloj.clip === 'idle' && reloj.t > 0 && reloj.cambios === 1, reloj.info());

const tTras10 = (() => { for (let i = 0; i < 9; i++) reloj.avanzar('idle', 1 / 60, i / 60); return reloj.t; })();
check('el MISMO clip acumula en vez de reiniciar', tTras10 > 0.15, { t: tTras10 });

// Cambiar de clip es lo que reinicia, y es lo unico que lo reinicia.
const antes = reloj.t;
reloj.avanzar('atk_light', 1 / 60, 10 / 60);
check('cambiar de clip vuelve a cero', reloj.t < antes && reloj.clip === 'atk_light', reloj.info());
check('y cuenta el cambio', reloj.cambios === 2, reloj.cambios);

// Volver al clip anterior NO se confondido con "el mismo clip de antes": es un
// jab nuevo, y un jab empieza por el principio. Este es el fallo que hacia que
// el segundo jab saliera a medias.
reloj.avanzar('idle', 1 / 60, 11 / 60);
reloj.avanzar('atk_light', 1 / 60, 12 / 60);
reloj.avanzar('idle', 1 / 60, 13 / 60);
check('volver al idle es un clip nuevo otra vez (no se reanuda a medias)',
    reloj.clip === 'idle' && reloj.t < 0.02, reloj.info());

// Un dt cero (pausa) no debe mover el reloj ni romper nada.
const quieto = new ClipPlayer();
quieto.avanzar('idle', 0, 0);
const t0 = quieto.t;
quieto.avanzar('idle', 0, 0);
check('un frame de dt 0 no avanza el reloj', quieto.t === t0, quieto.info());

// Un dt NEGATIVO tampoco: el engine unclamp en una pausa y un reloj que corre
// para atras es un ciclo que gira al reves.
const neg = new ClipPlayer();
neg.avanzar('idle', 0.016, 0);
const tn = neg.t;
neg.avanzar('idle', -0.5, -0.5);
check('un dt negativo no hace correr el reloj para atras', neg.t >= tn, neg.info());

// El corte: un cambio de mundo entero no debe mezclarse.
const corte = new ClipPlayer();
corte.avanzar('idle', 0.016, 0);
corte.corte();
check('el corte se puede pedir', corte.info().corte === true);

corte.reset();
check('reset vacia el reloj', corte.clip === null && corte.cambios === 0, corte.info());

// ===========================================================================
section('6. LA RESPUESTA ES TOTAL');
// ===========================================================================

check('resolver sin contexto no rompe', (() => {
    const r = B.resolver();
    return r && r.clip === B.REPOSO && r.origen === B.ORIGEN.REPOSO;
})(), B.resolver());
check('resolver con grupos raros no rompe', (() => {
    const r = B.resolver({ id: 999, groups: ['INVENTADO'], posture: null, loco: 'RARO' });
    return r && typeof r.clip === 'string';
})());
check('clipDeGolpe(null) no rompe', typeof B.clipDeGolpe(null) === 'string');
check('clipDeAgarre(null) no rompe', typeof B.clipDeAgarre(null) === 'string');

// ===========================================================================
console.log('\n================================================================');
console.log(`clipboard: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);
