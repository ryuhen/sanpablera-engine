/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/design.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de las TABLAS DE DISEÑO: los arquetipos base, la
 * escalada de fases de combate y el sistema de estancias de
 * boxeo (arquetipo YUGO).
 *
 * Que comprueba:
 *   1. La triada de arquetipos existe y cada peleador del roster
 *      viene de uno.
 *   2. Las cuatro fases del roadmap con SUS reglas (arbitro,
 *      ventana de 1 s, zonas ilegales, armas, desarme).
 *   3. El sistema de estancias: los seis puestos de boxeo, sus
 *      golpes exclusivos, la rotacion, el baile, los comandos y
 *      que el golpe de la postura sustituye al del estado en la FSM.
 *
 * Ejecutar:  node tests/design.smoke.mjs
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
// Modulos
// ---------------------------------------------------------------------------
const SPF = (await load('src/core/fsm/Constants.js')).default;
const { ARCHETYPES, ARCHETYPE_LIST, isArchetype } =
    await load('src/core/archetypes.js');
const Boxer = (await load('src/core/boxing.js')).default;
const Phases = (await load('src/core/phases.js')).default;
const { ROSTER, fullRoster } = await load('src/core/roster.js');
const MoveTable = (await load('src/core/fsm/MoveTable.js')).default;
const catalog = await load('src/core/fsm/StateCatalog.js');
const statesIndex = await load('src/core/fsm/states/index.js');
const { StateMachine } = await load('src/core/fsm/StateMachine.js');
const { registerCharacterStances } = await load('src/core/fsm/states/CharacterStates.js');

const { Intent, State } = SPF;

// ---------------------------------------------------------------------------
// 1. La triada de arquetipos
// ---------------------------------------------------------------------------
section('1. Arquetipos base (plantilla internacional segura)');

check('son exactamente tres', ARCHETYPE_LIST.length === 3, ARCHETYPE_LIST.length);
check('el boxeador es YUGO', ARCHETYPES.YUGO.name === 'El Boxeador' && ARCHETYPES.YUGO.base === 'Boxeo');
check('YUGO es de puños rápidos', /puños/.test(ARCHETYPES.YUGO.concept), ARCHETYPES.YUGO.concept);
check('el salvaje es MONTE', ARCHETYPES.MONTE.name === 'El Peleador Salvaje');
check('MONTE es acrobacia, saltos y cuadrupedia',
    /acrob/.test(ARCHETYPES.MONTE.concept) && /cuadrúpedas/.test(ARCHETYPES.MONTE.concept),
    ARCHETYPES.MONTE.concept);
check('el vagabundo es MUSASHI', ARCHETYPES.MUSASHI.name === 'El Vagabundo Marcial');
check('MUSASHI es Karate, Aikido y Judo',
    /Karate/.test(ARCHETYPES.MUSASHI.base) && /Aikido/.test(ARCHETYPES.MUSASHI.base) &&
    /Judo/.test(ARCHETYPES.MUSASHI.base), ARCHETYPES.MUSASHI.base);
check('MUSASHI improvisa armas (kenjutsu)',
    /Kenjutsu Improvisado/.test(ARCHETYPES.MUSASHI.concept), ARCHETYPES.MUSASHI.concept);
check('los tres tienen lo que crece en la calle', ARCHETYPE_LIST.every((a) => Array.isArray(a.grows) && a.grows.length > 0));
check('isArchetype filtra lo desconocido', isArchetype('YUGO') && !isArchetype('ROBOT'));

// ---------------------------------------------------------------------------
// 2. Roster: cada peleador viene de un arquetipo
// ---------------------------------------------------------------------------
section('2. Roster y arquetipos');

check('siguen siendo ocho peleadores del juego', ROSTER.length === 8, ROSTER.length);
check('todos tienen arquetipo de la triada', ROSTER.every((f) => isArchetype(f.archetype)),
    ROSTER.map((f) => f.archetype));
check('Pedro es el boxeador (YUGO)', ROSTER[0].archetype === 'YUGO');
check('todos tienen nombre, etiqueta, historia y estilo',
    ROSTER.every((f) => f.name && f.tag && f.story && f.style));
check('la novena celda es el peleador del jugador', fullRoster().length === 9, fullRoster().length);
check('el peleador del jugador viene del motor (sin arquetipo)',
    fullRoster()[8].custom === true && fullRoster()[8].archetype === null,
    fullRoster()[8].archetype);

// ---------------------------------------------------------------------------
// 3. Escalada de fases del combate
// ---------------------------------------------------------------------------
section('3. Fases de combate (roadmap de campaña)');

check('son cuatro fases en orden',
    Phases.PHASE_ORDER.length === 4 &&
    Phases.PHASE_ORDER[0] === Phases.PHASE.SPORT &&
    Phases.PHASE_ORDER[3] === Phases.PHASE.OUTLAW, Phases.PHASE_ORDER);
check('la ventana del arbitro es de 1 segundo', Phases.REFEREE_STOP_FRAMES === 60, Phases.REFEREE_STOP_FRAMES);

// Fase 1 · deportivo
const sport = Phases.phaseRules(Phases.PHASE.SPORT);
check('Fase 1 hay arbitro', sport.referee === true);
check('Fase 1 el arbitro para a los 60 frames', sport.groundWindow === 60, sport.groundWindow);
check('Fase 1 no hay ground and pound libre', sport.groundAndPound === false);
check('Fase 1 tiene limite de tiempo', sport.timeLimit === true);
check('Fase 1 premia limpio, contraataque y proyeccion',
    sport.score.clean && sport.score.counter && sport.score.projection);
check('Fase 1 solo permite cara y torso',
    sport.legalTargets.join(',') === 'FACE,TORSO', sport.legalTargets);
check('Fase 1 penaliza espalda, piernas, ojos, ingles y cuello',
    sport.illegalTargets.length === 5 && sport.cards === true, sport.illegalTargets);

// Fase 2 · callejero
const street = Phases.phaseRules(Phases.PHASE.STREET);
check('Fase 2 desaparece el arbitro', street.referee === false);
check('Fase 2 el suelo no tiene limite', street.groundWindow === null);
check('Fase 2 el ground and pound es libre', street.groundAndPound === true);
check('Fase 2 es a KO, sin tiempo', street.timeLimit === false && street.score === null);
check('Fase 2 todavia sin armas', street.weapons.length === 0);
check('Fase 2 la espalda ya es legal',
    Phases.isLegalTarget(Phases.PHASE.STREET, Phases.ZONES.BACK) &&
    !Phases.isLegalTarget(Phases.PHASE.SPORT, Phases.ZONES.BACK));

// Fase 3 · tactico urbano
const tactical = Phases.phaseRules(Phases.PHASE.TACTICAL);
check('Fase 3 trae los seis armas portatiles',
    tactical.weapons.length === 6 && Phases.weaponAvailable(Phases.PHASE.TACTICAL, Phases.WEAPONS.KNIFE) &&
    Phases.weaponAvailable(Phases.PHASE.TACTICAL, Phases.WEAPONS.BOTTLE) &&
    Phases.weaponAvailable(Phases.PHASE.TACTICAL, Phases.WEAPONS.CLOTHING), tactical.weapons);
check('Fase 3 no deja el cuchillo en la calle',
    !Phases.weaponAvailable(Phases.PHASE.STREET, Phases.WEAPONS.KNIFE));

// Fase 4 · duelos ilegales
const outlaw = Phases.phaseRules(Phases.PHASE.OUTLAW);
check('Fase 4 armas de pleno uso', outlaw.weapons === 'ANY' &&
    Phases.weaponAvailable(Phases.PHASE.OUTLAW, 'CUALQUIER_ARMA'));
check('Fase 4 trae el desarme y la apropiacion', outlaw.disarm === true);
check('el suelo libre empieza en la calle',
    !Phases.freeGround(Phases.PHASE.SPORT) && Phases.freeGround(Phases.PHASE.OUTLAW));
check('una fase desconocida cae en la calle (la base)',
    Phases.phaseRules('FASE_INVENTADA').referee === street.referee);

// ---------------------------------------------------------------------------
// 4. El sistema de estancias de boxeo
// ---------------------------------------------------------------------------
section('4. Estancias de boxeo (arquetipo YUGO)');

check('hay seis posturas: tres base y tres de comando',
    Boxer.STANCE_CYCLE.length === 3 && Boxer.COMMAND_STANCES.length === 3);
check('SHELL es la Peek-a-Boo', Boxer.STANCES.SHELL.label.indexOf('Shell') !== -1);
check('LEAD es el Puno al Frente', Boxer.STANCES.LEAD.label.indexOf('Frente') !== -1);
check('RELAX es la Postura Descansada (puno a la rodilla)',
    Boxer.STANCES.RELAX.label.indexOf('Descansada') !== -1 && Boxer.STANCES.RELAX.handY < 0.7,
    Boxer.STANCES.RELAX.handY);
check('cada postura tiene moveset propio para los tres botones',
    Boxer.ALL_STANCES.every((id) => {
        const m = Boxer.STANCES[id].moves;
        return !!m[Intent.ATAQUE_LIGERO] && !!m[Intent.ATAQUE_PESADO] && !!m[Intent.ATAQUE_ESPECIAL];
    }));
check('las posturas base se distinguen una de otra',
    Boxer.STANCES.SHELL.moves[Intent.ATAQUE_LIGERO] !== Boxer.STANCES.LEAD.moves[Intent.ATAQUE_LIGERO] &&
    Boxer.STANCES.LEAD.moves[Intent.ATAQUE_PESADO] !== Boxer.STANCES.RELAX.moves[Intent.ATAQUE_PESADO]);
check('cada postura tiene silueta para el rig',
    Boxer.ALL_STANCES.every((id) => {
        const s = Boxer.STANCES[id].silhouette;
        return typeof s.spread === 'number' && typeof s.guard === 'number';
    }));

// Golpes de las posturas: existen en el moveset del peleador YUGO.
const pedro = MoveTable.getMoves('PEDRO');
const stanceKeys = new Set();
for (const id of Boxer.ALL_STANCES) {
    for (const k of Object.keys(Boxer.STANCES[id].moves)) stanceKeys.add(Boxer.STANCES[id].moves[k]);
}
check('todos los golpes de las posturas estan en el moveset de Pedro',
    [...stanceKeys].every((k) => !!pedro[k]), [...stanceKeys].filter((k) => !pedro[k]));
check('el costillazo va a las costillas',
    Math.abs(pedro.COSTILLAZO.hitbox.centerY - 0.82) < 0.2, pedro.COSTILLAZO.hitbox.centerY);
check('la patada baja es baja y lineal (el dash salta)',
    pedro.PATADA_BAJA.height === 'BAJO' && pedro.PATADA_BAJA.type === 'LINEAL');
check('el ascendente rompe la guardia alta',
    pedro.UPPERCUT.breaksGuardHeight === 'ALTA' && pedro.UPPERCUT.height === 'ALTO');
check('la proyeccion del abrazo derriba siempre',
    pedro.PROYECCION.knockdown === 'ALWAYS');
check('el jab largo llega mas lejos que el corto',
    pedro.JAB_LARGO.hitbox.forward > pedro.GOLPE_CORTO.hitbox.forward);

// Rotacion e inversion
check('la rotacion va Shell -> Lead -> Relax -> Shell',
    Boxer.nextStance('SHELL') === 'LEAD' &&
    Boxer.nextStance('LEAD') === 'RELAX' &&
    Boxer.nextStance('RELAX') === 'SHELL');
check('accion + atras invierte el ciclo',
    Boxer.nextStance('SHELL', true) === 'RELAX' && Boxer.nextStance('RELAX', true) === 'LEAD');
check('desde una postura de comando se vuelve al ciclo',
    Boxer.nextStance('PRESS') === 'SHELL', Boxer.nextStance('PRESS'));

// El baile
check('el tilt arriba empieza por Lead y acaba en Relax',
    Boxer.dancePair('UP').join(',') === 'LEAD,RELAX', Boxer.dancePair('UP'));
check('el tilt abajo empieza por Relax y acaba en Shell',
    Boxer.dancePair('DOWN').join(',') === 'RELAX,SHELL', Boxer.dancePair('DOWN'));
check('los ocho direcciones del pad tienen par de baile',
    ['UP', 'DOWN', 'LEFT', 'RIGHT', 'UP_LEFT', 'UP_RIGHT', 'DOWN_LEFT', 'DOWN_RIGHT']
        .every((d) => Boxer.dancePair(d).length === 2));
check('el baile dura una fraccion de segundo', Boxer.DANCE_DURATION > 0.1 && Boxer.DANCE_DURATION < 0.4,
    Boxer.DANCE_DURATION);

// Los comandos
const fresh = (extra) => Object.assign({
    down: false, forward: false, back: false,
    held: Object.create(null)
}, extra);
check('abajo+adelante+accion -> presion frontal',
    Boxer.commandStance(fresh({ down: true, forward: true }), true) === 'PRESS');
check('guardia+accion -> absorcion y contraataque',
    Boxer.commandStance(fresh({ held: { GUARDIA: true } }), true) === 'ABSORB');
check('abajo+atras+guardia+accion -> atrapamiento (el mas especifico)',
    Boxer.commandStance(fresh({ down: true, back: true, held: { GUARDIA: true } }), true) === 'CATCH');
check('sin pulsacion reciente no hay comando',
    Boxer.commandStance(fresh({ down: true, forward: true }), false) === null);
check('absorben dos impactos directos, la base ninguna',
    Boxer.stanceAbsorb('ABSORB') === 2 && Boxer.stanceAbsorb('SHELL') === 0);
check('solo CATCH atrapa patadas bajas',
    Boxer.catchesLowKicks('CATCH') && !Boxer.catchesLowKicks('SHELL'));

// ---------------------------------------------------------------------------
// 5. La postura sustituye al golpe del estado (la FSM lo resuelve)
// ---------------------------------------------------------------------------
section('5. La FSM resuelve el golpe de la postura');

registerCharacterStances('PEDRO', catalog.defineState);

const api = {
    characterId: 'PEDRO',
    juggleCount: () => 0,
    hasMeter: () => true,
    canPay: () => true,
    canGrapple: () => false,
    canBreakCombo: () => true,
    wakeupReady: () => true,
    isDownAttack: () => false,
    stanceAttack: (key) => (key === Intent.ATAQUE_LIGERO ? 'GOLPE_CORTO' : null),
    now: () => 0,
    simFrame: () => 0
};
const fsm = new StateMachine({
    fighterId: 'P1',
    characterId: 'PEDRO',
    profile: catalog.createProfile('PEDRO'),
    moves: pedro,
    api
});
fsm.setInput({
    x: 0, y: 0, forward: false, back: false, up: false, down: false,
    left: false, right: false,
    pressed: { [Intent.ATAQUE_LIGERO]: true }, held: Object.create(null)
});
fsm.update(1 / 60);
check('el golpe sale en el estado ATAQUE_LIGERO', fsm.stateId === State.ATAQUE_LIGERO, fsm.stateId);
check('pero el golpe ES el de la postura (el corto)', fsm.move && fsm.move.key === 'GOLPE_CORTO',
    fsm.move && fsm.move.key);
check('el frame data sale del golpe de la postura',
    fsm.move && fsm.move.startup === 2 && fsm.move.duration === 9, fsm.move && fsm.move.startup);

// Sin postura (api que no sustituye): vuelve el golpe base del estado.
const plain = new StateMachine({
    fighterId: 'P2', characterId: 'PEDRO',
    profile: catalog.createProfile('PEDRO'),
    moves: pedro,
    api: Object.assign({}, api, { stanceAttack: () => null })
});
plain.setInput({
    x: 0, y: 0, forward: false, back: false, up: false, down: false,
    left: false, right: false,
    pressed: { [Intent.ATAQUE_LIGERO]: true }, held: Object.create(null)
});
plain.update(1 / 60);
check('sin postura activa manda el golpe del estado',
    plain.move && plain.move.key === 'ATAQUE_LIGERO', plain.move && plain.move.key);

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log(`design: ${passed} ok, ${failed} fallos.`);
process.exit(failed ? 1 : 0);