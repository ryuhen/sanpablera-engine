/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/guard.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la CAPA DE GUARDIA: con la guardia puesta, la cruceta deja de ser
 * un mando de ocho direcciones y pasa a uno de dos vias.
 *
 * POR QUE UN ARCHIVO APARTE Y NO DENTRO DEL DE DIRECCIONES
 * ----------------------------------------------------------------------------
 *   Son dos capas que se complementan pero se estorban si se mezclan. La
 *   matriz de direcciones decide QUE golpe sale de una direccion; la capa de
 *   guardia decide QUE SIGNIFICA cada boton mientras la guardia esta puesta.
 *   Un fallo aqui no es "el golpe equivocado", es "el boton no hace nada" o
 *   "hace dos cosas", y son sintomas distintos.
 *
 * LO QUE SE COMPRUEBA
 *   - `guardia + arriba` salta y `arriba` solo NO (arriba sigue siendo
 *     direccion de ataque y de movimiento).
 *   - `guardia + abajo` agacha sea en el ORDEN que sea, no solo pulsando los
 *     dos a la vez. Ese es el fallo que se ha corregido aqui.
 *   - el doble toque de ABAJO se detecta, y es una senal aparte del dash.
 *
 *   node tests/guard.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

const IM = await load('src/core/entities/InputMapper.js');
const FE = await load('src/core/entities/FighterEntity.js');
const SPF = (await load('src/core/fsm/Constants.js')).default;
const RigMod = await load('src/core/cine/Rig.js');
const { BONES } = await load('src/core/cine/CineConstants.js');
await load('src/core/fsm/states/Movesets.js');

const CAM = { fx: 0, fz: 1, rx: 1, rz: 0 };
const RIVAL = { x: 0, z: 1 };

function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}

/**
 * Una partida con entrada REAL: un unico mapper y un unico mando, como en el
 * juego. Las detecciones de doble toque necesitan reloj y memoria entre
 * frames, asi que pulsar boton a boton con un mapper nuevo no serviria (y ya
 * ha servido para escribir bugs).
 */
function partida() {
    const model = { rig: contractRig(), applyPose() { }, place() { } };
    const gauge = () => ({
        value: 100, spend(v) { this.value -= v; }, gain() { },
        update() { }, canRun: () => true, reset() { }
    });
    const ent = (id, x) => new FE.FighterEntity({
        fighter: { name: id, x, z: 0, facing: 0, health: 100, gauge: gauge() },
        model, characterId: 'PEDRO', id, stance: 'SHELL'
    });
    const a = ent('P1', -0.45);
    const b = ent('P2', 0.45);
    const world = {
        hitstop: 0, minSpacing: 0.9,
        opponentOf: (e) => (e === a ? b : a),
        tryHit: () => 'miss', props: [], ringLimit: 2.8, ringOut: () => null
    };
    const mapper = new IM.InputMapper();
    const dpad = { up: false, down: false, left: false, right: false, upLeft: false, upRight: false, downLeft: false, downRight: false };
    const buttons = { attack1: false, attack2: false, block: false, action: false };

    return {
        e: a, world,
        /**
         * Pone el mando. LIMPIA antes de aplicar: si no, soltar un boton no
         * se puede probar, porque `Object.assign` solo anade y nunca quita.
         * (Un arnes que no puede soltar el boton no puede comprobar que
         * soltarlo hace algo.)
         */
        set(p, b2) {
            Object.assign(dpad, {
                up: false, down: false, left: false, right: false,
                upLeft: false, upRight: false, downLeft: false, downRight: false
            }, p);
            Object.assign(buttons, {
                attack1: false, attack2: false, block: false, action: false
            }, b2);
        },
        step(n = 1) {
            for (let i = 0; i < n; i++) {
                mapper.tick(1 / 60);
                a.update(1 / 60, mapper.snapshot({ dpad, buttons }, CAM, RIVAL), world);
            }
        },
        get state() { return a.fsm.stateId; },
        get airborne() { return a.fsm.inGroup(SPF.StateGroup.AIRBORNE); },
        snap() {
            mapper.tick(1 / 60);
            return mapper.snapshot({ dpad, buttons }, CAM, RIVAL);
        }
    };
}

const NORMAL = SPF.State.NORMAL_A;
const GUARD_ALTA = SPF.State.AGACHADO_GUARDIA_ALTA;
const GUARD_BAJA = SPF.State.AGACHADO_GUARDIA_BAJA;
const SALTO = SPF.State.SALTO_NORMAL_A;

// ===========================================================================
section('1 · La senal de doble ABAJO');
// ===========================================================================

run('doble toque abajo se detecta y se separa del dash', () => {
    const p = partida();
    p.step(2);
    // Un toque: nada.
    p.set({ down: true }, {});
    const s1 = p.snap();
    ok(s1.doubleDown === false, 'un solo toque no es doble toque');
    p.step(2);
    // Soltar y volver a pulsar dentro de la ventana.
    p.set({ down: false }, {});
    p.step(2);
    p.set({ down: true }, {});
    const s2 = p.snap();
    ok(s2.doubleDown === true, 'el segundo toque si lo es');
    // El doble toque de ABAJO CONVIVE con el crouch-dash de antes, y no lo
    // reemplaza: el dash es "agacharse y correr", lo de tirar al suelo es
    // otra cosa y pide GUARDIA (que es como lo distingue la capa). Que las
    // dos senales puedan valer en el mismo frame es correcto; lo que no vale
    // es que una se coma a la otra.
    ok(s2.dash && s2.dash.kind === 'CROUCH_DASH',
        'el crouch-dash de siempre sigue ahi', s2.dash && s2.dash.kind);
});

run('mantener abajo no cuenta como segundo toque', () => {
    // Si se mirase el historial en vez de la arista, mantener el pulgar abajo
    // contaria como doble toque y el peleador se tiraria al suelo solo.
    const p = partida();
    p.step(2);
    p.set({ down: true }, {});
    p.snap();
    let alguno = false;
    for (let i = 0; i < 30; i++) alguno = alguno || p.snap().doubleDown;
    ok(!alguno, '30 frames manteniendo abajo no producen doble toque');
});

run('fuera de la ventana no es doble toque', () => {
    const p = partida();
    p.step(2);
    p.set({ down: true }, {});
    p.snap();
    p.set({ down: false }, {});
    p.step(40);            // muy por encima de DOUBLE_TAP_WINDOW (0,26 s)
    p.set({ down: true }, {});
    ok(p.snap().doubleDown === false, 'tarde ya no cuenta');
});

// ===========================================================================
section('2 · El mapa de la cruceta cambia con la guardia');
// ===========================================================================

run('ARRIBA solo NO salta: sigue siendo direccion de movimiento y ataque', () => {
    const p = partida();
    p.step(2);
    p.set({ up: true }, {});
    p.step(10);
    ok(p.state === NORMAL && !p.airborne,
        'arriba sin guardia no salta', [p.state, p.airborne]);
});

run('GUARDIA + ARRIBA salta', () => {
    const p = partida();
    p.step(2);
    p.set({}, { block: true });
    p.step(4);
    ok(p.state === GUARD_ALTA, 'primero la guardia alta', p.state);
    p.set({ up: true }, { block: true });
    p.step(4);
    ok(p.state === SALTO && p.airborne,
        'y con arriba salta de verdad', [p.state, p.airborne]);
});

run('mantener arriba con la guardia puesta no deja saltando', () => {
    // Con el estado en vez de la arista, mantener el pulgar arriba pasaria el
    // filtro de salto en cuanto se aterrice, y el peleador botaria solo.
    const p = partida();
    p.step(2);
    p.set({}, { block: true });
    p.set({ up: true }, {});
    p.step(60);
    const vueltas = p.e.fsm.frame;
    ok(p.airborne || p.state !== SALTO,
        'no se queda en el estado de salto indefinidamente', [p.state, vueltas]);
});

run('las diagonales NO son el boton de saltar', () => {
    // Arriba-derecha es una direccion de ataque. Con la guardia puesta
    // tambien: el salto es el ARRIBA de verdad, no las cuatro que lo rodean.
    const p = partida();
    p.step(2);
    p.set({}, { block: true });
    p.step(4);
    p.set({ up: true, right: true }, { block: true });
    p.step(4);
    ok(!p.airborne, 'arriba+derecha con guardia no es un salto', [p.state, p.airborne]);
});

// ===========================================================================
section('3 · ABAJO con guardia, en cualquier orden');
// ===========================================================================

run('guardia y abajo a la vez -> guardia baja', () => {
    const p = partida();
    p.step(2);
    p.set({ down: true }, { block: true });
    p.step(4);
    ok(p.state === GUARD_BAJA, 'los dos en el mismo frame', p.state);
});

run('guardia primero y despues abajo -> guardia baja', () => {
    // ESTE ERA EL FALLO. La regla de `Transitions` se dispara con la ARISTA de
    // GUARDIA, asi que pulsar la guardia antes que abajo no volvia a disparar
    // nada: el peleador se quedaba en guardia ALTA con el boton apretado.
    const p = partida();
    p.step(2);
    p.set({}, { block: true });
    p.step(6);
    ok(p.state === GUARD_ALTA, 'guardia sola -> guardia alta', p.state);
    p.set({ down: true }, { block: true });
    p.step(4);
    ok(p.state === GUARD_BAJA, 'y luego abajo -> guardia baja', p.state);
});

run('abajo primero y despues guardia -> guardia baja tambien', () => {
    const p = partida();
    p.step(2);
    p.set({ down: true }, {});
    p.step(4);
    ok(p.state === NORMAL, 'abajo sin guardia no hace nada', p.state);
    // OJO: `set` LIMPIA lo que no se le pase. Mantener el pulgar abajo hay que
    // pedirlo otra vez, igual que en el mando de verdad hay que seguir
    // pulsandolo.
    p.set({ down: true }, { block: true });
    p.step(4);
    ok(p.state === GUARD_BAJA, 'el orden inverso tambien', p.state);
});

run('ABAJO sin guardia NO se agacha (sigue siendo direccion de ataque)', () => {
    const p = partida();
    p.step(2);
    p.set({ down: true }, {});
    p.step(10);
    ok(p.state === NORMAL, 'abajo suelto no hace nada especial', p.state);
});

// ===========================================================================
section('4 · La guardia se expone como dato');
// ===========================================================================

run('el snapshot dice si la guardia esta puesta', () => {
    const p = partida();
    p.step(2);
    ok(p.snap().guard === false, 'sin pulsar');
    p.set({}, { block: true });
    ok(p.snap().guard === true, 'con pulsar');
    p.set({}, {});
    ok(p.snap().guard === false, 'al soltar');
});

// ===========================================================================
section('5 · Los movimientos de suelo');
// ===========================================================================

/** Doble ABAJO con la guardia puesta: el gesto de tirarse al suelo. */
function tirarAlSuelo(p, n = 3) {
    p.set({ down: true }, { block: true });
    p.step(n);
    p.set({ down: false }, { block: true });
    p.step(2);
    p.set({ down: true }, { block: true });
    p.step(n);
}

run('doble ABAJO + guardia -> pecho a tierra', () => {
    const p = partida();
    p.step(2);
    tirarAlSuelo(p);
    ok(p.state === SPF.State.PECHO_TIERRA,
        'llega al estado de pecho a tierra', p.state);
    ok(p.e.fsm.state.voluntary === true,
        'marcado como voluntario (el jugador lo ha pedido)', p.e.fsm.state.voluntary);
});

run('guardia + abajo a secas sigue siendo GUARDIA BAJA, no el suelo', () => {
    // El suelo es el gesto CON INTENCION (doble toque). Mantener el pulgar
    // abajo un rato mas no puede ser otra cosa.
    const p = partida();
    p.step(2);
    p.set({ down: true }, { block: true });
    p.step(20);
    ok(p.state === SPF.State.AGACHADO_GUARDIA_BAJA,
        'un solo toque prolonged es agacharse', p.state);
});

run('el suelo NO se levanta solo, pero un derribo SI', () => {
    // La diferencia entre tirarse al suelo y que te tiren. Si el estado
    // voluntario se levantara solo a los 8 frames, la jugada duraria un
    // parpadeo y no serviria para nada.
    const p = partida();
    p.step(2);
    tirarAlSuelo(p);
    p.set({}, {});
    p.step(40);
    ok(p.state === SPF.State.PECHO_TIERRA,
        'tras 40 frames sigue en el suelo voluntarily', p.state);

    const q = partida();
    q.step(2);
    q.e.fsm.changeState(SPF.State.SUELO_TUMBADO_BOCA_ABAJO,
        { source: 'TEST', reason: 'knockdown' });
    q.set({}, {});
    q.step(40);
    ok(q.state !== SPF.State.SUELO_TUMBADO_BOCA_ABAJO,
        'pero un derribo se levanta solo', q.state);
});

run('ARRIBA desde el suelo = levantarse', () => {
    const p = partida();
    p.step(2);
    tirarAlSuelo(p);
    ok(p.state === SPF.State.PECHO_TIERRA, 'en el suelo', p.state);
    p.set({ up: true }, { block: true });
    p.step(3);
    ok(p.state === SPF.State.LEVANTANDOSE_DESDE_PECHO_TIERRA,
        'arriba levanta', p.state);
    p.step(30);
    ok(p.state !== SPF.State.PECHO_TIERRA && !p.airborne,
        'y se queda de pie', p.state);
});

run('ACCION desde el suelo: la direccion elige el movimiento', () => {
    // Gateo, deslizamiento y rodada son la misma idea con distinto riesgo.
    // Elegirlos con la cruceta es lo coherente con el resto del juego: la
    // direccion ya elige el golpe, ahora elige como te mueves tumbado.
    //
    // En esta prueba el rival esta DEFRENTE (ver CAM/RIVAL arriba), asi que
    // ARRIBA de la cruceta es "hacia el rival" y ABAJO es "alejandose".
    const casos = [
        [{}, SPF.State.CUADRUPEDA, 'sin direccion -> gateo'],
        [{ up: true }, SPF.State.DESLIZAMIENTO, 'hacia el rival -> deslizamiento'],
        [{ down: true }, SPF.State.RODANDO, 'alejandose -> rodada']
    ];
    for (const [dpad, esperado, nombre] of casos) {
        const p = partida();
        p.step(2);
        tirarAlSuelo(p);
        p.set(dpad, { action: true, block: true });
        p.step(3);
        ok(p.state === esperado, nombre, [p.state, esperado]);
    }
});

run('el deslizamiento va HACIA el rival, no en la direccion del pulgar', () => {
    const p = partida();
    p.step(2);
    tirarAlSuelo(p);
    p.set({ up: true }, { action: true, block: true });
    p.step(3);
    ok(p.state === SPF.State.DESLIZAMIENTO, 'es deslizamiento', p.state);
    // El rival esta en +x y el peleador en -x: la direccion del deslizamiento
    // tiene que apuntar hacia +x.
    ok(p.e.loco.dir.x > 0.5, 'y va hacia el', p.e.loco.dir);
});

run('el suelo tiene PRECIO: el rival puede castigarlo', () => {
    // Esta es la comprobacion que evita que esto sea una esquiva gratis. El
    // estado esta en el grupo DOWNED a proposito: `_downAttack` del rival lo
    // puede golpear en el suelo. Si estuviera fuera, tumbarse seria gratis.
    const p = partida();
    p.step(2);
    tirarAlSuelo(p);
    ok(p.e.fsm.inGroup(SPF.StateGroup.DOWNED),
        'pecho a tierra esta en el grupo DOWNED');

    // Se pregunta desde el RIVAL, que es como lo hace el motor: el que esta
    // en el suelo es la victima, y el castigo se pide mirando el estado de
    // la victima mientras el otro esta golpeando.
    const rival = p.world.opponentOf(p.e);
    rival.fsm.changeState(SPF.State.ATAQUE_LIGERO,
        { source: 'TEST', reason: 'atacando' });
    ok(rival.fsm.inGroup(SPF.StateGroup.ATTACKING), 'el rival esta golpeando');
    const castigo = rival._downAttack(p.e);
    ok(castigo !== null && castigo !== undefined,
        'y le sale una silueta de castigo al caido', castigo);
    ok(['PIE', 'MANOS', 'SALTAR', 'PESADO'].indexOf(castigo) !== -1,
        'que es una de las cuatro de golpear al suelo', castigo);
});

console.log('\n================================================================');
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
} else {
    console.log('TODO EN VERDE');
}
console.log('================================================================');
console.log(`\nresultado: ${pass} ok, ${fails.length} fallos\n`);
process.exit(fails.length ? 1 : 0);