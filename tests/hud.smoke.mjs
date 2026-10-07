/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/hud.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de los helpers puros del HUD (ui/HUD.js): clampStat y barColor.
 *
 * El resto del HUD (DOM, lerp, estilo) no se testea en Node porque necesita
 * un navegador: se deja la parte que calcula numeros, que es donde viven los
 * bugs clasicos (una barra que pasa de 100, una vida que baja de cero, un
 * threshold de color desplazado).
 *
 *   node tests/hud.smoke.mjs
 * ============================================================================
 */
import {
    clampStat, barColor, LOW_HEALTH_THRESHOLD, MAX_STAT, formatTimer
} from '../src/ui/HUD.js';

let pass = 0;
const fails = [];

function ok(cond, name, extra) {
    if (cond) { pass++; return true; }
    fails.push(extra ? `${name} :: ${extra}` : name);
    return false;
}

function run(name, fn) {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) { fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n')[0] : e}`); }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
}

run('clampStat', () => {
    ok(clampStat(0) === 0, 'escala en 0');
    ok(clampStat(MAX_STAT) === MAX_STAT, 'tope superior es MAX_STAT');
    ok(clampStat(50) === 50, 'valores intermedios pasan tal cual');
    ok(clampStat(-5) === 0, 'nunca baja de 0');
    ok(clampStat(150) === MAX_STAT, 'nunca pasa de MAX_STAT');
    ok(clampStat(undefined) === MAX_STAT, 'undefined se lee como "barra llena"');
    ok(clampStat(null) === MAX_STAT, 'null se lee como "barra llena"');
    ok(clampStat(NaN) === MAX_STAT, 'NaN no rompe: se lee como "barra llena"');
    ok(clampStat('40') === 40, 'string numerico se convierte');
    ok(clampStat(30, 200) === 30, 'respeta el maximo por-luchador');
    ok(clampStat(250, 200) === 200, 'topa con el maximo por-luchador');
});

run('barColor', () => {
    ok(barColor(1) === '#43c46b', 'salud maxima = verde');
    ok(barColor(0.5) === '#e8a41c', 'media = amber');
    ok(barColor(LOW_HEALTH_THRESHOLD) === '#e0342c', 'umbral bajo = rojo');
    ok(barColor(1) !== barColor(0.5) && barColor(0.5) !== barColor(0.1), 'los tres estados son distinguibles');
    ok(barColor(0) === '#5c1518', 'a cero queda un rojo oscuro muerto');
    ok(barColor(-1) === '#5c1518', 'ratio negativo cae en el mismo color que 0');
});

run('formatTimer', () => {
    ok(formatTimer(99) === '99', '99 segundos -> "99"');
    ok(formatTimer(7) === '07', 'un digito se rellena a dos');
    ok(formatTimer(0) === '00', 'cero -> "00"');
    ok(formatTimer(-3) === '00', 'negativo nunca baja de 00');
    ok(formatTimer(120.7) === '120', 'se trunca a segundos enteros');
    ok(formatTimer(5.99) === '05', '5.99 -> 05 (no redondea arriba)');
});

// ---------------------------------------------------------------------------
console.log(`\nHUD: ${pass} ok, ${fails.length} fallos.`);
if (fails.length) {
    console.log('FALLOS:');
    fails.forEach(f => console.log('  - ' + f));
    process.exit(1);
}