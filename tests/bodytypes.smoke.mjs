/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/bodytypes.smoke.mjs
 * ----------------------------------------------------------------------------
 * Tipologias de cuerpo (somatotipos) y genero: datos puros, sin DOM ni Babylon.
 * Comprueba que las seis combinaciones existen, que las diferencias son
 * pequenas (el moveset compartido tiene que seguir leyendose igual) y que
 * escalar una tabla de piezas NO muta la tabla original.
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

const BT = await load('src/core/bodyTypes.js');
const PM = await load('src/render/PartMannequin.js');
const R = await load('src/core/roster.js');

section('1 · Tres somatotipos, variacion corta');
{
    const ids = Object.keys(BT.SOMATOTYPES);
    check('hay tres somatotipos', ids.length === 3, ids);
    check('son los esperados',
        ['ECTOMORFO', 'MESOMORFO', 'ENDOMORFO'].every(k => !!BT.SOMATOTYPES[k]), ids);
    const heights = ids.map(k => BT.SOMATOTYPES[k].height);
    check('alturas entre 1.72 y 1.82', heights.every(h => h >= 1.72 && h <= 1.82), heights);
    const masses = ids.map(k => BT.SOMATOTYPES[k].mass);
    const reaches = ids.map(k => BT.SOMATOTYPES[k].reach);
    check('masa en rango estrecho', Math.max(...masses) - Math.min(...masses) <= 0.2, masses);
    check('alcance en rango estrecho', Math.max(...reaches) - Math.min(...reaches) <= 0.1, reaches);
    check('mesomorfo es la referencia 1.00',
        BT.SOMATOTYPES.MESOMORFO.mass === 1 && BT.SOMATOTYPES.MESOMORFO.reach === 1);
}

section('2 · Genero es identidad, no proportions');
{
    check('M y F existen', !!BT.GENDERS.M && !!BT.GENDERS.F);
    check('Fallback de genero es M', BT.genderOf('X').id === 'M');
    const ecto = BT.SOMATOTYPES.ECTOMORFO;
    check('el genero no altera proporciones',
        ecto.proportions.torso === BT.bodyTypeOf('ECTOMORFO').proportions.torso);
}

section('3 · Escalar la tabla de piezas es puro');
{
    const original = PM.PART_TABLE;
    const antes = JSON.stringify(original);
    const ecto = BT.scalePartTable(original, 'ECTOMORFO');
    const endo = BT.scalePartTable(original, 'ENDOMORFO');
    check('no muta la tabla original', JSON.stringify(original) === antes);
    check('devuelve tabla nueva', ecto !== original && endo !== original);
    check('mantiene el numero de piezas', ecto.length === original.length, ecto.length);
    const torso = (tabla) => tabla.find(p => p.contract === 'CHEST' || p.contract === 'SPINE');
    const a = torso(ecto), b = torso(endo);
    check('el endomorfo tiene el tronco mas ancho',
        !!a && !!b && b.size.w > a.size.w, { ecto: a && a.size, endo: b && b.size });
    check('el mesomorfo deja la tabla intacta',
        BT.scalePartTable(original, 'MESOMORFO').every((p, i) => p === original[i]));
}

section('4 · Seis personajes generados, uno por combinacion');
{
    const generados = BT.GENERATED_CHARACTERS;
    check('hay seis', generados.length === 6, generados.length);
    const combos = new Set(generados.map(g => g.bodyType + '/' + g.gender));
    check('cubren las seis combinaciones', combos.size === 6, [...combos]);
    check('todos tienen ficha completa', generados.every(g =>
        g.id && g.name && g.height && g.mass && g.reach && g.bodyType && g.gender));
    check('createCharacter rellena desde el somatotipo', (() => {
        const c = BT.createCharacter({ id: 'X', name: 'X', bodyType: 'ENDOMORFO', gender: 'F' });
        return c.height === BT.SOMATOTYPES.ENDOMORFO.height && c.gender === 'F';
    })());
}

section('5 · El roster expone tipologia y la hereda');
{
    const lista = R.fullRoster();
    check('ocho mas el personalizado', lista.length === 9, lista.length);
    check('todos los del juego tienen bodyType',
        lista.slice(0, 8).every(s => !!BT.SOMATOTYPES[s.bodyType]));
    check('todos tienen genero', lista.every(s => s.gender === 'M' || s.gender === 'F'));
    const custom = lista.find(s => s.custom);
    check('el personalizado heredera una tipologia valida',
        !!custom && !!BT.SOMATOTYPES[custom.bodyType], custom && custom.bodyType);
    check('roster reexporta los generados', R.GENERATED_CHARACTERS === BT.GENERATED_CHARACTERS);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
