/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/stamina.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la barra de stamina (core/combat/Stamina.js):
 * clasificacion del rumbo (hacia / alejandose / lateral), tasas de consumo
 * (1x, 1.5x, 0x), regeneracion al parar y costes de parkour.
 *
 *   node tests/stamina.smoke.mjs
 * ============================================================================
 */
import {
    classifyMove, StaminaGauge, PARKOUR_COST,
    MOVE_CLASS, STAMINA_MAX, RUN_BASE_DRAIN_PER_SEC, RUN_AWAY_MULTIPLIER
} from '../src/core/combat/Stamina.js';

let pass = 0;
const fails = [];

function ok(cond, name, extra) {
    if (cond) { pass++; return true; }
    fails.push(extra ? `${name} :: ${extra}` : name);
    return false;
}
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

function run(name, fn) {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) { fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n')[0] : e}`); }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
}

run('classifyMove', () => {
    // (mx,mz) movimiento, (ox,oz) vector hacia el rival.
    ok(classifyMove(0, 1, 0, 1) === MOVE_CLASS.TOWARD, 'hacia el rival = TOWARD');
    ok(classifyMove(0, -1, 0, 1) === MOVE_CLASS.AWAY, 'dale la espalda = AWAY');
    ok(classifyMove(1, 0, 0, 1) === MOVE_CLASS.LATERAL, 'perpendicular = LATERAL');
    ok(classifyMove(-1, 0, 0, 1) === MOVE_CLASS.LATERAL, 'perpendicular contraria = LATERAL');
    ok(classifyMove(0.7071, 0.7071, 0, 1) === MOVE_CLASS.TOWARD, 'diagonal a 45 grados hacia el rival = TOWARD');
    ok(classifyMove(1, 0.2, 0, 1) === MOVE_CLASS.LATERAL, 'casi paralelo (barrido lateral) = LATERAL');
    ok(classifyMove(0, 0, 0, 1) === null, 'sin movimiento = null');
    ok(classifyMove(0, 1, 0, 0) === null, 'sin vector al rival = null');
    ok(classifyMove(10, 0.1, 10, 0) === MOVE_CLASS.TOWARD, 'casi paralelo por delante = TOWARD');
});

run('consumo al correr', () => {
    // Coge un gauge lleno y un paso de 1 s hacia el rival.
    const toward = new StaminaGauge();
    const dt = 1; // hablar de "por segundo" es mas claro que 1/60
    const res = toward.update(dt, { running: true, moveX: 0, moveZ: 1, toOppX: 0, toOppZ: 1 });
    ok(near(toward.value, STAMINA_MAX - RUN_BASE_DRAIN_PER_SEC), 'hacia el rival = tasa base (1x)');
    ok(near(res.drain, RUN_BASE_DRAIN_PER_SEC), 'devuelve los puntos drenados');
    ok(res.move === MOVE_CLASS.TOWARD, 'reporta TOWARD');

    // Huida: 1.5x.
    const away = new StaminaGauge();
    away.update(dt, { running: true, moveX: 0, moveZ: -1, toOppX: 0, toOppZ: 1 });
    ok(near(away.value, STAMINA_MAX - RUN_BASE_DRAIN_PER_SEC * RUN_AWAY_MULTIPLIER),
        'alejandose = 1.5x la base');

    // Lateral/paralelo: 0x.
    const lateral = new StaminaGauge();
    lateral.update(dt, { running: true, moveX: 1, moveZ: 0, toOppX: 0, toOppZ: 1 });
    ok(lateral.value === STAMINA_MAX, 'lateral/en paralelo = no consume nada');
});

run('solo se corre unos segundos', () => {
    // 100 pts a 18/s de frente = ~5,55 s a tope. A 1/60 de paso.
    const g = new StaminaGauge();
    for (let i = 0; i < 30; i++) {
        g.update(1 / 60, { running: true, moveX: 0, moveZ: 1, toOppX: 0, toOppZ: 1 });
    }
    ok(g.value > 0, 'no se vacia en medio segundo');
    for (let i = 0; i < 340; i++) { // hasta 6,2 s en total
        g.update(1 / 60, { running: true, moveX: 0, moveZ: 1, toOppX: 0, toOppZ: 1 });
    }
    ok(g.value === 0, 'agotada pasados los ~5,5 s de carrera');
    ok(!g.canRun(), 'sin stamina no se puede arrancar otra carrera');
});

run('regeneracion y lateral camina', () => {
    const g = new StaminaGauge({ value: 50 });
    g.update(1, { running: false });
    ok(near(g.value, 50 + 24), 'regenera al no correr');
    g.update(10, { running: false });
    ok(g.value === STAMINA_MAX, 'nunca pasa del maximo');
});

run('parkour', () => {
    const g = new StaminaGauge({ value: PARKOUR_COST.REBOTE + PARKOUR_COST.DESLIZAR });
    ok(g.spendParkour('REBOTE') === true, 'rebote se paga');
    ok(g.value === PARKOUR_COST.DESLIZAR, 'descuenta el coste del rebote');
    ok(g.spendParkour('DESLIZAR') === true, 'deslizarse se paga');
    ok(g.value === 0, 'quedaron 0 pts');
    ok(g.spendParkour('REBOTE') === false, 'sin stamina la maniobra NO sale');
    ok(!g.spendParkour('VUELO'), 'maniobra desconocida = false');
    ok(g.spendParkour('DESLIZAR') === false, 'y sigue false sin haber drenado');
});

// ---------------------------------------------------------------------------
console.log(`\nStamina: ${pass} ok, ${fails.length} fallos.`);
if (fails.length) {
    console.log('FALLOS:');
    fails.forEach(f => console.log('  - ' + f));
    process.exit(1);
}