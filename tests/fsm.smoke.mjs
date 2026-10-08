/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/fsm.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de la FSM, sin dependencias y sin navegador.
 *
 * Que comprueba:
 *   1. El catalogo cubre TODOS los estados del enum (y no inventa ids).
 *   2. Todas las transiciones apuntan a estados que existen.
 *   3. La tabla de agarres (postura x papel) esta completa.
 *   4. La simulacion a paso fijo es DETERMINISTA: la misma secuencia de inputs
 *      produce la misma secuencia de estados.
 *   5. Las reglas de combate: hitstun, knockdown, orientacion de caida,
 *      limite de juggle, air recovery, APC, guardia alta/baja.
 *   6. El agarre: el TORI ataca, el UKE escapa, la prioridad decide y los dos
 *      luchadores terminan en el sitio correcto.
 *
 * Ejecutar:  node tests/fsm.smoke.mjs
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

// ---------------------------------------------------------------------------
// Carga de modulos (ver loader.mjs: los .js del proyecto son ES modules y el
// package.json sigue siendo CommonJS porque server.js usa require)
// ---------------------------------------------------------------------------
const SPF = (await load('src/core/fsm/Constants.js')).default;
const catalog = await load('src/core/fsm/StateCatalog.js');
const statesIndex = await load('src/core/fsm/states/index.js');
const transitions = (await load('src/core/fsm/Transitions.js')).default;
const MoveTable = (await load('src/core/fsm/MoveTable.js')).default;
const { StateMachine } = await load('src/core/fsm/StateMachine.js');
const { registerCharacterStances, characterStanceDefs } =
    await load('src/core/fsm/states/CharacterStates.js');
const { GrappleSession } = await load('src/core/fsm/GrappleSession.js');

const { State, StateGroup, Phase, HitLevel, Intent, GrappleRole, GrappleStance, GrappleAction } = SPF;

// ---------------------------------------------------------------------------
// 1. Catalogo
// ---------------------------------------------------------------------------
section('1. Catalogo de estados');
const report = statesIndex.catalogReport();
check('el enum esta cubierto', report.validation.ok, report.validation.missing);
check('no hay ids fuera del enum', report.validation.extra.length === 0, report.validation.extra);
check('hay mas de 10 estados', report.total > 10, report.total);
check('estados de suelo', report.total >= 60, report.total);

// ---------------------------------------------------------------------------
// 2. Transiciones
// ---------------------------------------------------------------------------
section('2. Tabla de transiciones');
const profile = catalog.createProfile('BASE');
const tval = transitions.validateTargets(profile);
check('todos los destinos existen', tval.ok, tval.missing);

// ---------------------------------------------------------------------------
// 3. Agarre
// ---------------------------------------------------------------------------
section('3. Sistema de agarre (UKE / TORI)');
const GRAPPLE_STANCES = Object.keys(SPF.GrappleStance);
let grappleComplete = true;
const missingGrapple = [];
for (const stance of GRAPPLE_STANCES) {
    for (const role of [GrappleRole.UKE, GrappleRole.TORI]) {
        const id = SPF.grappleState(stance, role);
        if (id == null || !profile.has(id)) {
            grappleComplete = false;
            missingGrapple.push(stance + '/' + role);
        }
    }
}
check('todas las posturas x papeles existen', grappleComplete, missingGrapple);

const pieUke = profile.get(SPF.grappleState(GrappleStance.PIE, GrappleRole.UKE));
const pieTori = profile.get(SPF.grappleState(GrappleStance.PIE, GrappleRole.TORI));
check('el UKE no puede atacar en el agarre', pieUke.control.canAct === false);
check('el TORI si puede atacar en el agarre', pieTori.control.canAct === true);
check('el UKE solo puede escapar',
    pieUke.grapple.actions[GrappleAction.ESCAPE] !== null &&
    pieUke.grapple.actions[GrappleAction.ATACAR] === null &&
    pieUke.grapple.actions[GrappleAction.PROYECCION] === null &&
    pieUke.grapple.actions[GrappleAction.SUMISION] === null);
// Los clips se indexan por VisualFacing ('FRENTE_A_CAMARA' / 'ESPALDA_A_CAMARA'),
// no por el sufijo: el sufijo ('__f' / '__b') es lo que lleva el NOMBRE del clip.
const F = SPF.VisualFacing.FRENTE_A_CAMARA;
const B = SPF.VisualFacing.ESPALDA_A_CAMARA;
check('el agarre define las 4 animaciones',
    ['ATACAR', 'ESCAPE', 'PROYECCION', 'SUMISION']
        .every((a) => pieTori.grapple.actions[a] && pieTori.grapple.actions[a].clips[F]));
check('cada animacion tiene su variante de frente y de espaldas',
    ['ATACAR', 'ESCAPE', 'PROYECCION', 'SUMISION']
        .every((a) => pieTori.grapple.actions[a].clips[F] !== pieTori.grapple.actions[a].clips[B]));
check('los nombres de clip llevan el sufijo de camara',
    pieTori.grapple.actions.ATACAR.clips[F].endsWith('__f') &&
    pieTori.grapple.actions.ATACAR.clips[B].endsWith('__b'),
    pieTori.grapple.actions.ATACAR.clips);
check('una postura sin sumision la declara como null (no clip inventado)',
    profile.get(SPF.grappleState(GrappleStance.AGACHADO, GrappleRole.TORI))
        .grapple.actions[GrappleAction.SUMISION] === null);

// Sesion de agarre: el TORI golpea, el UKE escapa
function fakeFighter(id) {
    return {
        id,
        meter: 100,
        damageLog: [],
        state() { return {}; }
    };
}

{
    const tori = fakeFighter('TORI');
    const uke = fakeFighter('UKE');
    const session = new GrappleSession({
        tori: tori.id, uke: uke.id,
        stance: GrappleStance.PIE,
        surface: 'VERTICAL',
        api: {
            getState: (id) => profile.get(id),
            damageUke: (amount, action) => uke.damageLog.push({ amount, action }),
            addToriMeter: () => {}
        }
    });

    check('el rol se resuelve por luchador', session.roleOf(tori.id) === GrappleRole.TORI);
    check('el UKE no puede pedir una proyeccion',
        session.request(uke.id, GrappleAction.PROYECCION) === false);

    // TORI golpea 3 veces: la presion debe llegar al tope y romper el agarre
    let resolved = null;
    session.onResolve((ev) => { if (ev.type === 'RESOLVED') resolved = ev; });
    for (let i = 0; i < 200 && !resolved; i++) {
        if (session.frame % 10 === 0) session.request(tori.id, GrappleAction.ATACAR);
        if (session.frame % 10 === 5) session.mashEscape();
        session.step(i);
    }
    check('la presion rompe el agarre si el TORI no resuelve', resolved && resolved.result === GrappleAction.ESCAPE, resolved && resolved.result);
    check('el TORI recibe castigo al fallar', resolved && resolved.exit[GrappleRole.TORI] === State.DE_RODILLAS);
}

{
    // El TORI proyecta antes de que el UKE escape: gana el TORI
    const session = new GrappleSession({
        tori: 'T', uke: 'U',
        stance: GrappleStance.PIE, surface: 'VERTICAL',
        api: { getState: (id) => profile.get(id), damageUke: () => {}, addToriMeter: () => {} }
    });
    let resolved = null;
    session.onResolve((ev) => { if (ev.type === 'RESOLVED') resolved = ev; });
    for (let i = 0; i < 120 && !resolved; i++) {
        session.request('T', GrappleAction.PROYECCION);
        if (i % 4 === 0) session.mashEscape();
        session.step(i);
    }
    check('la proyeccion del TORI saca al UKE lanzado',
        resolved && resolved.result === GrappleAction.PROYECCION && resolved.exit[GrappleRole.UKE] === State.JUGGLER,
        resolved && resolved.result);
    check('el TORI sale de la proyeccion de pie', resolved && resolved.exit[GrappleRole.TORI] === State.AGACHADO);
}

{
    // El UKE machaca y sale antes de que el TORI llegue a la presion
    const session = new GrappleSession({
        tori: 'T', uke: 'U',
        stance: GrappleStance.PIE, surface: 'VERTICAL',
        api: { getState: (id) => profile.get(id), damageUke: () => {}, addToriMeter: () => {} }
    });
    let resolved = null;
    session.onResolve((ev) => { if (ev.type === 'RESOLVED') resolved = ev; });
    for (let i = 0; i < 120 && !resolved; i++) {
        if (i % 2 === 0) session.mashEscape();
        session.step(i);
    }
    check('el escape por machaqueo libera al UKE',
        resolved && resolved.result === GrappleAction.ESCAPE, resolved && resolved.result);
}

// ---------------------------------------------------------------------------
// 4. Stances por personaje
// ---------------------------------------------------------------------------
section('4. Stances propios de cada peleador');
const defineState = catalog.defineState;
for (const id of ['PEDRO', 'JUAN']) {
    const own = registerCharacterStances(id, defineState);
    check(id + ' tiene stances propios', own.length >= 3, own.length);
}
const pedroMoves = MoveTable.getMoves('PEDRO');
check('Pedro tiene golpes propios', !!pedroMoves.EMBESTIDA && !!pedroMoves.GOLPE_CODO);
check('Pedro conserva el set base', !!pedroMoves.ATAQUE_LIGERO);
check('el golpe propio tiene su frame data', pedroMoves.EMBESTIDA.startup === 11 && pedroMoves.EMBESTIDA.duration === 36);
check('el moveset de Pedro es por capas', !!pedroMoves.GANCHO && !!pedroMoves.PATADA_FRONTAL && !!pedroMoves.BARREDO && !!pedroMoves.DERIBO && !!pedroMoves.SUMISION);
check('el botellazo es su especial', pedroMoves.ATAQUE_ESPECIAL.label === 'Botellazo' && pedroMoves.ATAQUE_ESPECIAL.type === 'AREA');
check('el directo de Pedro es mas rapido que el base', pedroMoves.ATAQUE_LIGERO.startup === 3);
check('Juan tiene el remate', !!MoveTable.getMoves('JUAN').RV_FIN);
check('hasMove distingue lo propio de lo base', MoveTable.hasMove('PEDRO', 'GANCHO') && !MoveTable.hasMove('JUAN', 'GANCHO') && !MoveTable.hasMove('PEDRO', 'NO_EXISTE'));

// ---------------------------------------------------------------------------
// 5. Maquina: comportamiento de combate
// ---------------------------------------------------------------------------
section('5. Maquina de estados: combate');

function makeFsm(opts = {}) {
    const fighter = {
        id: 'F1',
        characterId: opts.characterId || 'BASE',
        health: 1000,
        meter: opts.meter != null ? opts.meter : 100,
        juggle: 0,
        grounded: true,
        grapples: true,
        wakeupFrames: 8
    };
    const fsm = new StateMachine({
        fighterId: fighter.id,
        profile: opts.profile || profile,
        moves: MoveTable.getMoves(fighter.characterId),
        initial: opts.initial,
        api: {
            characterId: fighter.characterId,
            juggleCount: () => fighter.juggle,
            hasMeter: (c) => fighter.meter >= (c || 0),
            canGrapple: () => fighter.grapples,
            canBreakCombo: () => true,
            wakeupReady: () => true,
            isDownAttack: () => false,
            now: () => 0,
            simFrame: () => 0,
            getGrappleSession: () => fsm.grappleSession
        }
    });
    fsm.fighter = fighter;
    return fsm;
}

function input(partial) {
    const base = {
        x: 0, y: 0, forward: false, back: false, up: false, down: false,
        left: false, right: false,
        pressed: Object.create(null),
        held: Object.create(null)
    };
    return Object.assign(base, partial);
}

function tap(fsm, intent, dir, frames = 1) {
    const inp = input(Object.assign({ pressed: { [intent]: true } }, dir || {}));
    fsm.setInput(inp);
    for (let i = 0; i < frames; i++) fsm.step();
}

// --- ataque y salida --------------------------------------------------------
{
    const fsm = makeFsm();
    tap(fsm, Intent.ATAQUE_LIGERO);
    check('el ligero entra al ataque', fsm.stateId === State.ATAQUE_LIGERO, SPF.stateName(fsm.stateId));
    const move = fsm.move;
    check('el frame data sale de la tabla de golpes', move && move.key === 'ATAQUE_LIGERO');
    check('la fase de arranque es STARTUP', fsm.getAttackPhase() === 'STARTUP', fsm.getAttackPhase());

    // Fase activa en el frame exacto
    for (let i = 0; i < move.activeStart - 1; i++) fsm.step();
    check('la hitbox se enciende en ACTIVE', fsm.getAttackPhase() === 'ACTIVE', fsm.getAttackPhase());
    check('la entidad ve la hitbox activa', fsm.isHitboxActive());
    check('el golpe solo puede conectar una vez', fsm.isHitboxActive() && (fsm.markHitboxResolved(), !fsm.isHitboxActive()));

    // Al acabarse vuelve a la base
    let guard = 0;
    while (fsm.stateId === State.ATAQUE_LIGERO && guard++ < 200) fsm.step();
    check('el ataque vuelve a la base', fsm.stateId === State.NORMAL_A, SPF.stateName(fsm.stateId));
    check('el clip tiene variante de camara', fsm.getAnimationKey().endsWith('__f') || fsm.getAnimationKey().endsWith('__b'), fsm.getAnimationKey());
}

// --- guardia alta y baja ----------------------------------------------------
{
    const fsm = makeFsm();
    tap(fsm, Intent.GUARDIA, { down: true });
    check('abajo + guardia = guardia baja', fsm.stateId === State.AGACHADO_GUARDIA_BAJA, SPF.stateName(fsm.stateId));
    const fsm2 = makeFsm();
    tap(fsm2, Intent.GUARDIA, {});
    check('de pie + guardia = guardia alta', fsm2.stateId === State.AGACHADO_GUARDIA_ALTA, SPF.stateName(fsm2.stateId));
    const fsm3 = makeFsm();
    tap(fsm3, Intent.AGACHARSE, { down: true });
    check('cuadrupeda al agacharse en adelante', fsm3.stateId === State.CUADRUPEDA, SPF.stateName(fsm3.stateId));
    const fsm4 = makeFsm();
    tap(fsm4, Intent.AGACHARSE, {});
    check('agachado simple', fsm4.stateId === State.AGACHADO, SPF.stateName(fsm4.stateId));
}

// --- golpe bajo, medio y fuerte --------------------------------------------
{
    const low = makeFsm();
    low.onHit({ hitLevel: HitLevel.BAJO, knockdown: 'ALWAYS', isLow: true });
    check('golpe bajo -> pecho tierra', low.stateId === State.SUELO_TUMBADO_BOCA_ABAJO, SPF.stateName(low.stateId));

    const heavy = makeFsm();
    heavy.onHit({ hitLevel: HitLevel.FUERTE, knockdown: 'LIGHT', hitstun: 4 });
    check('golpe fuerte -> hitstun', heavy.stateId === State.GOLPEADO, SPF.stateName(heavy.stateId));
    heavy.step(); heavy.step(); heavy.step(); heavy.step();
    check('el hitstun fuerte acaba en knockdown', heavy.stateId === State.SUELO_TUMBADO_BOCA_ARRIBA, SPF.stateName(heavy.stateId));

    const mid = makeFsm();
    mid.onHit({ hitLevel: HitLevel.MEDIO, knockdown: 'NONE', hitstun: 4 });
    check('golpe medio -> tropezon (no derriba)', mid.stateId === State.TROPEZON, SPF.stateName(mid.stateId));
}

// --- orientacion de caida ---------------------------------------------------
{
    const back = makeFsm();
    back.onHit({ hitLevel: HitLevel.FUERTE, knockdown: 'ALWAYS', isBack: true });
    check('golpe a la espalda -> cae de cara con la cabeza al rival',
        back.stateId === State.SUELO_TUMBADO_BOCA_ABAJO, SPF.stateName(back.stateId));

    const sweep = makeFsm();
    sweep.onHit({ hitLevel: HitLevel.BAJO, knockdown: 'ALWAYS', isLow: true });
    sweep.step();
    check('el barrido deja el cuerpo en angulo intermedio (45/135)',
        sweep.getData('knockdown').axis === 135, sweep.getData('knockdown'));

    // Levantada con invulnerabilidad
    const down = makeFsm();
    down.onHit({ hitLevel: HitLevel.FUERTE, knockdown: 'ALWAYS' });
    for (let i = 0; i < 8; i++) down.step();   // espera la ventana de wakeup
    down.setInput(input({ pressed: { [Intent.LEVANTARSE]: true } }));
    down.step();
    check('la levantada tiene invulnerabilidad', down.isInvulnerable(), down.stateId);
    for (let i = 0; i < 14; i++) down.step();
    check('levantado -> de pie', down.stateId === State.NORMAL_A, SPF.stateName(down.stateId));
}

// --- juggle y air recovery --------------------------------------------------
{
    const fsm = makeFsm();
    fsm.fighter.juggle = 0;
    fsm.onHit({ hitLevel: HitLevel.FUERTE, knockdown: 'LIGHT', launchY: 3 });
    check('golpe en el aire -> juggler', fsm.stateId === State.JUGGLER, SPF.stateName(fsm.stateId));

    const full = makeFsm();
    full.fighter.juggle = SPF.CONFIG.JUGGLE_MAX;
    full.onHit({ hitLevel: HitLevel.FUERTE, launchY: 3 });
    check('juggle agotado -> sin aire', full.stateId === State.SIN_AIRE, SPF.stateName(full.stateId));

    const air = makeFsm({ initial: State.AIRE_LIBRE });
    air.fighter.juggle = 1;
    air.setInput(input({ pressed: { [Intent.SALTAR]: true } }));
    air.step();
    check('air recovery con margen de juggle', air.stateId === State.SALTO_AEREO_RECUPERACION, SPF.stateName(air.stateId));

    const noAir = makeFsm({ initial: State.JUGGLER });
    noAir.fighter.juggle = SPF.CONFIG.JUGGLE_MAX;
    noAir.setInput(input({ pressed: { [Intent.SALTAR]: true } }));
    noAir.step();
    check('sin margen de juggle no hay air recovery', noAir.stateId === State.JUGGLER, SPF.stateName(noAir.stateId));
}

// --- aterrizaje -------------------------------------------------------------
{
    const fsm = makeFsm({ initial: State.SALTO_NORMAL_A });
    fsm.onContact('LANDED');
    check('aterrizar amortigua en agachado', fsm.stateId === State.AGACHADO, SPF.stateName(fsm.stateId));
}

// --- APC --------------------------------------------------------------------
{
    const fsm = makeFsm();
    tap(fsm, Intent.ATAQUE_LIGERO);
    fsm.requestCancel('HEAVY');
    check('el APC pasa por el estado puente', fsm.stateId === State.ANY_POINT_CANCEL, SPF.stateName(fsm.stateId));
    fsm.step();
    check('el puente entrega el destino del cancel', fsm.stateId === State.ATAQUE_PESADO, SPF.stateName(fsm.stateId));

    // El APC no puede bajar de tier: cancelar un especial con un jab
    const fsm2 = makeFsm();
    tap(fsm2, Intent.ATAQUE_ESPECIAL);
    const cancelado = (() => {
        fsm2.requestCancel('LIGHT');
        return fsm2.stateId !== State.ANY_POINT_CANCEL;
    })();
    check('un especial no se cancela con un jab', cancelado, SPF.stateName(fsm2.stateId));
}

// --- especial: coste de recurso --------------------------------------------
{
    const poor = makeFsm({ meter: 0 });
    tap(poor, Intent.ATAQUE_ESPECIAL);
    check('sin recurso no hay especial', poor.stateId !== State.ATAQUE_ESPECIAL, SPF.stateName(poor.stateId));
    const rich = makeFsm({ meter: 100 });
    tap(rich, Intent.ATAQUE_ESPECIAL);
    check('con recurso entra el especial', rich.stateId === State.ATAQUE_ESPECIAL, SPF.stateName(rich.stateId));
}

// --- determinismo -----------------------------------------------------------
section('6. Determinismo a paso fijo');
{
    // Dos maquinas identicas con la misma secuencia de inputs deben terminar
    // en el mismo estado y con el mismo historial.
    const script = [
        { intent: Intent.ATAQUE_LIGERO, dir: {} },
        { intent: Intent.AGACHARSE, dir: { down: true } },
        { intent: Intent.GUARDIA, dir: {} },
        { intent: Intent.SALTAR, dir: { up: true } },
        { intent: Intent.ATAQUE_LIGERO, dir: {} }
    ];
    const run = () => {
        const fsm = makeFsm();
        for (const step of script) {
            fsm.setInput(input({ pressed: { [step.intent]: true }, ...step.dir }));
            for (let i = 0; i < 30; i++) fsm.step();
        }
        return fsm;
    };
    const a = run();
    const b = run();
    check('misma secuencia -> mismo estado', a.stateId === b.stateId, [SPF.stateName(a.stateId), SPF.stateName(b.stateId)]);
    check('misma secuencia -> mismo historial',
        JSON.stringify(a.history) === JSON.stringify(b.history));
    check('el historial registra las transiciones', a.history.length >= 5, a.history.length);

    // update() con dt real debe dar el mismo numero de pasos que el manual
    const fsm = makeFsm();
    const pasos = fsm.update(1 / 60);
    check('un frame a 60 fps da un paso', pasos === 1, pasos);
    const fsm2 = makeFsm();
    check('un frame a 30 fps da dos pasos', fsm2.update(1 / 30) === 2, fsm2.update(1 / 30));
}

// --- explicacion de transiciones -------------------------------------------
section('7. Depuracion de la tabla');
{
    const fsm = makeFsm();
    const why = fsm.explain(Intent.SALTAR, 'INPUT');
    check('explain() devuelve candidatos', why.candidates.length > 0, why.candidates.length);
    check('explain() ordena por prioridad',
        why.candidates.every((c, i, arr) => i === 0 || arr[i - 1].priority >= c.priority));
    check('explain() marca los guards que fallan',
        why.candidates.some((c) => c.fromOk && c.guardOk === false));
}

// --- resumen ----------------------------------------------------------------
console.log('\n' + '-'.repeat(52));
console.log(`resultado: ${passed} ok, ${failed} fallos`);
if (failed > 0) process.exit(1);