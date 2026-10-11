/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/direction.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la MATRIZ DE GOLPES POR DIRECCION.
 *
 * POR QUE ESTAS PRUEBAS Y NO UNA MAS
 * ----------------------------------------------------------------------------
 *   La matriz es 54 celdas escritas a mano (3 posturas x 9 direcciones x 2
 *   botones). Ese es exactamente el tamaño en el que una tabla se queda
 *   desactualizada sin que nada avise: se anade una direccion, se olvida una
 *   celda, y el jugador pulsa esa combinacion y no pasa nada.
 *
 *   Aqui se fija lo que NO PUEDE pasar:
 *     - que toda combinacion resuelva a una clave de golpe real;
 *     - que dos direcciones distintas no compartan golpe sin querer;
 *     - que la cuantizacion ponga cada vector en el sector que le toca;
 *     - que la matriz siga funcionando si le llega basura.
 *
 * ES LO MISMO QUE CUENTA LA REGLA DE LA CASA: nada se da por hecho hasta que
 * hay un test que lo falla si se rompe.
 *
 *   node tests/direction.smoke.mjs
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

const DM = await load('src/core/directionMatrix.js');
const MT = await load('src/core/fsm/MoveTable.js');
// Import SOLO por su efecto secundario: `Movesets.js` es lo que REGISTRA los
// golpes de cada peleador en la tabla. Sin cargarlo, `getMoves('PEDRO')` viene
// vacio y GANCHO, GOLPE_CODO, UPPERCUT y PATADA_FRONTAL "no existen" cuando si
// existen. Que es justo lo que estas pruebas tienen que comprobar.
await load('src/core/fsm/states/Movesets.js');
const AP = await load('src/core/entities/AttackPoses.js');
const RigMod = await load('src/core/cine/Rig.js');
const SPF = (await load('src/core/fsm/Constants.js')).default;
const { BONES } = await load('src/core/cine/CineConstants.js');

const { resolveAttack, quantizeDirection, allCombinations, ATTACK_MATRIX, DIRECTIONS, STANCES, BUTTONS } = DM;

/** El rig del contrato, sin depender de ningun .glb (igual que en las otras suites). */
function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name, parentName: b.parent,
        localT: b.offset.slice(), localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}

// ===========================================================================
section('1 · La cuantizacion de direcciones');
// ===========================================================================

run('cada uno de los ocho sectores cae donde toca', () => {
    // La base es (side, fwd): `side` positivo es la DERECHA del peleador y
    // `fwd` positivo mira AL RIVAL. Estos doce vectores son el mapa completo:
    // si alguno cambia de sector, la matriz dara el golpe equivocado.
    const casos = [
        [0, 1, 'F'], [0, -1, 'B'],
        [1, 0, 'R'], [-1, 0, 'L'],
        [1, 1, 'FR'], [-1, 1, 'FL'],
        [1, -1, 'BR'], [-1, -1, 'BL'],
        [0, 0, 'N']
    ];
    for (const [side, fwd, esperado] of casos) {
        ok(quantizeDirection(side, fwd) === esperado,
            `(${side},${fwd}) es ${esperado}`, quantizeDirection(side, fwd));
    }
});

run('un vector con fuerza real cae en el mismo sector que su version fuerte', () => {
    // El mando de verdad da vectores normalizados, no (0,1) exactos: lo que
    // llega es (0.71, 0.70). Si la cuantizacion solo acertara con vectores
    // limpios, en el juego no cairia nunca en las diagonales.
    for (const [side, fwd] of [[0.71, 0.70], [-0.71, 0.70], [0.71, -0.70], [-0.71, -0.70]]) {
        const dir = quantizeDirection(side, fwd);
        const fuerte = quantizeDirection(side * 5, fwd * 5);
        ok(dir === fuerte && dir !== 'N',
            `(${side},${fwd}) aguanta la escala`, [dir, fuerte]);
    }
});

run('la zona muerta devuelve el sticksuelto', () => {
    // Por debajo del umbral no se esta pulsando nada: es la zona en la que el
    // joystick tiembla. Sin esto, el golpe cambiaria solo mientras el mando
    // hace ruido alrede de la posicion central.
    ok(quantizeDirection(0.1, 0.1) === 'N', 'ruido pequeno -> N', quantizeDirection(0.1, 0.1));
    ok(quantizeDirection(0.34, 0) === 'N', 'justo por debajo del umbral -> N');
    ok(quantizeDirection(0.36, 0) === 'R', 'justo por encima -> R');
});

run('las diagonales son diagonales de verdad, no un "adelante" disfrazado', () => {
    // Este es el fallo que cuesta caro: si la cuantizacion no distingue
    // diagonal de cardinal, pulsar arriba-adelante y adelante darian el mismo
    // golpe y 4 de las 8 direcciones serian decorativas.
    const sector = (side, fwd) => quantizeDirection(side, fwd);
    ok(sector(1, 1) !== sector(1, 0) && sector(1, 1) !== sector(0, 1),
        'adelante-derecha no es ni adelante ni derecha');
    ok(new Set(DIRECTIONS).size === 9, 'hay 8 direcciones mas el stick suelto',
        DIRECTIONS.join(','));
});

// ===========================================================================
section('2 · La matriz esta COMPLETA');
// ===========================================================================

run('toda combinacion resuelve a una clave de golpe', () => {
    const todas = allCombinations();
    ok(todas.length === 3 * 9 * 2, 'son 3 posturas x 9 direcciones x 2 botones',
        todas.length);
    for (const c of todas) {
        ok(typeof c.move === 'string' && c.move.length > 0,
            `${c.stance}/${c.dir}/${c.button} resuelve`, c.move);
    }
});

run('ninguna celda esta vacia ni es un error de tecleo', () => {
    // Un `undefined` escrito a mano NO sale en la cuenta de arriba (esa
    // comprueba el RESULTADO de resolver). Hay que mirar la tabla cruda, que
    // es donde un nombre mal escrito se cuela sin que se note.
    for (const stance of STANCES) {
        for (const dir of DIRECTIONS) {
            for (const button of BUTTONS) {
                const celda = ATTACK_MATRIX[stance][dir][button];
                ok(typeof celda === 'string' && /^[A-Z_]+$/.test(celda),
                    `${stance}/${dir}/${button} es una clave limpia`, celda);
            }
        }
    }
});

run('las claves de golpe solo usan el patron PUNO_/PATADA_/ATAQUE_/GANCHO', () => {
    // Sin esto se puede colar una clave con tilde o minuscula y la tabla
    // parecera correcta mientras el motor la busca y no la encuentra.
    const permitidos = /^(PUNO_|PATADA_|ATAQUE_|GANCHO$|GOLPE_CODO$|UPPERCUT$|BARRIDO_)/;
    for (const c of allCombinations()) {
        ok(permitidos.test(c.move), `${c.move} sigue el patron`, c.move);
    }
});

run('la matriz no le da el MISMO golpe a dos direcciones distintas', () => {
    // Cada direccion tiene que aportar algo propio. Si dos celdas comparten
    // clave, la direccion sobra: el jugador la usa y no ve diferencia.
    // Se permite el caso N, que es el sticksuelto y no es una direccion.
    for (const stance of STANCES) {
        for (const button of BUTTONS) {
            const vistos = new Map();
            for (const dir of DIRECTIONS) {
                if (dir === 'N') continue;
                const move = resolveAttack(stance, dir, button);
                if (vistos.has(move)) {
                    fails.push(`${stance}/${button}: ${dir} repite el golpe de ${vistos.get(move)} (${move})`);
                } else {
                    vistos.set(move, dir);
                }
                pass++;
            }
        }
    }
    ok(!fails.some((f) => f.includes('repite el golpe')),
        'ninguna direccion esta repetida', fails.filter((f) => f.includes('repite')).slice(0, 3));
});

// ===========================================================================
section('3 · La matriz aguanta basura');
// ===========================================================================

run('una postura o direccion desconocida cae en algo que existe', () => {
    // Se llama en el CAMINO DE UN GOLPE. Si devolviera undefined por un dato
    // raro, quien la llama tendria que defenderse y el fallo se veria como
    // "el golpe no hace nada".
    ok(resolveAttack('VOLANDO', 'F', 'PUNCH') === resolveAttack('STAND', 'F', 'PUNCH'),
        'postura desconocida -> de pie');
    ok(resolveAttack('STAND', 'NW', 'PUNCH') === resolveAttack('STAND', 'N', 'PUNCH'),
        'direccion desconocida -> stick suelto');
    ok(resolveAttack('STAND', 'F', 'CODO') === resolveAttack('STAND', 'F', 'PUNCH'),
        'boton desconocido -> puño');
    ok(typeof resolveAttack(undefined, undefined, undefined) === 'string',
        'y sin datos del todo tampoco revienta');
});

run('la matriz esta CONGELADA (es dato, no codigo vivo)', () => {
    // Si alguien la muta en runtime, el motor empezaria a dar golpes distintos
    // en cada partida sin que nada haya cambiado en el repo.
    try {
        ATTACK_MATRIX.STAND.F.PUNCH = 'HACK';
    } catch (e) { /* en modo estricto lanza; en flojo no cambia */ }
    ok(ATTACK_MATRIX.STAND.F.PUNCH === 'GANCHO',
        'no se puede escribir en la matriz', ATTACK_MATRIX.STAND.F.PUNCH);
    ok(Object.isFrozen(ATTACK_MATRIX), 'la tabla entera esta congelada');
});

// ===========================================================================
section('4 · Que golpes existen ya de verdad');
// ===========================================================================

run('las celdas que el motor ya produce apuntan a golpes que EXISTEN', () => {
    const existe = (key) => !!(MT.CORE_MOVES[key] || MT.getMoves('PEDRO')[key]);

    const queYaDebenExistir = [
        'ATAQUE_LIGERO', 'ATAQUE_PESADO', 'ATAQUE_AGACHADO', 'ATAQUE_AEREO',
        'GANCHO', 'GOLPE_CODO', 'UPPERCUT', 'PATADA_FRONTAL', 'ATAQUE_BARRIDO'
    ];
    for (const key of queYaDebenExistir) {
        ok(existe(key), `${key} existe en CORE_MOVES`, key);
    }
});

run('AHORA TODAS: las 54 celdas apuntan a un golpe que existe', () => {
    // Este bloque no existia cuando se escribio la matriz: entonces muchas
    // celdas apuntaban a golpes todavia sin escribir y caian al golpe del
    // estado, que era justo lo previsto. Ya rellenados, la matriz no puede
    // depender de esa red: si una celda vuelve a apuntar a la nada, el
    // silencio vuelve a ser la respuesta y no se ve por aqui.
    const existe = (key) => !!(MT.CORE_MOVES[key] || MT.getMoves('PEDRO')[key]);
    const faltan = allCombinations()
        .map((c) => c.move)
        .filter((key) => !existe(key));
    ok(faltan.length === 0,
        'las 54 celdas tienen golpe real', [...new Set(faltan)].join(', '));
});

run('cada golpe de la matriz tiene SILUETA', () => {
    // Un golpe sin silueta no falla: `silhouetteOf` cae en JAB y una patada se
    // anima como un puño. El jugador ve "este boton hace un jab" cuando ha
    // pulsado una patada, que es la confusion mas cara que puede dar un panel.
    const sinSilueta = [];
    for (const c of allCombinations()) {
        const fam = AP.silhouetteOf(c.move);
        if (!AP.ATTACK_SILHOUETTES[fam]) sinSilueta.push(`${c.move}->${fam}`);
    }
    ok(sinSilueta.length === 0,
        'ninguna celda cae en una familia inexistente', sinSilueta.slice(0, 6).join(', '));
});

run('dos direcciones distintas NO se animan igual', () => {
    // ESTE es el requisito real del jugador: que pulsar arriba-izquierda se
    // vea distinto a pulsar abajo-derecha. Con los 45 golpes rellenos, cada
    // celda tiene su frame data Y su silueta. Que dos direcciones compartan
    // las dos cosas a la vez es lo unico que haria la cruceta decorativa.
    const existe = (key) => !!(MT.CORE_MOVES[key] || MT.getMoves('PEDRO')[key]);
    const iguales = [];
    for (const stance of STANCES) {
        for (const button of BUTTONS) {
            const vistas = new Map();
            for (const dir of DIRECTIONS) {
                const move = resolveAttack(stance, dir, button);
                if (!existe(move)) continue;
                const a = MT.getMoves('PEDRO')[move] || MT.CORE_MOVES[move];
                // La firma de un golpe: lo que el jugador nota. Los frames de
                // inicio y recuperacion mas la silueta que lo dibuja.
                const firma = `${a.startup}/${a.recovery}/${AP.silhouetteOf(move)}`;
                if (vistas.has(firma)) {
                    iguales.push(`${stance}/${button}: ${dir} se ve como ${vistas.get(firma)}`);
                } else {
                    vistas.set(firma, dir);
                }
            }
        }
    }
    ok(iguales.length === 0,
        'ninguna direccion repite firma (frames + silueta)', iguales.slice(0, 8));
});

run('las cuatro direcciones que ya funcionaban siguen dando lo mismo', () => {
    // Antes de esta matriz, `adelante + ligero` daba GANCHO y
    // `atras + ligero` daba GOLPE_CODO, por reglas sueltas de Transitions. Si
    // la matriz no devuelve exactamente esas, el combate cambia de manos sin
    // que se haya decidido.
    ok(resolveAttack('STAND', 'F', 'PUNCH') === 'GANCHO', 'adelante + puño -> GANCHO');
    ok(resolveAttack('STAND', 'B', 'PUNCH') === 'GOLPE_CODO', 'atras + puño -> GOLPE_CODO');
    ok(resolveAttack('STAND', 'F', 'KICK') === 'PATADA_FRONTAL', 'adelante + patada -> PATADA_FRONTAL');
    ok(resolveAttack('STAND', 'N', 'PUNCH') === 'ATAQUE_LIGERO', 'sticksuelto + puño -> ATAQUE_LIGERO');
    ok(resolveAttack('STAND', 'N', 'KICK') === 'ATAQUE_PESADO', 'sticksuelto + patada -> ATAQUE_PESADO');
});

run('la matriz es la UNICA fuente: nadie la duplica a mano', () => {
    // Si alguien vuelve a escribir un golpe por direccion en Transitions, la
    // tabla deja de ser la verdad y estas comprobaciones empiezan a mentir.
    ok(Object.keys(ATTACK_MATRIX).length === 3, 'solo hay tres posturas en la tabla',
        Object.keys(ATTACK_MATRIX).join(','));
    for (const stance of STANCES) {
        ok(Object.keys(ATTACK_MATRIX[stance]).length === 9, `${stance} tiene 9 direcciones`,
            Object.keys(ATTACK_MATRIX[stance]).join(','));
    }
});

// ===========================================================================
// ===========================================================================
section('5 · El cableado de verdad (no solo la tabla)');
// ===========================================================================

const IM = await load('src/core/entities/InputMapper.js');
const FE = await load('src/core/entities/FighterEntity.js');

// Camara mirando a +Z, con la derecha de pantalla en +X. El rival esta en +Z,
// o sea DEFRENTE: lo que el jugador ve a la derecha es la izquierda del
// peleador. Es la razon de que pulsar "derecha" de la cruceta sea 'L' y no
// 'R', y por eso el test lo fija explicitamente en vez de suponerlo.
const CAM = { fx: 0, fz: 1, rx: 1, rz: 0 };
const RIVAL = { x: 0, z: 1 };

function touch(dpad = {}, buttons = {}) {
    return {
        dpad: Object.assign({
            up: false, down: false, left: false, right: false,
            upLeft: false, upRight: false, downLeft: false, downRight: false
        }, dpad),
        buttons: Object.assign({
            attack1: false, attack2: false, block: false, action: false
        }, buttons)
    };
}

/** El snapshot real del mapper, no uno escrito a mano: se prueba toda la cadena. */
function pulsar(dpad, buttons, frames = 1) {
    const m = new IM.InputMapper();
    const t = touch(dpad, buttons);
    let snap = null;
    for (let i = 0; i < frames; i++) {
        m.tick(1 / 60);
        snap = m.snapshot(t, CAM, RIVAL);
    }
    return snap;
}

run('el mapper dice en que de las ocho direcciones mira la cruceta', () => {
    ok(pulsar({}).dir8 === 'N', 'sticksuelto -> N', pulsar({}).dir8);
    ok(pulsar({ up: true }).dir8 === 'F', 'arriba -> adelante', pulsar({ up: true }).dir8);
    ok(pulsar({ down: true }).dir8 === 'B', 'abajo -> atras', pulsar({ down: true }).dir8);
    // El rival esta DEFRENTE, asi que la derecha de pantalla es su izquierda.
    ok(pulsar({ right: true }).dir8 === 'L', 'derecha de pantalla -> izquierda del peleador');
    ok(pulsar({ left: true }).dir8 === 'R', 'izquierda de pantalla -> derecha del peleador');
    ok(pulsar({ up: true, right: true }).dir8 === 'FL', 'arriba+derecha -> diagonal');
    ok(pulsar({ up: true, left: true }).dir8 === 'FR', 'arriba+izquierda -> la otra diagonal');
    ok(pulsar({ down: true, left: true }).dir8 === 'BR', 'abajo+izquierda -> atras y derecha');
});

run('el mapper da la MISMA direccion que la matriz, no una cuenta aparte', () => {
    // Si el mapper y la tabla calcularan el sector por su cuenta, un dia
    // cambiarian las reglas de uno y el otro diria otra cosa: el golpe seria
    // de una direccion y el jugador habria pulsado otra.
    for (const d of [{}, { up: true }, { down: true }, { left: true }, { right: true },
    { up: true, left: true }, { up: true, right: true },
    { down: true, left: true }, { down: true, right: true }]) {
        const snap = pulsar(d);
        const lado = snap.x;    // `side`
        const frente = snap.y; // `fwd`
        ok(snap.dir8 === quantizeDirection(lado, frente),
            `dir8 coincide con la tabla (${JSON.stringify(d)})`, snap.dir8);
    }
});

// --- el circuito completo: entidad + FSM + matriz -------------------------

const rig = contractRig();
const model = { rig, applyPose() { }, place() { } };
// El gauge de mentira necesita la misma forma que el de verdad: `update` lo
// llama la entidad cada frame para el recurso, `canRun` para correr. Sin ellos
// el fallo sale a mitad del `update` y esconde lo que se quiere comprobar.
const gauge = () => ({
    value: 100,
    spend(v) { this.value -= v; },
    gain(v) { this.value += v; },
    update() { }, canRun: () => true, reset() { this.value = 100; }
});

function mkFighter(id) {
    return new FE.FighterEntity({
        fighter: { name: id, x: id === 'P1' ? -0.45 : 0.45, z: 0, facing: 0, health: 100, gauge: gauge() },
        model, characterId: 'PEDRO', id, stance: 'SHELL'
    });
}

function mkWorld(a, b) {
    return {
        hitstop: 0, minSpacing: 0.9,
        opponentOf: (e) => (e === a ? b : a),
        tryHit: () => 'miss', props: [], ringLimit: 2.8, ringOut: () => null
    };
}

/**
 * Pulsa un boton con una direccion y devuelve la clave del golpe que salio.
 * @returns {{key:string|null, frames:number}}
 */
function golpe(dpad, button, pasos = 1) {
    const e1 = mkFighter('P1');
    const e2 = mkFighter('P2');
    const world = mkWorld(e1, e2);
    let key = null;
    for (let i = 0; i < pasos; i++) {
        const boton = i === 0 ? button : {};   // solo el primer frame es arista
        const snap = pulsar(dpad, boton);
        e1.update(1 / 60, snap, world);
        if (i === 0) key = e1.fsm.move ? e1.fsm.move.key : null;
    }
    return { key, entidad: e1, world };
}

run('pulsar una direccion + un boton da un golpe DISTINTO por direccion', () => {
    // Con el stick suelto el golpe NO es ATAQUE_LIGERO: Pedro tiene la
    // postura SHELL siempre activa y su golpe para ese boton es GOLPE_CORTO.
    // Eso es lo que hay antes de este trabajo y lo que hay ahora, y es
    // justamente lo que la direccion tiene que distinguir.
    const base = golpe({}, { attack1: true }).key;
    ok(base === 'GOLPE_CORTO', 'sticksuelto: el golpe del personaje', base);

    const conDir = {
        atras: golpe({ down: true }, { attack1: true }).key,
        lateral: golpe({ left: true }, { attack1: true }).key,
        diag: golpe({ up: true, left: true }, { attack1: true }).key
    };
    for (const [nombre, key] of Object.entries(conDir)) {
        ok(!!key, `${nombre}: sale un golpe`, key);
        ok(key !== base, `${nombre}: es DISTINTO del de sticksuelto`, [base, key]);
    }
    // Y que sean distintos entre si, no tres nombres para el mismo golpe.
    const vals = Object.values(conDir);
    ok(new Set(vals).size === vals.length, 'las tres direcciones tambien se distinguen entre si', vals.join(' | '));
});

run('la patada sale de la otra celda que el puño', () => {
    const p = golpe({ left: true }, { attack1: true }).key;
    const k = golpe({ left: true }, { attack2: true }).key;
    ok(!!k && !!p, 'los dos dan golpe', [p, k]);
    ok(p !== k, 'puño y patada en la misma direccion son distintos', [p, k]);
    ok(/PATADA|PESADO|FRONTAL/.test(k), 'y el segundo es de pierna', k);
});

run('EL GOLPE QUEDA FIJADO: soltar la cruceta no lo cambia a mitad', () => {
    // Es el fallo que hizo falta fijar. El getter `move` se lee en cada frame
    // del ataque: si la direccion se leyera del input vivo, con el stick
    // suelto a mitad de un jab el golpe pasaria de PUNO_LATERAL a ATAQUE_LIGERO
    // sin que cambiara el estado ni sonara ningun error. La hitbox y el dano
    // cambiarian por debajo de la animacion.
    const e1 = mkFighter('P1');
    const e2 = mkFighter('P2');
    const world = mkWorld(e1, e2);

    e1.update(1 / 60, pulsar({ left: true }, { attack1: true }), world);
    const alEmpezar = e1.fsm.move ? e1.fsm.move.key : null;
    ok(alEmpezar && alEmpezar !== 'GOLPE_CORTO', 'empieza con el golpe lateral', alEmpezar);

    // El ataque dura poco (amago + activo), asi que el bucle tiene que ser
    // corto: si se pasa de largo, `fsm.move` sale null porque el golpe ha
    // terminado, y el test pasaria por el motivo equivocado. Se comprueba
    // que sigue EN ataque, para que un fallo aqui no se disfraze de eso.
    const sigueAtacando = (i) => ok(e1.fsm.inGroup(SPF.StateGroup.ATTACKING),
        `frame ${i}: sigue en el ataque (el bucle no se ha pasado de largo)`);

    // Ahora el jugador SUELTA la cruceta. El golpe tiene que seguir siendo el.
    for (let i = 0; i < 4; i++) {
        e1.update(1 / 60, pulsar({}), world);
        sigueAtacando(i);
        const ahora = e1.fsm.move ? e1.fsm.move.key : null;
        ok(ahora === alEmpezar,
            `frame ${i}: el golpe no se ha cambiado`, [alEmpezar, ahora]);
    }

    // Y con la OTRA direccion tampoco: ese es el caso que duele. Se usa una
    // horizontal y no una diagonal con ARRIBA porque arriba es el boton de
    // saltar: cambiar ahi saca al peleador del ataque, que es correcto pero
    // no es lo que este test quiere medir.
    for (let i = 0; i < 3; i++) {
        e1.update(1 / 60, pulsar({ right: true }), world);
        sigueAtacando(i);
        const ahora = e1.fsm.move ? e1.fsm.move.key : null;
        ok(ahora === alEmpezar,
            `frame ${i}: cambiar de direccion tampoco lo cambia`, [alEmpezar, ahora]);
    }
});

run('agachado usa los golpes bajos de la fila CROUCH', () => {
    const dePie = golpe({}, { attack1: true }).key;
    const abajo = golpe({ down: true }, { attack1: true }).key;
    ok(!!abajo, 'agachado y pulsando: sale golpe', abajo);
    ok(abajo !== dePie, 'y no es el de pie', [dePie, abajo]);
    ok(abajo === resolveAttack('CROUCH', 'B', 'PUNCH'),
        'y es exactamente el de la fila agachada', abajo);
});

run('la postura de boxeo se respeta cuando la cruceta esta suelta', () => {
    // Pedro tiene SHELL por defecto y esa postura esta SIEMPRE activa. Con el
    // stick suelto, el golpe tiene que ser el suyo y no el de la matriz: si no,
    // el moveset del personaje desapareceria en cuanto se tocara la cruceta.
    const e1 = mkFighter('P1');
    const e2 = mkFighter('P2');
    const world = mkWorld(e1, e2);

    const deLaPostura = golpe({}, { attack1: true }).key;
    ok(!!deLaPostura, 'sticksuelto + puño sale un golpe', deLaPostura);

    // Y con direccion, la cruceta manda sobre la postura.
    const conDireccion = golpe({ left: true }, { attack1: true }).key;
    ok(conDireccion !== deLaPostura,
        'pero con direccion manda la matriz', [deLaPostura, conDireccion]);
    ok(conDireccion === resolveAttack('STAND', 'R', 'PUNCH'),
        'y es exactamente la celda de la matriz', conDireccion);

    // La postura sigue estando viva: no la hemos declarado muerta.
    e1.update(1 / 60, pulsar({}), world);
    ok(!!(e1.stance && e1.stance.id), 'la postura sigue activa', e1.stance && e1.stance.id);
});

// ===========================================================================
section('6 · Un bug de paso: el especial no costaba nada');
// ===========================================================================

run('entrar en un estado por INPUT dispara su _onStateEnter', () => {
    // ESTE TEST VIVE AQUI aunque no hable de direcciones, y por eso lo digo
    // explicitamente: se ha encontrado cableando la matriz y usa el mismo
    // arnes, asi que separarlo en otro fichero solo costaria duplicarlo.
    //
    // EL FALLO: en `update`, el estado anterior se guardaba DESPUES de
    // `fsm.setInput()`. Pero `setInput` es quien aplica las transiciones por
    // input, asi que al llegar a la comprobacion el estado ya era el NUEVO y
    // `stateId !== prevId` salia siempre falsa. `_onStateEnter` no se llamaba
    // NUNCA para nada que se dispare con un boton.
    //
    // LO QUE SE PERDIA, en silencio:
    //   - el COSTE DE RECURSO. La unica llamada a `gauge.spend(meterCost)` de
    //     todo el motor esta en `_onStateEnter`, asi que el ESPECIAL (25 de
    //     barra) salia gratis y de hecho infinitamente seguido;
    //   - `_justAttacked`, que encara al rival al golpear.
    const e1 = mkFighter('P1');
    const e2 = mkFighter('P2');
    const world = mkWorld(e1, e2);
    e1.fighter.gauge.value = 100;

    const base = pulsar({}, {});
    e1.update(1 / 60, base, world);
    const antes = e1.fighter.gauge.value;
    ok(antes === 100, 'la barra empieza llena', antes);

    // Se fuerza el especial por input, sin pasar por el doble toque (que
    // necesitaria reloj y dos snapshots).
    const conEspecial = pulsar({}, {});
    conEspecial.pressed[SPF.Intent.ATAQUE_ESPECIAL] = true;
    e1.update(1 / 60, conEspecial, world);

    ok(e1.fsm.stateId === SPF.State.ATAQUE_ESPECIAL,
        'el especial se ha ejecutado', e1.fsm.stateId);
    ok(e1.fighter.gauge.value < antes,
        'y ha COSTADO barra (antes era gratis)', [antes, e1.fighter.gauge.value]);
    ok(antes - e1.fighter.gauge.value === 25,
        'exactamente el coste declarado (25)', antes - e1.fighter.gauge.value);
});

run('un golpe normal no cuesta barra', () => {
    // La comprobacion de al lado: si el arreglo cobrara de mas, seria tan
    // grave como cobrar de menos. El jab no tiene `meterCost`.
    const e1 = mkFighter('P1');
    const e2 = mkFighter('P2');
    const world = mkWorld(e1, e2);
    e1.fighter.gauge.value = 100;
    e1.update(1 / 60, pulsar({}, {}), world);
    const antes = e1.fighter.gauge.value;
    e1.update(1 / 60, pulsar({}, { attack1: true }), world);
    ok(e1.fighter.gauge.value >= antes,
        'el jab no cuesta nada (gana, si acaso)', [antes, e1.fighter.gauge.value]);
});

console.log('\n================================================================');
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
} else {
    console.log('TODO EN VERDE');
}
console.log('================================================================');
console.log(`\nresultado: ${pass} ok, ${fails.length} fallos\n`);
process.exit(fails.length ? 1 : 0);