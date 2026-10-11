/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/glbclip.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de los CLIPS CC0 REALES (core/anim/GlbClip.js + assets/).
 *
 * POR QUE ESTE TEST Y NO UNO DE BOOLES
 *   Un lector de animaciones se puede escribir entero y no mover un solo
 *   hueso: si el delta sale mal, si la interpolacion esta mal o si el clip se
 *   mapea al reves, el archivo "carga" y el juego se ve igual que antes. La
 *   unica prueba que vale es medir el movimiento de verdad.
 *
 *     1. LOS ARCHIVOS LEEN ................. los 20 clips del juego existen,
 *        son GLB y sus pistas se convierten a huesos del contrato.
 *     2. LOS CLIPS TIENEN MOVIMIENTO ........ se mide el recorrido angular de
 *        los brazos y las piernas a lo largo del clip. Si es 0, el clip no se
 *        mueve aunque se cargue y se samplee perfectamente.
 *     3. EL DELTA CIERRA .................... el ultimo frame de un clip de
 *        bucle tiene que caer cerca del primero. Si no, cada vuelta da un
 *        salto: eso es un delta mal calculado, no un clip malo.
 *     4. EL FK SIGUE SIENDO UN HUMANO ..... se corre el FK REAL del motor con
 *        la pose de un clip y se mide donde quedan cabeza, pelvis y manos. Un
 *        delta equivocado se nota aqui antes que en pantalla.
 *
 * Los assets son CC0 de Quaternius (dominio publico), traidos de ActionForge.
 * Ver BITACORA.md para la nota de licencia.
 *
 * Ejecutar:  node tests/glbclip.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';
import { readFileSync, existsSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const DIR = 'assets/animations/quaternius/';

// Los clips que el juego necesita, con para que se piden.
const ESPERADOS = Object.freeze({
    idle_loop: 'reposo',
    walk_loop: 'andar',
    jog_fwd_loop: 'trote',
    sprint_loop: 'correr',
    punch_jab: 'ataque ligero (jab)',
    punch_cross: 'ataque medio (cruzado)',
    sword_attack: 'ataque pesado (mandoble)',
    hit_chest: 'golpe recibido al pecho',
    hit_head: 'golpe recibido a la cabeza',
    hit_knockback: 'empujon',
    crouch_idle_loop: 'agachado quieto',
    crouch_fwd_loop: 'agachado andando',
    jump_start: 'despegue',
    jump_loop: 'en el aire',
    jump_land: 'aterrizaje',
    roll: 'rodada',
    slide_start: 'deslizar',
    slide_loop: 'deslizando',
    melee_hook: 'gancho / agarre',
    interact: 'interaccion',
    laytoidle: 'levantarse del suelo',
    fixing_kneeling: 'arrodillado'
});

const G = await load('src/core/anim/GlbClip.js');
const { partirGlb, crearClip, muestrear, aviso } = G;
const { buildBoneMap } = await load('src/render/BoneMap.js');
const Pose = await load('src/core/cine/Pose.js');
const Rig = await load('src/core/cine/Rig.js');

// ---------------------------------------------------------------------------
section('1. EL ESQUELETO DE LOS CLIPS');
// ---------------------------------------------------------------------------
// El mapeo se construye con los nombres del RIG, no con los del clip: tiene
// que valer para cualquier archivo de este esqueleto.
const rigBuf = readFileSync(DIR + '_rig-human.glb');
const rigGlb = partirGlb(new Uint8Array(rigBuf).buffer);
const nombresRig = rigGlb.json.nodes.map(n => n.name);
const boneIndex = buildBoneMap(nombresRig);

const CONTRATO = [
    'PELVIS', 'SPINE', 'CHEST', 'NECK', 'HEAD',
    'CLAV_L', 'UPPERARM_L', 'FOREARM_L', 'HAND_L',
    'CLAV_R', 'UPPERARM_R', 'FOREARM_R', 'HAND_R',
    'THIGH_L', 'SHIN_L', 'FOOT_L', 'TOE_L',
    'THIGH_R', 'SHIN_R', 'FOOT_R', 'TOE_R'
];
const sinMapear = CONTRATO.filter(c => !boneIndex.map[c]);
check('los 21 huesos del contrato tienen nombre real en el rig', sinMapear.length === 0, sinMapear);
check('el indice dice que el modelo es jugable', boneIndex.playable(),
    { faltan: boneIndex.missing, duplicados: boneIndex.duplicates });

// ---------------------------------------------------------------------------
section('2. LOS ARCHIVOS LEEN Y CONVIERTEN A HUESOS DEL CONTRATO');
// ---------------------------------------------------------------------------
const clips = {};
const ausentes = [];
for (const nombre of Object.keys(ESPERADOS)) {
    const ruta = DIR + nombre + '.glb';
    if (!existsSync(ruta)) { ausentes.push(nombre); continue; }
    const raw = new Uint8Array(readFileSync(ruta));
    const { json, bin } = partirGlb(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    clips[nombre] = crearClip(json, bin, boneIndex, nombre);
}
check('los ' + Object.keys(ESPERADOS).length + ' clips estan en ' + DIR,
    ausentes.length === 0, ausentes);
check('todos se han leido', Object.keys(clips).length === Object.keys(ESPERADOS).length,
    Object.keys(clips).length);

const sinPistas = Object.keys(clips).filter(n => !clips[n].pistas.length);
check('ningun clip se queda sin pistas', sinPistas.length === 0, sinPistas);

const huesosVistos = new Set();
for (const n of Object.keys(clips)) {
    for (const p of clips[n].pistas) if (p.ruta === 'rotation') huesosVistos.add(p.hueso);
}
// Las claviculas no las anima ningun clip de pelea: no es fallo.
const faltanCuerpo = CONTRATO
    .filter(c => c !== 'CLAV_L' && c !== 'CLAV_R')
    .filter(c => !huesosVistos.has(c));
check('los clips animan el cuerpo entero', faltanCuerpo.length === 0, faltanCuerpo);

// ---------------------------------------------------------------------------
section('3. LOS CLIPS TIENEN MOVIMIENTO DE VERDAD');
// ---------------------------------------------------------------------------
// Recorrido angular: el mayor cambio de un hueso a lo largo de todo el clip.
// Si esto sale 0, el clip es una foto y no sirve para animar.
//
// OJO con la formula: el angulo entre dos quaternions es `2*acos(|dot|)`, y
// lo que se recorta a 1 es el PRODUCTO INTERNO, no el doble. Si se recorta
// despues de multiplicar, `2*dot` siempre es >= 1 y el angulo sale 0 siempre:
// una prueba que nunca falla y nunca mide nada.
function recorrido(clip, hueso) {
    const pose = Pose.createPose();
    let antes = null;
    let max = 0;
    const pasos = 48;
    for (let i = 0; i <= pasos; i++) {
        Pose.resetPose(pose);
        muestrear(clip, clip.duracion * i / pasos, pose);
        const q = pose.rot[hueso];
        if (!q) continue;
        if (antes) {
            const dot = antes[0] * q[0] + antes[1] * q[1] + antes[2] * q[2] + antes[3] * q[3];
            max = Math.max(max, 2 * Math.acos(Math.min(1, Math.abs(dot))));
        }
        antes = q;
    }
    return max * 180 / Math.PI;
}

// QUE UN CLIP NO SE MUEVA DEPENDE DEL CLIP, NO DEL LECTOR
//
// Hay clips que POR DEFINICION casi no se mueven: el reposo, el agachado quieto
// y el plan de vuelo son casi verticales quietos. Pedirles 10 grados seria
// exigir que el maniqui tiemble. Lo que si tiene que moverse es el cuerpo de
// combate: andar, correr y pegar.
const CANDOSOS = Object.freeze([
    'walk_loop', 'jog_fwd_loop', 'sprint_loop',
    'punch_jab', 'punch_cross', 'sword_attack',
    'hit_knockback', 'jump_start', 'roll', 'slide_start', 'melee_hook'
]);

const sinMovimiento = [];
const duracionesCero = [];
const tabla = [];
for (const n of Object.keys(clips)) {
    const c = clips[n];
    if (c.duracion <= 0.01) { duracionesCero.push(n); continue; }
    // el mayor recorrido de cualquier hueso del cuerpo: un jab pega con un brazo
    // y con el otro puede no mover practicamente nada
    const huesos = [...new Set(c.pistas.filter(p => p.ruta === 'rotation').map(p => p.hueso))];
    let mejor = 0;
    let quien = '';
    for (const h of huesos) {
        const r = recorrido(c, h);
        if (r > mejor) { mejor = r; quien = h; }
    }
    tabla.push({ clip: n, dur: c.duracion, mov: mejor, hueso: quien, candoso: CANDOSOS.includes(n) });
}
for (const t of tabla) {
    if (t.candoso && t.mov < 10) sinMovimiento.push(t.clip + ' (' + t.mov.toFixed(1) + ' grados en ' + t.hueso + ')');
}

check('ningun clip tiene duracion cero', duracionesCero.length === 0, duracionesCero);
check('los clips que TIENEN que moverse se mueven', sinMovimiento.length === 0, sinMovimiento);
check('el reposo tiene duracion de clip, no de foto',
    clips['idle_loop'].duracion > 0.5, clips['idle_loop'].duracion);

const movJab = Math.max(
    recorrido(clips['punch_jab'], 'FOREARM_L'),
    recorrido(clips['punch_jab'], 'FOREARM_R'),
    recorrido(clips['punch_jab'], 'UPPERARM_L'),
    recorrido(clips['punch_jab'], 'UPPERARM_R')
);
check('el jab mueve el brazo mas de un cuarto de vuelta', movJab > 25, Math.round(movJab));

const movCorrer = Math.max(
    recorrido(clips['sprint_loop'], 'THIGH_L'),
    recorrido(clips['sprint_loop'], 'THIGH_R'),
    recorrido(clips['sprint_loop'], 'SHIN_L'),
    recorrido(clips['sprint_loop'], 'SHIN_R')
);
check('correr mueve las piernas mas de un cuarto de vuelta', movCorrer > 25, Math.round(movCorrer));

// ---------------------------------------------------------------------------
section('4. EL DELTA CIERRA (el bucle no da un salto)');
// ---------------------------------------------------------------------------
function costura(clip) {
    const pose = Pose.createPose();
    Pose.resetPose(pose);
    muestrear(clip, 0, pose);
    const inicio = {};
    for (const h in pose.rot) inicio[h] = pose.rot[h].slice();

    Pose.resetPose(pose);
    muestrear(clip, clip.duracion - 1e-4, pose);

    const lejos = [];
    for (const h in pose.rot) {
        const p = inicio[h];
        const q = pose.rot[h];
        if (!p) continue;
        const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
        const grados = 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
        if (grados > 12) lejos.push(h + ' ' + grados.toFixed(0) + ' grados');
    }
    return lejos;
}

// SOLO SE EXIGE QUE CIERRE EL QUE ES UN BUCLE
//
// Los `_loop` se repiten: si su ultimo frame no coincide con el primero, el
// personaje da un salto cada vuelta y se nota mas que cualquier otra falta de
// animacion. Un golpe o una rodada NO es un bucle: termina donde acaba, y que
// su ultimo frame difiera del primero es lo correcto.
const descosidos = [];
for (const n of Object.keys(clips)) {
    if (!clips[n].duracion) continue;
    if (!/_loop$/.test(n)) continue;
    const lejos = costura(clips[n]);
    if (lejos.length > 2) descosidos.push({ clip: n, huesos: lejos.slice(0, 3) });
}
check('los clips de bucle cierran sin salto', descosidos.length === 0, descosidos);

// ---------------------------------------------------------------------------
section('5. EL FK REAL DEL MOTOR SIGUE DANDO UN HUMANO');
// ---------------------------------------------------------------------------
// La prueba que mas vale: el FK del motor con la pose de un clip de verdad.
// Si el delta estuviera mal (signo invertido, escala, reposo equivocado) el
// cuerpo se descuadra aqui, aunque todos los tests de arriba pasen.
// buildRig NO lee el formato del .glb: quiere { name, parentName, localT,
// localQ }. O sea que el esqueleto hay que aplanarlo antes. Se aprovechan las
// traslaciones y rotaciones REALES del rig, no las del contrato: si aqui se
// usaran las genericas, la prueba no estaria midiendo el asset sino una
// invencion del test.
const padreDe = Object.create(null);
rigGlb.json.nodes.forEach((n, i) => (n.children || []).forEach(c => { padreDe[c] = i; }));
const nodosRig = rigGlb.json.nodes.map((n, i) => ({
    name: n.name,
    parentName: padreDe[i] != null ? rigGlb.json.nodes[padreDe[i]].name : null,
    localT: (n.translation || [0, 0, 0]).slice(),
    localQ: (n.rotation || [0, 0, 0, 1]).slice()
}));

const rig = Rig.buildRig(boneIndex, nodosRig, { scale: 1, rootFix: 'Y_UP' });
check('el rig del motor se construye con el esqueleto de los clips',
    rig.bones.length >= 19, rig.bones.length);

// MEDIR SOBRE EL EJE ARRIBA DEL PROPIO RIG, NO SOBRE LA Y DEL MUNDO
//
// Los .glb no todos vienen con el mismo eje vertical: el de los clips trae el
// esqueleto tumbado a lo largo de +Z (cabeza en z=1,44 m, pies en z=0,10 m), y
// medir la altura por la Y del mundo daria casi cero y haria pensar que el
// esqueleto esta colapsionado cuando lo que esta tumbado. El eje se saca del
// propio rig (cabeza menos pie) y se normaliza: asi la prueba da lo mismo
// este el modelo de pie, tumbado o con los ejes cambiados.
const arriba = (() => {
    const h = rig.restWorld.HEAD && rig.restWorld.FOOT_L ? rig.restWorld.HEAD.p : null;
    const p = rig.restWorld.FOOT_L ? rig.restWorld.FOOT_L.p : null;
    if (!h || !p) return [0, 1, 0];
    const d = [h[0] - p[0], h[1] - p[1], h[2] - p[2]];
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / n, d[1] / n, d[2] / n];
})();
const ALTO = rig.restWorld.HEAD && rig.restWorld.FOOT_L
    ? Math.hypot(
        rig.restWorld.HEAD.p[0] - rig.restWorld.FOOT_L.p[0],
        rig.restWorld.HEAD.p[1] - rig.restWorld.FOOT_L.p[1],
        rig.restWorld.HEAD.p[2] - rig.restWorld.FOOT_L.p[2])
    : 0;
/** Proyeccion de un desplazamiento de hueso sobre el eje arriba, en metros. */
const alto = (a, b) =>
    (a[0] - b[0]) * arriba[0] + (a[1] - b[1]) * arriba[1] + (a[2] - b[2]) * arriba[2];

function anatomia(clip) {
    const pose = Pose.createPose();
    const st = Rig.fk(rig, pose);
    const res = { sobreCadera: [], manoPorDebajoDelHombro: 1e9, alturaMin: 1e9, alturaMax: -1e9 };
    for (let i = 0; i <= 12; i++) {
        const t = clip.duracion * i / 12;
        Pose.resetPose(pose);
        // el suelo lo pone el motor: aqui solo se mide la FORMA, no la altura
        Pose.setPos(pose, 'PELVIS', [0, 0, 0]);
        muestrear(clip, t, pose);
        Rig.fk(rig, pose, st);
        const cabeza = st.p.HEAD;
        const pelvis = st.p.PELVIS;
        const mano = st.p.HAND_R;
        const hombro = st.p.UPPERARM_R;
        const pie = st.p.FOOT_L;
        if (!cabeza || !pelvis || !pie) return null;
        res.sobreCadera.push(alto(cabeza, pelvis));
        res.alturaMin = Math.min(res.alturaMin, alto(cabeza, pie));
        res.alturaMax = Math.max(res.alturaMax, alto(cabeza, pie));
        if (mano && hombro) {
            res.manoPorDebajoDelHombro = Math.min(res.manoPorDebajoDelHombro, alto(hombro, mano));
        }
    }
    res.cabezaMinSobreCadera = Math.min(...res.sobreCadera);
    res.cabezaMaxSobreCadera = Math.max(...res.sobreCadera);
    // en fracciones de la altura del asset: asi el umbral no depende de si el
    // modelo mide 1,8 m o 90 cm
    res.cabezaSobreCaderaFrac = res.cabezaMinSobreCadera / ALTO;
    res.manoFrac = res.manoPorDebajoDelHombro / ALTO;
    res.alturaFracMin = res.alturaMin / ALTO;
    res.alturaFracMax = res.alturaMax / ALTO;
    return res;
}

const aProbar = ['idle_loop', 'punch_jab', 'sword_attack', 'walk_loop',
    'crouch_idle_loop', 'jump_start', 'hit_chest'].filter(n => clips[n]);

const fkMalos = [];
for (const n of aProbar) {
    const a = anatomia(clips[n]);
    if (!a) { fkMalos.push(n + ': el FK no devolvio huesos'); continue; }
    // LA UNICA INVARIANTE DE VERDAD: la cabeza por encima de la pelvis. Un
    // delta mal calculado (signo, escala o reposo equivocado) tumba o dobla el
    // cuerpo, y eso es lo unico que esta comprobacion puede detectar sola.
    //
    // Lo que NO se comprueba aqui, a proposito: que la mano cuelgue por debajo
    // del hombro ni que la cabeza llegue a un tanto por ciento de la altura.
    // Durante un mandoble o un salto el brazo esta en alto, y agachado la
    // cabeza baja: las dos cosas son el clip haciendo lo que tiene que hacer,
    // y exigir lo contrarioeria marcar como fallo la animacion buena.
    if (a.cabezaSobreCaderaFrac < 0.15) {
        fkMalos.push(n + ': cabeza al ' + Math.round(a.cabezaSobreCaderaFrac * 100) +
            '% de la altura sobre la pelvis (tumbado)');
    }
}
check('el FK con poses de clip mantiene al hombre de pie (' + aProbar.length + ' clips)',
    fkMalos.length === 0, fkMalos);

const muestra = clips['punch_jab'] ? anatomia(clips['punch_jab']) : null;
if (muestra) {
    console.log('       (jab: cabeza del ' + Math.round(muestra.cabezaSobreCaderaFrac * 100) +
        '% al ' + Math.round(muestra.cabezaMaxSobreCadera / ALTO * 100) +
        '% de la altura sobre la pelvis; agachado llega al ' +
        (clips['crouch_idle_loop'] ? Math.round(anatomia(clips['crouch_idle_loop']).cabezaSobreCaderaFrac * 100) : '-') +
        '%)');
}
console.log('       (asset: ' + ALTO.toFixed(2) + ' m de pie, tumbado en ' +
    (arriba[1] > 0.7 ? 'Y' : arriba[2] > 0.7 ? 'Z' : 'X') +
    '; CharacterModel lo pone de pie y lo escala)');

// ---------------------------------------------------------------------------
section('6. INFORME');
// ---------------------------------------------------------------------------
console.log('  clip             duracion   movimiento');
for (const t of tabla.slice().sort((a, b) => b.mov - a.mov)) {
    console.log('  ' + (t.clip + (t.candoso ? '' : '  (quieto a proposito)')).padEnd(34) +
        t.dur.toFixed(2) + 's' + String(Math.round(t.mov)).padStart(8) + ' grados  ' + t.hueso);
}
const problemas = [];
for (const n of Object.keys(clips)) problemas.push(...aviso(clips[n], boneIndex));
console.log('\n  avisos del lector: ' + (problemas.length ? problemas.join('; ') : 'ninguno'));

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);