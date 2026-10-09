/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/air.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del AIRE (core/air.js) y de la CAPA DE CHOQUE (core/clinch.js).
 *
 * Que comprueba:
 *   1. Los tipos de salto: altura, control y quien puede hacer cuales.
 *   2. Las tres familias de ataque aereo y que un personaje pueda tener
 *      ataques aereos SIN saber saltar (el caso del diseno).
 *   3. El ataque antiaereo que se ejecuta desde el suelo.
 *   4. Los comandos de entrada.
 *   5. La tabla ATAQUE x DEFENSA del choque, incluidos los casos que
 *     Alejandro''(takedown contra el muro, barrido contra guardia baja...).
 *   6. La explotacion de piedra-papel-tijera y la guardia en el impacto.
 *
 * Ejecutar:  node tests/air.smoke.mjs
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
function section(t) { console.log('\n' + t); }

const Air = (await load('src/core/air.js')).default;
const Clinch = (await load('src/core/clinch.js')).default;

const {
    JUMP, JUMP_TABLE, FALL_FACTOR, AIR_GRAVITY,
    STANCE, CENTER_OF_MASS, COMMAND, COMMAND_TABLE,
    AIR_FAMILY, AIR_FAMILY_RULES, AIR_MOVES, ANTIAIR_BLOCK, ANTIAIR_SEND,
    AIR_TARGET, targetZone, AIR_PRESETS,
    canUseAirAttack, canDoubleJump, canAcroJump, checkPreset
} = Air;

const {
    CLASH_ATTACK, DEFENSE, CLASH, INPUT,
    OFFLINE, offlineRule, defenseFrom, resolveClash, resolveClinch, beats
} = Clinch;

// ---------------------------------------------------------------------------
// 1. Tipos de salto
// ---------------------------------------------------------------------------
section('1. Tipos de salto');

check('los seis tipos estan en la tabla',
    Object.keys(JUMP_TABLE).length === 6, Object.keys(JUMP_TABLE));

check('el salto normal da mas altura que el corto',
    JUMP_TABLE[JUMP.NORMAL].vy > JUMP_TABLE[JUMP.SHORT].vy,
    { normal: JUMP_TABLE[JUMP.NORMAL].vy, corto: JUMP_TABLE[JUMP.SHORT].vy });

check('el acrobatico es el mas alto',
    JUMP_TABLE[JUMP.ACRO].vy > JUMP_TABLE[JUMP.NORMAL].vy,
    { acro: JUMP_TABLE[JUMP.ACRO].vy, normal: JUMP_TABLE[JUMP.NORMAL].vy });

check('el salto atras va hacia atras y el normal no',
    JUMP_TABLE[JUMP.BACK].back === true && JUMP_TABLE[JUMP.BACK].forward === false &&
    JUMP_TABLE[JUMP.NORMAL].back === false, JUMP_TABLE[JUMP.BACK]);

check('el salto atras tiene la misma altura que el normal (si no, es una trampa)',
    JUMP_TABLE[JUMP.BACK].vy === JUMP_TABLE[JUMP.NORMAL].vy, {
    atras: JUMP_TABLE[JUMP.BACK].vy, normal: JUMP_TABLE[JUMP.NORMAL].vy
});

check('el corto cae mas rapido que el normal',
    FALL_FACTOR[JUMP.SHORT] > FALL_FACTOR[JUMP.NORMAL],
    { corto: FALL_FACTOR[JUMP.SHORT], normal: FALL_FACTOR[JUMP.NORMAL] });

check('el multiple NO es mas alto que el normal (si no, se sale del ring)',
    JUMP_TABLE[JUMP.DOUBLE].vy < JUMP_TABLE[JUMP.NORMAL].vy,
    { doble: JUMP_TABLE[JUMP.DOUBLE].vy, normal: JUMP_TABLE[JUMP.NORMAL].vy });

check('el multiple flota mas que el normal',
    FALL_FACTOR[JUMP.DOUBLE] < FALL_FACTOR[JUMP.NORMAL], FALL_FACTOR[JUMP.DOUBLE]);

check('solo el multiple y el acrobatico se pueden repetir',
    JUMP_TABLE[JUMP.NORMAL].doubleable === false &&
    JUMP_TABLE[JUMP.DOUBLE].doubleable === true &&
    JUMP_TABLE[JUMP.ACRO].doubleable === true);

check('el salto atras NO se puede cancelar en el aire (si no, es opcion de flee infinita)',
    JUMP_TABLE[JUMP.BACK].cancelable === false && JUMP_TABLE[JUMP.NORMAL].cancelable === true);

check('la gravedad es positiva y finita', AIR_GRAVITY > 0 && isFinite(AIR_GRAVITY), AIR_GRAVITY);

// ---------------------------------------------------------------------------
// 2. Posturas y centro de masa
// ---------------------------------------------------------------------------
section('2. Posturas (centro de masa)');

check('agachado baja el centro de masa',
    CENTER_OF_MASS[STANCE.CROUCH] < CENTER_OF_MASS[STANCE.NEUTRAL],
    { agachado: CENTER_OF_MASS[STANCE.CROUCH], dePie: CENTER_OF_MASS[STANCE.NEUTRAL] });

check('guardia agachada es el centro de masa mas bajo de pie',
    CENTER_OF_MASS[STANCE.CROUCH_GUARD] === Math.min(
        CENTER_OF_MASS[STANCE.NEUTRAL], CENTER_OF_MASS[STANCE.GUARD],
        CENTER_OF_MASS[STANCE.CROUCH], CENTER_OF_MASS[STANCE.CROUCH_GUARD],
        CENTER_OF_MASS[STANCE.RUN], CENTER_OF_MASS[STANCE.PLANTED]
    ), CENTER_OF_MASS[STANCE.CROUCH_GUARD]);

check('plantarse baja un poco el centro de masa (se planta y se agacha)',
    CENTER_OF_MASS[STANCE.PLANTED] < CENTER_OF_MASS[STANCE.NEUTRAL]);

check('el centro de masa del aire es centinela (-1), no un numero real',
    CENTER_OF_MASS[STANCE.AIRBORNE] === -1);

// ---------------------------------------------------------------------------
// 3. Las tres familias de ataque aereo
// ---------------------------------------------------------------------------
section('3. Familias de ataque aereo');

check('son tres', Object.keys(AIR_FAMILY_RULES).length === 3, AIR_FAMILY_RULES);

check('el AEREO necesita estar en el aire',
    AIR_FAMILY_RULES[AIR_FAMILY.AEREO].needs === STANCE.AIRBORNE);

check('el ASCENDENTE se lanza desde el suelo (no del aire)',
    AIR_FAMILY_RULES[AIR_FAMILY.ASCENDENTE].needs === STANCE.NEUTRAL);

check('el ASCENDENTE te deja en el aire al terminar',
    AIR_FAMILY_RULES[AIR_FAMILY.ASCENDENTE].endsIn === STANCE.AIRBORNE);

check('el DESCENDENTE te devuelve al suelo (hay recuperacion)',
    AIR_FAMILY_RULES[AIR_FAMILY.DESCENDENTE].endsIn === STANCE.NEUTRAL);

check('el ASCENDENTE es el unico con invulnerabilidad real',
    AIR_FAMILY_RULES[AIR_FAMILY.ASCENDENTE].airInvuln >
    AIR_FAMILY_RULES[AIR_FAMILY.AEREO].airInvuln);

check('pero es el que mas castigo tiene al bloquear (es lento a proposito)',
    AIR_FAMILY_RULES[AIR_FAMILY.ASCENDENTE].onBlock >
    AIR_FAMILY_RULES[AIR_FAMILY.DESCENDENTE].onBlock, {
    ascendente: AIR_FAMILY_RULES[AIR_FAMILY.ASCENDENTE].onBlock,
    descendente: AIR_FAMILY_RULES[AIR_FAMILY.DESCENDENTE].onBlock
});

// ---------------------------------------------------------------------------
// 4. Personajes con aereo SIN saltar
// ---------------------------------------------------------------------------
section('4. Ataques aereos sin saber saltar');

check('YUGO (boxeador) solo tiene aereo, y si salta', (() => {
    const y = AIR_PRESETS.YUGO;
    return canUseAirAttack(y, AIR_FAMILY.AEREO) &&
        !canUseAirAttack(y, AIR_FAMILY.ASCENDENTE) &&
        !canUseAirAttack(y, AIR_FAMILY.DESCENDENTE) &&
        y.jumps.length > 0;
})(), AIR_PRESETS.YUGO.jumps);

check('MONTE tiene las tres familias y multiples', (() => {
    const m = AIR_PRESETS.MONTE;
    return canUseAirAttack(m, AIR_FAMILY.AEREO) &&
        canUseAirAttack(m, AIR_FAMILY.ASCENDENTE) &&
        canUseAirAttack(m, AIR_FAMILY.DESCENDENTE) &&
        canDoubleJump(m);
})(), AIR_PRESETS.MONTE.jumps);

check('MUSASHI tiene ascendentes pero NINGUN salto multiple', (() => {
    const m = AIR_PRESETS.MUSASHI;
    return canUseAirAttack(m, AIR_FAMILY.ASCENDENTE) &&
        !canUseAirAttack(m, AIR_FAMILY.AEREO) &&
        !canDoubleJump(m);
})(), AIR_PRESETS.MUSASHI.jumps);

check('MONTE tiene salto acrobatico y YUGO no', (() => {
    return canAcroJump(AIR_PRESETS.MONTE) && !canAcroJump(AIR_PRESETS.YUGO);
})());

check('un personaje sin saltos no puede tener ataque AEREO', (() => {
    // El error mas facil al escribir un moveset: un aereo que nadie alcanza.
    const roto = { jumps: [], airAttacks: { [AIR_FAMILY.AEREO]: ['x'] } };
    return canUseAirAttack(roto, AIR_FAMILY.AEREO);
})());

check('checkPreset detecta ese mismo error', (() => {
    const r = checkPreset('YUGO');
    return r.ok === true;
})(), checkPreset('YUGO'));

check('un personaje vacio no rompe nada', checkPreset('NO_EXISTE').ok === false);

// ---------------------------------------------------------------------------
// 5. El ataque antiaereo desde el suelo
// ---------------------------------------------------------------------------
section('5. Antiaereo (pega en el aire pero sale del suelo)');

const patada = AIR_MOVES.patada_voladora;
const ascendente = AIR_MOVES.ascendente_marcial;

check('la patada voladora es antiaerea', patada.antiAir === true);
check('y es DESCENDENTE (sale del suelo, sube y cae)', patada.family === AIR_FAMILY.DESCENDENTE);
check('la patada voladora NO se puede bloquear', patada.block === ANTIAIR_BLOCK.UNBLOCKABLE);
check('y manda a volar al rival', patada.send === ANTIAIR_SEND.LAUNCH);
check('lleva grito', patada.shout === true);

check('el ascendente marcial SI se puede bloquear', ascendente.block === ANTIAIR_BLOCK.BLOCKABLE);
check('y tumba en vez de mandar a volar', ascendente.send === ANTIAIR_SEND.DROP);

check('la patada voladora hace mas dano que el ascendente',
    patada.damage > ascendente.damage, { patada: patada.damage, ascendente: ascendente.damage });

check('targetZone: contra rival en el aire pega a la cabeza',
    targetZone(true, true) === AIR_TARGET.AIR);
check('targetZone: contra rival de pie pega al cuerpo',
    targetZone(true, false) === AIR_TARGET.GROUND);
check('targetZone: un golpe normal no es antiaereo',
    targetZone(false, true) === AIR_TARGET.NONE);

// ---------------------------------------------------------------------------
// 6. Comandos de entrada
// ---------------------------------------------------------------------------
section('6. Comandos');

check('guardia + abajo = agachado en guardia',
    COMMAND_TABLE[COMMAND.GUARD_DOWN].stance === STANCE.CROUCH_GUARD,
    COMMAND_TABLE[COMMAND.GUARD_DOWN]);

check('arriba = salto alto', COMMAND_TABLE[COMMAND.UP].jump === JUMP.NORMAL);
check('arriba + adelante = salto al frente', COMMAND_TABLE[COMMAND.UP_FORWARD].jump === JUMP.FORWARD);
check('arriba + atras = salto atras', COMMAND_TABLE[COMMAND.UP_BACK].jump === JUMP.BACK);
check('toque de arriba = salto corto', COMMAND_TABLE[COMMAND.TAP_UP].jump === JUMP.SHORT);
check('doble arriba = salto multiple', COMMAND_TABLE[COMMAND.DOUBLE_TAP_UP].jump === JUMP.DOUBLE);

check('ningun comando de salto cambia la postura (se queda en el aire)',
    COMMAND_TABLE[COMMAND.UP].stance === null);

// ---------------------------------------------------------------------------
// 7. CHOCE · ATAQUE x DEFENSA
// ---------------------------------------------------------------------------
section('7. Choque: ataque x defensa');

/** Atacar a alguien de pie sin defensa. */
function golpea(ataque, defPosture, opts = {}) {
    return resolveClash(
        Object.assign({ x: -0.5, z: 0, posture: STANCE.RUN, attack: ataque }, opts.a || {}),
        Object.assign({ x: 0.5, z: 0, posture: defPosture }, opts.b || {})
    );
}

check('sin ataque, choque de cuerpos = empuje',
    golpea(CLASH_ATTACK.NONE, STANCE.NEUTRAL).result === CLASH.PUSH);

check('la carga de hombro manda a volar a uno de pie',
    golpea(CLASH_ATTACK.CHARGE, STANCE.NEUTRAL).result === CLASH.LAUNCH);

check('el takedown tumba a uno de pie',
    golpea(CLASH_ATTACK.TAKEDOWN, STANCE.NEUTRAL).result === CLASH.DROP);

check('el barrido tumba a uno de pie',
    golpea(CLASH_ATTACK.SWEEP, STANCE.NEUTRAL).result === CLASH.DROP);

// --- EL MURO: guardia baja plantada ---
check('takedown contra el MURO (agachado, guardia, plantado) = nada',
    golpea(CLASH_ATTACK.TAKEDOWN, STANCE.CROUCH_GUARD, { b: { planted: true } }).result === CLASH.ABSORB,
    golpea(CLASH_ATTACK.TAKEDOWN, STANCE.CROUCH_GUARD, { b: { planted: true } }).reason);

check('barrido contra el MURO = nada',
    golpea(CLASH_ATTACK.SWEEP, STANCE.CROUCH_GUARD, { b: { planted: true } }).result === CLASH.ABSORB);

check('PERO la carga de hombro si manda a volar al MURO (lo abre por arriba)',
    golpea(CLASH_ATTACK.CHARGE, STANCE.CROUCH_GUARD, { b: { planted: true } }).result === CLASH.LAUNCH);

check('el rodillazo tambien entra en el muro (pega abajo)',
    golpea(CLASH_ATTACK.KNEE, STANCE.CROUCH_GUARD, { b: { planted: true } }).result === CLASH.PROJECT);

// --- barrido contra guardia baja SUELTA (sin plantarse) ---
check('el barrido PIERDE contra guardia baja sin plantar',
    golpea(CLASH_ATTACK.SWEEP, STANCE.CROUCH, { b: { guard: true } }).result === CLASH.ABSORB);

check('y el takedown tambien se libra contra guardia baja',
    golpea(CLASH_ATTACK.TAKEDOWN, STANCE.CROUCH, { b: { guard: true } }).result === CLASH.TUMBLE);

check('el rodillazo es al reves: contra guardia ALTA no entra',
    golpea(CLASH_ATTACK.KNEE, STANCE.GUARD).result === CLASH.REBOUND);

check('pero contra el que esta agachado es justo lo que hay que pegarle',
    golpea(CLASH_ATTACK.KNEE, STANCE.CROUCH).result === CLASH.PROJECT);

// --- esquivar por encima ---
check('saltar esquiva cualquier ataque',
    golpea(CLASH_ATTACK.CHARGE, STANCE.AIRBORNE).result === CLASH.EVADE,
    golpea(CLASH_ATTACK.CHARGE, STANCE.AIRBORNE).reason);

check('tambien esquiva un barrido', golpea(CLASH_ATTACK.SWEEP, STANCE.AIRBORNE).result === CLASH.EVADE);

// --- pisoton ---
check('un rival en el suelo se PISA, no se choca',
    golpea(CLASH_ATTACK.NONE, STANCE.DOWNED).result === CLASH.STOMP);

check('y el pisoton hace dano al que esta tirado',
    golpea(CLASH_ATTACK.NONE, STANCE.DOWNED).damageB > 0);

// --- el agachado es desventaja, no muro ---
check('correr contra uno agachado lo arrolla (MUTUAL)',
    golpea(CLASH_ATTACK.NONE, STANCE.CROUCH).result === CLASH.MUTUAL);

check('correr contra guardia agachada tambien es MUTUAL',
    golpea(CLASH_ATTACK.NONE, STANCE.CROUCH_GUARD).result === CLASH.MUTUAL);

// ---------------------------------------------------------------------------
// 8. Piedra-papel-tijera del instante
// ---------------------------------------------------------------------------
section('8. Explotacion en el instante del impacto');

check('puño gana a accion', beats(INPUT.PUNCH, INPUT.ACTION));
check('accion gana a patada', beats(INPUT.ACTION, INPUT.KICK));
check('patada gana a puño', beats(INPUT.KICK, INPUT.PUNCH));
check('el ciclo se cierra (puño > accion > patada > puño)', (() => {
    return beats(INPUT.PUNCH, INPUT.ACTION) && beats(INPUT.ACTION, INPUT.KICK) &&
        beats(INPUT.KICK, INPUT.PUNCH);
})());
check('el mismo boton contra si mismo es empate', beats(INPUT.PUNCH, INPUT.PUNCH) === false);

check('quien gana la explotacion manda en el veredicto', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, attack: CLASH_ATTACK.NONE, input: INPUT.PUNCH },
        { x: 0.5, z: 0, posture: STANCE.GUARD, input: INPUT.ACTION }
    );
    return v.exploitation === 'A' && v.damageB > 0 && v.damageA === 0;
})());

check('gana B si es el que explota bien', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, input: INPUT.ACTION },
        { x: 0.5, z: 0, posture: STANCE.GUARD, input: INPUT.PUNCH }
    );
    return v.exploitation === 'B' && v.damageA > 0;
})());

check('si los dos pulsan lo mismo, no hay explotacion (sigue la tabla)', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, attack: CLASH_ATTACK.CHARGE, input: INPUT.PUNCH },
        { x: 0.5, z: 0, posture: STANCE.NEUTRAL, input: INPUT.PUNCH }
    );
    return v.exploitation === null && v.result === CLASH.LAUNCH;
})());

check('la accion es el unico que NO tumba: desequilibra', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, input: INPUT.ACTION },
        { x: 0.5, z: 0, posture: STANCE.GUARD }
    );
    return v.result === CLASH.TUMBLE;
})());

check('el puño y la patada si mandan al suelo', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, input: INPUT.PUNCH },
        { x: 0.5, z: 0, posture: STANCE.GUARD }
    );
    return v.result === CLASH.PROJECT;
})());

// ---------------------------------------------------------------------------
// 9. Guardia en el impacto y abrazo
// ---------------------------------------------------------------------------
section('9. Ponerse fuerte y abrazo');

check('la guardia convierte un DROP en REBOUND (se pone fuerte)', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.RUN, attack: CLASH_ATTACK.TAKEDOWN, guard: true },
        { x: 0.5, z: 0, posture: STANCE.NEUTRAL }
    );
    return v.result === CLASH.REBOUND;
})());

check('un DASH contra quien se pone fuerte abre ABRAZO', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.DASH, attack: CLASH_ATTACK.CHARGE },
        { x: 0.5, z: 0, posture: STANCE.NEUTRAL, guard: true }
    );
    return v.result === CLASH.CLINCH && v.clinch === true;
})());

check('el abrazo se resuelve al final, con castigo', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.DASH },
        { x: 0.5, z: 0, posture: STANCE.NEUTRAL, guard: true }
    );
    const fin = resolveClinch(v, 3, 1);
    return fin.clinch === false && fin.damageB > 0 && fin.damageA === 0;
})());

check('si el otro lleva mas momento, gana el el abrazo', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.DASH },
        { x: 0.5, z: 0, posture: STANCE.NEUTRAL, guard: true }
    );
    const fin = resolveClinch(v, 1, 5);
    return fin.damageA > 0 && fin.damageB === 0;
})());

// ---------------------------------------------------------------------------
// 10. Que no rompe con datos raros
// ---------------------------------------------------------------------------
section('10. Robustez');

check('un enemigo en el aire esquiva y no hay choque', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.AIRBORNE },
        { x: 0.5, z: 0, posture: STANCE.RUN }
    );
    return v.isClash === false && v.result === CLASH.EVADE;
})());

check('ambos agarrados no es choque', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.GRAPPLE },
        { x: 0.5, z: 0, posture: STANCE.GRAPPLE }
    );
    return v.isClash === false && v.result === CLASH.ABSORB;
})());

check('los dos en el suelo no es choque', (() => {
    const v = resolveClash(
        { x: -0.5, z: 0, posture: STANCE.DOWNED },
        { x: 0.5, z: 0, posture: STANCE.DOWNED }
    );
    return v.isClash === false;
})());

check('posiciones identicas (solape) dan una normal valida', (() => {
    const v = resolveClash(
        { x: 0, z: 0, posture: STANCE.RUN, attack: CLASH_ATTACK.CHARGE },
        { x: 0, z: 0, posture: STANCE.NEUTRAL }
    );
    return isFinite(v.normal.x) && isFinite(v.normal.z);
})());

check('defenseFrom: agachado + guardia + plantado = MURO', (() => {
    return defenseFrom(STANCE.CROUCH_GUARD, true, true) === DEFENSE.PLANTED_LOW;
})());

check('defenseFrom: agachado + guardia SIN plantar = solo guardia baja', (() => {
    return defenseFrom(STANCE.CROUCH_GUARD, true, false) === DEFENSE.GUARD_LOW;
})());

check('defenseFrom: en el aire = esquivar', (() => {
    return defenseFrom(STANCE.AIRBORNE, false, false) === DEFENSE.EVADE;
})());

// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`air + clinch: ${passed} ok, ${failed} fallos`);
console.log('================================================================');

if (failed > 0) process.exit(1);
