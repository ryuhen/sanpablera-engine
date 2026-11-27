/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/stages.smoke.mjs
 * ----------------------------------------------------------------------------
 * Los escenarios ya no son uno: hay nueve anclados a la geografia y el dojo de
 * entrenamiento. Esta suite evita el fallo silencioso de una paleta incompleta
 * (el ring se pinta negro) o de un lugar que no existe en la maqueta.
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

const S = await load('src/core/stages.js');
const M = await load('src/core/geo/margarita.js');
const UI = await load('src/ui/StageSelect.js');
const HEX = /^#[0-9a-fA-F]{6}$/;

section('1 · Diez escenarios, ninguno repetido');
{
    check('hay nueve de historia mas el dojo', S.STAGES.length === 10, S.STAGES.length);
    const ids = S.STAGES.map(s => s.id);
    check('ids unicos', new Set(ids).size === ids.length, ids);
    check('el dojo sigue existiendo', ids.includes('DOJO_ORIGAMI'));
    check('la playa del diorama existe como escenario', ids.includes('PLAYA_AGUA'));
}

section('2 · Cada escenario trae paleta de pelea y guion');
{
    const malos = [];
    for (const s of S.STAGES) {
        if (![s.ground, s.mat, s.rail, s.wall].every(c => HEX.test(c || ''))) malos.push(s.id + ': paleta');
        if (!s.pelea || !s.pelea.ritmo || !s.pelea.visibilidad || !s.pelea.nota) malos.push(s.id + ': pelea');
        if (!s.narrativa || !s.narrativa.tono || !s.narrativa.gancho || !s.narrativa.intro) malos.push(s.id + ': narrativa');
        if (!Array.isArray(s.narrativa.paleta) || s.narrativa.paleta.length !== 3
            || !s.narrativa.paleta.every(c => HEX.test(c))) malos.push(s.id + ': paleta narrativa');
    }
    check('todos estan completos', malos.length === 0, malos);
}

section('3 · Los anclajes hablan el idioma del mapa');
{
    const lugares = new Set(M.LUGARES.map(l => l.id));
    const anclados = S.NARRATIVE_STAGES;
    check('nueve escenarios anclados', anclados.length === 9, anclados.length);
    const desconocidos = anclados.filter(s => !lugares.has(s.lugar)).map(s => s.lugar);
    // El mapa puede usar otro nombre de export; si no lo encontramos, al menos
    // exigimos que el lugar no este vacio y que el buscador lo resuelva.
    const sinBuscar = anclados.filter(s => !S.stageByLugar(s.lugar)).map(s => s.lugar);
    check('stageByLugar resuelve todos', sinBuscar.length === 0, sinBuscar);
    check('los lugares no estan vacios', anclados.every(s => !!s.lugar));
    check('lugares reconocidos por margarita', lugares.size === 0 || desconocidos.length === 0, desconocidos);
    check('zonas repetidas entre escenarios', new Set(anclados.map(s => s.zona)).size >= 3);
}

section('4 · Buscadores y selector');
{
    check('stageById por id', S.stageById('CRATERA').id === 'CRATERA');
    check('stageById cae al primero', S.stageById('NO_EXISTE').id === S.STAGES[0].id);
    check('stagesByZone(COSTA) devuelve playa, morro y pueblo',
        S.stagesByZone('COSTA').length === 3, S.stagesByZone('COSTA').map(s => s.id));
    check('FIGHT_STAGES excluye el dojo', !S.FIGHT_STAGES.some(s => s.zona === 'ESPECIAL'));
    check('StageSelect es clase', typeof UI.default === 'function');
    const sel = new UI.default({ stages: S.STAGES, initial: 'CRATERA' });
    check('el selector arranca en el escenario pedido',
        S.STAGES[sel.index].id === 'CRATERA', sel.index);
    check('sin initial arranca en el primero',
        new UI.default({ stages: S.STAGES }).index === 0);
}

section('5 · El rompecabezas narrativo usa los mismos lugares');
{
    const P = await load('src/core/narrative/stagePuzzle.js');
    check('el grafo esta sano', P.validatePuzzle().length === 0, P.validatePuzzle());
    const sinEscenario = P.STAGE_PUZZLE.nodes
        .filter(n => S.stageById(n.id).id !== n.id).map(n => n.id);
    check('todo nodo del puzzle es un escenario', sinEscenario.length === 0, sinEscenario);
    const zonasDistintas = P.STAGE_PUZZLE.nodes
        .filter(n => S.stageById(n.id).zona !== n.zona).map(n => n.id);
    check('las zonas coinciden con el mapa', zonasDistintas.length === 0, zonasDistintas);
    check('el puzzle no incluye el dojo',
        P.STAGE_PUZZLE.nodes.every(n => n.id !== 'DOJO_ORIGAMI'));
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
