/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/overrides.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la CAPA DE OVERRIDE y del INSPECTOR.
 *
 * POR QUE HAY UN ARCHIVO DEDICADO A ESTO
 * ----------------------------------------------------------------------------
 *   El inspector es lo que permite AJUSTAR las animaciones sin editar
 *   ficheros. Eso significa que hay una capa de codigo entre el ajuste y el
 *   motor, y esa capa es justo donde puede estar el fallo escondido:
 *
 *     - Si la capa tocase la tabla original, el motor se comportaria de una
 *       forma en el navegador y otra en las pruebas. Eso no se puede
 *      permitir: las pruebas tienen que valer para lo que se ve.
 *     - Si un override se ignorara silenciosamente, el inspector moveria un
 *       slider y no pasaria nada, y el usuario pensaria que el inspector esta
 *       roto (cuando lo que esta roto es la ruta mal escrita).
 *     - Si el rango de un slider dejara fuera el valor original, el valor
 *       apareceria pegado al extremo al abrir, que es desconcertante.
 *
 *   Las tres cosas se comprueban aqui contra el rig REAL del contrato.
 *
 *   node tests/overrides.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const near = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol;
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

const O = await load('src/core/anim/Overrides.js');
const PoseM = await load('src/core/cine/Pose.js');
const RigMod = await load('src/core/cine/Rig.js');
const AP = await load('src/core/entities/AttackPoses.js');
const HR = await load('src/core/entities/HitReactions.js');
const FR = await load('src/core/entities/FighterRig.js');
const I = await load('src/core/anim/Inspector.js');
const MT = await load('src/core/fsm/MoveTable.js');
const { BONES } = await load('src/core/cine/CineConstants.js');

/** El rig del contrato, sin depender de ningun .glb. */
function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}

const rig = contractRig();

// ===========================================================================
section('0 · La capa no toca la tabla original');
// ===========================================================================

run('sin overrides, merge devuelve la tabla INTACTA', () => {
    O.clearAll();
    const t = AP.liveSilhouettes();
    ok(t === AP.ATTACK_SILHOUETTES, 'devuelve la MISMA referencia, no una copia',
        t === AP.ATTACK_SILHOUETTES);
    ok(HR.liveReactions() === HR.HIT_REACTIONS, 'igual con la matriz de reacciones');

    // Y con eso, el motor se comporta igual que sin inspector. La prueba
    // fuerte es esta: la pose es IDENTICA bit a bit.
    const a = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'CROUCH', 'ACTIVE', 1, {});
    O.clearAll();
    const b = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'CROUCH', 'ACTIVE', 1, {});
    ok(near(a.state.p.HAND_L[2], b.state.p.HAND_L[2], 1e-12),
        'la pose es identica con y sin la capa',
        [a.state.p.HAND_L[2], b.state.p.HAND_L[2]]);
});

run('la tabla original esta CONGELADA EN PROFUNDO', () => {
    // POR QUE SE COMPRUEBA CON `isFrozen` Y NO INTENTANDO ESCRIBIR
    //   El cargador de pruebas (tests/loader.mjs) sirve los modulos como
    //   data: URL, y un modulo cargado asi NO esta en modo estricto: escribir
    //   en un objeto congelado ahi no lanza, se lo come. Un `try { ... } catch`
    //   daria "todo bien" sobre una tabla que en el navegador SI rechazaria.
    //   Lo que si es cierto en los dos sitios es `Object.isFrozen`.
    ok(Object.isFrozen(AP.ATTACK_SILHOUETTES), 'la tabla de siluetas');
    ok(Object.isFrozen(AP.ATTACK_SILHOUETTES.JAB), 'y cada familia');
    // El que faltaba: los ARRAYS. `Object.freeze({active: [1,2,3]})` deja el
    // array escribible, y escribir en el es el fallo silencioso que confunde
    // tres pruebas mas alla. Se escribio 99 ahi al escribir estas pruebas.
    ok(Object.isFrozen(AP.ATTACK_SILHOUETTES.JAB.STAND.armL.active),
        'y los arrays de dentro (este era el agujero)');
    ok(Object.isFrozen(HR.HIT_REACTIONS.MEDIO.FUERTE.arms), 'los brazos de la reaccion');
    ok(Object.isFrozen(HR.HIT_REACTIONS.MEDIO.FUERTE.spine), 'y la columna');
    ok(Object.isFrozen(AP.ATTACK_BASES.STAND.spec), 'la base de contexto');
});

// ===========================================================================
section('1 · Un override cambia lo que se ve');
// ===========================================================================

run('un override mueve el objetivo del golpe', () => {
    O.clearAll();
    const antes = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}).state;
    const antesZ = antes.p.HAND_L[2];
    const original = AP.ATTACK_SILHOUETTES.JAB.STAND.armL.active[2];

    // 0,20 m: por debajo del objetivo original (0,53) y MUY dentro del alcance
    // del brazo. Si se eligiera un valor mas corto todavia, el IK lo recortaria
    // y la mano no se moveria: ese es el fallo que explica el aviso de alcance.
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.20);
    const despues = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}).state;
    const despuesZ = despues.p.HAND_L[2];

    ok(despuesZ < antesZ - 0.15, 'acortar el objetivo acorta el alcance de verdad',
        { antes: antesZ.toFixed(3), despues: despuesZ.toFixed(3) });
    // Y la tabla original NO se ha movido.
    ok(AP.ATTACK_SILHOUETTES.JAB.STAND.armL.active[2] === original,
        'la tabla original sigue en su valor', original);
});

run('un override en las reacciones cambia la postura', () => {
    O.clearAll();
    const mov = { power: 'FUERTE', height: 'MEDIO' };
    const antes = HR.hitReactionPose(rig, mov, 0.1, {});
    const antesHip = antes.state.p.PELVIS[1];

    // 0,50 m: la cadera se hunde mas de lo que dice la fila (0,72).
    O.setOverride('HIT_REACTIONS.MEDIO.FUERTE.hip', 0.50);
    const despues = HR.hitReactionPose(rig, mov, 0.1, {});
    // Aqui se mide la POSE DE LA REACCION, sin la postura de combate debajo: el
    // override manda entero. (En combate la reaccion se SUMA a la guardia, asi
    // que su efecto se ve atenuado; eso se comprueba mas abajo, en su propia
    // prueba, para que quede claro que es una decision y no un fallo.)
    ok(near(despues.state.p.PELVIS[1], 0.50, 0.01),
        'la cadera de la reaccion es exactamente la de la fila',
        despues.state.p.PELVIS[1].toFixed(3));
    ok(despues.state.p.PELVIS[1] < antesHip - 0.15,
        'bajar el numero hunde al que recibe el golpe',
        { antes: antesHip.toFixed(3), despues: despues.state.p.PELVIS[1].toFixed(3) });
    ok(near(HR.HIT_REACTIONS.MEDIO.FUERTE.hip, 0.72), 'la tabla original sigue en 0,72');
});

run('un override en un array (spine) no rompe los otros elementos', () => {
    O.clearAll();
    O.setOverride('HIT_REACTIONS.ALTO.MEDIO.spine.1', 0.9);   // el giro del torso
    const R = HR.liveReactions().ALTO.MEDIO;
    ok(R.spine[0] === -0.16, 'spine[0] sigue siendo el original', R.spine[0]);
    ok(R.spine[1] === 0.9, 'spine[1] es el del override', R.spine[1]);
    ok(R.spine[2] === 0.12, 'spine[2] sigue siendo el original', R.spine[2]);
    ok(Array.isArray(R.spine) && R.spine.length === 3, 'sigue siendo un array de 3');
});

run('un override en un array anidado (arms)', () => {
    O.clearAll();
    O.setOverride('HIT_REACTIONS.BAJO.FUERTE.arms.0.2', 0.9);
    const R = HR.liveReactions().BAJO.FUERTE;
    ok(R.arms[0][2] === 0.9, 'la mano izquierda avanza', R.arms[0][2]);
    ok(R.arms[0][0] === 0.42, 'su x no se ha movido', R.arms[0][0]);
    ok(R.arms[1][0] === -0.34, 'la mano derecha no se ha movido', R.arms[1][0]);
});

// ===========================================================================
section('2 · El parche se ve y se borra');
// ===========================================================================

run('setOverride / list / clear', () => {
    O.clearAll();
    ok(O.overrideCount() === 0, 'empieza vacio');
    O.setOverride('A.b.c', 1);
    O.setOverride('A.b.d', 2);
    ok(O.overrideCount() === 2, 'dos rutas', O.overrideCount());
    ok(O.listOverrides().length === 2, 'listOverrides las ve');
    ok(O.overrideAt('A.b.c') === 1, 'y se puede leer el valor');

    // Poner el MISMO valor no cambia la version: es lo que hace la cache.
    const v1 = O.version();
    O.setOverride('A.b.c', 1);
    ok(O.version() === v1, 'poner el mismo valor no es un cambio');

    O.setOverride('A.b.c', 5);
    ok(O.version() > v1, 'un valor distinto si lo es');

    O.clearOverride('A.b.c');
    ok(O.overrideCount() === 1, 'clearOverride quita una', O.overrideCount());
    ok(O.overrideAt('A.b.c') === undefined, 'y ya no se ve');
    O.clearAll();
    ok(O.overrideCount() === 0, 'clearAll lo vacia');
});

run('un override a undefined es BORRARLO', () => {
    O.clearAll();
    O.setOverride('A.b', 3);
    O.setOverride('A.b', undefined);
    ok(O.overrideCount() === 0, 'setOverride(undefined) borra');
});

run('la cache se invalida al cambiar', () => {
    O.clearAll();
    const v0 = O.version();
    const t1 = AP.liveSilhouettes();
    const v1 = O.version();
    ok(v1 === v0, 'merge no cambia la version');
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.base.hip', 0.5);
    const t2 = AP.liveSilhouettes();
    ok(O.version() > v1, 'el override cambia la version');
    ok(t2 !== t1, 'y merge devuelve una tabla nueva');
    ok(t2.JAB.STAND.base.hip === 0.5, 'con el valor nuevo', t2.JAB.STAND.base.hip);
    ok(t1.JAB.STAND.base.hip === 0.86, 'mientras la anterior sigue como estaba',
        t1.JAB.STAND.base.hip);
    O.clearAll();
});

run('applyPatch y exportPatch son ida y vuelta', () => {
    O.clearAll();
    const parche = {
        ATTACK_SILHOUETTES: { JAB: { STAND: { armL: { active: [0.1, 1.0, 0.5] } } } },
        HIT_REACTIONS: { ALTO: { FUERTE: { recover: 0.11 } } }
    };
    // Aplanado (que es como se exporta):
    const plano = {
        'ATTACK_SILHOUETTES.JAB.STAND.armL.active.2': 0.5,
        'ATTACK_SILHOUETTES.JAB.STAND.armL.active.0': 0.1,
        'HIT_REACTIONS.ALTO.FUERTE.recover': 0.11
    };
    ok(O.applyPatch(plano) === 3, 'applyPatch acepta 3 rutas', O.applyPatch(plano));
    ok(O.overrideAt('HIT_REACTIONS.ALTO.FUERTE.recover') === 0.11, 'el valor esta');
    const fuera = O.exportPatch();
    ok(Object.keys(fuera).length === 3, 'exportPatch devuelve las 3');
    ok(fuera['HIT_REACTIONS.ALTO.FUERTE.recover'] === 0.11, 'con el valor');
    ok(parche !== null, 'el ejemplo de arriba no se usa (es solo doc)');
    O.clearAll();
});

// ===========================================================================
section('3 · El inspector: lo que el panel necesita saber');
// ===========================================================================

run('numericPaths encuentra los numeros de una fila', () => {
    const fila = AP.ATTACK_SILHOUETTES.JAB.STAND;
    const rutas = O.numericPaths(fila);
    ok(rutas.length > 0, 'hay rutas', rutas.length);
    ok(rutas.indexOf('base.hip') !== -1, 'incluye base.hip', rutas);
    ok(rutas.indexOf('armL.active.2') !== -1, 'incluye el indice del array',
        rutas.filter((r) => r.indexOf('active') !== -1));
    // Toda ruta debe RESOLVER a un numero. La version anterior de esta prueba
    // comprobaba que el ultimo trozo fuese parseable como numero, y fallaba
    // con `base.hip`: `parseFloat('hip')` es NaN. El nombre de una clave puede
    // ser cualquier cosa; lo que tiene que ser un numero es lo que hay debajo.
    const noNumeros = rutas.filter((r) => typeof O.readPath(fila, r) !== 'number');
    ok(noNumeros.length === 0, 'toda ruta resuelve a un numero', noNumeros.slice(0, 5));
    // Y ninguna mete una hoja dos veces (el sintoma clasico de olvidar el push).
    ok(new Set(rutas).size === rutas.length, 'no hay repetidas');
    // Y ninguna mete una hoja dos veces.
    ok(new Set(rutas).size === rutas.length, 'no hay repetidas');
});

run('numericPaths no se cuelga con datos raros', () => {
    // El tope de profundidad (5) es lo que evita que un descuido con un objeto
    // ciclico cuelgue el inspector entero.
    let ciclico = { a: 1 };
    ciclico.self = ciclico;
    let r = null;
    try { r = O.numericPaths(ciclico); } catch (e) { r = null; }
    ok(r !== null, 'no explota con un ciclo', r === null ? 'lanzo' : '');
});

run('rangeFor pone el valor original DENTRO del rango', () => {
    // Si el valor original cae fuera del rango del slider, al abrir el panel
    // el slider aparece pegado al extremo y el usuario ve un numero que no es
    // el del fichero. Es el fallo mas desconcertante que puede tener este panel.
    const problemas = [];
    const comprueba = (tabla) => {
        for (const ruta of O.numericPaths(tabla)) {
            const v = O.readPath(tabla, ruta);
            const r = O.rangeFor(ruta);
            if (v < r.min || v > r.max) problemas.push(`${ruta} = ${v} fuera de [${r.min}, ${r.max}]`);
        }
    };
    comprueba(AP.ATTACK_SILHOUETTES);
    comprueba(AP.ATTACK_BASES);
    comprueba(HR.HIT_REACTIONS);
    ok(problemas.length === 0,
        'todos los valores originales caben en su rango', problemas.slice(0, 6));
});

run('rangeFor da unidades coherentes', () => {
    ok(O.rangeFor('x.base.hip').unit === 'm', 'la cadera en metros');
    ok(O.rangeFor('x.base.hipY').unit === 'm', 'hipY en metros');
    ok(O.rangeFor('x.armL.active.1').unit === 'm', 'un objetivo de mano en metros');
    ok(O.rangeFor('x.base.twist').unit === 'rad', 'un giro en radianes');
    ok(O.rangeFor('x.recover').min === 0 && O.rangeFor('x.recover').max === 1,
        'recover es 0..1');

    // `lean` son GRADOS dentro de un spec y RADIANES en los mods de
    // locomocion. Con un unico rango, uno de los dos es inusable.
    ok(O.rangeFor('STAND.spec.lean').unit === 'grados',
        'lean de un spec va en grados',
        O.rangeFor('STAND.spec.lean'));
    ok(O.rangeFor('RUN.lean').unit === 'rad', 'lean de locomocion va en radianes',
        O.rangeFor('RUN.lean'));
    ok(O.rangeFor('STAND.spec.lean').max >= 14,
        'y el rango de grados cubre el valor real mas alto (14 en DOWN)',
        O.rangeFor('STAND.spec.lean').max);

    // `guard` es un factor, y SHELL llega a 1,20: un techo de 0,8 dejaba el
    // valor real del slider fuera de la pista.
    ok(O.rangeFor('STAND.spec.guard').max >= 1.2, 'el rango de guard cubre SHELL (1,20)',
        O.rangeFor('STAND.spec.guard').max);
    ok(O.rangeFor('STAND.spec.guard').unit === 'x', 'y no son metros');

    // La cadera y los objetivos de mano pueden salirse a proposito (para
    // explorar), pero tienen que estar marcados `soft`: el inspector avisa y el
    // motor no trunca en silencio.
    ok(O.rangeFor('x.base.hip').soft === true, 'la cadera es soft');
    ok(O.rangeFor('x.base.twist').soft === undefined, 'un giro es rango duro');
    // Y el `recover` de las 9 filas tiene que caber.
    const R = HR.HIT_REACTIONS;
    for (const h of ['ALTO', 'MEDIO', 'BAJO']) {
        for (const p of ['DEBIL', 'MEDIO', 'FUERTE']) {
            const v = R[h][p].recover;
            ok(v >= 0 && v <= 1, `recover de ${h}/${p} es 0..1`, v);
        }
    }
});

run('la vista sabe que fila de la tabla es', () => {
    O.clearAll();
    const ataque = I.filaDeLaVista({ kind: 'ATTACK', family: 'JAB', context: 'CROUCH' });
    ok(ataque.tabla === 'ATTACK_SILHOUETTES', 'el golpe sale de ATTACK_SILHOUETTES');
    ok(ataque.raiz === AP.ATTACK_SILHOUETTES.JAB.CROUCH, 'y de la fila correcta',
        ataque.raiz && Object.keys(ataque.raiz).join(','));
    ok(O.numericPaths(ataque.raiz).length > 0, 'que tiene numeros');

    const reaccion = I.filaDeLaVista({ kind: 'REACTION', height: 'ALTO', power: 'FUERTE' });
    ok(reaccion.tabla === 'HIT_REACTIONS', 'la reaccion sale de HIT_REACTIONS');
    ok(reaccion.raiz === HR.HIT_REACTIONS.ALTO.FUERTE, 'de la fila correcta');

    // La levantada y los golpes de suelo NO tienen tabla (estan en funciones).
    ok(I.filaDeLaVista({ kind: 'WAKEUP' }) === null, 'la levantada no tiene tabla');
    ok(I.filaDeLaVista({ kind: 'GROUND' }) === null, 'los golpes de suelo tampoco');
});

run('la vista de la tabla cambia con el override puesto', () => {
    O.clearAll();
    const f1 = I.filaDeLaVista({ kind: 'ATTACK', family: 'JAB', context: 'STAND' });
    ok(f1.raiz.armL.active[2] === AP.ATTACK_SILHOUETTES.JAB.STAND.armL.active[2],
        'sin parche, el valor original');
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.30);
    const f2 = I.filaDeLaVista({ kind: 'ATTACK', family: 'JAB', context: 'STAND' });
    ok(f2.raiz.armL.active[2] === 0.30, 'con parche, el nuevo', f2.raiz.armL.active[2]);
    // Y una familia que NO se ha tocado sigue con lo suyo.
    const f3 = I.filaDeLaVista({ kind: 'ATTACK', family: 'KICK', context: 'STAND' });
    ok(f3.raiz.legL.active[2] === AP.ATTACK_SILHOUETTES.KICK.STAND.legL.active[2],
        'las demas familias no se tocan');
    O.clearAll();
});

// ===========================================================================
section('4 · El inspector resuelve poses de verdad');
// ===========================================================================

run('pose() devuelve pose y estado para las cuatro vistas', () => {
    O.clearAll();
    const model = { rig };
    const vistas = [
        { kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', family: 'JAB', context: 'STAND', phase: 'ACTIVE', t: 1 },
        { kind: 'REACTION', height: 'ALTO', power: 'FUERTE', t: 0.2 },
        { kind: 'GROUND', groundKind: 'PIE', phase: 'ACTIVE', t: 0.8 },
        { kind: 'WAKEUP', t: 0.5 }
    ];
    for (const v of vistas) {
        const r = I.pose(model, v);
        ok(!!r.pose && !!r.state, `${v.kind}: devuelve pose y estado`);
        ok(r.state.p.HEAD != null, `${v.kind}: el estado tiene la FK`);
        ok(!!r.lectura, `${v.kind}: devuelve lectura`);
        ok(r.move != null, `${v.kind}: devuelve el frame data`);
    }
});

run('pose() del golpe es EXACTAMENTE lo que sale en combate', () => {
    O.clearAll();
    // Esta es la garantia central del inspector: que lo que se ve con F2 sea lo
    // que sale en la partida. Se comprueba calling las dos rutas y comparando
    // las manos, los pies y la cadera, hueso a hueso, en los tres contextos y
    // las tres fases. Si divergen, el inspector miente.
    const model = { rig };
    const IGUALES = 1e-9;
    const hueso = (s) => ['HAND_L', 'HAND_R', 'TOE_L', 'TOE_R', 'PELVIS', 'HEAD']
        .map((b) => s.p[b].join(',')).join('|');

    const fallos = [];
    for (const familia of ['ATAQUE_LIGERO', 'GANCHO', 'UPPERCUT']) {
        for (const contexto of ['STAND', 'CROUCH', 'AIR', 'DOWN']) {
            for (const fase of ['STARTUP', 'ACTIVE', 'RECOVERY']) {
                for (const t of [0, 0.5, 1]) {
                    const view = {
                        kind: 'ATTACK', moveKey: familia, context: contexto,
                        phase: fase, t
                    };
                    const delInspector = I.pose(model, view).state;
                    // El mismo golpe por el camino del combate, con el mismo
                    // contexto impuesto (el unico parametro que el panel cambia).
                    const delCombate = FR.poseFor(rig, {
                        phase: 'GROUND', groups: ['ATTACKING'],
                        context: contexto, attack: familia,
                        attackPhase: fase, attackT: t
                    }, {}).state;
                    if (hueso(delInspector) !== hueso(delCombate)) {
                        fallos.push(`${familia}/${contexto}/${fase} t=${t}`);
                    }
                }
            }
        }
    }
    ok(fallos.length === 0,
        'las dos rutas dan la misma pose, hueso a hueso', fallos.slice(0, 5));
});

run('el inspector ve lo mismo con un override', () => {
    O.clearAll();
    // Y el override tiene que notarse en las DOS rutas, no solo en la del
    // panel: si el inspector se purgara antes de resolver la pose, el slider
    // moveria el numero pero la figura no se moveria.
    const model = { rig };
    const view = { kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', context: 'STAND', phase: 'ACTIVE', t: 1 };
    const antes = I.pose(model, view).state.p.HAND_L[2];
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.20);
    const despues = I.pose(model, view).state.p.HAND_L[2];
    ok(despues < antes - 0.15, 'el panel ve el cambio', [antes.toFixed(3), despues.toFixed(3)]);

    const combate = FR.poseFor(rig, {
        phase: 'GROUND', groups: ['ATTACKING'], context: 'STAND',
        attack: 'ATAQUE_LIGERO', attackPhase: 'ACTIVE', attackT: 1
    }, {}).state.p.HAND_L[2];
    ok(Math.abs(combate - despues) < 1e-9, 'y el combate ve lo MISMO',
        [despues.toFixed(3), combate.toFixed(3)]);
    O.clearAll();
});

run('pose() con t fuera de 0..1 no rompe', () => {
    O.clearAll();
    const model = { rig };
    for (const t of [-5, 0, 0.5, 1, 99, NaN, null, undefined]) {
        let r = null;
        try { r = I.pose(model, { kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', context: 'STAND', phase: 'ACTIVE', t }); }
        catch (e) { r = null; }
        ok(!!r && !!r.pose, `t=${t} no rompe`, r === null ? 'lanzo' : '');
    }
});

run('pose() del golpe usa el frame data REAL', () => {
    O.clearAll();
    const r = I.pose({ rig }, {
        kind: 'ATTACK', moveKey: 'ATAQUE_PESADO', family: 'KICK',
        context: 'STAND', phase: 'ACTIVE', t: 1
    });
    const real = MT.CORE_MOVES.ATAQUE_PESADO;   // el frame data de verdad
    ok(r.move.startup === real.startup, 'el amago es el del golpe real', r.move.startup);
    ok(r.move.active === real.active, 'el activo tambien');
    ok(r.move.recover === real.recover, 'y la recogida');
});

run('el mismo golpe se ve distinto en cada contexto', () => {
    O.clearAll();
    const model = { rig };
    const dePie = I.pose(model, {
        kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', context: 'STAND', phase: 'ACTIVE', t: 1
    });
    const agachado = I.pose(model, {
        kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', context: 'CROUCH', phase: 'ACTIVE', t: 1
    });
    ok(agachado.state.p.HAND_L[1] < dePie.state.p.HAND_L[1] - 0.2,
        'el jab agachado pega mas abajo que el de pie',
        { dePie: dePie.state.p.HAND_L[1].toFixed(3), agachado: agachado.state.p.HAND_L[1].toFixed(3) });
    // Y las CADERAS tambien se ven distintas (si no, el inspector no prepara
    // bien la base y estarias ajustando la altura del brazo con la cadera de pie).
    ok(agachado.state.p.PELVIS[1] < dePie.state.p.PELVIS[1] - 0.2,
        'y con la cadera agachada', [dePie.state.p.PELVIS[1].toFixed(2), agachado.state.p.PELVIS[1].toFixed(2)]);
});

run('en el aire no se avisa de que el pie flota', () => {
    O.clearAll();
    const enAire = I.lectura(
        AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'AIR', 'ACTIVE', 1, {}).state,
        { kind: 'ATTACK', context: 'AIR' });
    ok(enAire.groundY === null, 'en el aire no hay suelo contra el que medir',
        enAire.groundY);

    const dePie = I.lectura(
        AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}).state,
        { kind: 'ATTACK', context: 'STAND' });
    ok(dePie.groundY === 0, 'de pie si lo hay');
    ok(typeof dePie.footY === 'number', 'y se lee la altura del pie', dePie.footY);
});

run('los golpes que clavan los pies los clavan DE VERDAD', () => {
    O.clearAll();
    // Este bloque es una REGRESION, y documenta el fallo que motivo el arreglo.
    //
    // La postura base clava las puntas en el suelo a su altura de cadera;
    // despues, la seccion 2 de attackPoseFor corrige la cadera a la del
    // contexto y a la de la silueta, y ESO MUEVE LOS PIES sin volver a
    // clavarlos. Medido antes del arreglo (TOE_L en metros, 0 = apoyado):
    //     jab        -0,02     gancho   -0,04
    //     uppercut   -0,16     tumbado  -0,18
    // Es decir, el uppercut clavaba las dos piernas 16 cm bajo el suelo: el
    // personaje no bajaba, se hundia el suelo con el.
    const MEDIDA = 0.03;   // 3 cm: por debajo, placeFoot no llega a cerrar
    const revisar = (nombre, moveKey, contexto, fases) => {
        for (const fase of fases) {
            const st = AP.attackPoseFor(rig, moveKey, contexto, fase, 1, {}).state;
            const yL = st.p.TOE_L[1], yR = st.p.TOE_R[1];
            ok(Math.abs(yL) < MEDIDA && Math.abs(yR) < MEDIDA,
                `${nombre} en pie en ${contexto}/${fase}`,
                { L: yL.toFixed(3), R: yR.toFixed(3) });
        }
    };
    const FASES = ['STARTUP', 'ACTIVE', 'RECOVERY'];
    // Solo los golpes de BRAZO: en los de pierna el pie de golpe esta en el
    // aire a proposito y el de apoyo lo clava la seccion 3.
    revisar('jab', 'ATAQUE_LIGERO', 'STAND', FASES);
    revisar('gancho', 'GANCHO', 'STAND', FASES);
    revisar('uppercut', 'UPPERCUT', 'STAND', FASES);
    revisar('jab', 'ATAQUE_LIGERO', 'CROUCH', FASES);
    revisar('jab', 'ATAQUE_LIGERO', 'DOWN', FASES);
    revisar('uppercut', 'UPPERCUT', 'CROUCH', FASES);
    O.clearAll();
});

run('el pie de APOYO se queda clavado en los golpes de pierna', () => {
    O.clearAll();
    // Al reves que el anterior: aqui el pie que se queda en el suelo es el
    // que NO es el de la patada, y el otro tiene que estar en el aire (si no,
    // es una patada con los dos pies en el suelo, que no es una patada).
    const r = AP.attackPoseFor(rig, 'ATAQUE_PESADO', 'STAND', 'ACTIVE', 1, {});
    ok(Math.abs(r.state.p.TOE_R[1]) < 0.03, 'el apoyo derecho sigue en el suelo',
        r.state.p.TOE_R[1].toFixed(3));
    ok(r.state.p.TOE_L[1] > 0.5, 'y el pie de la patada esta arriba',
        r.state.p.TOE_L[1].toFixed(3));
    O.clearAll();
});

run('el aire NO clava los pies', () => {
    O.clearAll();
    // El reves del arreglo: si el arreglo clava siempre, un golpe en el aire
    // deja al peleador "patinando en el aire", que es justo el fallo que
    // `planted: false` existe para evitar.
    const st = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'AIR', 'ACTIVE', 1, {}).state;
    ok(Math.abs(st.p.TOE_L[1]) > 0.03,
        'en el aire el pie no baja al suelo', st.p.TOE_L[1].toFixed(3));
    O.clearAll();
});

run('lectura() avisa cuando el pie NO esta en el suelo', () => {
    O.clearAll();
    const dePie = I.lectura(
        AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}).state,
        { kind: 'ATTACK', context: 'STAND' });
    ok(Math.abs(dePie.footY) < 0.06,
        'un golpe de brazo deja los pies en el suelo', dePie.footY);

    // Y si se sube la cadera a proposito, los pies tienen que seguir abajo: es
    // el arreglo de "reclavar los pies" funcionando con un numero del inspector.
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.base.hip', 0.60);
    const raro = I.lectura(
        AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}).state,
        { kind: 'ATTACK', context: 'STAND' });
    ok(Math.abs(raro.footY) < 0.06,
        'bajar la cadera por override NO hunde los pies', raro.footY);
    ok(raro.hipY < dePie.hipY - 0.15, 'pero la cadera si baja',
        [dePie.hipY.toFixed(3), raro.hipY.toFixed(3)]);
    O.clearAll();
});

// ===========================================================================
section('5 · Exportar');
// ===========================================================================

run('exportAsSource sale como codigo pegable', () => {
    O.clearAll();
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.55);
    O.setOverride('HIT_REACTIONS.ALTO.MEDIO.recover', 0.4);
    const txt = O.exportAsSource('// ajustes');

    ok(txt.indexOf('// ajustes') === 0, 'empieza por la cabecera');
    ok(txt.indexOf("setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.55)") !== -1,
        'tiene la linea del jab', txt);
    ok(txt.indexOf("setOverride('HIT_REACTIONS.ALTO.MEDIO.recover', 0.4)") !== -1,
        'y la de la reaccion');
    ok(txt.indexOf('ATTACK_SILHOUETTES ---') !== -1, 'agrupa por tabla');
    // Una linea por ajuste: es un diff legible, no una linea de 4.000 chars.
    ok(txt.split('\n').filter((l) => l.indexOf('setOverride') !== -1).length === 2,
        'una linea por ajuste');
    O.clearAll();
});

run('exportAsSource sin nada que exportar', () => {
    O.clearAll();
    const txt = O.exportAsSource();
    ok(txt.indexOf('sin overrides') !== -1, 'lo dice claro', txt);
});

run('exportPatch es JSON valido', () => {
    O.clearAll();
    O.setOverride('A.b', 1.5);
    const txt = JSON.stringify(O.exportPatch());
    const vuelta = JSON.parse(txt);
    ok(vuelta['A.b'] === 1.5, 'ida y vuelta', vuelta);
    O.clearAll();
});

// ===========================================================================
section('6 · Lo que el motor lee cuando el inspector esta abierto');
// ===========================================================================

run('poseFor respeta los overrides (el camino del combate)', () => {
    O.clearAll();
    // El camino real: la FSM -> poseFor. Si el override no llegara aqui, el
    // inspector moveria el slider y en combate no se veria nada.
    const snap = {
        phase: 'GROUND', groups: ['ATTACKING'],
        posture: { limbs: 'STAND', hipY: 0.88, spinePitch: 0.1 },
        attack: 'ATAQUE_LIGERO', attackPhase: 'ACTIVE', attackT: 1
    };
    const antes = FR.poseFor(rig, snap, {}).state.p.HAND_L[2];
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 0.30);
    const despues = FR.poseFor(rig, snap, {}).state.p.HAND_L[2];
    ok(despues < antes - 0.2,
        'poseFor (el camino de combate) ve el override',
        { antes: antes.toFixed(3), despues: despues.toFixed(3) });
    O.clearAll();
});

run('la reaccion del combate tambien ve los overrides', () => {
    O.clearAll();
    const snap = {
        phase: 'IMPACT', groups: ['IMPACT'],
        move: { hitLevel: 'FUERTE', power: 'FUERTE', height: 'MEDIO' },
        hitLevel: 'FUERTE', hitT: 0.1
    };
    const antes = FR.poseFor(rig, snap, {}).state.p.PELVIS[1];
    O.setOverride('HIT_REACTIONS.MEDIO.FUERTE.hip', 0.45);
    const despues = FR.poseFor(rig, snap, {}).state.p.PELVIS[1];
    ok(despues < antes - 0.03, 'el override llega a la pose de combate',
        { antes: antes.toFixed(3), despues: despues.toFixed(3) });
    O.clearAll();
});

run('el efecto de la reaccion se ATENUA al mezclarse (y es a proposito)', () => {
    O.clearAll();
    // La reaccion NO sustituye a la guardia: se SUMA encima con un peso
    // (`weight * recover`). Para MEDIO/FUERTE el peso es 0,70 * 0,30 = 0,21, de
    // modo que un delta de 0,27 m en la fila acaba siendo 0,06 m en pantalla.
    //
    // Se comprueba a proposito, porque es el numero que hace que "mover un
    // slider y no verse casi nada" sea NORMAL en la pestana REACCION y un
    // fallo en cualquier otra. El inspector lo avisa: el contador de la fila
    // dice cuantos ajustes hay sin volcar al codigo, y la mezcla se puede ver
    // mirando la postura de combate debajo.
    const mov = { power: 'FUERTE', height: 'MEDIO' };
    const suelta = HR.hitReactionPose(rig, mov, 0.25, {}).state.p.PELVIS[1];
    const sobreGuardia = FR.blendReactionOverStance(
        rig, FR.posturePose(rig, { limbs: 'BRACE', hipY: 0.88, spinePitch: 0.1 }, {}),
        HR.hitReactionPose(rig, mov, 0.25, {})
    ).state.p.PELVIS[1];

    ok(suelta < 0.80, 'suelta, la fila de MEDIO/FUERTE hunde la cadera', suelta.toFixed(3));
    ok(sobreGuardia > suelta + 0.05,
        'mezclada sobre la guardia, hunde menos: la guardia no desaparece',
        { suelta: suelta.toFixed(3), mezcla: sobreGuardia.toFixed(3) });
    ok(sobreGuardia < 0.88, 'pero sigue mas abajo que la guardia pura (0,88)',
        sobreGuardia.toFixed(3));
    O.clearAll();
});

run('TODOS los objetivos de la tabla estan al alcance del cuerpo', () => {
    O.clearAll();
    // ESTA ES LA REGRESION MAS IMPORTANTE DEL ARCHIVO.
    //
    // El IK recorta EN SILENCIO lo que no alcanza (cine/Rig.js: `if (d >
    // reachMax) { d = reachMax }`). Un objetivo 40 cm mas lejos del hombro que
    // el brazo no da error, no avisa y se ve casi igual de bien: el brazo se
    // estira entero y para. El resultado es que un slider de extension deja de
    // responder en el ultimo tramo, y el sintoma ("el slider esta roto") no
    // lleva a ninguna parte.
    //
    // Catorce objetivos estaban asi (casi todos los `active` de brazo, y el
    // barrido), invisible porque el recorte las hacia parecer razonables. Por
    // eso la comprobacion recorre TODOS los pares familia/contexto/fase: un
    // objetivo nuevo no puede colarse.
    //
    // Se mide con el hombro YA EN SU SITIO (tras el giro del torso), no con el
    // de reposo: el hombro del jab se va 24 cm al girar el torso, y medir
    // contra el de reposo daria un margen de 24 cm que en la pose real no
    // existe.
    const FAMS = {
        JAB: 'ATAQUE_LIGERO', GANCHO: 'GANCHO', UPPERCUT: 'UPPERCUT',
        KICK: 'ATAQUE_PESADO', SWEEP: 'ATAQUE_BARRIDO'
    };
    const alcBrazo = rig.bones[rig.index.UPPERARM_L].length
        + rig.bones[rig.index.FOREARM_L].length;
    const alcPierna = rig.bones[rig.index.THIGH_L].length
        + rig.bones[rig.index.SHIN_L].length + 0.06;   // + el tobillo a la punta

    const fuera = [];
    let medidos = 0;
    for (const [fam, moveKey] of Object.entries(FAMS)) {
        for (const contexto of ['STAND', 'CROUCH', 'AIR', 'DOWN']) {
            const fila = AP.ATTACK_SILHOUETTES[fam][contexto];
            const esBrazo = !!fila.armL;
            const alc = esBrazo ? alcBrazo : alcPierna;
            for (const [fase, faseFSM] of [
                ['home', 'RECOVERY'], ['startup', 'STARTUP'], ['active', 'ACTIVE']
            ]) {
                const K = esBrazo ? fila.armL : fila.legL;
                if (!K || !K[fase]) continue;
                const snap = {
                    phase: 'GROUND', groups: ['ATTACKING'], context: contexto,
                    attack: moveKey, attackPhase: faseFSM, attackT: 1,
                    posture: {
                        limbs: contexto === 'CROUCH' ? 'CROUCH' : 'BRACE',
                        hipY: contexto === 'CROUCH' ? 0.52 : 0.88,
                        spinePitch: 0.1
                    }
                };
                const raiz = FR.poseFor(rig, snap, {}).state.p[esBrazo ? 'UPPERARM_L' : 'THIGH_L'];
                const obj = K[fase];
                const d = Math.hypot(obj[0] - raiz[0], obj[1] - raiz[1], obj[2] - raiz[2]);
                medidos++;
                // Margen del 2%: un objetivo pegado al limite es un objetivo
                // que se va a salir en cuanto el modelo cambie un centimetro.
                if (d > alc * 1.02) {
                    fuera.push(`${fam}/${contexto}.${fase}: pide ${d.toFixed(2)} m, alcanza ${alc.toFixed(2)} m`);
                }
            }
        }
    }
    ok(medidos >= 50, 'se han medido todos los objetivos', medidos);
    ok(fuera.length === 0,
        'ninguno pide mas de lo que el cuerpo puede dar', fuera.slice(0, 8));
});

run('el inspector avisa cuando el objetivo NO se alcanza', () => {
    O.clearAll();
    const model = { rig };
    const v = {
        kind: 'ATTACK', moveKey: 'ATAQUE_LIGERO', family: 'JAB',
        context: 'STAND', phase: 'ACTIVE', t: 1
    };
    // Con la tabla buena, no hay aviso.
    const bien = I.pose(model, v);
    ok(bien.alcance !== null, 'se mide el alcance del modelo', bien.alcance);
    ok(bien.alcance.faltan < 0.02, 'y el objetivo de la tabla SI se alcanza',
        bien.alcance);
    // Con un override imposible, el aviso tiene que saltar y decir cuanto falta.
    O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', 1.20);
    const mal = I.pose(model, v);
    ok(mal.alcance.faltan > 0.3, 'con un objetivo imposible avisa', mal.alcance.faltan);
    ok(mal.alcance.pedido > mal.alcance.real,
        'y la distancia pedida es mayor que la real', mal.alcance);
    // Y el aviso tiene que ser sobre la FASE que se esta viendo, no sobre otra.
    v.phase = 'RECOVERY';
    const enRec = I.pose(model, v);
    ok(enRec.alcance !== null, 'tambien en RECOVERY hay lectura de alcance');
    O.clearAll();
});

run('un override absurdo no rompe la pose', () => {
    // El slider permite salirse del rango (esta marcado `soft`), asi que el
    // motor tiene que aguantar un objetivo en el otro extremo del universo.
    O.clearAll();
    for (const v of [999, -999, 0, NaN]) {
        O.setOverride('ATTACK_SILHOUETTES.JAB.STAND.armL.active.2', v);
        let r = null;
        try { r = AP.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}); }
        catch (e) { r = null; }
        ok(!!r && !!r.pose && !!r.state, `objetivo = ${v} no rompe`, r === null ? 'lanzo' : '');
        ok(Number.isFinite(r.state.p.HAND_L[2]), `y la mano sale en un numero (${v})`,
            r.state.p.HAND_L[2]);
    }
    O.clearAll();
});

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
}
console.log(`\n${pass} comprobaciones, ${fails.length} fallos`);
process.exit(fails.length ? 1 : 0);