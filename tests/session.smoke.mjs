/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/session.smoke.mjs
 * ----------------------------------------------------------------------------
 * La SESION: como un KO se convierte en Cobre, avance de cuadro y ciclo.
 * Es el pegamento que el navegador no puede testear, aqui con reloj manual.
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

const S = await load('src/core/modes/session.js');

section('1 · Crear una sesion segun el modo');
{
    const basica = S.createSession({ modo: 'CLASICO', jugadores: ['P1', 'P2'] });
    check('el modo por defecto es clasico', S.createSession().modo === 'CLASICO');
    check('la sesion clasica no trae cuadro', basica.royale === null);
    check('ni campana', basica.campana === null);
    check('arranca con monedero en cero', basica.wallet.saldo.COBRE === 0);
    check('la fase es ACTIVA', basica.fase === S.FASE_SESION.ACTIVA);
    check('el duelo son los dos elegidos', S.dueloActual(basica).a === 'P1' && S.dueloActual(basica).b === 'P2');

    const ry = S.createSession({ modo: 'ROYALE', jugadores: ['ana', 'bob', 'curro', 'dia'], seed: 7 });
    check('el Royale crea cuadro', !!ry.royale);
    check('y ya esta peleando', S.dueloActual(ry).a === 'ana', S.dueloActual(ry));
    check('la sesion diorama no crea cuadro', S.createSession({ modo: 'DIORAMA', jugadores: ['a', 'b'] }).royale === null);

    const camp = S.createSession({ modo: 'CAMPAÑA', jugadores: ['P1', 'P2'], seed: 7 });
    check('la campana crea estado narrativo', !!camp.campana);
    check('y ya tiene un primer ciclo', camp.campana.ciclo >= 1, camp.campana.ciclo);
    check('el reparto inicial no esta vacio',
        camp.campana.bando.tatami.length + camp.campana.bando.afueras.length > 0, camp.campana.bando);
}

section('2 · Un KO solo cuenta si cae uno del duelo');
{
    const s = S.createSession({ modo: 'CLASICO', jugadores: ['P1', 'P2'] });
    check('sin caidos no hay evento', S.registrarKO(s, { P1: 100, P2: 80 }) === null);
    const conExtra = S.registrarKO(S.createSession({ jugadores: ['P1', 'P2'] }), { P1: 0, P2: 80, OTRO: 0 });
    check('un caido ajeno al duelo no lo deshace', conExtra && conExtra.ganador === 'P2', conExtra);
    const t = S.createSession({ modo: 'CLASICO', jugadores: ['P1', 'P2'] });
    check('doble KO no decide', S.registrarKO(t, { P1: 0, P2: 0 }) === null);
    const u = S.createSession({ modo: 'CLASICO', jugadores: ['P1', 'P2'] });
    check('el perdedor cae y el otro gana', S.registrarKO(u, { P1: 0, P2: 30 }, 100).ganador === 'P2');
}

section('3 · La victoria paga Cobre y solo una vez por duelo');
{
    const s = S.createSession({ modo: 'CLASICO', jugadores: ['P1', 'P2'] });
    const e = S.registrarVictoria(s, 'P1', 'P2', 1000);
    check('se paga el premio del modo', e.premio === S.RECOMPENSA.CLASICO, e);
    check('el monedero lo recibe', s.wallet.saldo.COBRE === 20, s.wallet.saldo);
    check('se escribe en el historial', s.historial.length === 1);
    check('la ronda avanza', s.ronda === 1);
    check('el ganador ajeno no cobra dos veces', S.registrarVictoria(s, 'OTRO', 'P1') === null);
    check('el saldo no cambio', s.wallet.saldo.COBRE === 20);
    check('el contacto actualiza lastSeen', s.wallet.lastSeen === 1000, s.wallet.lastSeen);

    const d = S.createSession({ modo: 'DIORAMA', jugadores: ['P1', 'P2'], lugar: 'EL_MORRO' });
    const e2 = S.registrarVictoria(d, 'P2', 'P1', 1001);
    check('el diorama paga mas', e2.premio === S.RECOMPENSA.DIORAMA, e2);
    check('el lugar se contabiliza', d.ganados.EL_MORRO === 1, d.ganados);
    const e3 = S.registrarVictoria(d, 'P2', 'P1', 1002);
    check('ganar dos veces suma dos victorias', d.ganados.EL_MORRO === 2 && e3.premio === S.RECOMPENSA.DIORAMA);
}

section('4 · Royale: el cuadro avanza y el campeon cobra el bono');
{
    const s = S.createSession({
        modo: 'ROYALE', seed: 7,
        jugadores: ['ana', 'bob', 'curro', 'dia']
    });
    const e1 = S.registrarVictoria(s, 'bob', 'ana', 100);
    check('primera semifinal pagada', e1.premio === S.RECOMPENSA.ROYALE, e1);
    check('el siguiente duelo son los otros dos', S.dueloActual(s).a === 'curro', S.dueloActual(s));
    S.registrarVictoria(s, 'curro', 'dia', 200);
    check('la final ya esta armada', S.dueloActual(s).a === 'bob' && S.dueloActual(s).b === 'curro', S.dueloActual(s));
    const e3 = S.registrarVictoria(s, 'bob', 'curro', 300);
    check('el campeon se proclama', e3.campeon === 'bob' && s.campeon === 'bob', e3);
    check('el bono entra en el premio', e3.premio === S.RECOMPENSA.ROYALE + S.RECOMPENSA.CAMPEON, e3);
    check('la sesion se cierra', s.fase === S.FASE_SESION.FINALIZADA);
    check('el total es 2 semifinales + final', s.wallet.saldo.COBRE === 30 * 2 + 130, s.wallet.saldo);
    check('no se puede seguir ganando', S.registrarVictoria(s, 'bob', 'curro') === null);
    check('el relevo se delega al modulo', S.relevo(s, 'dia', 10).ok === false);
    check('tick sin Royale devuelve false', S.tickSesion(S.createSession(), 10) === false);
}

section('5 · Campana: los lugares abiertos cambian y el ciclo avanza');
{
    const s = S.createSession({ modo: 'CAMPAÑA', jugadores: ['P1', 'P2'], seed: 11, lugar: 'PLAYA_AGUA' });
    const cicloInicial = s.campana.ciclo;
    const e = S.registrarVictoria(s, 'P1', 'P2', 10);
    check('la victoria paga el premio de campana', e.premio === S.RECOMPENSA.CAMPAÑA, e);
    check('el ciclo avanza', s.campana.ciclo > cicloInicial, [cicloInicial, s.campana.ciclo]);
    check('el lugar queda registrado', s.ganados.PLAYA_AGUA === 1, s.ganados);
    check('el evento guarda el ciclo', e.ciclo === s.campana.ciclo, e);
    check('el resumen se puede leer', typeof S.textoCampana(s) === 'string' && S.textoCampana(s).length > 10, S.textoCampana(s));
    check('sin campana el resumen es vacio', S.textoCampana(S.createSession()) === '');
    check('la HUD menciona modo, ronda y Cobre',
        S.lineaHUD(s).includes('CAMPAÑA') && S.lineaHUD(s).includes('Cobre'), S.lineaHUD(s));
}

section('6 · Guardado de la sesion');
{
    const s = S.createSession({ modo: 'CAMPAÑA', jugadores: ['P1', 'P2'], seed: 3, lugar: 'EL_MORRO' });
    S.registrarVictoria(s, 'P1', 'P2', 55);
    const t = S.serializeSession(s);
    check('el texto es compacto', t.length < 3000, t.length);
    const copia = S.deserializeSession(t);
    check('el modo sobrevive', copia.modo === 'CAMPAÑA');
    check('el Cobre sobrevive', copia.wallet.saldo.COBRE === s.wallet.saldo.COBRE);
    check('la ronda sobrevive', copia.ronda === s.ronda);
    check('los lugares sobreviven', copia.ganados.EL_MORRO === 1, copia.ganados);
    check('la campana se reconstruye', !!copia.campana && copia.campana.ciclo === s.campana.ciclo);
    check('el historial se conserva', copia.historial.length === s.historial.length);
    let versionMala = false;
    try { S.deserializeSession('{"v":99}'); } catch (_) { versionMala = true; }
    check('una version futura se rechaza', versionMala);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
