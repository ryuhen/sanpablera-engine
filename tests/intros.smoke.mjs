/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/intros.smoke.mjs
 * ----------------------------------------------------------------------------
 * Guiones de entrada de los ocho peleadores. Comprueba que no se han quedado en
 * un cajón: cada beat apunta a un clip REAL de la biblioteca (resolviendo
 * alias), y el validador sirve también para intros genericos.
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

const I = await load('src/core/cine/fighterIntros.js');
const ROSTER = await load('src/core/roster.js');
const CL = await load('src/core/anim/ClipLibrary.js');
const RIG = await load('src/core/entities/FighterRig.js');
const CM = await load('src/core/anim/ClipMap.js');

const ocho = ROSTER.default;

section('1 · Un guion por peleador del juego');
{
    check('hay ocho intros authoring',
        ocho.every(s => !!I.FIGHTER_INTROS[s.id]), ocho.map(s => s.id));
    check('estructura valida', I.validateIntros(ocho).length === 0, I.validateIntros(ocho));
    check('todos tienen beats', ocho.every(s => I.FIGHTER_INTROS[s.id].beats.length >= 3));
    check('duraciones cubren los beats', ocho.every(s => {
        const intro = I.FIGHTER_INTROS[s.id];
        const fin = intro.beats[intro.beats.length - 1];
        return intro.duration >= fin.t + fin.dur - 0.001;
    }));
}

section('2 · Los clips de los beats existen de verdad');
{
    const bib = CL.crearBiblioteca({
        locoPose: RIG.default.locoPose,
        attackPose: RIG.default.attackPose,
        stancePoseFn: RIG.default.posturePose
    });
    const clips = new Set(CL.nombres(bib));
    const avisos = I.validateIntros(ocho, clips);
    check('ningun clip inventado', avisos.length === 0, avisos);
    const usados = new Set();
    for (const s of ocho) {
        for (const b of I.FIGHTER_INTROS[s.id].beats) usados.add(CM.clipEfectivo(b.clip));
    }
    check('los beats usan clips reales', [...usados].every(c => clips.has(c)), [...usados]);
    check('hay variedad de clips', usados.size >= 8, usados.size);
}

section('3 · Generico y utilidades');
{
    const generic = I.introForFighter('CUSTOM');
    check('el generico existe', !!generic && generic.beats.length === 3);
    check('sin ficha en el roster conserva el id como nombre',
        generic.beats[0].text === 'CUSTOM', generic.beats[0].text);
    const beats = I.listIntroBeats('PEDRO');
    check('listIntroBeats indiza', beats[0].index === 0 && beats[1].index === 1);
    check('respeta los beats authoring', beats.length === I.FIGHTER_INTROS.PEDRO.beats.length);
    check('introForFighter respeta la authoring',
        I.introForFighter('PEDRO') === I.FIGHTER_INTROS.PEDRO);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
