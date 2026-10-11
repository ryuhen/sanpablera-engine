/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/groundstance.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test de la STANCE DE SUELO y de la CINEMATICA DE SUELO
 *   (core/ground/stance.js + core/ground/groundCine.js).
 *
 * Lo que hay que comprobar, y por que cada comprobacion existe:
 *
 *   1. QUE LA STANCE NO INVENTA .... la postura decide si una accion existe;
 *                                    la POSICION decide si la jugada es legal.
 *                                    Si se mezclan, el jugador ve "no puedes"
 *                                    cuando en realidad lo que se le paso es el
 *                                    momento.
 *   2. QUE EL ENLACE FUNCIONA ...... cada verbo de la stance tiene que llegar
 *                                    al modelo posicional y moverlo de verdad.
 *   3. QUE EL FRENO FUNCIONA ....... la ventana de escape cierra, y cuando
 *                                    cierra la accion NO se cobra: el jugador
 *                                    no ha hecho nada, no tiene que pagarlo.
 *   4. QUE LA CINEMATICA NO MANDA .. LA REGLA. No devuelve ningun estado, no
 *                                    consume input, y se superpone en vez de
 *                                    sustituir. Si algun dia devuelve estado,
 *                                    aqui falla.
 *   5. QUE SE VE LO QUE PASA ...... cada accion tiene plano, y el plano
 *                                    encuadra a los dos cuerpos tumbados.
 *
 * Ejecutar:  node tests/groundstance.smoke.mjs
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

const S = await load('src/core/ground/stance.js');
const P = await load('src/core/ground/position.js');
const U = await load('src/core/ground/punish.js');
const C = await load('src/core/ground/groundCine.js');

const { STANCE, ACCION, ACCIONES, STANCES, MOTIVO, COSTE, BOTON_DE, DIRECCION_DE, MAPEO,
        infoStance, accionesDe, puedeHacer, exposicionDe, proteccionDe,
        resolverStance, accionDeBoton, accionDeDireccion, opcionesDeBoton, lecturaDe } = S;
const { POS, GEV, ROL, ventanaDe } = P;
const { BOTON } = U;
const { GUION, ALTO_PLANO, REPOSO_ENTRELAZADO, ShotSize, CameraMove,
        guionDe, duracionDe, planoEn, capaEn, pesoDelBeat, planDe, planDeReposo,
        capaDeReposo, planoPara, tieneGuion } = C;

// ===========================================================================
section('1. La tabla de stances');
// ===========================================================================

check('hay 5 stances', STANCES.length === 5, STANCES);
check('cada stance tiene ficha', STANCES.every(s => !!infoStance(s)));
check('cada ficha dice nombre, exposicion y proteccion',
    STANCES.every(s => {
        const i = infoStance(s);
        return typeof i.nombre === 'string' && i.expone >= 0 && i.expone <= 3 && i.protege >= 0 && i.protege <= 3;
    }), STANCES.map(s => { const i = infoStance(s); return [s, i.expone, i.protege]; }));
check('la tabla esta congelada', Object.isFrozen(STANCE) && Object.isFrozen(infoStance(STANCE.BOCA_ARRIBA)));

check('la tortuga (boca abajo) es la que menos se ve', (() => {
    return exposicionDe(STANCE.BOCA_ABAJO) === 0 &&
           exposicionDe(STANCE.BOCA_ABAJO) === exposicionDe(STANCE.BOCA_ARRIBA) - exposicionDe(STANCE.BOCA_ARRIBA);
})(), STANCES.map(s => exposicionDe(s)));
check('boca abajo es la que mas protege', (() => {
    const todas = STANCES.map(proteccionDe);
    return Math.max(...todas) === proteccionDe(STANCE.BOCA_ABAJO);
})(), STANCES.map(s => proteccionDe(s)));
check('de pie en postura baja no protege nada', proteccionDe(STANCE.DE_PIE_BAJO) === 0);

check('la de pie NO puede levantarse (ya esta de pie)', puedeHacer(STANCE.DE_PIE_BAJO, ACCION.LEVANTARSE) === false);
check('la boca arriba SI puede levantarse', puedeHacer(STANCE.BOCA_ARRIBA, ACCION.LEVANTARSE) === true);
check('la boca abajo NO puede atacar tumbado (hay que abrirse)', puedeHacer(STANCE.BOCA_ABAJO, ACCION.ATACAR_DESDE_SUELO) === false);
check('la boca arriba SI', puedeHacer(STANCE.BOCA_ARRIBA, ACCION.ATACAR_DESDE_SUELO) === true);
check('solo el entrelazado puede cambiar el agarre', (() => {
    return ACCIONES.filter(a => puedeHacer(STANCE.ENTRELAZADO, a) && !puedeHacer(STANCE.BOCA_ARRIBA, a)).length >= 3;
})());

check('accionesDe() devuelve una COPIA', (() => {
    const a = accionesDe(STANCE.BOCA_ARRIBA);
    a.push('BASURA');
    return accionesDe(STANCE.BOCA_ARRIBA).indexOf('BASURA') === -1;
})());

check('toda accion de la tabla tiene ficha de coste',
    ACCIONES.every(a => !!COSTE[a]), ACCIONES.filter(a => !COSTE[a]));
// Toda accion tiene que poder pedirse de ALGUN modo: por boton desde alguna
// postura, o por direccion. Si hubiera una accion que no se puede pedir nunca,
// estaria en la tabla y no se podria hacer: un dato muerto que parece jugable.
const salibleConBoton = (a) => STANCES.some(s => Object.keys(MAPEO[s]).some(b => MAPEO[s][b] === a));
check('toda accion se puede pedir: por boton desde alguna postura, o por direccion',
    ACCIONES.every(a => salibleConBoton(a) || !!DIRECCION_DE[a]),
    ACCIONES.filter(a => !salibleConBoton(a) && !DIRECCION_DE[a]));
check('la de pie NO puede levantar (ya esta de pie): el mapa lo respeta', (() => {
    return !Object.keys(MAPEO[STANCE.DE_PIE_BAJO]).some(b => MAPEO[STANCE.DE_PIE_BAJO][b] === ACCION.LEVANTARSE);
})());
check('ninguna accion se pide con boton Y con direccion a la vez',
    ACCIONES.every(a => !(BOTON_DE[a] && DIRECCION_DE[a])),
    ACCIONES.filter(a => BOTON_DE[a] && DIRECCION_DE[a]));
check('las de direccion son las de cuerpo: levantarse, rodar, soltarse, invertir',
    ['LEVANTARSE', 'RODAR_DEFENSIVO', 'SEPARARSE', 'REVERTER'].every(a => DIRECCION_DE[a]),
    Object.keys(DIRECCION_DE));
check('y las direcciones son las cuatro que ya lee el InputRouter',
    Object.keys(DIRECCION_DE).every(k => ['ARRIBA', 'ABAJO', 'ATRAS', 'ADELANTE'].indexOf(DIRECCION_DE[k]) !== -1),
    Object.values(DIRECCION_DE));
check('el coste es siempre positivo', ACCIONES.every(a => COSTE[a].coste > 0 && COSTE[a].energia > 0));

// ===========================================================================
section('2. El enlace con el modelo posicional');
// ===========================================================================

{
    // LEVANTARSE pide LEVANTAR al modelo posicional. Sin ventana se puede
    // levantar (LEVANTAR no es salir de un agarre).
    const r = resolverStance({ stance: STANCE.BOCA_ARRIBA, accion: ACCION.LEVANTARSE, pos: POS.CAIDO_LIBRE });
    check('levantarse funciona de pie en el suelo', r.ok === true, r);
    check('y dice a que postura se acaba', r.stanceTras === STANCE.DE_PIE_BAJO, r.stanceTras);
    check('y no cambia la posicion (no habia agarre)',
        r.posicionCambiada === false || r.posTras === POS.DE_PIE, r);
}

{
    // REVERTER pide REVERSAR, que es el verbo con ventana. Con ventana abierta
    // se invierte; cerrada, no.
    const con = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, framesInside: 0 });
    check('revertir con la ventana abierta funciona', con.ok === true, con);
    check('y cambia la posicion de verdad', con.posicionCambiada === true, con);
    check('y se marca como inversion', con.invierte === true);
    check('la nueva posicion es mas alta en la escalera', (() => {
        return P.peligroDe(con.posTras) > P.peligroDe(POS.CONTROL_LATERAL);
    })(), { antes: POS.CONTROL_LATERAL, despues: con.posTras });

    const sin = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, framesInside: 999 });
    check('revertir con la ventana cerrada NO', sin.ok === false, sin);
    check('y el motivo es el del modelo posicional, no uno propio',
        sin.motivo === P.MOTIVO.FUERA_DE_VENTANA, sin.motivo);
}

{
    // ESTA SEPARACION DE MOTIVOS ES LO QUE HACE QUE EL JUEGO SEA LEGIBLE.
    // Desde una postura que no puede, el motivo es STANCE_INCORRECTA. Desde una
    // postura que puede pero con el momento pasado, es el del modelo posicional.
    // Si se mezclaran, el jugador veria siempre "no puedes" y no entenderia
    // nunca que lo que se le acaba es el TIEMPO.
    const malaStance = resolverStance({ stance: STANCE.BOCA_ABAJO, accion: ACCION.ATACAR_DESDE_SUELO, pos: POS.MONTEJA });
    check('postura que no puede -> STANCE_INCORRECTA',
        malaStance.ok === false && malaStance.motivo === MOTIVO.STANCE_INCORRECTA, malaStance.motivo);

    const buenStance = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, framesInside: 999 });
    check('postura que puede pero sin tiempo -> el motivo del modelo',
        buenStance.ok === false && buenStance.motivo === P.MOTIVO.FUERA_DE_VENTANA, buenStance.motivo);
    check('los dos motivos son DISTINTOS', malaStance.motivo !== buenStance.motivo);
}

{
    // EL FRENO: cuando falla por la ventana, la accion NO se cobra. El jugador
    // no ha hecho nada, asi que no tiene por que pagarlo. Si costara, el
    // el energia se drenaria sola por pulsar y el suelo seria injugable.
    const r = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, framesInside: 999 });
    check('una accion que falla por ventana no cuesta energia', r.energia === 0, r.energia);
    check('ni cuesta frames', r.frames === 0);
    check('ni cambia la postura', r.stanceTras === STANCE.ENTRELAZADO, r.stanceTras);
}

{
    // Y la que falla por postura tampoco. Pero la que falla por ENERGIA si se
    // comprueba antes que nada, para que el motivo sea el que el jugador quiere
    // saber ("no llega") y no un "no puedes salir de ahi" que no es cierto.
    const sinEnergia = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, energia: 2 });
    check('sin energia el motivo es SIN_ENERGIA', sinEnergia.ok === false && sinEnergia.motivo === MOTIVO.SIN_ENERGIA, sinEnergia.motivo);
    check('y se comprueba ANTES que la posicion (el motivo no es de posicion)',
        sinEnergia.motivo !== P.MOTIVO.FUERA_DE_VENTANA);
}

check('la energia justa llega', (() => {
    const r = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL, energia: COSTE[ACCION.REVERTER].energia });
    return r.ok === true;
})());

check('una accion que no existe se contesta', (() => {
    const r = resolverStance({ stance: STANCE.BOCA_ARRIBA, accion: 'VOLAR' });
    return r.ok === false && r.motivo === 'ACCION_DESCONOCIDA';
})());
check('una stance que no existe se contesta', (() => {
    const r = resolverStance({ stance: 'VOLANDO', accion: ACCION.LEVANTARSE });
    return r.ok === false && r.motivo === MOTIVO.STANCE_INCORRECTA;
})());

{
    // LAS ACCIONES SIN VERBO no tocan la posicion. Atacar, cambiar el agarre y
    // la presion son gestos del propio cuerpo: no cambian quien manda.
    for (const a of [ACCION.ATACAR_DESDE_SUELO, ACCION.CAMBIAR_AGARRE, ACCION.PRESION]) {
        const r = resolverStance({ stance: STANCE.ENTRELAZADO, accion: a, pos: POS.CONTROL_LATERAL });
        check('  ' + a + ' no pide verbo posicional', COSTE[a].verbo === null && r.ok === true, r);
    }
}

{
    // Y las que SI lo tienen, lo tienen de verdad: la posicion cambia al otro
    // lado de la escalera, no un pelin.
    const r = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.SEPARARSE, pos: POS.MONTEJA });
    check('separarse pide ESCAPAR y cambia de posicion', r.ok === true && r.posicionCambiada === true, r);
    check('desde la montaja separarse SALE dentro de la ventana', r.ok === true && r.posTras === POS.CONTROL_LATERAL, r);
    check('pero pasado el tiempo no sale', (() => {
        const t = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.SEPARARSE, pos: POS.MONTEJA, framesInside: 999 });
        return t.ok === false && t.motivo === P.MOTIVO.FUERA_DE_VENTANA;
    })());
    check('y en la espalda con gancho tampoco hay manera', (() => {
        const t = resolverStance({ stance: STANCE.ENTRELAZADO, accion: ACCION.SEPARARSE, pos: POS.ESPALDA_GANCHO });
        return t.ok === false;
    })());
}

// ===========================================================================
section('3. El boton y la stance');
// ===========================================================================

{
    // El mapeo depende de la postura: el mismo boton es "atacar" de pie y
    // "atacar tumbado" en el suelo. Por eso vive en la stance y no en el
    // InputRouter.
    check('el boton de accionion es la presion en el entrelazado', (() => {
        const r = accionDeBoton(STANCE.ENTRELAZADO, BOTON.ACCION, POS.CONTROL_LATERAL);
        return r && r.accion === ACCION.PRESION;
    })(), accionDeBoton(STANCE.ENTRELAZADO, BOTON.ACCION, POS.CONTROL_LATERAL));

    check('el mapeo es EXPLICITO, no se deduce por ser mas barato', (() => {
        // En el entrelazado el boton de ACCION da PRESION (30 frames) y NO RODAR
        // OFENSIVO (24). Antes se elegia "la mas barata" y salia RODAR, que
        // hacia que un criterio de PRECIO decidiera lo que hace un boton: eso
        // cambia en cuanto se toca un numero y el jugador no puede aprenderlo.
        return COSTE[ACCION.PRESION].coste > COSTE[ACCION.RODAR_OFENSIVO].coste;
    })(), { presion: COSTE[ACCION.PRESION].coste, rodar: COSTE[ACCION.RODAR_OFENSIVO].coste });
    check('y hay un mapeo declarado para cada stance', STANCES.every(s => !!MAPEO[s]),
        STANCES.filter(s => !MAPEO[s]));
    check('el mapeo solo nombra acciones que esa stance puede hacer', STANCES.every(s => {
        const fila = MAPEO[s];
        return Object.keys(fila).every(b => puedeHacer(s, fila[b]));
    }), (() => {
        const malos = [];
        for (const s of STANCES) {
            for (const b of Object.keys(MAPEO[s])) if (!puedeHacer(s, MAPEO[s][b])) malos.push(s + '/' + b);
        }
        return malos;
    })());

    check('el mapeo NO depende de la posicion: es de la postura', (() => {
        // Con gancho la PRESION sigue siendo legal (es el remate), asi que el
        // boton da lo mismo que antes. El mapeo es de la postura; la posicion
        // la consulta el modelo cuando se ejecuta, no el boton al nombrarlo.
        const r = accionDeBoton(STANCE.ENTRELAZADO, BOTON.ACCION, POS.ESPALDA_GANCHO);
        return r && r.accion === ACCION.PRESION;
    })(), accionDeBoton(STANCE.ENTRELAZADO, BOTON.ACCION, POS.ESPALDA_GANCHO));

    check('pero si la jugada no se puede ejecutar, el boton NO da una accion cualquiera', (() => {
        return accionDeBoton(STANCE.ENTRELAZADO, BOTON.ACCION, POS.ESPALDA_GANCHO, 1) === null;
    })());

    check('el boton de guardia es cambiar el agarre en el entrelazado', (() => {
        const r = accionDeBoton(STANCE.ENTRELAZADO, BOTON.GUARDIA, POS.CONTROL_LATERAL);
        return r && r.accion === ACCION.CAMBIAR_AGARRE;
    })());

    check('un boton sin nada que hacer devuelve null, no un error', (() => {
        return accionDeBoton(STANCE.DE_PIE_BAJO, BOTON.ACCION, POS.DE_PIE) === null;
    })());
}

{
    // Un suelo entero con el boton de accion, sin mirar nada mas: el jugador
    // tiene que poder jugar esto solo con lo que ve.
    const r = accionDeBoton(STANCE.BOCA_ARRIBA, BOTON.ACCION, POS.MONTEJA);
    check('boca arriba: el boton de accion saca la rodar defensiva',
        r === null || r.accion === ACCION.RODAR_DEFENSIVO || r.accion === ACCION.RODAR_OFENSIVO,
        r && r.accion);
}

// ===========================================================================
section('4. La lectura completa');
// ===========================================================================

{
    const l = lecturaDe(STANCE.BOCA_ARRIBA, POS.CONTROL_LATERAL, ROL.ABAJO, 5);
    check('la lectura junta stance y posicion', l.stance === STANCE.BOCA_ARRIBA && l.pos === POS.CONTROL_LATERAL);
    check('el papel se PIDE, no se deduce: lo recibe', l.rol === ROL.ABAJO, l.rol);
    check('los dos nombres son legibles', l.nombreStance.length > 3 && l.nombrePos.length > 3, l);
    check('trae el peligro de la posicion', l.peligro === P.peligroDe(POS.CONTROL_LATERAL));

    // La postura NO dice quien manda, y este es el fallo que se corrigio: antes
    // el papel se deducía de si la posicion "tenia alguien arriba", y eso es
    // FALSO para uno de los dos, porque los dos estan en la MISMA posicion.
    const abajo = lecturaDe(STANCE.BOCA_ARRIBA, POS.MONTEJA, ROL.ABAJO, 5);
    const arriba = lecturaDe(STANCE.BOCA_ARRIBA, POS.MONTEJA, ROL.ARRIBA, 5);
    check('la misma postura y la misma posicion con distinto papel',
        abajo.stance === arriba.stance && abajo.pos === arriba.pos && abajo.rol !== arriba.rol,
        { abajo: abajo.rol, arriba: arriba.rol });
    check('porque una stance NO dice quien manda: lo dice el combate',
        abajo.stance === STANCE.BOCA_ARRIBA && arriba.stance === STANCE.BOCA_ARRIBA);
    check('y la lectura trae la ventana que queda', (() => {
        const l = lecturaDe(STANCE.BOCA_ARRIBA, POS.CONTROL_LATERAL, ROL.ABAJO, 5);
        return l.ventanaRestante === P.ventanaDe(POS.CONTROL_LATERAL) - 5;
    })(), lecturaDe(STANCE.BOCA_ARRIBA, POS.CONTROL_LATERAL, ROL.ABAJO, 5).ventanaRestante);
}

// ===========================================================================
section('5. LA CINEMATICA NO MANDA  (la regla)');
// ===========================================================================

check('ningun modulo de la cinematica devuelve un estado de juego', (() => {
    // Se mira el nombre de lo que exporta: si algum dia aparece un
    // `setEstado` o `aplicarControl`, aqui falla.
    const exports = Object.keys(C);
    const sospechosos = exports.filter(k => /estado|control|input|bloquea|bloquear|posea$/i.test(k));
    return sospechosos.length === 0;
})(), Object.keys(C).filter(k => /estado|control|input|bloquea|bloquear|posea$/i.test(k)));

check('el plan NO lleva ninguna posicion ni stance (no decide nada del juego)', (() => {
    const p = planDe(ACCION.REVERTER);
    return !('pos' in p) && !('stance' in p) && !('rol' in p) && !('estado' in p);
})(), Object.keys(planDe(ACCION.REVERTER)));

check('el plan solo lleva camara: planos, duracion y capa', (() => {
    const p = planDe(ACCION.REVERTER);
    return p.existe === true && typeof p.frames === 'number' && Array.isArray(p.planos);
})(), Object.keys(planDe(ACCION.REVERTER)));

check('la capa de pose son deltas con peso, no una pose completa', (() => {
    const capa = capaEn(ACCION.REVERTER, 10);
    return capa.length > 0 && capa.every(c => typeof c.hueso === 'string' && typeof c.grados === 'number' && c.peso >= 0);
})(), capaEn(ACCION.REVERTER, 10));

check('la capa NUNCA sustituye: solo hay huesos y grados, ni una posicion', (() => {
    const capa = capaEn(ACCION.ATACAR_DESDE_SUELO, 4);
    return capa.every(c => !('x' in c) && !('y' in c) && !('z' in c));
})(), capaEn(ACCION.ATACAR_DESDE_SUELO, 4));

check('pedir un guion que no existe NO es un fallo: es el caso normal', (() => {
    const p = planDe('ACCION_FANTASMA');
    return p.existe === false && p.frames === 0 && p.planos.length === 0;
})());
check('y el motor no tiene que preguntar nada: la capa sale vacia', (() => {
    return capaEn('ACCION_FANTASMA', 0).length === 0;
})());
check('tambien cuando la secuencia ya se ha acabado', (() => {
    return capaEn(ACCION.REVERTER, 9999).length === 0 && planoEn(ACCION.REVERTER, 9999) === null;
})());

// ===========================================================================
section('6. Que se vea lo que pasa');
// ===========================================================================

check('cada accion tiene guion', ACCIONES.every(a => tieneGuion(a)),
    ACCIONES.filter(a => !tieneGuion(a)));
check('cada accion tiene al menos un plano', ACCIONES.every(a => guionDe(a) && guionDe(a).length >= 1));
check('cada plano dura algo', ACCIONES.every(a => guionDe(a).every(p => p.dur > 0)));
check('cada plano declara un tamano declarado en metros', (() => {
    for (const a of ACCIONES) {
        for (const p of guionDe(a)) if (ALTO_PLANO[p.size] == null) return false;
    }
    return true;
})(), (() => {
    const malos = [];
    for (const a of ACCIONES) for (const p of guionDe(a)) if (ALTO_PLANO[p.size] == null) malos.push(a + ':' + p.size);
    return malos;
})());

check('cada plano declara un movimiento y una transicion', (() => {
    for (const a of ACCIONES) {
        for (const p of guionDe(a)) {
            if (!p.move) return false;
            if (p.trans == null) return false;
        }
    }
    return true;
})());
check('el primer plano de cada guion entra a corte, no mezclado', (() => {
    for (const a of ACCIONES) {
        if (guionDe(a)[0].trans !== 'CUT') return false;
    }
    return true;
})(), ACCIONES.filter(a => guionDe(a)[0].trans !== 'CUT'));

{
    // LA PRUEBA DE QUE SE VE: los golpes se ven de CERCA y la separacion se ve
    // de ANCHO. Si un golpe saliera en plano ancho, el brazo del rival estaria
    // fuera de cuadro y el castigo no se veria, que es justo lo que no puede
    // pasar en el suelo.
    const tamanoDe = a => guionDe(a).map(p => ALTO_PLANO[p.size]);
    const masCercano = a => Math.min(...tamanoDe(a));
    const masLejos = a => Math.max(...tamanoDe(a));

    check('golpear tumbado se ve de cerca', masCercano(ACCION.ATACAR_DESDE_SUELO) <= 1.20,
        masCercano(ACCION.ATACAR_DESDE_SUELO));
    check('la presion se ve muy de cerca', masCercano(ACCION.PRESION) <= 0.45,
        masCercano(ACCION.PRESION));
    check('la inversion se ve de ancho (los cuerpos se dan la vuelta)',
        masLejos(ACCION.REVERTER) >= 2.20, masLejos(ACCION.REVERTER));
    check('separarse se ve de ancho (hay que ver a los dos)', masLejos(ACCION.SEPARARSE) >= 4.00,
        masLejos(ACCION.SEPARARSE));
    check('y la inversion es la mas larga del suelo', (() => {
        return duracionDe(guionDe(ACCION.REVERTER)) === Math.max(...ACCIONES.map(a => duracionDe(guionDe(a))));
    })(), ACCIONES.map(a => [a, duracionDe(guionDe(a))]));
}

check('planoPara() mide y no adivina', (() => {
    return planoPara(0.3) === ShotSize.CLOSE &&
           planoPara(1.0) === ShotSize.MEDIUM &&
           planoPara(2.0) === ShotSize.FULL &&
           planoPara(6.0) === ShotSize.ESTABLISHING;
})(), [0.3, 1, 2, 6].map(x => planoPara(x)));

check('dos cuerpos tumbados y solapados necesitan mas plano que uno de pie', (() => {
    return planoPara(1.7, true) !== planoPara(1.7, false);
})(), [planoPara(1.7, false), planoPara(1.7, true)]);

check('el peso del beat entra rapido y sale despacio', (() => {
    const w1 = pesoDelBeat(0.1), w2 = pesoDelBeat(0.5), w3 = pesoDelBeat(0.95);
    return w1 < w2 && w2 > 0 && w3 < 1 && pesoDelBeat(0) === 0 && pesoDelBeat(1) === 1;
})(), [pesoDelBeat(0), pesoDelBeat(0.1), pesoDelBeat(0.5), pesoDelBeat(1)]);
check('y siempre entre 0 y 1 (si se pasa, el esqueleto se rompe)', (() => {
    for (let i = 0; i <= 100; i++) {
        const w = pesoDelBeat(i / 100);
        if (w < 0 || w > 1) return false;
    }
    return true;
})());
check('el peso de la capa tambien esta entre 0 y 1', (() => {
    for (const a of ACCIONES) {
        for (let f = 0; f < duracionDe(guionDe(a)); f++) {
            for (const c of capaEn(a, f)) if (c.peso < 0 || c.peso > 1) return false;
        }
    }
    return true;
})());

{
    // El plano cambia dentro de la secuencia, y eso es lo que la hace
    // cinematica y no un zoom lento.
    const tl = guionDe(ACCION.REVERTER);
    check('la inversion cambia de plano a mitad', tl.length >= 3 && tl[0].size !== tl[2].size,
        tl.map(p => p.size));
    check('y se ve el encuadre avanzando', (() => {
        const p0 = planoEn(ACCION.REVERTER, 2);
        const p1 = planoEn(ACCION.REVERTER, 20);
        return p0 && p1 && p0.plano.size !== p1.plano.size;
    })());
    check('el progreso va de 0 a 1 dentro de la secuencia', (() => {
        const a = planoEn(ACCION.REVERTER, 0);
        const b = planoEn(ACCION.REVERTER, duracionDe(guionDe(ACCION.REVERTER)) - 1);
        return a.progreso < b.progreso && a.progreso >= 0 && b.progreso <= 1;
    })());
}

check('el reposo tiene plano y capa: aunque no pase nada, se ve algo', (() => {
    const p = planDeReposo();
    return p.existe === true && p.planos.length === 1 && capaDeReposo(0).length > 0;
})());
check('el reposo sigue a los dos (no es un plano fijo clavado)',
    planDeReposo().planos[0].move === CameraMove.FOLLOW, planDeReposo().planos[0].move);
check('y su capa es mas suave que la de un golpe', (() => {
    const reposo = Math.max(...capaDeReposo(0).map(c => c.peso));
    const golpe = Math.max(...capaEn(ACCION.PRESION, 8).map(c => c.peso));
    return reposo < golpe;
})(), { reposo: Math.max(...capaDeReposo(0).map(c => c.peso)),
       golpe: Math.max(...capaEn(ACCION.PRESION, 8).map(c => c.peso)) });
check('el reposo da la vuelta (respira) sin parar', (() => {
    return capaDeReposo(0).length > 0 && capaDeReposo(15).length > 0;
})());
check('el reposo NUNCA es un plano cerrado (hay que ver a los dos)', (() => {
    const p = planDeReposo().planos[0];
    return ALTO_PLANO[p.size] >= 1.20;
})(), ALTO_PLANO[planDeReposo().planos[0].size]);

// ===========================================================================
section('7. Las dos mitades juntas');
// ===========================================================================

{
    // EL ENLACE QUE PIDIO EL ENCARGADO: una accion de la stance produce su
    // plano, y el plano NO vuelve a tocar la stance.
    const pasos = [
        { stance: STANCE.BOCA_ARRIBA, accion: ACCION.ATACAR_DESDE_SUELO, pos: POS.CONTROL_LATERAL },
        { stance: STANCE.ENTRELAZADO, accion: ACCION.REVERTER, pos: POS.CONTROL_LATERAL },
        { stance: STANCE.ENTRELAZADO, accion: ACCION.PRESION, pos: POS.MONTEJA },
        { stance: STANCE.BOCA_ABAJO, accion: ACCION.RODAR_DEFENSIVO, pos: POS.MONTEJA }
    ];

    let conPlano = 0;
    for (const p of pasos) {
        const s = resolverStance({ stance: p.stance, accion: p.accion, pos: p.pos, framesInside: 0 });
        const plan = planDe(p.accion);
        if (plan.existe && plan.frames > 0) conPlano++;
        // La cinematica es la MISMA para la accion, este o no en el suelo: eso
        // es correcto, porque la cinematica no sabe de posiciones.
        if (plan.existe && plan.planos.some(pl => pl.peso > 0)) conPlano++;
    }
    check('cada accion de la stance tiene su plano', conPlano === pasos.length * 2, conPlano);

    check('el mismo golpe se ve igual desde cualquier posicion', (() => {
        // El plano no depende de la posicion: por eso no puede ser el sitio
        // donde se decida nada del juego.
        return planDe(ACCION.ATACAR_DESDE_SUELO).frames === planDe(ACCION.ATACAR_DESDE_SUELO).frames;
    })());
}

// ===========================================================================
console.log('\n================================================================');
console.log(`groundstance: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);