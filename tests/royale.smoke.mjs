/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/royale.smoke.mjs
 * ----------------------------------------------------------------------------
 * Battle Royale local (PDF seccion 6): cuadro de duelos, relevos, botin
 * segmentado y campeon. Modulo puro: ni Babylon ni DOM.
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
const failed = [];
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); return; }
    const msg = name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '');
    failed.push(msg);
    console.log('  FAIL ' + msg);
}
function section(t) { console.log('\n' + t); }

const R = await load('src/core/modes/battleRoyale.js');

function cuatro() {
    return R.createRoyale({
        seed: 42,
        fighters: [
            { id: 'ana', name: 'Ana', team: 'A' },
            { id: 'bob', name: 'Bob', team: 'B' },
            { id: 'curro', name: 'Curro', team: 'A' },
            { id: 'dia', name: 'Dia', team: 'B' }
        ]
    });
}

section('1 · Cuatro jugadores, dos equipos, duelos cruzados');
{
    const s = cuatro();
    check('hay cuatro jugadores', s.players.length === 4);
    check('empiezan vivos y con la vida llena', s.players.every((p) => p.alive && p.health === 100));
    check('empieza en lobby', s.phase === R.PHASE.LOBBY);
    check('el cuadro tiene semifinales y final', s.rounds.length === 2 && s.rounds[0].length === 2, s.rounds);
    check('A pelea contra B en la primera semifinal',
        s.players.find((p) => p.id === s.rounds[0][0][0]).team !==
        s.players.find((p) => p.id === s.rounds[0][0][1]).team);
    check('start() abre el primer duelo', R.start(s, 0) === true && s.active.a === 'ana' && s.active.b === 'bob', s.active);
    check('la ventana de relevo esta abierta 3 s', s.relayOpenUntil === R.RELAY_WINDOW_MS, s.relayOpenUntil);
    check('start dos veces no hace nada', R.start(s, 0) === false);
    let mal = false;
    try { R.createRoyale({ fighters: ['a'] }); } catch (_) { mal = true; }
    check('con un jugador no se puede crear', mal);
    let repetidos = false;
    try { R.createRoyale({ fighters: ['a', 'a'] }); } catch (_) { repetidos = true; }
    check('los ids repetidos se rechazan', repetidos);
}

section('2 · Relevos solo dentro de la ventana');
{
    const s = cuatro();
    R.start(s, 0);
    const r = R.relay(s, 'curro', 1000);
    check('el companero puede entrar', r.ok && r.entra === 'curro' && r.sale === 'ana', r);
    check('el que pelea ahora es el companero', s.active.a === 'curro', s.active);
    check('el que salio sigue vivo (esta en la banda)', s.players.find((p) => p.id === 'ana').alive === true);
    check('la ventana se cierra con el relevo', s.relayOpenUntil === 0);
    const r2 = R.relay(s, 'ana', 1001);
    check('sin ventana no hay segundo relevo', r2.ok === false && r2.motivo === 'ventana cerrada', r2);

    const s2 = cuatro();
    R.start(s2, 0);
    check('un id inventado no entra', R.relay(s2, 'nadie', 10).ok === false);
    check('quien ya pelea no puede relevarse a si mismo', R.relay(s2, 'bob', 10).motivo === 'ya esta peleando');
    check('tick cierra la ventana al pasar el tiempo', R.tick(s2, R.RELAY_WINDOW_MS + 1) === true && s2.relayOpenUntil === 0);
}

section('3 · Cuadro: eliminados, final y campeon');
{
    const s = cuatro();
    R.start(s, 0);
    let r = R.resolveMatch(s, 'bob', 100);
    check('el ganador pasa y el perdedor muere', r.ok && !s.players.find((p) => p.id === 'ana').alive, r);
    check('sigue la otra semifinal', r.siguiente && r.siguiente[0] === 'curro' && r.siguiente[1] === 'dia', r);
    check('el primer ganador se guarda para la final', s.roundWinners[0] === 'bob', s.roundWinners);

    r = R.resolveMatch(s, 'curro', 200);
    check('la final ya esta lista con los dos ganadores',
        r.final === true && s.rounds[1][0][0] === 'bob' && s.rounds[1][0][1] === 'curro', r);
    check('la final enfrenta a bob y curro', s.active.a === 'bob' && s.active.b === 'curro', s.active);

    r = R.resolveMatch(s, 'bob', 300);
    check('al terminar hay campeon', r.campeon === 'bob' && s.champion === 'bob', r);
    check('la partida pasa a FINISHED', s.phase === R.PHASE.FINISHED);
    check('no se puede resolver otra vez', R.resolveMatch(s, 'bob').ok === false);
    check('el perdedor de la final queda eliminado', !s.players.find((p) => p.id === 'curro').alive);

    const dos = R.createRoyale({ fighters: ['x', 'y'] });
    R.start(dos, 0);
    const r2 = R.resolveMatch(dos, 'y', 0);
    check('con dos jugadores hay una sola final', r2.campeon === 'y' && dos.rounds.length === 1, dos.rounds);
    const otro = cuatro();
    R.start(otro, 0);
    check('un ganador que no pelea se rechaza', R.resolveMatch(otro, 'fuera').ok === false);
}

section('4 · Botin: un objeto por slot, comida apilable');
{
    const s = cuatro();
    check('recoge un arma blanca', R.collect(s, 'ana', 'MACHETE') === true && s.players[0].weapon === 'MACHETE');
    check('cambiar de arma sobrescribe el slot', R.collect(s, 'ana', 'NAVAJA') === true && s.players[0].weapon === 'NAVAJA');
    check('las tres piezas de proteccion son independientes',
        R.collect(s, 'ana', 'CASCO') && R.collect(s, 'ana', 'VENDAJES') && R.collect(s, 'ana', 'COPA') &&
        Object.values(s.players[0].protection).every((x) => x !== null), s.players[0].protection);
    check('vehiculo de escape', R.collect(s, 'ana', 'MOTO') && s.players[0].vehicle === 'MOTO');
    R.collect(s, 'ana', 'PLATANO');
    R.collect(s, 'ana', 'PLATANO');
    check('la comida se apila', s.players[0].food.length === 2, s.players[0].food);
    check('un objeto inventado se rechaza', R.collect(s, 'ana', 'LASER') === false);
    check('un muerto no recoge', R.collect(s, 'bob', 'NAVAJA') === true && (s.players[1].alive = false, R.collect(s, 'bob', 'CADENA') === false));

    const c1 = R.openCrate(s, 'bob', 7);
    const s2 = cuatro();
    const c2 = R.openCrate(s2, 'bob', 7);
    check('el cofre es determinista con la misma semilla', c1.item === c2.item, [c1.item, c2.item]);
}

section('5 · Proteccion segmentada y comida potenciadora');
{
    const s = cuatro();
    const p = s.players[0];
    check('sin proteccion no hay reduccion', R.protectionOf(s, 'ana') === 0);
    R.collect(s, 'ana', 'CASCO');
    R.collect(s, 'ana', 'COPA');
    const reduccion = R.protectionOf(s, 'ana');
    check('casco mas copa suman 0.55', Math.abs(reduccion - 0.55) < 1e-9, reduccion);
    const real = R.damage(s, 'ana', 100);
    check('100 de danio se reducen a 45', real === 45, real);
    check('y la vida baja solo eso', p.health === 55, p.health);
    check('nunca cura', R.damage(s, 'ana', -5) === 0 && p.health === 55);

    p.stamina = 10; p.health = 50;
    R.collect(s, 'ana', 'SOPA');
    check('la sopa da stamina y vida', R.eat(s, 'ana', 'SOPA') && p.stamina === 20 && p.health === 70, [p.stamina, p.health]);
    check('no se puede comer lo que no se lleva', R.eat(s, 'ana', 'SOPA') === false);
}

section('6 · Guardado compacto');
{
    const s = cuatro();
    R.start(s, 0);
    R.collect(s, 'ana', 'MACHETE');
    const t = R.serialize(s);
    check('el texto es corto', t.length < 700, t.length);
    check('incluye semilla, fase y campeon', t.includes('"seed":42') && t.includes('LOBBY') === false && t.includes('"champion":null'));
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
