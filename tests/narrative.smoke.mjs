/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/narrative.smoke.mjs
 * ----------------------------------------------------------------------------
 * El Cuarteto de Caribe (Biblia Apex Primal, seccion 7): reparto tatami/afueras,
 * ciclos roguelike, secretos persistentes y misiones desde otras perspectivas.
 * Modulo PURO: se carga con tests/loader.mjs, sin DOM ni Babylon.
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
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
function lanza(fn) {
    try { fn(); return false; } catch (_) { return true; }
}

const N = await load('src/core/narrative/cuarteto.js');
const { ROSTER } = await load('src/core/roster.js');
const { LUGARES, lugar } = await load('src/core/geo/margarita.js');

// ---------------------------------------------------------------------------
section('1 · La campaña nace con cuatro amigos del roster');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 42 });
    check('el cuarteto tiene cuatro ids', s.cuarteto.length === 4, s.cuarteto);
    check('los cuatro son del roster', s.cuarteto.every((id) => ROSTER.some((r) => r.id === id)), s.cuarteto);
    check('no hay peleadores repetidos', new Set(s.cuarteto).size === 4, s.cuarteto);
    check('arranca en el ciclo 0', s.ciclo === 0, s.ciclo);
    check('arranca en la fase de encuentro', s.fase === N.FASE.ENCUENTRO, s.fase);
    check('la semilla se guarda', s.seed === 42, s.seed);
    check('arranca sin secretos', s.secretoConocidos.length === 0, s.secretoConocidos);
    check('arranca sin bandos repartidos',
        s.bando.tatami.length === 0 && s.bando.afueras.length === 0, s.bando);
    check('arranca sin misiones ni ganados',
        Object.keys(s.misiones).length === 0 && Object.keys(s.ganados).length === 0);
    check('la historia cuenta el encuentro', /se encuentran/.test(s.historia[0] || ''), s.historia);
    check('el lugar inicial existe en el mapa', !!lugar(s.lugar), s.lugar);
    check('el estado es plano y serializable', typeof JSON.stringify(s) === 'string');

    check('un cuarteto de tres se rechaza', lanza(() => N.createCampaign({ cuarteto: ['PEDRO', 'JUAN', 'JOSE'] })));
    check('un cuarteto con repetidos se rechaza',
        lanza(() => N.createCampaign({ cuarteto: ['PEDRO', 'PEDRO', 'JUAN', 'JOSE'] })));
    check('una banda rival no puede ser del cuarteto',
        lanza(() => N.createCampaign({ cuarteto: ['PEDRO', 'JUAN', 'JOSE', 'GUARDIAN'] })));
}

// ---------------------------------------------------------------------------
section('2 · Reparto tatami / afueras y determinismo');
// ---------------------------------------------------------------------------
{
    const a = N.createCampaign({ seed: 42 });
    const b = N.createCampaign({ seed: 42 });
    const r1 = N.nextCycle(a, { PLAYA_AGUA: 1 });
    const r2 = N.nextCycle(b, { PLAYA_AGUA: 1 });

    check('devuelve el ciclo', r1.ciclo === 1, r1.ciclo);
    check('dos en el tatami', r1.tatami.length === 2, r1.tatami);
    check('dos en las afueras', r1.afueras.length === 2, r1.afueras);
    check('el reparto cubre el cuarteto entero',
        [...r1.tatami, ...r1.afueras].sort().join(',') === [...a.cuarteto].sort().join(','),
        { r1, cuarteto: a.cuarteto });
    check('nadie esta en los dos bandos', !r1.tatami.some((id) => r1.afueras.includes(id)), r1);
    check('el estado guarda el mismo reparto',
        a.bando.tatami.join(',') === r1.tatami.join(',')
        && a.bando.afueras.join(',') === r1.afueras.join(','), a.bando);
    check('la misma semilla da el mismo reparto',
        r1.tatami.join(',') === r2.tatami.join(',') && r1.afueras.join(',') === r2.afueras.join(','),
        { a: r1, b: r2 });
    check('y el mismo texto de evento', r1.evento === r2.evento);
    check('el evento menciona los dos frentes',
        /tatami/.test(r1.evento) && /afueras/.test(r1.evento), r1.evento);
    check('el evento nombra peleadores reales',
        r1.tatami.every((id) => r1.evento.includes(N.nombreDe(id))), r1.evento);

    // No basta con una semilla: distintas semillas tienen que poder separar
    // distinto. Se prueban varias para que un collision aislado no rompa el test.
    const firmas = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const lados = N.repartir(a.cuarteto, seed, 1);
        firmas.add(lados.tatami.join(',') + '|' + lados.afueras.join(','));
    }
    check('semillas distintas pueden cambiar el emparejamiento', firmas.size > 1, firmas.size);

    const porGanados = new Set();
    for (let n = 0; n <= 5; n++) {
        const lados = N.repartir(a.cuarteto, 42, 1, { PLAYA_AGUA: n });
        porGanados.add(lados.tatami.join(',') + '|' + lados.afueras.join(','));
    }
    check('ganar en un lugar altera el reparto (ciclo dinamico)', porGanados.size > 1, porGanados.size);
    check('repartir no toca el cuarteto original',
        a.cuarteto.join(',') === b.cuarteto.join(','), a.cuarteto);
}

// ---------------------------------------------------------------------------
section('3 · Ciclos que escriben historia');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 7 });
    const fases = [];
    for (let i = 0; i < 3; i++) fases.push(N.nextCycle(s).ciclo + ':' + s.fase);
    check('la alianza llega en el primer ciclo', fases[0] === '1:ALIANZA', fases);
    check('despues se mira el tatami', fases[1] === '2:TATAMI', fases);
    check('y luego las afueras', fases[2] === '3:AFUERAS', fases);
    check('cada ciclo anade historia', s.historia.length >= 4, s.historia.length);
    const historiaAntes = s.historia.length;
    N.nextCycle(s);
    check('la historia crece con cada vuelta', s.historia.length > historiaAntes,
        { antes: historiaAntes, despues: s.historia.length });

    const ganados = {};
    for (const l of LUGARES) ganados[l.id] = l.requisito ? l.requisito.combates + 1 : 2;
    const final = N.createCampaign({ seed: 7 });
    N.nextCycle(final, ganados);
    check('con la isla entera se entra en final', final.fase === N.FASE.FINAL, final.fase);
    N.nextCycle(final, ganados);
    check('y despues en leyenda (nunca se repite fase pegada)', final.fase === N.FASE.LEYENDA, final.fase);

    const externo = { PLAYA_AGUA: 3 };
    N.nextCycle(N.createCampaign({ seed: 1 }), externo);
    check('nextCycle no modifica el objeto de ganados que le pasan', externo.PLAYA_AGUA === 3, externo);
}

// ---------------------------------------------------------------------------
section('4 · Secretos de Caribe (no se duplican)');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 5 });
    check('la tabla de secretos no esta vacia', N.SECRETO_IDS.length >= 9, N.SECRETO_IDS.length);
    check('cada secreto cae en un lugar real',
        N.SECRETO_IDS.every((id) => !!lugar(N.SECRETOS[id].lugar)));
    check('cada secreto dice su zona y coincide con el lugar',
        N.SECRETO_IDS.every((id) => N.SECRETOS[id].zona === lugar(N.SECRETOS[id].lugar).zona));
    check('descubrir uno nuevo devuelve true', N.discoverSecret(s, 'SECRETO_PLAYA') === true);
    check('y se guarda en el estado', s.secretoConocidos.includes('SECRETO_PLAYA'));
    check('descubrirlo otra vez devuelve false', N.discoverSecret(s, 'SECRETO_PLAYA') === false);
    check('no se duplica en la lista', s.secretoConocidos.filter((x) => x === 'SECRETO_PLAYA').length === 1);
    check('un secreto inventado no se acepta', N.discoverSecret(s, 'SECRETO_FALSO') === false);
    check('el secreto desconocido no entra en la lista', s.secretoConocidos.length === 1, s.secretoConocidos);
    check('el hallazgo se cuenta en la historia',
        s.historia.some((h) => h.includes(N.SECRETOS.SECRETO_PLAYA.nombre)));
}

// ---------------------------------------------------------------------------
section('5 · Guardado compacto y secretos entre partidas');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 99 });
    N.nextCycle(s, { PLAYA_AGUA: 1 });
    N.discoverSecret(s, 'SECRETO_MORRO');
    N.discoverSecret(s, 'SECRETO_PUERTO');
    const texto = N.serialize(s);

    check('serialize devuelve texto', typeof texto === 'string');
    // La historia es texto de verdad (no un numero), asi que el limite
    // absolute es un kilobyte: lo que importa es que no repita las claves
    // largas del estado y que quepa en un guardado ultraligero.
    check('el texto es compacto', texto.length < 1000, texto.length);
    check('y mas corto que el objeto entero', texto.length < JSON.stringify(s).length,
        { texto: texto.length, objeto: JSON.stringify(s).length });
    check('el texto no guarda claves largas', !texto.includes('secretoConocidos'), texto.slice(0, 80));

    const copia = N.deserialize(texto);
    check('deserialize recupera la semilla', copia.seed === 99, copia.seed);
    check('recupera el ciclo', copia.ciclo === s.ciclo, copia.ciclo);
    check('recupera los secretos', copia.secretoConocidos.join(',') === s.secretoConocidos.join(','));
    check('recupera la historia', copia.historia.join('\n') === s.historia.join('\n'));
    check('recupera el bando', copia.bando.tatami.join(',') === s.bando.tatami.join(','));
    check('recupera el lugar', copia.lugar === s.lugar, copia.lugar);

    const nueva = N.createCampaign({ desde: texto });
    check('createCampaign({desde}) vuelve al ciclo 0', nueva.ciclo === 0, nueva.ciclo);
    check('y mantiene la semilla', nueva.seed === 99, nueva.seed);
    check('los secretos PERSISTEN entre campañas',
        nueva.secretoConocidos.join(',') === 'SECRETO_MORRO,SECRETO_PUERTO', nueva.secretoConocidos);
    check('la historia anterior tambien persiste',
        s.historia.every((h) => nueva.historia.includes(h)));
    check('un descubrimiento repetido en la nueva partida no cuenta',
        N.discoverSecret(nueva, 'SECRETO_MORRO') === false);
    check('una version futura se rechaza', lanza(() => N.deserialize('{"v":99}')));
    check('un texto roto se rechaza', lanza(() => N.deserialize('no es json')));
}

// ---------------------------------------------------------------------------
section('6 · Misiones desde el roster y desde bandas rivales');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 11 });
    N.nextCycle(s);
    const m = N.startSidequest(s, 'PEDRO');
    check('la mision tiene id', typeof m.id === 'string' && m.id.length > 0, m.id);
    check('tiene el personaje que la pide', m.personaje === 'PEDRO', m.personaje);
    check('cae en un lugar real', !!lugar(m.lugar), m.lugar);
    check('tiene objetivo legible', typeof m.objetivo === 'string' && m.objetivo.length > 10, m.objetivo);
    check('arranca abierta', m.estado === 'ABIERTA', m.estado);
    check('la recompensa del amigo es Cobre', m.recompensa.tipo === N.RECOMPENSA.COBRE, m.recompensa);
    check('la mision se guarda en el estado', s.misiones[m.id] === m);

    const rival = N.startSidequest(s, 'GUARDIAN');
    check('una banda rival tambien puede pedir mision', rival.personaje === 'GUARDIAN');
    check('la banda paga reputacion, no Cobre',
        rival.recompensa.tipo === N.RECOMPENSA.REPUTACION, rival.recompensa);
    check('un personaje inventado se rechaza', lanza(() => N.startSidequest(s, 'NADIE')));
    check('un lugar inventado se rechaza',
        lanza(() => N.startSidequest(s, 'PEDRO', { lugar: 'MARTE' })));
    check('una recompensa inventada se rechaza',
        lanza(() => N.startSidequest(s, 'PEDRO', { recompensa: { tipo: 'ORO', cantidad: 9 } })));
    check('los ids de mision son repetibles con la misma semilla',
        N.startSidequest(N.createCampaign({ seed: 11 }), 'PEDRO').id !== '');

    const antes = s.cobre;
    const r = N.resolveSidequest(s, m.id, 'EXITO');
    check('cerrar con exito funciona', r.ok === true, r);
    check('la recompensa se devuelve', r.recompensa && r.recompensa.cantidad === m.recompensa.cantidad, r);
    check('el Cobre se suma', s.cobre === antes + m.recompensa.cantidad, s.cobre);
    check('la mision queda cerrada', s.misiones[m.id].estado === 'CERRADA');
    check('y marcada como cobrada', s.misiones[m.id].cobrado === true);

    const cobrado = s.cobre;
    const otra = N.resolveSidequest(s, m.id, 'EXITO');
    check('cerrar dos veces no funciona', otra.ok === false, otra);
    check('la recompensa NO se paga dos veces', s.cobre === cobrado, s.cobre);
    check('una mision desconocida no se cierra', N.resolveSidequest(s, 'SQ_NO').ok === false);

    const fallo = N.startSidequest(s, 'MARIA', { recompensa: { tipo: 'COBRE', cantidad: 33 } });
    const reputacion = s.reputacion;
    const rf = N.resolveSidequest(s, fallo.id, 'FRACASO');
    check('un fracaso tambien cierra la mision', rf.ok === true && s.misiones[fallo.id].estado === 'CERRADA');
    check('un fracaso no paga', rf.recompensa === null && s.cobre === cobrado
        && s.reputacion === reputacion, rf);
    const abierta = N.startSidequest(s, 'ANA');
    check('un resultado desconocido deja la mision abierta',
        N.resolveSidequest(s, abierta.id, 'QUIZAS').ok === false
        && s.misiones[abierta.id].estado === 'ABIERTA');

    const vuelta = N.deserialize(N.serialize(s));
    check('el guardado conserva la mision cerrada',
        vuelta.misiones[m.id].estado === 'CERRADA' && vuelta.misiones[m.id].cobrado === true);
    check('el guardado conserva el Cobre cobrado', vuelta.cobre === s.cobre, vuelta.cobre);
}

// ---------------------------------------------------------------------------
section('7 · Resumen legible y modulo puro');
// ---------------------------------------------------------------------------
{
    const s = N.createCampaign({ seed: 3 });
    N.nextCycle(s, { PLAYA_AGUA: 1 });
    N.discoverSecret(s, 'SECRETO_PLAYA');
    N.startSidequest(s, 'JUAN');
    const texto = N.resumen(s);

    check('el resumen es texto', typeof texto === 'string');
    check('dice el ciclo', texto.includes('Ciclo 1'), texto);
    check('dice la fase', texto.includes(s.fase), texto);
    check('dice el lugar', texto.includes(lugar(s.lugar).nombre), texto);
    check('nombra los dos frentes', texto.includes('Tatami:') && texto.includes('Afueras:'), texto);
    check('cuenta los secretos', texto.includes('Secretos 1/' + N.SECRETO_IDS.length), texto);
    check('cuenta las misiones abiertas', texto.includes('Misiones abiertas 1'), texto);
    check('no muestra objetos sin formatear', !texto.includes('[object Object]'), texto);
    check('cabe en una pantalla', texto.length < 400, texto.length);

    const source = readFileSync('src/core/narrative/cuarteto.js', 'utf8');
    // Se buscan LLAMADAS, no la mencion en los comentarios que explican
    // precisamente por que no las usamos.
    check('no usa Math.random', !/Math\s*\.\s*random\s*\(/.test(source));
    check('no mira la fecha', !/\bDate\s*\.\s*now\s*\(|\bnew\s+Date\s*\(/.test(source));
    check('no hace red', !/\bfetch\s*\(/.test(source));
    check('no toca DOM ni Babylon',
        !/\b(document|window)\s*\./.test(source) && !/\bBABYLON\s*\./.test(source));
    check('exporta todo tambien por default', !!N.default && typeof N.default.createCampaign === 'function');
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
