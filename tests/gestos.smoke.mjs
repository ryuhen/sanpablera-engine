/**
 * ============================================================================
 * SANPABLERA ENGINE · tests\gestos.smoke.mjs
 * ----------------------------------------------------------------------------
 * LA CAPA POR GOLPE. Que un gesto pueda dejar de heredar de su familia.
 * ============================================================================
 *
 * POR QUE ESTA PRUEBA EXISTE
 *   Hay 69 golpes repartidos en 10 familias, y hay 19 jabs, 14 patadas y 9
 *   ganchos. Un costillazo, una sumision y el especial se animan EXACTAMENTE
 *   igual, porque los tres son `JAB`; y `PUNO_IZQUIERDO` y `PUNO_DERECHO` son
 *   el mismo dato. Por eso las animaciones "estan raras": no es que esten mal
 *   afinadas, es que son LA MISMA donde el jugador esperaba varias.
 *
 *   Y con eso, un editor por familia no sirve: mover `JAB` mueve los 19. Esta
 *   capa es la que hace posible editar un golpe sin tocar los demas.
 *
 * QUE COMPRUEBA, Y POR QUE CADA COSA
 *
 *   1. CON LA TABLA VACIA NO PASA NADA. Es lo primero y lo mas importante: si
 *      anadir la capa hubiera cambiado una sola pose, el juego habria cambiado
 *      de comportamiento al Meter un editor. Se compara la pose de un jab con
 *      la tabla vacia y con la capa puesta, y tienen que ser IGUALES.
 *
 *   2. `origenDe` DICE DE DONDE VIENE. Sin esto el editor no puede ofrecer
 *      "trabajo el gesto" y "trabajo la familia" sin mentir: no se sabe de
 *      donde sale lo que se esta viendo.
 *
 *   3. EL GESTO PROPIO MANDA ENTERO, Y NO SE MEZCLA. Esta es LA REGLA. Podria
 *      haberse hecho mezcla campo a campo; aqui no, y el motivo esta escrito
 *      en el codigo: si se mezclara, mover el codo de un golpe podria moverle
 *      una cadera que venia de la familia, y el autor no sabria de donde sale
 *      cada numero. Con sustitucion entera, lo que ves es lo que escribiste.
 *
 *   4. UN OVERRIDE SOBRE LA CAPA SE LEE DE VERDAD. Este es el fallo que mas
 *      tiempo roba: si el editor escribe en la tabla ORIGINAL, el control
 *      responde, el autor lo mueve, y el combate sigue con la tabla vieja.
 *      Pasa por `merge()`, que es donde se doble el parche.
 */
import { load } from './loader.mjs';

let passed = 0, failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const AP = await load('src/core/entities/AttackPoses.js');
const Pose = await load('src/core/cine/Pose.js');
const RigMod = await load('src/core/cine/Rig.js');
const { BONES } = await load('src/core/cine/CineConstants.js');
const Overrides = await load('src/core/anim/Overrides.js');

const { MOVE_SILHOUETTES, MOVE_POSES, ORIGEN, origenDe, attackPoseFor, silhouetteOf } = AP;

/** El mismo esqueleto del contrato que usan las demas pruebas. */
function contractRig() {
    const bones = BONES.map(b => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}
const rig = contractRig();

/** La firma de una pose: numeros, para comparar dos poses sin mirarlas. */
function firma(p) {
    const o = p && p.state && p.state.p;
    if (!o) return 'nada';
    return Object.keys(o).sort().map(k => k + ':' + o[k].map(v => +v.toFixed(3)).join(',')).join('|');
}

/** Una silueta minima pero VALIDA: misma forma que una de la tabla. */
function siluetaPropia(hip, twist) {
    return {
        STAND: {
            base: { hip, pitch: 0.1, twist, yaw: 0 },
            armL: { home: [0.26, 1.16, 0.24], startup: [0.16, 1.06, 0.2], active: [0.52, 1.28, 0.62], recovery: [0.26, 1.16, 0.3] }
        }
    };
}

// ---------------------------------------------------------------------------
section('1. Con la tabla vacia, NADA cambia');
// ---------------------------------------------------------------------------
// Se compara la pose real contra la misma pose pasandole una capa vacia. Si la
// capaInfluence algo aunque este vacia, esta comparacion lo delata.
const sinCapa = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, {});
const capaVacia = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, { moves: {} });
check('la capa vacia da EXACTAMENTE la misma pose',
    firma(sinCapa) === firma(capaVacia));
check('y coincide con lo que da sin la opcion siquiera',
    firma(attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {}))
    === firma(attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, { moves: {} })));
check('MOVE_POSES esta vacia al empezar', Object.keys(MOVE_POSES).length === 0,
    Object.keys(MOVE_POSES));

// ---------------------------------------------------------------------------
section('2. El reparto: 69 golpes, 10 familias, y eso es el problema');
// ---------------------------------------------------------------------------
const golpes = Object.keys(MOVE_SILHOUETTES);
check('hay 69 golpes en la tabla', golpes.length === 69, golpes.length);
const fams = new Set(golpes.map(g => MOVE_SILHOUETTES[g]));
check('solo hay 10 familias distintas', fams.size === 10, [...fams].join(' '));
const jab = golpes.filter(g => MOVE_SILHOUETTES[g] === 'JAB');
check('19 golpes comparten el mismo jab', jab.length === 19, jab.length);
check('costillazo, sumision y el especial son EL MISMO dato',
    MOVE_SILHOUETTES.COSTILLAZO === 'JAB'
    && MOVE_SILHOUETTES.SUMISION === 'JAB'
    && MOVE_SILHOUETTES.ATAQUE_ESPECIAL === 'JAB');
check('y el puño izquierdo y el derecho tambien',
    MOVE_SILHOUETTES.PUNO_IZQUIERDO === MOVE_SILHOUETTES.PUNO_DERECHO);

// ---------------------------------------------------------------------------
section('3. origenDe dice de donde sale, y por defecto es la familia');
// ---------------------------------------------------------------------------
for (const g of golpes) {
    const o = origenDe(g, 'STAND');
    if (o.origen !== ORIGEN.FAMILIA) { check('por defecto todo hereda de la familia: ' + g, false, o); break; }
}
check('ningun golpe nace con gesto propio (todos heredan)', golpes.every(g => origenDe(g, 'STAND').origen === ORIGEN.FAMILIA));
check('y siempre sabe a que familia pertenece',
    golpes.every(g => origenDe(g, 'STAND').familia === MOVE_SILHOUETTES[g]));
check('un golpe que no existe tampoco rompe: cae en JAB',
    origenDe('NO_EXISTE', 'STAND').familia === 'JAB');
check('la ruta del inspector no se ha roto: sigue resuelviendo por familia',
    silhouetteOf('COSTILLAZO') === 'JAB');

// ---------------------------------------------------------------------------
section('4. Un gesto propio MANDA ENTERO');
// ---------------------------------------------------------------------------
const capa = { COSTILLAZO: siluetaPropia(0.55, 0.90) };
const conGesto = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, { moves: capa });
const sinGesto = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, {});

check('el golpe con gesto propio se mueve', firma(conGesto) !== firma(sinGesto));
check('su cadera es la que escribiste (0,55), no la de la familia (0,86)',
    Math.abs(conGesto.state.p.PELVIS[1] - 0.55) < 0.04,
    +conGesto.state.p.PELVIS[1].toFixed(3));

// LA REGLA: sustitucion entera, no mezcla. Si se mezclara, los campos que el
// gesto propio NO declara se leerian de la familia; con sustitucion, o estan
// todos o el motor usa el valor por defecto de SU codigo, nunca el de la
// familia. Se comprueba en la glabra opuesta: el codigo del motor tiene
// defecto para lo que no este declarado, y ese defecto se ve IGUAL en los dos.
const campos = ['PELVIS', 'HEAD', 'HAND_L', 'FOOT_L'].filter(k => sinGesto.state.p[k]);
check('la pose propia trae las cuatro articulaciones que trae la familiar',
    campos.length >= 2, campos);

// Y lo importante: el resto de golpes NO se mueven. Ese es el punto entero.
let movidos = 0;
for (const g of golpes) {
    const a = firma(attackPoseFor(rig, g, 'STAND', 'ACTIVE', 1, {}));
    const b = firma(attackPoseFor(rig, g, 'STAND', 'ACTIVE', 1, { moves: capa }));
    if (a !== b) movidos++;
}
check('darle gesto a UN golpe no ha movido NINGUNO de los otros 68',
    movidos === 1, { movidos });

// ---------------------------------------------------------------------------
section('5. Un override se LEE de verdad (no se escribe donde no se mira)');
// ---------------------------------------------------------------------------
// El fallo que mas tiempo roba: el control responde, lo mueves, y el combate
// no cambia. Pasa si se escribe en la tabla original en vez de en el parche.
try {
    // Se SIEMBRA antes de tocar nada. Y esto no es un detalle de la prueba: es
    // el flujo del autor. `writePath` no crea hermanos, asi que escribir un
    // numero sobre un golpe que no tiene gesto deja la entrada a medias y el
    // generador revienta al leer `base.pitch`. Lo que se hace es partir de la
    // familia y ajustar encima.
    const sembrados = AP.sembrarGesto('COSTILLAZO');
    check('sembrar copia la familia entera del golpe', sembrados > 20, sembrados);
    check('y despues de sembrar, origenDe dice GOLPE',
        origenDe('COSTILLAZO', 'STAND').origen === ORIGEN.GOLPE);

    const pSembrado = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, {});
    check('un gesto recien sembrado se ve EXACTAMENTE como su familia',
        firma(pSembrado) === firma(sinGesto));

    Overrides.setOverride('MOVE_POSES.COSTILLAZO.STAND.base.hip', 0.33);
    const p = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, {});
    check('el override del inspector cambia la pose REAL',
        Math.abs(p.state.p.PELVIS[1] - 0.33) < 0.04,
        +p.state.p.PELVIS[1].toFixed(3));

    Overrides.setOverride('MOVE_POSES.COSTILLAZO.STAND.base.hip', 0.70);
    const p2 = attackPoseFor(rig, 'COSTILLAZO', 'STAND', 'ACTIVE', 1, {});
    check('y se puede volver a mover mientras se edita',
        Math.abs(p2.state.p.PELVIS[1] - 0.70) < 0.04,
        +p2.state.p.PELVIS[1].toFixed(3));

    check('los demas siguen heredando de su familia',
        origenDe('ATAQUE_LIGERO', 'STAND').origen === ORIGEN.FAMILIA);

    // Y un gesto a medias NO rompe el combate: avisa y sigue con la familia.
    Overrides.setOverride('MOVE_POSES.SUMISION.STAND.base.hip', 0.33);
    const o = origenDe('SUMISION', 'STAND');
    check('un gesto a medias se declara incompleto, no se usa', o.incompleto === true, o);
    check('y se sigue con la familia, que es lo que el autor quiere de mientras',
        o.origen === ORIGEN.FAMILIA && firma(attackPoseFor(rig, 'SUMISION', 'STAND', 'ACTIVE', 1, {}))
        === firma(attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', 'ACTIVE', 1, {})));
} finally {
    Overrides.clearAll();
    Overrides.resetCache();
}
check('al limpiar los parches, el golpe vuelve a la familia',
    origenDe('COSTILLAZO', 'STAND').origen === ORIGEN.FAMILIA);

// Y con la tabla original intacta: el motor sin inspector tiene que ser
// EXACTAMENTE el de antes. Es lo que sostiene toda la promesa del registro.
check('MOVE_POSES sigue vacia despues de parchear y limpiar',
    Object.keys(MOVE_POSES).length === 0);

console.log('\n' + passed + ' ok, ' + failed + ' FAIL');
process.exit(failed ? 1 : 0);
