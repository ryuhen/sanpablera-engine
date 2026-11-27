/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/stagepuzzle.smoke.mjs
 * ----------------------------------------------------------------------------
 * Narrativa de acción en puzzle: nodos por regiones, transiciones por acciones
 * (caer, saltar, lanzar...), estado determinista. Módulo PURO.
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
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

const P = await load('src/core/narrative/stagePuzzle.js');

section('estructura');
check('exporta STAGE_PUZZLE', !!P.STAGE_PUZZLE);
check('nodos >= 8', P.STAGE_PUZZLE.nodes.length >= 8, P.STAGE_PUZZLE.nodes.length);
check('edges >= 10', P.STAGE_PUZZLE.edges.length >= 10, P.STAGE_PUZZLE.edges.length);
check('validatePuzzle sin issues', P.validatePuzzle().length === 0, P.validatePuzzle());
check('regiones cubren COSTA/SUR_SECO/MACIZO/CERRO',
    ['COSTA', 'SUR_SECO', 'MACIZO', 'CERRO'].every((r) => P.STAGE_PUZZLE.regiones[r]));

section('nodos');
const playa = P.getNode('PLAYA_AGUA');
check('getNode PLAYA_AGUA', !!playa);
check('nodo tiene region/zona', playa.region === 'COSTA' && playa.zona === 'COSTA');
check('nodo tiene anchors', Array.isArray(playa.anchors) && playa.anchors.length > 0);
check('getNode desconocido null', P.getNode('NO_EXISTE') === null);

section('transiciones por accion');
const salto = P.resolveTransition('PLAYA_AGUA', P.ACTION_TRIGGER.SALTO, {});
check('salto desde playa resuelve', !!salto, salto?.id);
check('salto lleva a otro nodo', salto && salto.to !== 'PLAYA_AGUA', salto?.to);
const caida = P.resolveTransition('EL_MORRO', P.ACTION_TRIGGER.CAIDA, {});
check('caida desde morro resuelve', caida?.to === 'PLAYA_AGUA', caida?.to);
check('accion inexistente da null', P.resolveTransition('PLAYA_AGUA', P.ACTION_TRIGGER.EXPLOSION, {}) === null);

section('bidireccional/reversa');
const rev = P.resolveTransition('EL_MORRO', P.ACTION_TRIGGER.SALTO, {});
check('reversa bidireccional disponible', !!rev && rev.to === 'PLAYA_AGUA', rev?.id);
check('reversa marcada', !!rev?._reversed);

section('requisitos');
const cond = P.resolveTransition('CRATERA', P.ACTION_TRIGGER.ROMPER_SUELO, {});
check('condicional sin flag no resuelve', cond === null);
const condOk = P.resolveTransition('CRATERA', P.ACTION_TRIGGER.ROMPER_SUELO, { flags: { suelo_hueco_descubierto: true } });
check('condicional con flag resuelve', condOk?.to === 'CANYON_SECO', condOk?.to);
const statNo = P.resolveTransition('CANYON_SECO', P.ACTION_TRIGGER.ROMPER_PARED, { stats: { power: 50 } });
check('requisito stat insuficiente no resuelve', statNo === null);
const statOk = P.resolveTransition('CANYON_SECO', P.ACTION_TRIGGER.ROMPER_PARED, { stats: { power: 80 } });
check('requisito stat suficiente resuelve', statOk?.to === 'VILLA_BASALTICA', statOk?.to);

section('estado');
const s0 = P.createPuzzleState({ startNode: 'PLAYA_AGUA' });
check('estado inicial', s0.currentNode === 'PLAYA_AGUA' && s0.history.length === 0);
const s1 = P.applyTransition(s0, salto, { at: 10 });
check('applyTransition mueve nodo', s1.currentNode === salto.to);
check('applyTransition guarda historial', s1.history.length === 1 && s1.history[0].from === 'PLAYA_AGUA');
check('applyTransition no muta original', s0.currentNode === 'PLAYA_AGUA' && s0.history.length === 0);
check('start desconocido lanza', throws(() => P.createPuzzleState({ startNode: 'NOPE' })));

section('grafo navegable');
const reach = P.reachableFrom('PLAYA_AGUA', 2);
check('reachableFrom devuelve rutas', reach.length > 0);
check('reachableFrom respeta profundidad', reach.every((r) => r.depth <= 2));
const avail = P.availableTransitions('PLAYA_AGUA', {});
check('availableTransitions lista opciones', avail.length > 0);

console.log(`\n[stagepuzzle.smoke] ${passed} passed, ${failed.length} failed`);
if (failed.length) {
    for (const f of failed) console.log('  - ' + f);
    process.exit(1);
}
