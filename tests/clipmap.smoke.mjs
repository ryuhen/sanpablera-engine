/**
 * SANPABLERA ENGINE · tests/clipmap.smoke.mjs
 * El MAPA de animaciones: que junte las tres listas y diga la verdad sobre
 * cuales clips conectan y cuales no. Sin Babylon, sin DOM.
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

const M = await load('src/core/anim/ClipMap.js');
const A = await load('src/ui/selectAnims.js');
const L = await load('src/core/anim/ClipLibrary.js');

const BIB = Object.freeze({
    idle: Object.freeze({ nombre: 'idle', dur: 1.2, loop: true, commitment: 0.1 }),
    jab_light: Object.freeze({ nombre: 'jab_light', dur: 0.4, loop: false, commitment: 0.6 }),
    guard_high: Object.freeze({ nombre: 'guard_high', dur: 0.8, loop: true, commitment: 0.25 })
});

const ANIMS = Object.freeze({
    guardia: Object.freeze({ id: 'guardia', nombre: 'Guardia', tipo: 'guardia', clip: 'idle', dur: 0, pes: 10 }),
    jab: Object.freeze({ id: 'jab', nombre: 'Jab', tipo: 'tecnica', clip: 'jab_light', dur: 0.7, pes: 4 }),
    roto: Object.freeze({ id: 'roto', nombre: 'Roto', tipo: 'tecnica', clip: 'NO_EXISTE', dur: 0.9, pes: 2 })
});

section('1 · Construccion del mapa');
const mapa = M.buildClipMap({ animaciones: ANIMS, biblioteca: BIB });
{
    check('tres filas', mapa.total === 3 && mapa.filas.length === 3, mapa.total);
    check('ids ordenados', mapa.filas.map((f) => f.id).join(',') === 'guardia,jab,roto', mapa.filas.map((f) => f.id));
    check('los nombres de clip salen de la biblioteca', mapa.nombresClip.join(',') === 'guard_high,idle,jab_light', mapa.nombresClip);
    check('no se toca el original congelado', ANIMS.jab.dur === 0.7);
    check('se copia la ficha', M.porId(mapa, 'jab').ficha.dur === 0.4);
    check('la ficha es copia, no la original', M.porId(mapa, 'jab').ficha !== BIB.jab_light);
    check('durClip se lee de la ficha', M.porId(mapa, 'guardia').durClip === 1.2);
}

section('2 · Los desconectados se ven');
{
    check('idle conecta', M.porId(mapa, 'guardia').clipEnBiblioteca === true);
    check('NO_EXISTE no conecta', M.porId(mapa, 'roto').clipEnBiblioteca === false);
    check('el aviso dice cual', M.porId(mapa, 'roto').aviso.includes('no existe'));
    check('solo un aviso', M.avisos(mapa).length === 1, M.avisos(mapa).map((f) => f.id));
    const r = M.resumen(mapa);
    check('resumen total', r.total === 3, r);
    check('resumen conClip', r.conClip === 2, r);
    check('resumen sinClip', r.sinClip === 1, r);
}

section('3 · Navegacion con vuelta');
{
    check('porId existe', !!M.porId(mapa, 'jab'));
    check('porId inexistente da null', M.porId(mapa, 'nadie') === null);
    check('indice', M.indiceDe(mapa, 'jab') === 1);
    check('indice inexistente', M.indiceDe(mapa, 'nadie') === -1);
    check('siguiente', M.vecino(mapa, 'guardia', 1).id === 'jab');
    check('anterior', M.vecino(mapa, 'jab', -1).id === 'guardia');
    check('del primero al ultimo', M.vecino(mapa, 'guardia', -1).id === 'roto');
    check('del ultimo al primero', M.vecino(mapa, 'roto', 1).id === 'guardia');
    check('salto grande vuelve al mismo sitio', M.vecino(mapa, 'jab', 3).id === 'jab');
    check('sin seleccion devuelve el primero', M.vecino(mapa, null, 1).id === 'guardia');
}

section('4 · Fases');
{
    check('tres fases', M.FASES.join(',') === 'STARTUP,ACTIVE,RECOVERY');
    check('las fases defecto suman 1', Math.abs(M.FASES_DEFECTO.STARTUP + M.FASES_DEFECTO.ACTIVE + M.FASES_DEFECTO.RECOVERY - 1) < 1e-9);
    const f = M.porId(mapa, 'guardia');
    check('commitment bajo reparte recovery', f.fases.RECOVERY > f.fases.STARTUP, f.fases);
    check('las fases de una fila suman 1', Math.abs(f.fases.STARTUP + f.fases.ACTIVE + f.fases.RECOVERY - 1) < 1e-6, f.fases);
    check('inicio es STARTUP', M.faseEn(f, 0) === 'STARTUP');
    check('mitad es ACTIVE o RECOVERY', ['ACTIVE', 'RECOVERY'].includes(M.faseEn(f, 0.5)), M.faseEn(f, 0.5));
    check('final es RECOVERY', M.faseEn(f, 1) === 'RECOVERY');
    check('t se recorta abajo', M.faseEn(f, -5) === 'STARTUP');
    check('t se recorta arriba', M.faseEn(f, 9) === 'RECOVERY');
    check('segundos de fase', Math.abs(M.segundosDeFase(f, 'RECOVERY') - 1.2 * f.fases.RECOVERY) < 1e-9);
}

section('5 · El mapa real de selectAnims');
{
    const real = M.buildClipMap({ biblioteca: BIB });
    check('18 animaciones reales', real.total === 18, real.total);
    check('la tabla trae guardia', !!M.porId(real, 'guardia'));
    check('la tabla trae llave_patas', !!M.porId(real, 'llave_patas'));
    check('no se puede mutar ANIMATIONS', Object.isFrozen(A.ANIMATIONS));

    // El caso real: la biblioteca de 83 clips y los 18 nombres de estado de
    // selectAnims. Si un alias apunta a un clip que ya no existe, aqui falla.
    const bibReal = L.crearBiblioteca({
        locoPose: () => null, attackPose: () => null, stancePoseFn: () => null
    });
    const completo = M.buildClipMap({ biblioteca: bibReal });
    check('los 18 estados conectan con un clip real', M.resumen(completo).sinClip === 0,
        M.avisos(completo).map((f) => f.id + ':' + f.clip));
    check('IDLE se traduce a idle', M.porId(completo, 'guardia').clipReal === 'idle');
    check('LIGHT_1 se traduce a st_recto', M.porId(completo, 'jab').clipReal === 'st_recto');
    check('REVERSE_KICK se traduce a sp_patada_giro',
        M.porId(completo, 'revision').clipReal === 'sp_patada_giro');
    check('el alias se marca', M.porId(completo, 'jab').esAlias === true);
    check('el nombre original se conserva', M.porId(completo, 'jab').clip === 'LIGHT_1');
    check('clipEfectivo deja pasar los nombres reales', M.clipEfectivo('idle') === 'idle');
    check('clipEfectivo sin nombre no revienta', M.clipEfectivo(null) === null);
    check('la tabla de alias esta congelada', Object.isFrozen(M.ALIAS_CLIP));
}

section('6 · Los alias producen poses de verdad');
{
    const RigMod = await load('src/core/cine/Rig.js');
    const { BONES } = await load('src/core/cine/CineConstants.js');
    const R = await load('src/core/entities/FighterRig.js');
    const huesos = BONES.map((b) => ({
        name: b.name, parentName: b.parent, localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const mapaHuesos = Object.create(null);
    for (const b of BONES) mapaHuesos[b.name] = b.name;
    const rig = RigMod.buildRig({ map: mapaHuesos, missing: [], duplicates: [] },
        huesos, { scale: 1, rootFix: 'Y_UP' });
    const bibReal = L.crearBiblioteca({
        locoPose: R.default.locoPose,
        attackPose: R.default.attackPose,
        stancePoseFn: R.default.posturePose
    });
    const completo = M.buildClipMap({ biblioteca: bibReal });
    let conPose = 0;
    const sinPose = [];
    for (const fila of completo.filas) {
        let pose = null;
        try {
            pose = L.poseDe(bibReal, fila.clipReal, rig, 0.3, { phase: 'ACTIVE' });
        } catch (err) {
            sinPose.push(fila.id + ' lanzo ' + err.message);
        }
        // ClipLibrary envuelve la Pose en `{ pose, state, spec... }`; el editor
        // la desempaqueta antes de pasarla a applyPose. Aqui se comprueba el
        // contrato tal cual lo consume el motor.
        if (pose && pose.pose) pose = pose.pose;
        // No todos los 21 huesos rotan en cada gesto: el generador escribe solo
        // los que cambian y `applyPose` rellena el resto con la identidad.
        if (pose && pose.rot && Object.keys(pose.rot).length >= 10
            && Object.values(pose.rot).every((q) => Array.isArray(q) && q.length === 4
                && q.every((n) => Number.isFinite(n)))) conPose++;
        else if (!sinPose.some((s) => s.startsWith(fila.id))) {
            sinPose.push(fila.id + ' (' + (pose ? Object.keys(pose).join(',') : 'null') + ')');
        }
    }
    check('las 18 animaciones dan una pose al editor', conPose === 18, sinPose);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
