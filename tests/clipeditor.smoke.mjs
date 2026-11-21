/**
 * SANPABLERA ENGINE · tests/clipeditor.smoke.mjs
 * El ESTADO del editor: seleccion, ajustes, fases que suman 1, deshacer,
 * parche y validacion. Todo puro, sin DOM.
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

const C = await load('src/core/anim/ClipEditor.js');
const M = await load('src/core/anim/ClipMap.js');

const BIB = {
    idle: { nombre: 'idle', dur: 1.2, loop: true, commitment: 0.1 },
    jab_light: { nombre: 'jab_light', dur: 0.4, loop: false, commitment: 0.6 },
    guard_high: { nombre: 'guard_high', dur: 0.8, loop: true, commitment: 0.25 }
};
const ANIMS = {
    guardia: { id: 'guardia', nombre: 'Guardia', tipo: 'guardia', clip: 'idle', dur: 0, pes: 10 },
    jab: { id: 'jab', nombre: 'Jab', tipo: 'tecnica', clip: 'jab_light', dur: 0.7, pes: 4 },
    roto: { id: 'roto', nombre: 'Roto', tipo: 'tecnica', clip: 'NO_EXISTE', dur: 0.9, pes: 2 }
};
const mapa = M.buildClipMap({ animaciones: ANIMS, biblioteca: BIB });
const sumaFases = (f) => f.fases.STARTUP + f.fases.ACTIVE + f.fases.RECOVERY;

section('1 · Creacion y seleccion');
let ed = C.createClipEditor({ mapa });
{
    check('selecciona la primera', ed.seleccionId === 'guardia');
    check('seleccion devuelve fila', C.seleccion(ed).id === 'guardia');
    check('no comparte filas con el mapa', ed.filas[0] !== mapa.filas[0]);
    check('no comparte fases', ed.filas[0].fases !== mapa.filas[0].fases);
    check('seleccionar id valido', C.seleccionar(ed, 'jab').id === 'jab');
    check('seleccionar id invalido', C.seleccionar(ed, 'nadie') === null);
    check('la seleccion no cambia', ed.seleccionId === 'jab');
    check('mover +1', C.mover(ed, 1).id === 'roto');
    check('mover -1 vuelve', C.mover(ed, -1).id === 'jab');
    check('mover con vuelta', C.mover(ed, -2).id === 'roto');
    check('campoValor dur', C.campoValor(ed, 'dur') === 0.9);
    check('campoValor fases', C.campoValor(ed, 'fases.ACTIVE') > 0);
    check('campo inexistente', C.campoValor(ed, 'noExiste') === null);
}

section('2 · Ajustar duracion y peso');
{
    C.seleccionar(ed, 'jab');
    const r = C.ajustar(ed, 'dur', 1);
    check('sube la duracion', Math.abs(r.valor - 0.75) < 1e-9, r);
    check('el cambio esta en la fila', C.seleccion(ed).dur === 0.75);
    check('bajar la duracion', Math.abs(C.ajustar(ed, 'dur', -1).valor - 0.7) < 1e-9);
    check('tope inferior', C.ajustar(ed, 'dur', -100, { abs: true }).valor === 0.05);
    check('tope superior', C.ajustar(ed, 'dur', 100, { abs: true }).valor === 10);
    check('valor absoluto', C.ajustar(ed, 'dur', 1.25, { abs: true }).valor === 1.25);
    check('peso entero', Number.isInteger(C.ajustar(ed, 'pes', 1).valor));
    check('peso tope', C.ajustar(ed, 'pes', 99, { abs: true }).valor === 20);
    check('campo desconocido no cambia', C.ajustar(ed, 'xyz', 1).ok === false);
    check('sin seleccion no revienta', C.ajustar(null, 'dur', 1).ok === false);
}

section('3 · Fases siempre suman 1');
{
    C.seleccionar(ed, 'jab');
    for (const fase of M.FASES) {
        for (const delta of [-3, -1, 1, 3]) {
            C.ajustar(ed, 'fases.' + fase, delta);
            check(fase + ' ' + delta + ' suma 1', Math.abs(sumaFases(C.seleccion(ed)) - 1) < 1e-3,
                C.seleccion(ed).fases);
        }
    }
    check('faseActiva por defecto', ed.faseActiva === 'STARTUP');
    check('ponerFaseActiva', C.ponerFaseActiva(ed, 'ACTIVE') === true);
    check('fase invalida se ignora', C.ponerFaseActiva(ed, 'BOGUS') === false);
    check('ajustar fase.Activa', C.ajustar(ed, 'fase', 1).campo === 'fases.ACTIVE');
    check('fase fuera de rango se recorta', C.ajustar(ed, 'fases.ACTIVE', -99, { abs: true }).valor === 0.02);
    check('sigue sumando 1', Math.abs(sumaFases(C.seleccion(ed)) - 1) < 1e-3, C.seleccion(ed).fases);
}

section('4 · Rebind del clip');
{
    C.seleccionar(ed, 'roto');
    check('antes no conectaba', C.seleccion(ed).clip === 'NO_EXISTE');
    const f = C.ciclarClip(ed, 1);
    check('ciclar da un nombre real', f.clip === 'guard_high', f.clip);
    check('aviso desaparece', f.aviso === null);
    check('marca conectado', f.clipEnBiblioteca === true);
    check('ciclar actualiza clipReal', f.clipReal === 'guard_high' && f.esAlias === false);
    // NO_EXISTE no esta en la lista: avanzar entra por el primero y retroceder
    // desde ahi da la vuelta al ultimo, no al clip inexistente.
    check('ciclar -1 da la vuelta al ultimo', C.ciclarClip(ed, -1).clip === 'jab_light');
    check('sin nombres no revienta', C.ciclarClip({ filas: [], seleccionId: null, nombresClip: [] }, 1) === null);
}

section('5 · Deshacer y rehacer');
{
    ed = C.createClipEditor({ mapa });
    C.seleccionar(ed, 'jab');
    const antes = C.seleccion(ed).dur;
    C.ajustar(ed, 'dur', 2);
    check('cambio aplicado', C.seleccion(ed).dur !== antes);
    check('deshacer funciona', C.deshacer(ed) === true);
    check('vuelve el valor', C.seleccion(ed).dur === antes, C.seleccion(ed).dur);
    check('rehacer funciona', C.rehacer(ed) === true);
    check('recupera el cambio', C.seleccion(ed).dur !== antes);
    check('deshacer sin historial', C.deshacer({ filas: [], undo: [], redo: [] }) === false);
    check('rehacer sin historial', C.rehacer({ filas: [], undo: [], redo: [] }) === false);
}

section('6 · Reloj y lectura');
{
    ed = C.createClipEditor({ mapa });
    C.seleccionar(ed, 'jab');
    check('tiempo recorta', C.tiempo(ed, 2) === 1 && ed.t === 1);
    check('tiempo negativo', C.tiempo(ed, -1) === 0);
    check('lectura trae fase', C.lectura(ed).fase === 'STARTUP');
    check('lectura trae clip', C.lectura(ed).clip === 'jab_light');
    check('lectura trae clipReal', C.lectura(ed).clipReal === 'jab_light');
    check('lectura trae esAlias', C.lectura(ed).esAlias === false);
    check('no avanza parado', (C.tiempo(ed, 0.2), C.avanzar(ed, 1).t) === 0.2);
    check('togglePlay enciende', C.togglePlay(ed) === true);
    const t2 = C.avanzar(ed, 0.1).t;
    check('avanza con dur 0.7', Math.abs(t2 - (0.2 + 0.1 / 0.7)) < 1e-9, t2);
    C.tiempo(ed, 0.99);
    check('da la vuelta con modulo', C.avanzar(ed, 0.1).t < 0.5, ed.t);
    check('togglePlay apaga', C.togglePlay(ed) === false);
}

section('7 · Parche, exportar, importar');
{
    ed = C.createClipEditor({ mapa });
    check('sin cambios al abrir', C.cambios(ed) === 0);
    check('parche vacio', Object.keys(C.parche(ed).animaciones).length === 0);
    C.seleccionar(ed, 'jab');
    C.ajustar(ed, 'dur', 1);
    C.ajustar(ed, 'fases.ACTIVE', 1);
    check('una animacion cambiada', C.cambios(ed) === 1);
    const p = C.parche(ed);
    check('el parche guarda dur', p.animaciones.jab.dur === 0.75, p.animaciones.jab);
    check('el parche guarda fases', !!p.animaciones.jab.fases.ACTIVE, p.animaciones.jab);
    check('el parche NO guarda lo demas', p.animaciones.jab.pes === undefined);
    const json = C.exportar(ed);
    check('exportar da JSON', typeof json === 'string' && json.includes('"jab"'));
    check('JSON valido', JSON.parse(json).version === 1);

    const otra = C.createClipEditor({ mapa });
    check('importar texto', C.importar(otra, json) === 1);
    check('import aplica dur', C.seleccionar(otra, 'jab').dur === 0.75);
    check('import aplica fases', Math.abs(sumaFases(C.seleccion(otra)) - 1) < 1e-3);
    check('import objeto', C.importar(otra, { version: 1, animaciones: { jab: { dur: 1 } } }) === 1);
    check('import basura no revienta', C.importar(otra, '{ no es json') === 0);
    check('import sin animaciones', C.importar(otra, { version: 1 }) === 0);
    check('import id desconocido', C.importar(otra, { animaciones: { nadie: { dur: 1 } } }) === 0);
}

section('8 · Validacion');
{
    ed = C.createClipEditor({ mapa });
    const antes = C.validar(ed);
    check('avisa del clip roto', antes.some((v) => v.id === 'roto'), antes);
    C.seleccionar(ed, 'roto');
    C.ciclarClip(ed, 1);
    check('el aviso desaparece al rebindear', !C.validar(ed).some((v) => v.id === 'roto'), C.validar(ed));
    check('dur cero se marca', C.validar({ filas: [{ id: 'x', clip: 'idle', dur: 0, fases: M.FASES_DEFECTO }], nombresClip: ['idle'] })
        .some((v) => v.mensaje.includes('duracion')));
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
