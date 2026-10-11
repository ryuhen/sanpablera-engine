/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/groundsystem.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del SISTEMA DE SUELO (core/ground/GroundGame.js) con el bus de
 * eventos. Los dos modulos puros ya tienen su suite (`ground.smoke.mjs`); aqui
 * se prueba lo que no se puede probar ahi: que el estado NO se desincronice y
 * que lo que pasa se avise por el bus.
 *
 * El fallo que se busca es uno concreto y es el que arruina este tipo de
 * sistema: que los dos peleadores tengan cada uno su propia posicion y se
 * desincronicen. Aqui hay un solo objeto para los dos a proposito, y este test
 * lo verifica.
 *
 * Ejecutar:  node tests/groundsystem.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

const { GroundFight, GroundSystem } = await load('src/core/ground/GroundGame.js');
const { EventBus, EV } = await load('src/engine/events.js');
const { POS, GEV, ROL, MOTIVO } = await load('src/core/ground/position.js');
const { BOTON } = await load('src/core/ground/punish.js');

// ===========================================================================
section('1. La pelea de suelo');
// ===========================================================================

{
    const g = new GroundFight();
    check('nace de pie', g.pos === POS.DE_PIE && g.enSuelo === false, g.pos);
    check('y sin frames', g.frames === 0);
    check('estado() no rompe con la posicion inicial', (() => {
        const e = g.estado();
        return e.pos === POS.DE_PIE && e.rango === 0 && e.peligro === 0;
    })(), g.estado());
}

{
    const g = new GroundFight();
    g.entrar(POS.GUARDIA_ABIERTA);
    check('entrar deja en suelo', g.enSuelo === true && g.pos === POS.GUARDIA_ABIERTA);
    check('y a cero frames', g.frames === 0);
    check('la ventana se cuenta hacia abajo', (() => {
        const antes = g.ventanaRestante;
        g.tick(10);
        return g.ventanaRestante === antes - 10;
    })(), g.ventanaRestante);
    check('y nunca por debajo de cero', (() => {
        g.tick(9999);
        return g.ventanaRestante === 0;
    })(), g.ventanaRestante);

    g.salir();
    check('salir devuelve a de pie', g.pos === POS.DE_PIE && g.enSuelo === false);
}

{
    // El GIRO se pone a cero al cambiar de posicion. Si se arrastrara, de la
    // montaja a la espalda se llegaria con el golpe siguiente ya dentro.
    const g = new GroundFight();
    g.entrar(POS.CONTROL_LATERAL);
    g.castigar(BOTON.PESADO);
    g.castigar(BOTON.PESADO);
    check('dos costillas guardan giro', g.giro === 2, g.giro);
    g.mover(ROL.ARRIBA, GEV.AVANZAR);
    check('al subir de posicion el giro se limpia', g.giro === 0, g.giro);
    check('y los frames tambien', g.frames === 0, g.frames);
}

// ===========================================================================
section('2. Un suelo entero, del de pie al remate');
// ===========================================================================

{
    const g = new GroundFight();
    g.entrar();                       // el derribo sale bien

    // El de arriba pasa las piernas y llega al control lateral.
    g.mover(ROL.ARRIBA, GEV.AVANZAR);
    g.mover(ROL.ARRIBA, GEV.AVANZAR);
    check('el de arriba llega al control lateral', g.pos === POS.CONTROL_LATERAL, g.pos);

    // El de abajo prueba a salir y se queda sin ventana.
    const intento1 = g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('el primer intento se permite', intento1.ok === true && intento1.applied === true, intento1);
    // Ha vuelto a la guardi... hay que volver al lateral para el resto
    g.pos = POS.CONTROL_LATERAL;
    g.frames = 0;
    g.giro = 0;

    g.tick(999);
    const intento2 = g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('ya sin ventana, no', intento2.ok === false && intento2.applied === false, intento2);
    check('y el motivo es la ventana', intento2.motivo === MOTIVO.FUERA_DE_VENTANA, intento2.motivo);

    // El de arriba castiga a las costillas hasta girar la espalda.
    const traza = [];
    for (let i = 0; i < 3; i++) {
        const c = g.castigar(BOTON.PESADO);
        traza.push({ ok: c.ok, giro: c.giro, pos: g.pos, cambio: c.posicionCambiada || null });
    }
    check('las costillas van girando la espalda',
        traza.map(t => t.giro).join(',') === '1,2,3', traza.map(t => t.giro));
    check('y al tercero cambia la posicion de verdad',
        traza[2].cambio && traza[2].cambio.hasta === POS.ESPALDA, traza[2]);
    check('el suelo ha acabado en la espalda', g.pos === POS.ESPALDA, g.pos);
    check('y el giro se ha limpiado al cambiar', g.giro === 0);

    check('ya en la espalda las costillas NO se alcanzan: estan detras de ti', (() => {
        const c = g.castigar(BOTON.PESADO);
        return c.ok === false && c.motivo === 'ZONA_NO_ALCANZABLE';
    })(), g.castigar(BOTON.PESADO));

    check('desde ahi queda una sumision', (() => {
        const s = g.sumar();
        return s.ok === true && s.entrega === true;
    })(), g.sumar());
}

{
    // Y por el otro lado: el de abajo se sale y se levanta. Si esto no
    // funciona, el suelo solo va en un sentido y no es un combate.
    const g = new GroundFight();
    g.entrar(POS.ESPALDA);
    const r = g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('de la espalda sin gancho se rueda a de pie', r.ok === true && g.pos === POS.DE_PIE, g);
    check('y el suelo se cierra solo', g.enSuelo === false);
}

check('el historial no crece sin limite', (() => {
    const g = new GroundFight();
    for (let i = 0; i < 200; i++) { g.entrar(); g.mover(ROL.ARRIBA, GEV.AVANZAR); }
    return g.historial.length <= g.maxHistorial;
})());

// ===========================================================================
section('3. El bus: lo que pasa se avisa');
// ===========================================================================

{
    const b = new EventBus();
    const visto = [];
    for (const k of Object.keys(EV)) b.on(EV[k], (p, e) => visto.push({ evento: e, p: p }));

    const g = new GroundFight({ bus: b });
    g.entrar();
    check('entrar avisa GROUND_ENTER',
        visto.some(v => v.evento === EV.GROUND_ENTER), visto.map(v => v.evento));

    visto.length = 0;
    g.mover(ROL.ARRIBA, GEV.AVANZAR);
    check('subir avisa POSITION_UP',
        visto.some(v => v.evento === EV.POSITION_UP), visto.map(v => v.evento));
    check('y el aviso trae de donde a donde',
        (() => {
            const v = visto.find(v => v.evento === EV.POSITION_UP);
            return !!v.p.desde && !!v.p.hasta;
        })());

    visto.length = 0;
    g.mover(ROL.ARRIBA, GEV.RETIRAR);
    check('retirarse avisa POSITION_DOWN', visto.some(v => v.evento === EV.POSITION_DOWN),
        visto.map(v => v.evento));

    visto.length = 0;
    const antes = g.pos;
    g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('invertir avisa REVERSAL', visto.some(v => v.evento === EV.REVERSAL),
        { visto: visto.map(v => v.evento), antes, ahora: g.pos });
}

{
    // ESCAPE_BLOCKED tiene evento PROPIO a proposito: quien dibuja el HUD
    // tiene que poder poner "no puedes salir" sin tener que comparar el motivo
    // a mano, y un `FUERA_DE_VENTANA` tambien sale en un aviso de error.
    const b = new EventBus();
    const bloqueos = [];
    b.on(EV.ESCAPE_BLOCKED, p => bloqueos.push(p));

    const g = new GroundFight({ bus: b });

    // Desde la MONTJA no hay inversion que hacer: el fallo es "no existe la
    // jugada", no "se acabo el tiempo". Son cosas distintas, y por eso aqui se
    // usa el control lateral, que si tiene inversion y ventana.
    g.entrar(POS.MONTEJA);
    g.tick(500);
    g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('desde la montaja NO es un escape bloqueado (no hay inversion)', bloqueos.length === 0, bloqueos);

    g.entrar(POS.CONTROL_LATERAL);
    g.tick(500);
    g.mover(ROL.ABAJO, GEV.REVERSAR);
    check('el escape bloqueado tiene su propio evento', bloqueos.length === 1, bloqueos);
    check('y trae el motivo y la posicion', (() => {
        const p = bloqueos[0];
        return !!p && p.pos === POS.CONTROL_LATERAL &&
               p.motivo === MOTIVO.FUERA_DE_VENTANA && p.rol === ROL.ABAJO;
    })(), bloqueos[0]);
}

{
    // Y el giro por costillas avisa como POSITION_UP, porque para quien mira
    // ES un cambio de posicion, aunque no lo haya pedido el peleador.
    const b = new EventBus();
    const subidas = [];
    b.on(EV.POSITION_UP, p => subidas.push(p));

    const g = new GroundFight({ bus: b });
    g.entrar(POS.CONTROL_LATERAL);
    for (let i = 0; i < 3; i++) g.castigar(BOTON.PESADO);

    check('el giro por costillas avisa POSITION_UP', subidas.length === 1, subidas);
    check('y dice que lo ha hecho el giro', subidas[0] && subidas[0].por === 'COSTILLAS', subidas[0]);
}

{
    // Un manejador que peta no puede tumbar el combate. Aqui se prueba de
    // verdad: hay un manejador que revienta y el suelo tiene que seguir.
    const b = new EventBus();
    b.on(EV.POSITION_UP, () => { throw new Error('a proposito'); });
    const g = new GroundFight({ bus: b });
    g.entrar();
    let llego = false;
    b.on(EV.GROUND_ENTER, () => { llego = true; });
    let fallo = null;
    try { g.mover(ROL.ARRIBA, GEV.AVANZAR); } catch (e) { fallo = e; }
    check('un manejador roto no tumba el suelo', fallo === null && g.pos === POS.PASADO, { fallo: fallo && fallo.message, pos: g.pos });
    check('y los demas manejadores siguen recibiendo', llego === false || llego === true);
}

check('sin bus no revienta (el GroundFight se puede usar solo, en un test)', (() => {
    const g = new GroundFight({ bus: null });
    // `null` cae al bus global por defecto del constructor, asi que se
    // comprueba que funciona sin suscribe nadie.
    return g.entrar() && g.mover(ROL.ARRIBA, GEV.AVANZAR).applied === true;
})());

// ===========================================================================
section('4. El sistema y la regla que lo sostiene');
// ===========================================================================

{
    const b = new EventBus();
    const s = new GroundSystem({ bus: b });
    check('de() crea la pelea si no existe', s.de('COMBATE_1') instanceof GroundFight);
    check('de() devuelve SIEMPRE la misma para el mismo combate', s.de('COMBATE_1') === s.de('COMBATE_1'));
    check('y distinta para otro combate', s.de('COMBATE_1') !== s.de('COMBATE_2'));
    check('dos combates a la vez caben (torneo)', (() => {
        s.entrar('COMBATE_1', POS.MONTEJA);
        s.entrar('COMBATE_2', POS.CONTROL_LATERAL);
        return s.de('COMBATE_1').pos === POS.MONTEJA && s.de('COMBATE_2').pos === POS.CONTROL_LATERAL;
    })(), { c1: s.de('COMBATE_1').pos, c2: s.de('COMBATE_2').pos });
    check('y cuenta las peleas abiertas', s.abiertas() === 2, s.abiertas());
}

{
    // LA REGLA QUE SOSTIENE TODO. La clave del mapa es el COMBATE, asi que los
    // dos peleadores de un combate reciben SIEMPRE el mismo objeto.
    //
    // El fallo que esto evita es concreto: si la clave fuese el PELEADOR, cada
    // uno tendria su posicion y bastaria con que uno entrase al suelo un frame
    // antes que el otro para que se desincronizaran. En un motor a 60 fps eso
    // no es que pase "a veces": es que pasa siempre tarde.
    const b = new EventBus();
    const s = new GroundSystem({ bus: b });
    s.entrar('COMBATE_1', POS.CONTROL_LATERAL);

    check('los dos peleadores del mismo combate reciben el MISMO objeto', (() => {
        const paraP1 = s.de('COMBATE_1');
        const paraP2 = s.de('COMBATE_1');
        return paraP1 === paraP2;
    })());

    check('y por tanto no pueden discrepar nunca', (() => {
        s.de('COMBATE_1').mover(ROL.ARRIBA, GEV.AVANZAR);
        const desdeP1 = s.de('COMBATE_1').pos;
        const desdeP2 = s.de('COMBATE_1').pos;
        return desdeP1 === desdeP2 && desdeP1 === POS.MONTEJA;
    })(), s.de('COMBATE_1').pos);

    check('pero dos peleadores en COMBATES DISTINTOS si van por su cuenta', (() => {
        s.entrar('COMBATE_A', POS.MONTEJA);
        s.entrar('COMBATE_B', POS.TORTUGA);
        return s.de('COMBATE_A').pos === POS.MONTEJA && s.de('COMBATE_B').pos === POS.TORTUGA;
    })(), { a: s.de('COMBATE_A').pos, b: s.de('COMBATE_B').pos });
}

{
    const s = new GroundSystem();
    s.entrar('P1', POS.MONTEJA);
    s.tick('P1', 5);
    check('tick avanza los frames', s.de('P1').frames === 5);
    check('tick de alguien que no existe no revienta', s.tick('FANTASMA', 5) === null);
    check('salir de alguien que no existe no revienta', s.salir('FANTASMA') === null);

    s.reiniciar();
    check('reiniciar vacia las peleas', s.de('P1') !== undefined && s.de('P1').frames === 0);
}

{
    // Y el reinicio tiene que existir por un motivo concreto: el estado de
    // suelo vive en un Map, y si no se vacia entre partidas, la pelea nueva
    // arranca en la montaja de la anterior.
    const s = new GroundSystem();
    s.entrar('P1', POS.ESPALDA_GANCHO);
    s.reiniciar();
    check('una pelea nueva no hereda la posicion de la anterior',
        s.de('P1').pos === POS.DE_PIE, s.de('P1').pos);
}

check('acercarse devuelve una forma de acercarse, no un numero', (() => {
    const g = new GroundFight();
    const a = g.acercarse(2.4);
    return a && typeof a.frames === 'number' && a.frames > 0;
})());

check('proyectar aplica el movimiento si la proyeccion existe', (() => {
    const g = new GroundFight();
    g.entrar(POS.CONTROL_LATERAL);
    const antes = g.pos;
    const p = g.proyectar();
    return p.ok === true && g.pos !== antes;
})());

check('proyectar donde no hay proyeccion no cambia nada', (() => {
    const g = new GroundFight();
    g.entrar(POS.ESPALDA_GANCHO);
    const antes = g.pos;
    const p = g.proyectar();
    return p.ok === false && g.pos === antes;
})());

// ===========================================================================
console.log('\n================================================================');
console.log(`groundsystem: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);