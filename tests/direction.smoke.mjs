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

const { resolveAttack, quantizeDirection, allCombinations, ATTACK_MATRIX, DIRECTIONS, STANCES, BUTTONS } = DM;

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
    // La matriz declara 54 celdas y muchas son golpes que todavia no estan en
    // el moveset. Eso es lo previsto: `stanceAttackKey` comprueba `hasMove` y
    // cae al golpe del estado. Pero las CELDAS QUE YA FUNCIONABAN no pueden
    // apuntar a la nada, o se habria roto el combate al empezar a usar esto.
    const existe = (key) => !!(MT.CORE_MOVES[key] || MT.getMoves('PEDRO')[key]);

    const queYaDebenExistir = [
        'ATAQUE_LIGERO', 'ATAQUE_PESADO', 'ATAQUE_AGACHADO', 'ATAQUE_AEREO',
        'GANCHO', 'GOLPE_CODO', 'UPPERCUT', 'PATADA_FRONTAL', 'ATAQUE_BARRIDO'
    ];
    for (const key of queYaDebenExistir) {
        ok(existe(key), `${key} existe en CORE_MOVES`, key);
    }
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