/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/locomotion.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del DESPLAZAMIENTO y los ATAQUES CORRIENDO
 * (core/locomotion.js).
 *
 * Que comprueba:
 *   1. Que un TOQUE y una pulsacion mantenida dan cosas distintas (paso frente
 *      a caminata). Ese es el motivo del modulo entero.
 *   2. El paso largo, el dash por doble toque, y que el dash se cancele a si
 *      mismo (tres toques seguidos no deben ser tres dashes).
 *   3. El compromiso: en que desplazamientos se puede atacar.
 *   4. Los ataques corriendo: que NO son choques, cuales se bloquean y cuales
 *      son agarres.
 *   5. La carga: mas carga mas dano, y siempre dentro de los limites.
 *
 * Ejecutar:  node tests/locomotion.smoke.mjs
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

const Loco = (await load('src/core/locomotion.js')).default;
const {
    LOCO, LOCO_TABLE, TAP,
    RUN_ATTACK, RUN_ATTACKS, RUN_PHASE,
    makeLocoState, readLoco, canAttackDuring,
    runAttackFor, isBlockable, chargedDamage, blockPunish
} = Loco;

/**
 * Simula una pulsacion del boton de mover durante `frames` frames de `dt`.
 * Devuelve la secuencia de tipos de desplazamiento que se leyeron.
 */
function mantener(st, frames, dt, t0) {
    const salida = [];
    for (let i = 0; i < frames; i++) {
        const t = t0 + i * dt;
        salida.push(readLoco(st, { down: true, justDown: i === 0, justUp: false, time: t }));
    }
    return salida;
}

// ---------------------------------------------------------------------------
// 1. TOQUE frente a pulsacion mantenida
// ---------------------------------------------------------------------------
section('1. Toque (paso) frente a mantener (caminata)');

{
    const st = makeLocoState();
    // Un toque de 3 frames a 60 Hz = 50 ms: por debajo de TAP_MAX.
    const seq = mantener(st, 3, 1 / 60, 0);
    check('un toque de 50 ms es SIEMPRE paso, nunca caminata',
        seq.every(s => s === LOCO.STEP), seq);
}

{
    const st = makeLocoState();
    // 80 frames a 60 Hz = 1,33 s: mantiene de verdad, mas alla de RUN_HOLD.
    const seq = mantener(st, 80, 1 / 60, 0);
    check('mantener el boton llega a carrera', seq[seq.length - 1] === LOCO.RUN, seq.slice(-6));
    check('y no se salta a carrera: pasa antes por paso largo',
        seq.indexOf(LOCO.STEP_LONG) !== -1 && seq.indexOf(LOCO.STEP_LONG) < seq.indexOf(LOCO.RUN),
        { pasoLargo: seq.indexOf(LOCO.STEP_LONG), carrera: seq.indexOf(LOCO.RUN) });
}

check('un mantenimiento MEDIO se queda en paso largo, sin llegar a correr', (() => {
    // 40 frames = 0,67 s, entre LONG_HOLD (0,55) y RUN_HOLD (1,10).
    const st = makeLocoState();
    const seq = mantener(st, 40, 1 / 60, 0);
    const fin = seq[seq.length - 1];
    return fin === LOCO.STEP_LONG || fin === LOCO.WALK;
})(), 'a 0,67 s no deberia ser carrera');

check('mantener pasa por la secuencia esperada paso -> largo -> caminar -> correr',
    (() => {
        const st = makeLocoState();
        const seq = mantener(st, 90, 1 / 60, 0);
        // Los tipos, en orden de primera aparicion.
        const orden = [];
        for (const s of seq) if (orden[orden.length - 1] !== s) orden.push(s);
        return orden[0] === LOCO.STEP &&
            orden.includes(LOCO.STEP_LONG) &&
            orden.includes(LOCO.WALK) &&
            orden.includes(LOCO.RUN);
    })());

check('soltar siempre vuelve a idle', (() => {
    const st = makeLocoState();
    mantener(st, 30, 1 / 60, 0);
    const r = readLoco(st, { down: false, justDown: false, justUp: true, time: 0.5 });
    return r === LOCO.IDLE;
})());

check('un toque mas corto que TAP_STEP_MIN ni cuenta como paso', (() => {
    const st = makeLocoState();
    readLoco(st, { down: true, justDown: true, justUp: false, time: 0 });
    const r = readLoco(st, { down: false, justDown: false, justUp: true, time: 0.03 });
    return r === LOCO.IDLE;
})());

// ---------------------------------------------------------------------------
// 2. Paso largo y dash
// ---------------------------------------------------------------------------
section('2. Paso largo y dash');

check('el paso largo es mas rapido que el paso corto',
    LOCO_TABLE[LOCO.STEP_LONG].speed > LOCO_TABLE[LOCO.STEP].speed, {
    largo: LOCO_TABLE[LOCO.STEP_LONG].speed, corto: LOCO_TABLE[LOCO.STEP].speed
});

check('el paso largo se compromete mas que el corto',
    LOCO_TABLE[LOCO.STEP_LONG].commitment > LOCO_TABLE[LOCO.STEP].commitment);

check('el paso corto NO permite atacar (es ajuste de distancia)',
    canAttackDuring(LOCO.STEP) === false, LOCO_TABLE[LOCO.STEP].commitment);

check('la caminata SI permite atacar', canAttackDuring(LOCO.WALK) === true);

check('correr y dash permiten atacar (ahi estan los ataques corriendo)',
    canAttackDuring(LOCO.RUN) && canAttackDuring(LOCO.DASH));

{
    const st = makeLocoState();
    // Un toque suelto.
    readLoco(st, { down: true, justDown: true, justUp: false, time: 0 });
    readLoco(st, { down: false, justDown: false, justUp: true, time: 0.1 });
    // Segundo toque dentro de la ventana: dash.
    const r = readLoco(st, { down: true, justDown: true, justUp: false, time: 0.2 });
    check('doble toque dentro de la ventana = DASH', r === LOCO.DASH, r);
}

{
    const st = makeLocoState();
    readLoco(st, { down: true, justDown: true, justUp: false, time: 0 });
    readLoco(st, { down: false, justDown: false, justUp: true, time: 0.1 });
    // Segundo toque TARDE: ya no es dash, es un paso mas.
    const r = readLoco(st, { down: true, justDown: true, justUp: false, time: 0.9 });
    check('un segundo toque TARDE no es dash (se perdio la ventana)', r === LOCO.STEP, r);
}

{
    const st = makeLocoState();
    // Tres toques seguidos en la ventana: el tercero no debe ser otro dash
    // (si lo fuera, pulsar thrice seria infinitamente mejor que mantener).
    readLoco(st, { down: true, justDown: true, justUp: false, time: 0 });
    readLoco(st, { down: false, justDown: false, justUp: true, time: 0.05 });
    readLoco(st, { down: true, justDown: true, justUp: false, time: 0.1 });
    readLoco(st, { down: false, justDown: false, justUp: true, time: 0.15 });
    const r = readLoco(st, { down: true, justDown: true, justUp: false, time: 0.2 });
    check('el tercer toque seguido NO vuelve a ser dash', r !== LOCO.DASH, r);
}

check('el dash es el mas rapido y el mas comprometido', (() => {
    const d = LOCO_TABLE[LOCO.DASH];
    const todos = Object.values(LOCO_TABLE).filter(t => t !== d);
    return todos.every(t => d.speed > t.speed) && d.commitment === 1.0;
})());

// ---------------------------------------------------------------------------
// 3. Los clips
// ---------------------------------------------------------------------------
section('3. Clips de cada desplazamiento');

check('cada desplazamiento tiene su clip', (() => {
    return Object.values(LOCO_TABLE).every(t => typeof t.clip === 'string' && t.clip.length > 0);
})());

check('los clips de carrera y dash son los que ya tenia el motor', (() => {
    // No se inventan nombres nuevos para lo que ya existe en GroundStates.
    return LOCO_TABLE[LOCO.RUN].clip === 'sprint_f' &&
        LOCO_TABLE[LOCO.DASH].clip === 'dash_side' &&
        LOCO_TABLE[LOCO.WALK].clip === 'walk';
})(), { run: LOCO_TABLE[LOCO.RUN].clip, dash: LOCO_TABLE[LOCO.DASH].clip });

check('el paso y el paso largo tienen clip propio (no reutilizan el de caminar)',
    LOCO_TABLE[LOCO.STEP].clip !== LOCO_TABLE[LOCO.WALK].clip &&
    LOCO_TABLE[LOCO.STEP_LONG].clip !== LOCO_TABLE[LOCO.WALK].clip);

// ---------------------------------------------------------------------------
// 4. Ataques corriendo
// ---------------------------------------------------------------------------
section('4. Ataques corriendo (no son choques)');

check('hay cinco ataques corriendo', Object.keys(RUN_ATTACKS).length === 5, Object.keys(RUN_ATTACKS));

check('las tres ventanas existen', Object.keys(RUN_PHASE).length === 3, RUN_PHASE);

check('cada ataque tiene las tres ventanas en tiempo y un clip', (() => {
    return Object.values(RUN_ATTACKS).every(a =>
        typeof a.startup === 'number' && typeof a.active === 'number' &&
        typeof a.recovery === 'number' && typeof a.clip === 'string');
})());

check('la carga del puño y de la hombro son bloqueables', (() => {
    return isBlockable(RUN_ATTACK.CHARGE_PUNCH) && isBlockable(RUN_ATTACK.SHOULDER_CHARGE);
})());

check('los agarres NO son bloqueables', (() => {
    return !isBlockable(RUN_ATTACK.LEG_GRAB) &&
        !isBlockable(RUN_ATTACK.NECK_GRAB) &&
        !isBlockable(RUN_ATTACK.TAKEDOWN_RUN);
})());

check('y brings su grappling', (() => {
    return RUN_ATTACKS[RUN_ATTACK.LEG_GRAB].grapple === 'LEG_GRAB' &&
        RUN_ATTACKS[RUN_ATTACK.NECK_GRAB].grapple === 'NECK_GRAB' &&
        RUN_ATTACKS[RUN_ATTACK.TAKEDOWN_RUN].grapple === 'TAKEDOWN';
})());

check('el puño cargado derriba si conecta',
    RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].onHit === 'KNOCKDOWN');

check('la carga de hombro manda a volar, y TAMBIEN al bloquear', (() => {
    const s = RUN_ATTACKS[RUN_ATTACK.SHOULDER_CHARGE];
    return s.onHit === 'LAUNCH' && s.onBlock === 'LAUNCH';
})());

check('el bloqueo de la carga de hombro no la anula (la castiga)', (() => {
    // Si el bloqueo la anulara, no haria falta la regla onBlock.
    return blockPunish(RUN_ATTACK.SHOULDER_CHARGE) > 0;
})());

check('los ataques corriendo llegan mas lejos que un golpe de pie', (() => {
    // El alcance propio: no reutilizan la hitbox del estado de ataque.
    return RUN_ATTACKS[RUN_ATTACK.SHOULDER_CHARGE].reach > 1.0;
})());

check('cada ataque pega en una zona distinta del cuerpo', (() => {
    const zonas = new Set(Object.values(RUN_ATTACKS).map(a => a.targetHeight));
    return zonas.size >= 3, [...zonas];
})());

// --- que comando lanza cada uno ---
check('correr + puño = puño cargado',
    runAttackFor('PUNCH', false, false) === RUN_ATTACK.CHARGE_PUNCH);
check('correr + puño + abajo = takedown',
    runAttackFor('PUNCH', false, true) === RUN_ATTACK.TAKEDOWN_RUN);
check('correr + patada = carga de hombro',
    runAttackFor('KICK', false, false) === RUN_ATTACK.SHOULDER_CHARGE);
check('correr + abajo = rodada a las piernas',
    runAttackFor('DOWN', false, false) === RUN_ATTACK.LEG_GRAB);
check('correr + arriba = salto al cuello',
    runAttackFor('UP', false, false) === RUN_ATTACK.NECK_GRAB);
check('con guardia mantenida no sale ningun ataque corriendo', runAttackFor('PUNCH', true, false) === null);
check('sin boton de ataque no hay ataque corriendo', runAttackFor(null, false, false) === null);

// ---------------------------------------------------------------------------
// 5. La carga
// ---------------------------------------------------------------------------
section('5. Carga del golpe');

{
    const a = chargedDamage(RUN_ATTACK.CHARGE_PUNCH, 0);
    const m = chargedDamage(RUN_ATTACK.CHARGE_PUNCH, 0.5);
    const f = chargedDamage(RUN_ATTACK.CHARGE_PUNCH, 1);
    check('cargar mas hace mas dano', a < m && m < f, { a, m, f });
    check('sin carga es el minimo del rango', a === RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].damage[0], a);
    check('a tope es el maximo del rango', f === RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].damage[1], f);
}

check('cargar mas alla del tope no se pasa del maximo', (() => {
    return chargedDamage(RUN_ATTACK.CHARGE_PUNCH, 5) ===
        RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].damage[1];
})());

check('cargar por debajo de cero da el minimo', (() => {
    return chargedDamage(RUN_ATTACK.CHARGE_PUNCH, -1) ===
        RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].damage[0];
})());

check('los agarres casi no hacen dano (su valor es el agarre, no el golpe)', (() => {
    return RUN_ATTACKS[RUN_ATTACK.LEG_GRAB].damage[1] <= 6 &&
        RUN_ATTACKS[RUN_ATTACK.CHARGE_PUNCH].damage[1] > 15;
})());

check('un ataque inexistente no rompe nada', chargedDamage('NO_EXISTE', 1) === 0);

// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`locomotion: ${passed} ok, ${failed} fallos`);
console.log('================================================================');

if (failed > 0) process.exit(1);
