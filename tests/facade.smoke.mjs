/**
 * Comprueba que la FACHADA (engine/systems/index.js) carga y que TODO lo que
 * re-exporta existe de verdad. Una fachada que apunta a rutas equivocadas es
 * peor que no tener fachada: da la sensacion de que algo funciona cuando no.
 */
import { load } from './loader.mjs';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

console.log('\n1. La fachada carga');
const facade = await load('src/engine/systems/index.js');
check('el modulo se importa sin errores', !!facade);
check('exporta SYSTEM_STATUS', !!facade.SYSTEM_STATUS);
check('exporta PENDING', Array.isArray(facade.PENDING) && facade.PENDING.length > 0);

console.log('\n2. Los sistemas exportados existen y NO son undefined');
const esperados = {
    // 1 appraisal
    WARDROBE: 'objeto',
    loadCharacterModel: 'funcion',
    CharacterModel: 'funcion',
    buildBoneMap: 'funcion',
    // 2 stance
    Boxing: 'objeto',
    ARCHETYPES: 'objeto',
    // 3 impact
    MoveTable: 'objeto',
    Phases: 'objeto',
    ZONES: 'objeto',
    // 4 framedata
    hitAdvantage: 'funcion',
    blockAdvantage: 'funcion',
    buildMoveIndex: 'funcion',
    frameSheet: 'funcion',
    // 5 cancel
    StateMachine: 'funcion',
    // 6 clash
    resolveClash: 'funcion',
    resolveClinch: 'funcion',
    defenseFrom: 'funcion',
    // 7 guard ik
    solveTwoBone: 'funcion',
    buildRig: 'funcion',
    stancePose: 'funcion',
    // 8 grapple
    grappleState: 'funcion',
    // 9 ground
    GroundStates: 'objeto',
    ImpactStates: 'objeto',
    // añadidos
    JUMP_TABLE: 'objeto',
    RUN_ATTACKS: 'objeto',
    readLoco: 'funcion',
    Cloth: 'objeto',
    InputRouter: 'funcion',
    // blending
    PoseBlender: 'funcion',
    blendFor: 'funcion',
    BLEND: 'objeto',
    EASE: 'objeto'
};
for (const [k, tipo] of Object.entries(esperados)) {
    const v = facade[k];
    const ok = tipo === 'funcion' ? typeof v === 'function' : (v && typeof v === 'object');
    check('  ' + k + ' es ' + tipo, ok, typeof v);
}

console.log('\n3. El bus de eventos');
const { EV, EventBus, bus } = await load('src/engine/events.js');
check('el bus existe', bus instanceof EventBus);
check('los eventos estan declarados', Object.keys(EV).length >= 12, Object.keys(EV).length);

const b = new EventBus();
let recibidos = 0;
const fn = () => { recibidos++; };
b.on(EV.HIT_LANDED, fn);
check('on() suscribe', b.has(EV.HIT_LANDED));
check('emit() reparte', b.emit(EV.HIT_LANDED, { golpe: 'X' }) === 1 && recibidos === 1);
check('emit() sin suscriptores devuelve 0', b.emit(EV.CLASH_RESOLVED, {}) === 0);
check('off() da de baja', (() => { b.off(EV.HIT_LANDED, fn); return !b.has(EV.HIT_LANDED); })());

{
    // Un suscriptor que peta NO puede tumbar el frame.
    const b2 = new EventBus();
    let llegoElSegundo = false;
    b2.on(EV.KNOCKDOWN, () => { throw new Error('a proposito'); });
    b2.on(EV.KNOCKDOWN, () => { llegoElSegundo = true; });
    b2.emit(EV.KNOCKDOWN, {});
    check('un manejador que peta no impide a los demas', llegoElSegundo);
}

{
    // Darse de baja durante el reparto no puede saltarse al siguiente.
    const b3 = new EventBus();
    let vio = 0;
    const self = () => { vio++; b3.off(EV.INPUT_ATTACK, self); };
    b3.on(EV.INPUT_ATTACK, self);
    b3.on(EV.INPUT_ATTACK, () => { vio++; });
    b3.emit(EV.INPUT_ATTACK, {});
    b3.emit(EV.INPUT_ATTACK, {});
    check('darse de baja en medio del reparto es seguro', vio === 3, { vio });
}

{
    // El primer argumento de on() tiene que ser una funcion.
    let lanzo = false;
    try { b.on('X', null); } catch (e) { lanzo = true; }
    check('on() sin funcion lanza', lanzo);
}

console.log('\n4. La cuenta de los sistemas');
const status = facade.SYSTEM_STATUS;
const claves = Object.keys(status);
check('hay al menos los 9 sistemas del diseno + los anadidos', claves.length >= 9, claves.length);
check('cada sistema tiene nota', claves.every(k => typeof status[k].note === 'string' && status[k].note.length > 10));
check('cada sistema dice si esta terminado', claves.every(k => typeof status[k].done === 'boolean'));
check('PENDING cubre TODOS los sistemas sin terminar', (() => {
    // No se exige igualdad exacta: PENDING lista TRABAJOS y un sistema puede
    // estar terminado en su base y aun asi tener cosas que añadirle (el
    // agarre tiene los 30 estados pero faltan las variantes por disciplina).
    const aMedias = claves.filter(k => !status[k].done);
    return aMedias.every(k => facade.PENDING.some(p => p.startsWith(k + ':') || p.startsWith(k + ' ')));
})(), { pendientes: facade.PENDING, sinTerminar: claves.filter(k => !status[k].done) });

check('todo lo que PENDING lista esta justificado con un sistema real', (() => {
    return facade.PENDING.every(p => claves.some(k => p.startsWith(k)));
})(), facade.PENDING);

console.log('\n================================================================');
console.log(`fachada: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);