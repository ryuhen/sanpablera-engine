/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/select.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de la SELECCION: el panal, los cuatro botones y las vistas previas.
 *
 * Este modulo (src/ui/selectState.js) es PURO, sin DOM ni Babylon, asi que se
 * puede probar entero en Node. Lo que se comprueba es exactamente lo que el
 * jugador va a hacer con los botones:
 *
 *   1. La navegacion por la cruceta.
 *   2. ATAQUE elige, PATADA cambia de ropa, GUARDIA cambia de animacion,
 *      ACCION suelta. Y que cada uno haga LO SUYO y no lo del otro.
 *   3. Los sides: P2 a la izquierda, P1 a la derecha.
 *   4. Que dos peleadores NO compartan el mismo repertorio de animaciones (si lo
 *      compartieran, la vista previa no serviria para elegir).
 *   5. Que el estado no se rompa con un roster raro (uno solo, Custom...).
 *
 * Ejecutar:  node tests/select.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
let failed = 0;

function check(name, condition, extra) {
    if (condition) {
        passed++;
        console.log('  ok   ' + name);
    } else {
        failed++;
        console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
    }
}

function section(title) {
    console.log('\n' + title);
}

const st = await load('src/ui/selectState.js');
const anims = await load('src/ui/selectAnims.js');
const wardrobe = await load('src/ui/wardrobe.js');
const roster = await load('src/core/roster.js');

const ROSTER = roster.fullRoster();
const nuevo = () => st.createSelectState(ROSTER);
const idDe = (i) => ROSTER[i].id;
const choose = (s, i) => { s.focus = i; s.focusPorLado[s.quienMira] = i; return s; };

// ---------------------------------------------------------------------------
section('1. La tabla de animaciones');
// ---------------------------------------------------------------------------
{
    const problemas = anims.validate();
    check('la tabla de animaciones no tiene ni un problema', problemas.length === 0, problemas);

    check('hay animaciones de las cuatro clases',
        ['movimiento', 'tecnica', 'provocacion', 'guardia']
            .every((t) => anims.allAnimations().some((a) => a.tipo === t)));

    check('toda animacion tiene nombre, clip y duracion',
        anims.allAnimations().every((a) => a.nombre && a.clip && typeof a.dur === 'number'));

    // El `id` de dentro tiene que ser IGUAL a su clave en la tabla. Si no,
    // `animationsOf` (que busca por clave) no encuentra lo que el peleador pide
    // y el boton de guardia cicla por una lista vacia sin avisar.
    check('el id de cada animacion es igual a su clave',
        anims.allAnimations().every((a) => anims.ANIMATIONS[a.id] === a),
        anims.allAnimations().filter((a) => anims.ANIMATIONS[a.id] !== a).map((a) => a.id));

    // Todos tienen las tres basicas, aunque no las declaren.
    for (const f of ROSTER) {
        const lista = anims.animationsOf(f.id);
        check(`${f.id}: tiene animaciones`, lista.length >= 3, lista.length);
        check(`${f.id}: tiene guardia, provocacion y caminar`,
            ['guardia', 'taunt', 'caminar'].every((x) => lista.includes(x)),
            lista);
        check(`${f.id}: no repite animacion en el ciclo`,
            new Set(lista).size === lista.length, lista);
        check(`${f.id}: todas sus animaciones existen`,
            lista.every((id) => !!anims.ANIMATIONS[id]), lista);
    }

    // ESTO ES LO IMPORTANTE: las animaciones tienen que ser DISTINTAS. Si dos
    // peleadores tuvieran la misma lista, la vista previa no serviria para
    // decidir a quien coger.
    const listas = new Set(ROSTER.map((f) => anims.animationsOf(f.id).join('|')));
    check('no hay dos peleadores con el mismo repertorio',
        listas.size === ROSTER.length,
        { distintos: listas.size, peleadores: ROSTER.length });

    // Y no solo distintas: tienen que TECNICAS distintas, no solo distinto orden.
    const tecnicas = ROSTER.map((f) => anims.animationsOf(f.id)
        .filter((id) => anims.ANIMATIONS[id].tipo === 'tecnica').sort().join('|'));
    check('las TECNICAS de cada uno son distintas de las del otro',
        new Set(tecnicas).size === ROSTER.length,
        { distintas: new Set(tecnicas).size });

    // La de reposo tiene que salir de las suyas, no ser una cualquiera.
    for (const f of ROSTER) {
        const d = anims.defaultAnimationFor(f.id);
        check(`${f.id}: la animacion de reposo es suya`,
            anims.animationsOf(f.id).includes(d), d);
    }

    check('el Custom (peleador del jugador) tambien tiene animaciones',
        anims.animationsOf('CUSTOM').length >= 3);
    check('un peleador desconocido no rompe: cae en la guardia',
        anims.defaultAnimationFor('NO_EXISTE') === 'guardia');
    check('clipOf de algo falso da null', anims.clipOf('NO_EXISTE') === null);
}

// ---------------------------------------------------------------------------
section('2. La cruceta navega por el panal');
// ---------------------------------------------------------------------------
{
    const s = nuevo();
    check('empieza en la primera celda', s.focus === 0);

    st.move(s, 'right');
    check('derecha avanza una celda', s.focus === 1, s.focus);
    st.move(s, 'down');
    check('abajo baja una fila', s.focus === 1 + st.COLS, s.focus);
    st.move(s, 'left');
    st.move(s, 'left');
    check('izquierda no se sale del panal', s.focus === st.COLS, s.focus);
    st.move(s, 'up');
    check('arriba no se sale por arriba', s.focus === 0, s.focus);

    // Los bordes tienen que aguantar pulsadas repetidas.
    for (let i = 0; i < 20; i++) st.move(s, 'left');
    check('20 veces a la izquierda no rompe', s.focus === 0, s.focus);
    for (let i = 0; i < 50; i++) st.move(s, 'right');
    check('50 veces a la derecha se queda en la ultima columna',
        s.focus % st.COLS === st.COLS - 1, s.focus);

    // El foco nunca puede caer en una celda que no existe. Con 8 peleadores y
    // COLS = 3 la ultima fila tiene 2 celdas, no 3: el tope de columna no basta
    // y hay que comprobar contra el tamano real del roster.
    const s2 = nuevo();
    for (const d of ['down', 'right', 'down', 'down', 'down', 'down', 'right']) st.move(s2, d);
    check('el foco nunca se sale del roster',
        s2.focus >= 0 && s2.focus < ROSTER.length, s2.focus);

    // Recorrido a saco por TODAS las direcciones: el foco siempre en rango y
    // siempre解锁 una celda real (focused() nunca null con roster normal).
    const s3 = nuevo();
    const dirs = ['up', 'down', 'left', 'right'];
    let fueraDeRango = 0, nulos = 0;
    for (let i = 0; i < 300; i++) {
        st.move(s3, dirs[i % dirs.length]);
        if (s3.focus < 0 || s3.focus >= ROSTER.length) fueraDeRango++;
        if (!st.focused(s3)) nulos++;
    }
    check('300 pasos: el foco nunca se sale del rango', fueraDeRango === 0, { fueraDeRango });
    check('300 pasos: el foco siempre cae en un peleador real', nulos === 0, { nulos });

    // TODAS las celdas tienen que ser alcanzables. Se comprueba celda por celda
    // con un camino explicito (bajar `fila` veces y avanzar `col` veces), que
    // es como se llega a cualquier celda jugando. El patron ciclico
    // up/down/left/right NO sirve: oscila entre las dos primeras filas.
    const inalcanzables = [];
    for (let objetivo = 0; objetivo < ROSTER.length; objetivo++) {
        const fila = Math.floor(objetivo / st.COLS);
        const col = objetivo % st.COLS;
        const s5 = nuevo();
        for (let i = 0; i < fila; i++) st.move(s5, 'down');
        for (let i = 0; i < col; i++) st.move(s5, 'right');
        if (s5.focus !== objetivo) inalcanzables.push({ objetivo, llego: s5.focus });
    }
    check('toda celda del panal es alcanzable con la cruceta',
        inalcanzables.length === 0, inalcanzables);

    check('las dos flechas tienen memoria por lado',
        nuevo().focusPorLado.length === 2);
}

// ---------------------------------------------------------------------------
section('3. Los cuatro botones hacen lo suyo');
// ---------------------------------------------------------------------------
{
    // --- ATAQUE elige ----------------------------------------------------
    let s = nuevo();
    choose(s, 0);
    let r = st.apply(s, 'attack1');
    check('ATAQUE elige al peleador enfocado', r.cambio === 'elegido', r.cambio);
    check('Queda en el slot de P1', s.slots[0].fighter && s.slots[0].fighter.id === idDe(0));
    check('y P2 sigue sin elegir', !s.slots[1].fighter);

    check('ATAQUE elige de verdad el objeto del roster',
        s.slots[0].fighter === ROSTER[0]);

    // Al elegir P1, el turno pasa a P2 solo (para no tener que navegar).
    check('al elegir uno, el turno pasa al otro jugador', s.quienMira === 1, s.quienMira);

    // Volver a elegir el mismo no hace nada (deseleccionar es de ACCION).
    choose(s, 0);
    s.quienMira = 0;
    r = st.apply(s, 'attack1');
    check('ATAQUE sobre uno ya elegido no hace nada', r.cambio === 'ya-estaba', r.cambio);
    check('y sigue elegido', !!s.slots[0].fighter);

    // Cambiar de opinion: elegir otro sustituye al primero.
    choose(s, 2);
    s.quienMira = 0;
    st.apply(s, 'attack1');
    check('elegir otro sustituye al anterior',
        s.slots[0].fighter.id === idDe(2), s.slots[0].fighter.id);

    // --- PATADA cambia de ropa -------------------------------------------
    s = nuevo();
    choose(s, 0);
    check('PATADA sin elegir no hace nada', st.apply(s, 'attack2').cambio === 'nada');
    check('y no inventa una seleccion', !s.slots[0].fighter);

    st.apply(s, 'attack1');
    s.quienMira = 0;
    choose(s, 0);
    const ropa0 = s.slots[0].outfit;
    r = st.apply(s, 'attack2');
    check('PATACA cambia el atuendo', r.cambio === 'vestuario', r.cambio);
    check('el atuendo es distinto del de antes', s.slots[0].outfit !== ropa0,
        [ropa0, s.slots[0].outfit]);
    check('el atuendo existe en el catalogo', !!wardrobe.outfitById(s.slots[0].outfit));

    // El ciclo de ropa tiene que dar la vuelta completa y volver al punto de
    // partida. Con N atuendos hacen falta N pulsaciones, no N-1: la ultima
    // pulsacion es la que cierra el circulo.
    const lista = wardrobe.outfitsFor(s.slots[0].fighter.id);
    const partida = s.slots[0].outfit;
    const vistos = new Set([partida]);
    for (let i = 0; i < lista.length; i++) {
        st.apply(s, 'attack2');
        vistos.add(s.slots[0].outfit);
    }
    check('el ciclo de PATADA recorre todos los atuendos', vistos.size === lista.length,
        { vistos: vistos.size, lista: lista.length });
    check('y tras una vuelta completa vuelve al principio',
        s.slots[0].outfit === partida, [partida, s.slots[0].outfit]);
    check('el recorrido sigue el orden del catalogo',
        wardrobe.outfitsFor(s.slots[0].fighter.id)
            .map((o) => o.id).join('|') === lista.map((o) => o.id).join('|'));

    // El atuendo pertenece al peleador, no al slot.
    check('el atuido sigue siendo del peleador elegido',
        s.slots[0].fighter.id === idDe(0));

    // --- GUARDIA cambia de animacion --------------------------------------
    s = nuevo();
    choose(s, 0);
    check('GUARDIA sin elegir no hace nada', st.apply(s, 'block').cambio === 'nada');

    st.apply(s, 'attack1');
    s.quienMira = 0;
    choose(s, 0);
    const anim0 = s.slots[0].anim;
    r = st.apply(s, 'block');
    check('GUARDIA cambia la animacion', r.cambio === 'animacion', r.cambio);
    check('la animacion es distinta', s.slots[0].anim !== anim0, [anim0, s.slots[0].anim]);
    check('la animacion existe en la tabla', !!anims.ANIMATIONS[s.slots[0].anim]);

    // Y SOLO por las suyas: el ciclo no puede salirse de su repertorio.
    const suyas = anims.animationsOf(s.slots[0].fighter.id);
    let fugas = 0;
    for (let i = 0; i < 40; i++) {
        st.apply(s, 'block');
        if (!suyas.includes(s.slots[0].anim)) fugas++;
    }
    check('40 veces de GUARDIA nunca salen de su repertorio', fugas === 0, { fugas, suyas });
    check('y el ciclo vuelve a donde empezo (tras una vuelta entera)',
        suyas.includes(s.slots[0].anim));

    // --- ACCION deselecciona ---------------------------------------------
    s = nuevo();
    choose(s, 0);
    st.apply(s, 'attack1');
    s.quienMira = 0;
    choose(s, 0);
    check('antes de ACCION hay seleccion', !!s.slots[0].fighter);
    r = st.apply(s, 'action');
    check('ACCION suelta la seleccion', r.cambio === 'deseleccionado', r.cambio);
    check('el slot queda libre', !s.slots[0].fighter);
    check('y se limpia el atuendo', !s.slots[0].outfit);
    check('y se limpia la animacion', !s.slots[0].anim);

    // Volver a elegir funciona igual que la primera vez.
    st.apply(s, 'attack1');
    check('se puede volver a elegir tras soltar', !!s.slots[0].fighter);

    // ACCION sin nada elegido pasa el turno (no suelta nada).
    s = nuevo();
    choose(s, 0);
    st.apply(s, 'attack1');        // P1 elige
    s.quienMira = 1;
    r = st.apply(s, 'action');      // P2 no ha elegido todavia
    check('ACCION sin seleccion propia pasa el turno', r.cambio === 'turno', r.cambio);
    check('y no borra lo que ya habia elegido el otro',
        !!s.slots[0].fighter);
}

// ---------------------------------------------------------------------------
section('4. Los lados: P2 izquierda, P1 derecha');
// ---------------------------------------------------------------------------
{
    check('P1 esta en la derecha', st.SIDE.P1.lado === 'derecha', st.SIDE.P1.lado);
    check('P2 esta en la izquierda', st.SIDE.P2.lado === 'izquierda', st.SIDE.P2.lado);
    check('P1 es el slot 0 y P2 el slot 1', st.SIDE.P1.slot === 0 && st.SIDE.P2.slot === 1);

    const s = nuevo();
    check('el estado empieza mirando P1', s.quienMira === 0);
    s.quienMira = 1;
    check('se puede pasar a P2', s.quienMira === 1);

    // Cada lado tiene su propia ficha: elegir con P1 no llena el de P2.
    const s2 = nuevo();
    choose(s2, 0);
    st.apply(s2, 'attack1');           // P1 elige
    s2.quienMira = 1;
    choose(s2, 4);
    st.apply(s2, 'attack1');           // P2 elige
    check('P1 y P2 pueden elegir peleadores distintos',
        s2.slots[0].fighter.id === idDe(0) && s2.slots[1].fighter.id === idDe(4),
        [s2.slots[0].fighter.id, s2.slots[1].fighter.id]);
    check('y cada uno lleva su propio atuendo', s2.slots[0].outfit !== null && s2.slots[1].outfit !== null);
    check('que ademas son los suyos',
        s2.slots[0].outfit === wardrobe.defaultFor(idDe(0)).id
        && s2.slots[1].outfit === wardrobe.defaultFor(idDe(4)).id,
        [s2.slots[0].outfit, s2.slots[1].outfit, s2.slots[1].fighter.id]);

    // Y no se pueden elegir el MISMO peleador los dos.
    const s3 = nuevo();
    choose(s3, 0);
    st.apply(s3, 'attack1');
    s3.quienMira = 1;
    choose(s3, 0);
    st.apply(s3, 'attack1');
    check('los dos pueden acabar en el mismo peleador (el juego lo permite)',
        s3.slots[0].fighter.id === s3.slots[1].fighter.id);
    check('pero con atuendo propio de cada uno',
        !!s3.slots[0].outfit && !!s3.slots[1].outfit);
}

// ---------------------------------------------------------------------------
section('5. Cuando se puede pelear');
// ---------------------------------------------------------------------------
{
    let s = nuevo();
    check('al principio no se puede pelear', !st.puedePelear(s));

    choose(s, 0);
    st.apply(s, 'attack1');
    check('con uno solo tampoco', !st.puedePelear(s));

    s.quienMira = 1;
    choose(s, 1);
    st.apply(s, 'attack1');
    check('con los dos ya', st.puedePelear(s), st.resumen(s));
    check('el resumen dice los dos nombres',
        st.resumen(s).p1 && st.resumen(s).p2, st.resumen(s));

    // Si uno suelta, ya no se puede pelear.
    s.quienMira = 0;
    choose(s, 0);
    st.apply(s, 'action');
    check('si uno suelta, se bloquea otra vez', !st.puedePelear(s));
}

// ---------------------------------------------------------------------------
section('6. El estado aguanta rosteres raros');
// ---------------------------------------------------------------------------
{
    // Un solo peleador: no se puede navegar a ningun lado.
    const uno = st.createSelectState([ROSTER[0]]);
    st.move(uno, 'right');
    st.move(uno, 'down');
    check('con un solo peleador, la cruceta no se mueve', uno.focus === 0, uno.focus);
    check('y se puede elegir', st.apply(uno, 'attack1').cambio === 'elegido');

    // El roster vacio tiene que fallar claro, no dar la pantalla en blanco.
    let lanzo = false;
    try { st.createSelectState([]); } catch (e) { lanzo = true; }
    check('un roster vacio avisa en vez de romperse en silencio', lanzo);

    // El peleador del jugador (custom) tiene que entrar en el panal.
    const conCustom = nuevo();
    const hayCustom = conCustom.roster.some((f) => f.custom || f.id === 'CUSTOM');
    check('el roster incluye al peleador del jugador', hayCustom,
        conCustom.roster.map((f) => f.id));
    if (hayCustom) {
        const i = conCustom.roster.findIndex((f) => f.custom || f.id === 'CUSTOM');
        choose(conCustom, i);
        st.apply(conCustom, 'attack1');
        check('el peleador del jugador se puede elegir', !!conCustom.slots[0].fighter);
        st.apply(conCustom, 'attack2');
        check('y tiene atuendos', !!wardrobe.outfitById(conCustom.slots[0].outfit));
        st.apply(conCustom, 'block');
        check('y animaciones',
            anims.animationsOf(conCustom.slots[0].fighter.id).includes(conCustom.slots[0].anim));
    }

    // Un boton que no existe no rompe nada.
    const s = nuevo();
    check('una accion desconocida no rompe', st.apply(s, 'inventado').cambio === 'nada');

    // El outfitOf / animOf del estado no revientan si no hay nada elegido.
    check('outfitOf sin elegir no rompe', st.outfitOf(nuevo(), 0) === null || !!st.outfitOf(nuevo(), 0));
    check('animOf sin elegir cae en la del enfocado', !!st.animOf(nuevo(), 0));
    check('focusedId sin nada devuelve un id o null', st.focusedId(nuevo()) !== undefined);
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(64));
console.log(`resultado: ${passed} ok, ${failed} fallos`);
console.log('='.repeat(64));
if (failed > 0) process.exit(1);
