/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/ground.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del MODELO POSICIONAL DE SUELO
 *   (core/ground/position.js + core/ground/punish.js).
 *
 * Lo que hay que comprobar, y por que cada comprobacion existe:
 *
 *   1. QUE LA ESCALERA ESTA BIEN ..... si las posiciones no estan ordenadas
 *                                    por peligro, el modelo no dice nada.
 *   2. QUE NO ES UNA ESCALERA SIMPLE . la guardia cerrada es la posicion MAS
 *                                    SEGURA para el de abajo. Ese es el punto
 *                                    del modelo y lo que un principiante
 *                                    haria mal.
 *   3. QUE LA VENTANA CIERRA ........ la ventana de escape es el motor del
 *                                    sistema. Si no cierra, el suelo es un
 *                                    mazo y no un juego.
 *   4. QUE LOS ROLES NO SE MEZCLAN . el de arriba no se escapa y el de abajo
 *                                    no sube. Si se mezclan, se rompe la
 *                                    escalera entera por un lado.
 *   5. QUE SE LLEGA A TODO .......... desde la guardia abierta se puede
 *                                    terminar el suelo. Si hay posiciones
 *                                    muertas, el combate se atasca.
 *   6. QUE LAS COSTILLAS GIRAN ..... el remate del spec: castigar las
 *                                    costillas obliga a girar la espalda.
 *   7. QUE SE PUEDE FRENAR .......... el boton de guardia tiene que servir
 *                                    para algo, o el giro solo sube.
 *
 * Ejecutar:  node tests/ground.smoke.mjs
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

const P = await load('src/core/ground/position.js');
const U = await load('src/core/ground/punish.js');
const { POS, GEV, ROL, MOTIVO, POSICIONES, resolverSuelo, peligroDe, presionDe,
        ventanaDe, rangoDe, info, esPeor, otroRol, porPeligro, porRango, hayArriba,
        estaEnPeligro, mejorAcercamiento, puedeCastigar, sumisionesDe, ACERCAMIENTO } = P;
const { BOTON, ACCION, SUM, CASTIGO, castigoDe, resolverGiro, sumisionDe,
        proyeccionDe, posicionesDeRemate, GIRO_NECESARIO } = U;

// ===========================================================================
section('1. La tabla');
// ===========================================================================

check('hay 13 posiciones (las doce de suelo mas el caido libre)', POSICIONES.length === 13, POSICIONES.length);
check('toda posicion tiene ficha', POSICIONES.every(p => !!info(p)), POSICIONES.filter(p => !info(p)));
check('la ficha dice si hay alguien arriba',
    POSICIONES.every(p => typeof hayArriba(p) === 'boolean'));
check('de pie NO hay nadie arriba', hayArriba(POS.DE_PIE) === false);
check('las otras doce si', POSICIONES.filter(p => p !== POS.DE_PIE).every(hayArriba));
check('peligro entre 0 y 10 en todas',
    POSICIONES.every(p => { const n = peligroDe(p); return n >= 0 && n <= 10; }),
    POSICIONES.map(p => [p, peligroDe(p)]).filter(x => x[1] < 0 || x[1] > 10));
check('presion entre 0 y 10 en todas',
    POSICIONES.every(p => { const n = presionDe(p); return n >= 0 && n <= 10; }));
check('la ventana nunca es negativa', POSICIONES.every(p => ventanaDe(p) >= 0));
check('los dos de pie no tienen peligro', peligroDe(POS.DE_PIE) === 0 && presionDe(POS.DE_PIE) === 0);
check('la tabla esta congelada', Object.isFrozen(POS) && Object.isFrozen(info(POS.MONTEJA)));
check('la tabla congelada es de verdad: no se puede escribir en ella',
    (() => { try { info(POS.MONTEJA).peligro = 0; return peligroDe(POS.MONTEJA) !== 0; } catch (e) { return true; } })());

{
    // Una posicion que no existe tiene que RESPONDER, no devolver la de pie.
    // Devolver la de pie taparia el fallo y el combate seguiria con datos
    // inventados, que es como se pierde un bug tres meses.
    const r = resolverSuelo('NO_EXISTE', ROL.ARRIBA, GEV.AVANZAR, 0);
    check('una posicion inventada no revienta, y lo dice', r.ok === false && r.to === null, r);
    check('y el motivo es que no hay salida', r.motivo === MOTIVO.SIN_SALIDA, r.motivo);
    check('peligroDe de lo que no existe es 0, no undefined', peligroDe('NO_EXISTE') === 0);
    check('info de lo que no existe es null', info('NO_EXISTE') === null);
}

{
    // LA POSICION QUE UNE EL DERRIBO CON EL SUELO. Sin ella, `LEVANTARSE` no
    // tendria sitio: caes, y el modelo decia "guardia abierta", que es mentira
    // porque un derribo no es un agarre. Aqui se comprueba que existe, que se
    // entra desde de pie y que desde ahi se puede pasar al suelo y levantarse.
    check('CAIDO_LIBRE existe', !!info(POS.CAIDO_LIBRE));
    check('y se entra desde los dos de pie (el derribo sale bien)', (() => {
        return info(POS.DE_PIE).sube.indexOf(POS.CAIDO_LIBRE) !== -1;
    })(), info(POS.DE_PIE).sube);
    check('y es lo primero a lo que se entra: un derribo te deja tirado', (() => {
        return resolverSuelo(POS.DE_PIE, ROL.ARRIBA, GEV.AVANZAR, 0).to === POS.CAIDO_LIBRE;
    })());
    check('desde ahi el de abajo puede levantarse (de ahi sale la levantada)', (() => {
        const r = resolverSuelo(POS.CAIDO_LIBRE, ROL.ABAJO, GEV.LEVANTAR, 0);
        return r.ok === true && r.to === POS.DE_PIE;
    })(), resolverSuelo(POS.CAIDO_LIBRE, ROL.ABAJO, GEV.LEVANTAR, 0));
    check('o cerrarse la guardia', (() => {
        const r = resolverSuelo(POS.CAIDO_LIBRE, ROL.ABAJO, GEV.ESCAPAR, 0);
        return r.ok === true && r.to === POS.GUARDIA_ABIERTA;
    })(), resolverSuelo(POS.CAIDO_LIBRE, ROL.ABAJO, GEV.ESCAPAR, 0));
    check('y el de arriba puede castigarle o subirse encima', (() => {
        return puedeCastigar(POS.CAIDO_LIBRE, P.ZONA.CABEZA).ok === true &&
               resolverSuelo(POS.CAIDO_LIBRE, ROL.ARRIBA, GEV.AVANZAR, 0).to === POS.GUARDIA_ABIERTA;
    })());
    check('y al que no se le puede cerrar elMale la ventana en un frame', (() => {
        // La ventana de CAIDO_LIBRE es generosa (45) a proposito: es el sitio
        // donde el de abajo tiene mas margen, y de ahi salio el fallo de que
        // levantarse no tenia sentido en ninguna parte.
        return ventanaDe(POS.CAIDO_LIBRE) >= 40;
    })(), ventanaDe(POS.CAIDO_LIBRE));
}

check('un evento que no existe tampoco revienta', (() => {
    const r = resolverSuelo(POS.MONTEJA, ROL.ARRIBA, 'EVENTO_FANTASMA', 0);
    return r.ok === false && r.motivo === MOTIVO.SIN_SALIDA;
})());

// ===========================================================================
section('2. La escalera NO es una lista ordenada');
// ===========================================================================

check('el rango va de 0 (de pie) a 12 (espalda con gancho)', (() => {
    const r = porRango();
    return rangoDe(r[0]) === 0 && rangoDe(r[r.length - 1]) === 12;
})(), porRango().map(p => [p, rangoDe(p)]));
check('los rangos son 0..12 sin huecos ni repeticiones', (() => {
    const rs = porRango().map(rangoDe);
    return rs.length === 13 && rs.every((v, i) => v === i);
})(), porRango().map(rangoDe));
check('el peligro va de 0 a 10 a lo largo de la escalera', (() => {
    const r = porPeligro();
    return peligroDe(r[0]) === 0 && peligroDe(r[r.length - 1]) === 10;
})(), porPeligro().map(p => [p, peligroDe(p)]));

check('el mas peligroso para el de abajo es la espalda con gancho',
    porPeligro()[porPeligro().length - 1] === POS.ESPALDA_GANCHO);
check('la monteja esta en la zona alta', peligroDe(POS.MONTEJA) >= 9);
check('la guardia cerrada es MAS SEGURA que la abierta', (() => {
    return peligroDe(POS.GUARDIA_CERRADA) < peligroDe(POS.GUARDIA_ABIERTA);
})(), { cerrada: peligroDe(POS.GUARDIA_CERRADA), abierta: peligroDe(POS.GUARDIA_ABIERTA) });

check('pero la guardia cerrada es la que MAS ATARRA al de arriba', (() => {
    return presionDe(POS.GUARDIA_CERRADA) > presionDe(POS.GUARDIA_ABIERTA);
})(), { cerrada: presionDe(POS.GUARDIA_CERRADA), abierta: presionDe(POS.GUARDIA_ABIERTA) });

check('la tortuga es segura pero no hace nada', (() => {
    return peligroDe(POS.TORTUGA) <= 2 && presionDe(POS.TORTUGA) >= 6;
})(), { peligro: peligroDe(POS.TORTUGA), presion: presionDe(POS.TORTUGA) });

check('la montaja no ata a nadie', presionDe(POS.MONTEJA) === 0);
check('desde la montaja SI se puede castigar a la cabeza (es de lo mejor que hay)',
    puedeCastigar(POS.MONTEJA, 'CABEZA').ok === true);
check('la que no se puede castigar de nada es la tortuga', puedeCastigar(POS.TORTUGA, 'CABEZA').ok === false);

{
    // El punto del modelo en una sola comprobacion: NO existe un total unico
    // de "mejor posicion", porque depende de quien seas. Si algun dia alguien
    // añade `esMejor()` con un solo numero, esta comprobacion lo delata.
    const cerrada = info(POS.GUARDIA_CERRADA);
    const monteja = info(POS.MONTEJA);
    check('no hay ninguna posicion que sea buena para los dos a la vez', (() => {
        // buena para el de arriba = poca presion
        // buena para el de abajo = poco peligro
        return !(cerrada.presion <= 5 && cerrada.peligro <= 2) &&
               !(monteja.presion <= 5 && monteja.peligro <= 2);
    })(), { cerrada: { p: cerrada.peligro, pr: cerrada.presion }, monteja: { p: monteja.peligro, pr: monteja.presion } });
}

check('esPeor compara por peligro', esPeor(POS.ESPALDA_GANCHO, POS.MONTEJA) === true);
check('y da falso al reves', esPeor(POS.MONTEJA, POS.ESPALDA_GANCHO) === false);
check('esPeor no miente cuando son la misma', esPeor(POS.MONTEJA, POS.MONTEJA) === false);
check('porPeligro() no devuelve la tabla de dentro (si la ordenas, la rompes)', (() => {
    const a = porPeligro();
    a.push('BASURA');
    return porPeligro().indexOf('BASURA') === -1 && POSICIONES.length === 13;
})());

// ===========================================================================
section('3. La ventana de escape');
// ===========================================================================

check('la ventana se acorta conforme sube el peligro', (() => {
    // De las posiciones con ventana, cuando mas peligroso mas corta.
    const conVentana = POSICIONES.filter(p => ventanaDe(p) > 0);
    for (let i = 1; i < conVentana.length; i++) {
        const a = conVentana[i - 1], b = conVentana[i];
        if (peligroDe(b) > peligroDe(a) && ventanaDe(b) > ventanaDe(a)) return false;
    }
    return true;
})(), POSICIONES.filter(p => ventanaDe(p) > 0).map(p => [p, peligroDe(p), ventanaDe(p)]));

check('la espalda con gancho no tiene ventana: se ha acabado', ventanaDe(POS.ESPALDA_GANCHO) === 0);
check('la montaja tiene menos ventana que el control lateral',
    ventanaDe(POS.MONTEJA) < ventanaDe(POS.CONTROL_LATERAL));
check('la tortuga no tiene ventana (la ha elegido el)', ventanaDe(POS.TORTUGA) === 0);

{
    // LA PRUEBA DE FUEGO: dentro de la ventana se sale, fuera no. Y el motivo
    // tiene que ser el correcto, porque es lo que se enseña en el HUD.
    const dentro = resolverSuelo(POS.CONTROL_LATERAL, ROL.ABAJO, GEV.REVERSAR, 0);
    check('con la ventana abierta se puede invertir', dentro.ok === true, dentro);
    check('y se dice cuanto queda', dentro.ventanaRestante === ventanaDe(POS.CONTROL_LATERAL), dentro.ventanaRestante);

    const justo = resolverSuelo(POS.CONTROL_LATERAL, ROL.ABAJO, GEV.REVERSAR, ventanaDe(POS.CONTROL_LATERAL) - 1);
    check('un frame antes de que cierre todavia se puede', justo.ok === true, justo);

    const fuera = resolverSuelo(POS.CONTROL_LATERAL, ROL.ABAJO, GEV.REVERSAR, ventanaDe(POS.CONTROL_LATERAL));
    check('un frame despues ya no', fuera.ok === false, fuera);
    check('y el motivo dice FUERA DE VENTANA', fuera.motivo === MOTIVO.FUERA_DE_VENTANA, fuera.motivo);

    const muyFuera = resolverSuelo(POS.CONTROL_LATERAL, ROL.ABAJO, GEV.REVERSAR, 9999);
    check('y sigue fuera dentro de mil frames', muyFuera.ok === false);
}

{
    // De la montaja no hay inversion, pero eso NO es "fuera de ventana": es que
    // la jugada no existe. Son dos fallos distintos y hay que distinguirlos.
    const r = resolverSuelo(POS.MONTEJA, ROL.ABAJO, GEV.REVERSAR, 0);
    check('desde la montaja no hay inversion porque no existe, no por la ventana',
        r.ok === false && r.motivo === MOTIVO.SIN_SALIDA, r);
}

{
    // El de arriba NO tiene ventana: puede avanzar cuando le apetezca. Si se
    // le aplicara la suya, la ventana le frenaria a el y no al de abajo.
    const r = resolverSuelo(POS.MONTEJA, ROL.ARRIBA, GEV.AVANZAR, 0);
    check('el de arriba avanza sin que le cuentan los frames', r.ok === true, r);
}

{
    // Y el de abajo puede ROSCARSE siempre, se llame como se llame: enroscarse
    // no es salir de nada, es cambiar a cubierto.
    const tardio = resolverSuelo(POS.MONTEJA, ROL.ABAJO, GEV.GUARDAR, 500);
    check('montado hace rato, aun se puede enroscarse', tardio.ok === true, tardio);
    check('y enroscarse lleva a la tortuga', tardio.to === POS.TORTUGA, tardio);
    check('pero desde la espalda con gancho NO (es el final)', (() => {
        const r = resolverSuelo(POS.ESPALDA_GANCHO, ROL.ABAJO, GEV.GUARDAR, 0);
        return r.ok === false && r.motivo === MOTIVO.SIN_SALIDA;
    })());
}

check('estaEnPeligro avisa de la montaja', estaEnPeligro(POS.MONTEJA, 0) === true);
check('estaEnPeligro NO avisa de la guardia cerrada aunque se acabe la ventana', estaEnPeligro(POS.GUARDIA_CERRADA, 999) === false);
check('porque el de arriba esta atrapado: perder la salida no es perder el suelo', presionDe(POS.GUARDIA_CERRADA) >= 7);
check('estaEnPeligro SI avisa si se acaba la ventana y el de arriba esta suelto', (() => {
    return estaEnPeligro(POS.MEDIA_GUARDIA, ventanaDe(POS.MEDIA_GUARDIA)) === true;
})());
check('estaEnPeligro avisa cuando se acaba la ventana', estaEnPeligro(POS.CONTROL_LATERAL, ventanaDe(POS.CONTROL_LATERAL)) === true);
check('estaEnPeligro de lo que no existe es false', estaEnPeligro('NO_EXISTE', 0) === false);

// ===========================================================================
section('4. Los roles no se mezclan');
// ===========================================================================

check('el de arriba no puede escapar', (() => {
    const r = resolverSuelo(POS.MONTEJA, ROL.ARRIBA, GEV.ESCAPAR, 0);
    return r.ok === false && r.motivo === MOTIVO.ROL_INCORRECTO;
})());
check('el de abajo no puede avanzar', (() => {
    const r = resolverSuelo(POS.MONTEJA, ROL.ABAJO, GEV.AVANZAR, 0);
    return r.ok === false && r.motivo === MOTIVO.ROL_INCORRECTO;
})());
check('el de abajo no puede retirarse', (() => {
    const r = resolverSuelo(POS.MONTEJA, ROL.ABAJO, GEV.RETIRAR, 0);
    return r.ok === false && r.motivo === MOTIVO.ROL_INCORRECTO;
})());
check('otroRol da la vuelta', otroRol(ROL.ARRIBA) === ROL.ABAJO && otroRol(ROL.ABAJO) === ROL.ARRIBA);
check('los roles son los mismos que los del agarre (SPF.GrappleRole)', (() => {
    // Si esto deja de ser cierto, el suelo y el agarre habran dejado de
    // entenderse y habra que traducir el papel en dos sitios.
    return ROL.ARRIBA === 'TORI' && ROL.ABAJO === 'UKE';
})());

{
    // LA INVERSION da la vuelta el papel. Es lo unico que lo hace.
    const r = resolverSuelo(POS.MEDIA_GUARDIA, ROL.ABAJO, GEV.REVERSAR, 0);
    check('invertir pone al de abajo de arriba', r.ok === true && r.rol === ROL.ARRIBA, r);
    const normal = resolverSuelo(POS.MEDIA_GUARDIA, ROL.ARRIBA, GEV.AVANZAR, 0);
    check('avanzar NO cambia el rol', normal.ok === true && normal.rol === ROL.ARRIBA, normal);
    const esc = resolverSuelo(POS.CONTROL_LATERAL, ROL.ABAJO, GEV.ESCAPAR, 0);
    check('escapar tampoco cambia el rol', esc.ok === true && esc.rol === ROL.ABAJO, esc);
}

{
    // El coste de cada tipo de jugada. Si todos costaran lo mismo, el jugador
    // no tendria que decidir nada: solo repetir.
    const r = resolverSuelo(POS.MEDIA_GUARDIA, ROL.ARRIBA, GEV.AVANZAR, 0);
    const inv = resolverSuelo(POS.MEDIA_GUARDIA, ROL.ABAJO, GEV.REVERSAR, 0);
    const ros = resolverSuelo(POS.MEDIA_GUARDIA, ROL.ABAJO, GEV.GUARDAR, 0);
    check('la inversion es lo mas caro', inv.frames > r.frames && inv.frames > ros.frames,
        { avanzar: r.frames, invertir: inv.frames, roscar: ros.frames });
    check('enroscarse es lo mas barato', ros.frames < r.frames);
    check('toda jugada legal dura algo', [r, inv, ros].every(x => x.frames > 0));
}

{
    // El resultado dice cuanto peor (o mejor) queda el de abajo. Sin eso el
    // motor no puede decidir si vale la pena, y el numero se pierde.
    const r = resolverSuelo(POS.CONTROL_LATERAL, ROL.ARRIBA, GEV.AVANZAR, 0);
    check('el resultado dice el peligro antes y despues',
        r.peligroAntes === peligroDe(POS.CONTROL_LATERAL) && typeof r.peligroDespues === 'number', r);
    check('subir es peor para el de abajo', r.peligroDespues > r.peligroAntes, r);
    const baja = resolverSuelo(POS.MONTEJA, ROL.ARRIBA, GEV.RETIRAR, 0);
    check('retirarse es mejor para el de abajo', baja.peligroDespues < baja.peligroAntes, baja);
}

// ===========================================================================
section('5. Se llega a todas partes y no hay posiciones muertas');
// ===========================================================================

{
    // Recorrido en anchura: desde la guardia abierta, ¿se puede terminar el
    // suelo sin pasar por una posicion sin salida?
    const vistos = new Set();
    const cola = [POS.DE_PIE];
    while (cola.length) {
        const actual = cola.shift();
        if (vistos.has(actual)) continue;
        vistos.add(actual);
        const i = info(actual);
        for (const k of ['sube', 'baja', 'escapa', 'invierte', 'rosca']) {
            for (const d of i[k]) if (!vistos.has(d)) cola.push(d);
        }
    }
    check('se llega a TODAS las posiciones desde los dos de pie', vistos.size === POSICIONES.length,
        { alcanzadas: vistos.size, total: POSICIONES.length, faltan: POSICIONES.filter(p => !vistos.has(p)) });
}

{
    // Y al reves: desde la mejor posicion, ¿se puede volver a los de pie?
    const vistos = new Set([POS.ESPALDA_GANCHO]);
    const cola = [POS.ESPALDA_GANCHO];
    while (cola.length) {
        const actual = cola.shift();
        const i = info(actual);
        for (const k of ['sube', 'baja', 'escapa', 'invierte', 'rosca']) {
            for (const d of i[k]) if (!vistos.has(d)) { vistos.add(d); cola.push(d); }
        }
    }
    check('desde el final del suelo se vuelve a la posicion neutra', vistos.has(POS.DE_PIE),
        [...vistos]);
}

check('ninguna posicion es un callejon sin salida para el de arriba', (() => {
    // Salvo el final, que es el final de proposito.
    return POSICIONES.filter(p => p !== POS.DE_PIE && p !== POS.ESPALDA_GANCHO)
        .every(p => info(p).sube.length > 0 || info(p).baja.length > 0);
})(), POSICIONES.filter(p => p !== POS.DE_PIE && p !== POS.ESPALDA_GANCHO)
    .filter(p => info(p).sube.length === 0 && info(p).baja.length === 0));

{
    // Subir NORMALMENTE es un paso, nunca un salto de varios escalones. Si una
    // posicion "subiera" directamente a la espalda con gancho, el modelo
    // dejaria de ser una escalera y se podria ganar el suelo de un salto.
    // El tope es 4 rangos, no 2, y hay una razon: de CONTROL_LATERAL a
    // ESPALDA hay una tecnica de un solo movimiento (el arrastre del brazo).
    // Lo que NO puede pasar es llegar a la ESPALDA CON GANCHO desde abajo: eso
    // seria ganar el suelo de un salto.
    const saltos = [];
    for (const p of POSICIONES) {
        const i = info(p);
        for (const d of i.sube) {
            const salto = rangoDe(d) - rangoDe(p);
            if (salto > 4) saltos.push(p + ' -> ' + d + ' (+' + salto + ')');
        }
    }
    check('subir nunca salta mas de cuatro rangos', saltos.length === 0, saltos);
    check('y de pie no se llega mas alla de la guardia cerrada', (() => {
        return info(POS.DE_PIE).sube.every(d => rangoDe(d) <= 2);
    })(), info(POS.DE_PIE).sube);
}

{
    // Un destino tiene que existir de verdad. Si la tabla se queda a medias y
    // pone un nombre que no esta, el motor mete al peleador en un estado
    // fantasma y no se ve hasta tres frames despues.
    let malos = [];
    for (const p of POSICIONES) {
        const i = info(p);
        for (const k of ['sube', 'baja', 'escapa', 'invierte', 'rosca']) {
            for (const d of i[k]) if (!info(d)) malos.push(p + '.' + k + '->' + d);
        }
    }
    check('ningun destino apunta a una posicion inexistente', malos.length === 0, malos);
}

{
    // Y las zonas de castigo que declara cada posicion tienen que existir.
    let malos = [];
    const zonas = Object.keys(P.ZONA).map(k => P.ZONA[k]);
    for (const p of POSICIONES) for (const z of info(p).ataca) if (zonas.indexOf(z) === -1) malos.push(p + ':' + z);
    check('ninguna posicion ataca una zona que no existe', malos.length === 0, malos);
}

{
    // Y las sumisiones que declara tienen que existir en punish.js.
    let malos = [];
    const sums = Object.keys(SUM);
    for (const p of POSICIONES) for (const s of info(p).sumision) if (sums.indexOf(s) === -1) malos.push(p + ':' + s);
    check('ninguna posicion ofrece una sumision inexistente', malos.length === 0, malos);
    check('y la lista que devuelve sumisionesDe es una COPIA',
        (() => { const a = sumisionesDe(POS.MONTEJA); a.push('BASURA'); return sumisionesDe(POS.MONTEJA).indexOf('BASURA') === -1; })());
}

// ===========================================================================
section('6. La aproximacion al suelo');
// ===========================================================================

check('la tabla de acercamiento existe entera',
    Object.keys(ACERCAMIENTO).length === 3, Object.keys(ACERCAMIENTO));
check('con alcance 0 se usa lo mas corto (rodar)',
    mejorAcercamiento(0) === ACERCAMIENTO.RODAR);
check('con alcance corto sale el mas rapido de los que llegan', mejorAcercamiento(1.5) === ACERCAMIENTO.DESLIZAR,
    { elegido: mejorAcercamiento(1.5).nombre });
check('el elegido siempre es el mas rapido que ALCANZA el destino', (() => {
    for (const d of [0.5, 1.2, 1.8, 2.2, 2.9, 3.5]) {
        const elegido = mejorAcercamiento(d);
        const alcanzables = Object.values(ACERCAMIENTO).filter(a => a.alcance >= d);
        if (!alcanzables.length) continue;
        const min = Math.min(...alcanzables.map(a => a.frames));
        if (elegido.frames !== min) return false;
    }
    return true;
})());
check('el elegido siempre llega al alcance pedido', (() => {
    for (const d of [0.5, 1.2, 1.8, 2.2, 2.9, 3.5]) {
        const a = mejorAcercamiento(d);
        if (d > 0 && a.alcance < d && a !== ACERCAMIENTO.RODAR) return false;
    }
    return true;
})());
check('el deslizamiento es lo mas rapido', ACERCAMIENTO.DESLIZAR.frames < ACERCAMIENTO.RODAR.frames);
check('y llega mas lejos que correr', ACERCAMIENTO.DESLIZAR.alcance > ACERCAMIENTO.CORRER.alcance);

// ===========================================================================
section('7. El castigo por zonas');
// ===========================================================================

check('los cuatro botones tienen castigo', Object.keys(BOTON).every(b => !!CASTIGO[b]),
    Object.keys(BOTON).filter(b => !CASTIGO[b]));
check('el ligero va a la cabeza', CASTIGO[BOTON.LIGERO].zona === 'CABEZA');
check('el pesado va a las costillas (el remate del spec)', CASTIGO[BOTON.PESADO].zona === 'COSTILLAS');
check('el pesado gira la espalda', CASTIGO[BOTON.PESADO].hacia === POS.ESPALDA);
check('el ligero NO gira (por eso hace mas dano por golpe)', CASTIGO[BOTON.LIGERO].giro === 0);
check('el de guardia frena: gira negativo', CASTIGO[BOTON.GUARDIA].giro < 0);

check('todo castigo cuesta energia', Object.values(CASTIGO).every(c => c.stamina > 0));
check('todo castigo tarda algo', Object.values(CASTIGO).every(c => c.frames > 0));

{
    const c = castigoDe(POS.CONTROL_LATERAL, BOTON.PESADO);
    check('se puede castigar a las costillas en control lateral', c.ok === true, c);
    check('y devuelve los numeros', c.dano > 0 && c.stamina > 0 && c.frames > 0, c);

    const fuera = castigoDe(POS.DE_PIE, BOTON.PESADO);
    check('de pie no se puede castigar a nadie', fuera.ok === false, fuera);
    check('y el motivo es que no hay nadie arriba', fuera.motivo === 'NO_HAY_ARRIBA', fuera.motivo);

    const atrapado = castigoDe(POS.GUARDIA_CERRADA, BOTON.LIGERO);
    check('con el de arriba atrapado no se puede castigar', atrapado.ok === false, atrapado);
    check('y el motivo es ATRAPADO, no "zona inalcanzable"', atrapado.motivo === 'ATRAPADO', atrapado.motivo);

    const lejos = castigoDe(POS.TORTUGA, BOTON.PESADO);
    check('la tortuga no se puede castigar', lejos.ok === false && lejos.motivo === 'ZONA_NO_ALCANZABLE', lejos);

    const fantasma = castigoDe(POS.MONTEJA, 'BOTON_FANTASMA');
    check('un boton que no existe se contesta, no revienta',
        fantasma.ok === false && fantasma.motivo === 'BOTON_DESCONOCIDO', fantasma);
}

{
    // LAS COSTILLAS GIRAN LA ESPALDA. Este es el remate del spec y el motivo
    // de que el sistema sea posicional y no un peleon de golpes con el rival
    // tumbado.
    let giro = 0;
    const traza = [];
    for (let i = 0; i < GIRO_NECESARIO.ESPALDA; i++) {
        const r = resolverGiro(POS.CONTROL_LATERAL, BOTON.PESADO, giro);
        giro = r.giro;
        traza.push(r);
    }
    check('al tercer golpe a las costillas la espalda esta girada',
        traza[traza.length - 1].completo === true, traza.map(r => r.giro));
    check('y lleva a ESPALDA', traza[traza.length - 1].hacia === POS.ESPALDA);
    check('antes del tercero todavia no', traza[0].completo === false && traza[1].completo === false);
    check('el giro va de uno en uno', traza.map(r => r.giro).join(',') === '1,2,3', traza.map(r => r.giro));
}

{
    // EL FRENO. Sin esto, el de abajo solo tiene una salida y el suelo es una
    // cuenta atras.
    const conFreno = resolverGiro(POS.CONTROL_LATERAL, BOTON.GUARDIA, 2);
    check('el boton de guardia quita un golpe de giro', conFreno.giro === 1, conFreno);
    const nuncaNegativo = resolverGiro(POS.CONTROL_LATERAL, BOTON.GUARDIA, 0);
    check('el giro no baja de cero', nuncaNegativo.giro === 0, nuncaNegativo);

    // Y frenando a tiempo se puede evitar entrar en la espalda.
    let giro = 0;
    for (const b of [BOTON.PESADO, BOTON.GUARDIA, BOTON.PESADO, BOTON.GUARDIA, BOTON.PESADO]) {
        giro = resolverGiro(POS.CONTROL_LATERAL, b, giro).giro;
    }
    check('frenando y golpeando se puede dejar el giro a medias', giro < GIRO_NECESARIO.ESPALDA, giro);
}

{
    // El giro NO avanza si el golpe no se puede dar: si estas en tortuga y le
    // das al pesado, el giro tiene que quedarse igual, no contar un golpe que
    // no ha existido.
    const r = resolverGiro(POS.TORTUGA, BOTON.PESADO, 2);
    check('un golpe que no sale no cuenta para el giro', r.giro === 2 && r.ok === false, r);
}

check('el giro se puede perder desde el principio de la pelea', (() => {
    const r = resolverGiro(POS.CONTROL_LATERAL, BOTON.PESADO, 0);
    return r.giro === 1 && r.completo === false;
})());

// ===========================================================================
section('8. Las sumisiones');
// ===========================================================================

{
    const s = sumisionDe(POS.MONTEJA);
    check('desde la monteja hay sumision', s.ok === true, s);
    check('y es la mas rapida de las disponibles, no la primera de la lista', (() => {
        const disp = info(POS.MONTEJA).sumision;
        const min = Math.min(...disp.map(k => SUM[k].frames));
        return s.sumision.frames === min;
    })(), { elegida: s.sumision && s.sumision.clave, disponibles: info(POS.MONTEJA).sumision });
    check('la sumision entrega si se completa', s.entrega === true);
    check('tiene aviso antes de rematar', s.aviso > 0);
    check('cuesta energia', s.stamina > 0);

    const guardiaCerrada = sumisionDe(POS.GUARDIA_CERRADA);
    check('con el de arriba atrapado no hay sumision',
        guardiaCerrada.ok === false && guardiaCerrada.motivo === 'SIN_SUMISION_AQUI', guardiaCerrada);

    const dePie = sumisionDe(POS.DE_PIE);
    check('de pie tampoco', dePie.ok === false && dePie.motivo === 'NO_HAY_ARRIBA');

    const sinStamina = sumisionDe(POS.MONTEJA, 1);
    check('sin energia el motivo es SIN_STAMINA, no "no hay sumision"', (() => {
        return sinStamina.ok === false && sinStamina.motivo === 'SIN_STAMINA';
    })(), sinStamina);
    check('y dice CUALES habia, para que se vea que es falta de energia',
        Array.isArray(sinStamina.disponibles) && sinStamina.disponibles.length > 0, sinStamina);

    const fantasma = sumisionDe('NO_EXISTE');
    check('una posicion inventada no rompe sumisionDe', fantasma.ok === false);
}

check('cada sumision se ofrece solo desde posiciones donde tiene sentido', (() => {
    // Si una sumision aparece en una posicion que no esta en su `desde`, es
    // que alguien ha metido una sumision nueva en la tabla de posiciones sin
    // darla de alta aqui (o al reves). Son las dos mitades de lo mismo.
    for (const k of Object.keys(SUM)) {
        const s = SUM[k];
        for (const p of POSICIONES) {
            const declarada = info(p).sumision.indexOf(k) !== -1;
            const permitida = s.desde.indexOf(p) !== -1;
            if (declarada !== permitida) return false;
        }
    }
    return true;
})(), (() => {
    const malos = [];
    for (const k of Object.keys(SUM)) {
        const s = SUM[k];
        for (const p of POSICIONES) {
            const declarada = info(p).sumision.indexOf(k) !== -1;
            const permitida = s.desde.indexOf(p) !== -1;
            if (declarada !== permitida) malos.push(k + '@' + p);
        }
    }
    return malos;
})());

check('cada sumision cuesta energia y tarda frames', Object.values(SUM).every(s => s.stamina > 0 && s.frames > 0));
check('cada sumision avisa antes de rematar', Object.values(SUM).every(s => s.aviso > 0 && s.aviso < s.frames));
check('cada sumision remata', Object.values(SUM).every(s => s.resultado.entrega === true));

{
    const p = proyeccionDe(POS.CONTROL_LATERAL);
    check('desde el control lateral hay proyeccion', p.ok === true, p);
    check('y lleva a la montaja', p.llevaA === POS.MONTEJA, p);
    const ninguna = proyeccionDe(POS.ESPALDA_GANCHO);
    check('desde la espalda con gancho no hay proyeccion', ninguna.ok === false);
    check('desde la guardia cerrada si (la pasada es la salida de ahi)', proyeccionDe(POS.GUARDIA_CERRADA).ok === true);
    check('pero de pie no hay proyeccion', proyeccionDe(POS.DE_PIE).ok === false);
    check('ni en la tortuga', proyeccionDe(POS.TORTUGA).ok === false);
}

{
    const remate = posicionesDeRemate();
    check('el remate son las posiciones muy peligrosas', remate.length >= 5, remate);
    check('y ninguna se puede escapar', remate.every(p => ventanaDe(p) <= 20), remate);
    check('la guardia no esta en la lista de remate', remate.indexOf(POS.GUARDIA_CERRADA) === -1);
    check('el control lateral no esta (se puede revertir)', remate.indexOf(POS.CONTROL_LATERAL) === -1);
}

// ===========================================================================
section('9. Un suelo entero');
// ===========================================================================

{
    // Se juega un suelo completo de principio a fin, un boton cada vez, y se
    // mira que pase lo que tiene que pasar: se llega al remate, y desde el
    // remate no se sale.
    let pos = POS.DE_PIE;
    let rol = ROL.ARRIBA;
    let girando = 0;
    const traza = [pos];
    const guion = [
        // El de arriba pasa la guardia
        [ROL.ARRIBA, GEV.AVANZAR], [ROL.ARRIBA, GEV.AVANZAR], [ROL.ARRIBA, GEV.AVANZAR],
        // y se instala en el control lateral
        [ROL.ARRIBA, GEV.AVANZAR],
        // el de abajo intenta una vez y se queda sin ventana
        [ROL.ABAJO, GEV.REVERSAR], [ROL.ABAJO, GEV.REVERSAR],
        // el de arriba castiga hasta girar la espalda
        [ROL.ARRIBA, 'CASTIGO'], [ROL.ARRIBA, 'CASTIGO'], [ROL.ARRIBA, 'CASTIGO'],
        [ROL.ARRIBA, 'CASTIGO']
    ];

    for (const [quien, ev] of guion) {
        if (ev === 'CASTIGO') {
            const g = resolverGiro(pos, BOTON.PESADO, girando);
            girando = g.giro;
            if (g.completo && g.hacia) { pos = g.hacia; traza.push(pos); girando = 0; }
            continue;
        }
        const dentroDeVentana = Math.max(0, ventanaDe(pos) - 5);
        const r = resolverSuelo(pos, quien, ev, dentroDeVentana);
        if (r.ok) { pos = r.to; rol = r.rol; traza.push(pos); }
    }

    check('el suelo termina en ESPALDA', pos === POS.ESPALDA, { pos, traza });
    check('y el camino tiene que SUBIR POR LA ESCALERA, no por el peligro', (() => {
        // Y no tiene que ser monotonico en peligro, y hay una razon: PASADO es
        // un pico a proposito (peligro 7, mas que el control lateral que viene
        // justo despues). Es el momento en que el de arriba se ha comprometido
        // y el de abajo tiene su mejor oportunidad. Medido por rango si;
        // medido por peligro no, y un test que lo exigiera estaria
        // prohibiendo el diseño entero.
        for (let i = 1; i < traza.length; i++) if (rangoDe(traza[i]) < rangoDe(traza[i - 1])) return false;
        return true;
    })(), traza.map(p => [p, rangoDe(p)]));
    check('y el pico de peligro es el PASADO, a proposito', peligroDe(POS.PASADO) > peligroDe(POS.CONTROL_LATERAL),
        { pasado: peligroDe(POS.PASADO), lateral: peligroDe(POS.CONTROL_LATERAL) });

    check('aqui el de abajo AUN puede rodar: es la espalda SIN gancho', (() => {
        const r = resolverSuelo(pos, ROL.ABAJO, GEV.REVERSAR, 0);
        return r.ok === true && r.to === POS.DE_PIE;
    })(), resolverSuelo(pos, ROL.ABAJO, GEV.REVERSAR, 0));
    check('el gancho es lo que lo cierra: con gancho no hay inversion', (() => {
        const r = resolverSuelo(POS.ESPALDA_GANCHO, ROL.ABAJO, GEV.REVERSAR, 0);
        return r.ok === false && r.motivo === MOTIVO.SIN_SALIDA;
    })(), resolverSuelo(POS.ESPALDA_GANCHO, ROL.ABAJO, GEV.REVERSAR, 0));
    check('y la diferencia entre ambas es justo el gancho', (() => {
        return info(POS.ESPALDA).invierte.length > 0 && info(POS.ESPALDA_GANCHO).invierte.length === 0;
    })());
    check('el de arriba solo tiene un paso mas: el gancho final', (() => {
        const r = resolverSuelo(POS.ESPALDA, ROL.ARRIBA, GEV.AVANZAR, 0);
        return r.ok === true && r.to === POS.ESPALDA_GANCHO;
    })(), resolverSuelo(POS.ESPALDA, ROL.ARRIBA, GEV.AVANZAR, 0));
    check('y desde ahi ya no hay nada', resolverSuelo(POS.ESPALDA_GANCHO, ROL.ARRIBA, GEV.AVANZAR, 0).ok === false);
    check('pero si hay a donde refugiarse de una sumision', (() => {
        const s = sumisionDe(pos);
        return s.ok === true && s.entrega === true;
    })(), sumisionDe(pos));
}

{
    // Y el suelo al reves: el de abajo se escapes y se levanta. Es la otra
    // mitad del sistema y no puede fallar.
    let pos = POS.ESPALDA;             // espalda SIN gancho: hay inversion
    let f = 0;
    const inv = resolverSuelo(pos, ROL.ABAJO, GEV.REVERSAR, f);
    check('de la espalda sin gancho se puede rodar y ponerse de pie', inv.ok === true, inv);
    check('y se llega a los dos de pie', inv.to === POS.DE_PIE, inv);

    const conGancho = resolverSuelo(POS.ESPALDA_GANCHO, ROL.ABAJO, GEV.REVERSAR, 0);
    check('de la espalda CON gancho ya no se puede', conGancho.ok === false);
}

// ===========================================================================
console.log('\n================================================================');
console.log(`ground: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);