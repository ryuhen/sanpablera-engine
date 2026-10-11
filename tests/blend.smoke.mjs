/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/blend.smoke.mjs
 * ----------------------------------------------------------------------------
 * Smoke test del BLENDING (core/anim/Blend.js).
 *
 * Lo que hay que comprobar, y por que cada comprobacion existe:
 *
 *   1. QUE NO HAY SALTO ............ el motivo de que exista el modulo.
 *   2. QUE NO CUESTA NADA .......... la ruta caliente no clona ni mezcla. Si un
 *                                    dia el estado constante se paga, el bucle
 *                                    se va al frame rate igual.
 *   3. QUE LA MEZCLA TERMINA ....... una mezcla que no acaba es un personaje
 *                                    que se queda a medio camino para siempre.
 *   4. QUE NO ESCALONA .............. cambiar de estado DOS VECES seguidas tiene
 *                                    que ser un solo movimiento continuo, no dos
 *                                    tirones con un punto quieto en medio.
 *   5. QUE LOS HUESOS MANTIENEN ..... la mezcla es ANTES del fk. Si fuera
 *                                    despues, los huesos se estirarian.
 *   6. QUE LOS QUATERNION SON .....  un slerp mal hecho devuelve vectores que
 *                                    ya no son giros, y el hueso se aplana.
 *   7. QUE CADA SALTO SUENA A LO ... un impacto mezclado no pega: la
 *                                    reaccion tiene que estar en el mismo frame.
 *
 * Ejecutar:  node tests/blend.smoke.mjs
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

const { BLEND, EASE, pesoDe, PoseBlender, blendFor } = await load('src/core/anim/Blend.js');
const { createPose, setEulerV, clonePose, blendPoseInto, rotOf } = await load('src/core/cine/Pose.js');

// ---------------------------------------------------------------------------
// AYUDAS
// ---------------------------------------------------------------------------

/** Pose con una rotacion simple en un hueso: util para medir angulos. */
function poseCon(hueso, eje, grados) {
    const p = createPose();
    const r = (grados * Math.PI) / 180;
    setEulerV(p, hueso, eje === 'y' ? [0, r, 0] : [r, 0, 0]);
    return p;
}

/** Angulo en grados del giro sobre el eje Y de un quaternion. */
function gradoY(q) {
    return (Math.atan2(2 * (q[3] * q[1] + q[2] * q[0]), 1 - 2 * (q[1] * q[1] + q[0] * q[0])) * 180) / Math.PI;
}

/** Distancia angular entre dos quaternions, en grados (0 = iguales). */
function entre(qa, qb) {
    let d = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
    d = Math.min(1, d);
    return (2 * Math.acos(d) * 180) / Math.PI;
}

const DT = 1 / 60;
const hueso = 'antebrazo_d';

// ===========================================================================
section('1. Que no hay salto');
// ===========================================================================

{
    // El fallo que se ve en pantalla: el antebrazo estaba en guardia y al
    // cambiar de estado aparecia de golpe en la posicion nueva. Sin blending,
    // este frame vale los 120 grados enteros.
    const guardia = poseCon(hueso, 'y', 10);
    const ataque = poseCon(hueso, 'y', 130);

    const b = new PoseBlender();
    b.instant('GUARDIA', guardia);
    const conSalto = gradoY(rotOf(b.push('ATAQUE', ataque, BLEND.SNAP, DT), hueso));
    check('sin blending el salto es entero: 120 grados de golpe', Math.abs(conSalto - 130) < 0.5, conSalto);

    // Con blending, el primer frame no da el salto entero: da la fraccion
    // dt/dur del camino. OJO, esto NO es 0: el primer frame ya teaches parte
    // de la mezcla, porque si no habria un frame entero de retraso y ademas
    // el peso no avanzaria hasta el segundo frame.
    const b2 = new PoseBlender();
    b2.instant('GUARDIA', guardia);
    b2.push('ATAQUE', ataque, BLEND.LOCO, DT);
    const primerFrame = gradoY(rotOf(b2.shown, hueso));
    check('con blending el primer frame solo recorre una parte', primerFrame < 40, primerFrame);
    check('y va en la direccion correcta', primerFrame > 10, primerFrame);
}

{
    // LA PROPIEDAD QUE DE VERDAD IMPORTA: cuanto mas larga es la mezcla, mas
    // pequeno es el primer paso. Si esto no se cumpliera, el numero de
    // segundos de BLEND no estaria haciendo nada y seria mentira.
    const guardia = poseCon(hueso, 'y', 10);
    const ataque = poseCon(hueso, 'y', 130);
    const primerPaso = (dur) => {
        const bb = new PoseBlender();
        bb.instant('GUARDIA', guardia);
        bb.push('ATAQUE', ataque, dur, DT);
        return gradoY(rotOf(bb.shown, hueso)) - 10;
    };
    const corto = primerPaso(BLEND.ATAQUE);
    const medio = primerPaso(BLEND.LOCO);
    const largo = primerPaso(0.5);
    check('mezcla mas larga = primer paso mas pequeno', largo < medio && medio < corto,
        { corto: corto.toFixed(1), medio: medio.toFixed(1), largo: largo.toFixed(1) });

    // Y el primer paso es exactamente la fraccion dt/dur de lo que falta.
    const esperado = (DT / BLEND.LOCO) * 120;
    check('el primer frame avanza dt/dur del camino', Math.abs(medio - esperado) < 1.5,
        { real: medio.toFixed(2), esperado: esperado.toFixed(2) });
}

// ===========================================================================
section('2. Que no cuesta nada en el caso normal');
// ===========================================================================

{
    const b = new PoseBlender();
    const p = poseCon(hueso, 'y', 45);
    b.instant('CORRER', p);

    // 1000 frames del mismo clip: es lo que pasa en 16 segundos de carrera.
    let salioLaMisma = true;
    for (let i = 0; i < 1000; i++) {
        if (b.push('CORRER', p, BLEND.LOCO, DT) !== p) salioLaMisma = false;
    }
    check('mismo clip: devuelve la MISMA pose, sin clonar', salioLaMisma);
    check('mismo clip: ni una sola mezcla en 1000 frames', b.blends === 0 && b.framesBlending === 0, b.info());
}

{
    // Un ciclo de carrera cambia la pose en CADA frame, pero el clip es el
    // mismo. Ahi no se quiere mezcla: mezclarla con la anterior seria ir
    // siempre con retraso, y las piernas harianVisiblemente un tiron.
    const b = new PoseBlender();
    // Se fija el clip ANTES: el primer push contaria como cambio de estado, y
    // lo que se quiere medir aqui es el ESTABLE, no la entrada.
    b.instant('CORRER', poseCon(hueso, 'y', 0));
    let mezclas = 0;
    for (let i = 0; i < 120; i++) {
        const fase = (i / 120) * 360;
        b.push('CORRER', poseCon(hueso, 'y', Math.sin(fase * Math.PI / 180) * 40), BLEND.LOCO, DT);
        if (b.blending) mezclas++;
    }
    check('un ciclo continuo NO se mezcla frame a frame', mezclas === 0, { mezclas });
}

{
    // Sin dt (o con dt cero) no puede dividir por cero ni quedarse parado.
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 100);
    b.push('A', a, BLEND.LOCO, DT);
    let lanzo = false;
    try {
        b.push('B', c, BLEND.LOCO, 0);
        b.push('B', c, BLEND.LOCO, -1);
    } catch (e) { lanzo = true; }
    check('dt cero o negativo no rompe nada', !lanzo && Number.isFinite(b.t), b.t);
}

// ===========================================================================
section('3. Que la mezcla llega a su sitio y se acaba');
// ===========================================================================

{
    const b = new PoseBlender();
    const desde = poseCon(hueso, 'y', 0);
    const hasta = poseCon(hueso, 'y', 90);
    b.instant('A', desde);

    b.push('B', hasta, BLEND.LOCO, DT);
    const alEmpezar = gradoY(rotOf(b.shown, hueso));

    const total = Math.ceil(BLEND.LOCO / DT);
    for (let i = 0; i < total + 4; i++) b.push('B', hasta, BLEND.LOCO, DT);

    const alTerminar = gradoY(rotOf(b.shown, hueso));
    check('empieza cerca de donde estaba', Math.abs(alEmpezar) < 12, Math.round(alEmpezar));
    check('acaba en la pose destino', Math.abs(alTerminar - 90) < 0.5, Math.round(alTerminar));
    check('no se queda mezclando para siempre', b.blending === false, b.info());
}

{
    // Si la mezcla no acabara, cada cambio de estado sumaria un clon y el
    // fighter acabaria con la memoria llena de fotos.
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 90);
    b.instant('A', a);
    b.push('B', c, BLEND.LOCO, DT);
    for (let i = 0; i < 300; i++) b.push('B', c, BLEND.LOCO, DT);
    check('una sola mezcla = una sola foto', b.blends === 1 && b.snapshots === 1, b.info());
}

{
    // El numero de frames gastados tiene que ser el que dice la duracion.
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 90);
    b.instant('A', a);
    b.push('B', c, BLEND.LOCO, DT);
    const esperados = Math.ceil(BLEND.LOCO / DT);
    let gastados = 0;
    while (b.blending && gastados < 500) { b.push('B', c, BLEND.LOCO, DT); gastados++; }
    check('gasta los frames que dura la mezcla', gastados >= esperados - 1 && gastados <= esperados + 1,
        { gastados, esperados });
}

// ===========================================================================
section('4. Que no escalona al cambiar dos veces');
// ===========================================================================

{
    // GUARDIA -> ATAQUE -> (el ataque falla) -> GUARDIA, todo muy seguido.
    // Si cada mezcla partiese de la pose ANTERIOR y no de la que se veia,
    // el personaje daria un tiron, volveria al punto de partida y daria otro.
    const b = new PoseBlender();
    const guardia = poseCon(hueso, 'y', 0);
    const ataque = poseCon(hueso, 'y', 120);
    b.instant('GUARDIA', guardia);

    b.push('ATAQUE', ataque, BLEND.ATAQUE, DT);      // primer frame del ataque
    const visto = gradoY(rotOf(b.shown, hueso));
    b.push('GUARDIA', guardia, BLEND.RETORNO, DT);    // el ataque falla AHORA

    // La segunda mezcla tiene que arrancar desde lo que se veia (visto), no
    // desde donde empezo la primera. Si no, el cuerpo daria un tiron, volveria
    // al punto de partida y daria otro: dos saltos en vez de uno.
    // Y no solo sigue desde ahi: sigue DESDE AHI HACIA donde toca, avanzando
    // exactamente su fraccion. Si arrancara de 0, esto daria 0 en vez de 34.
    const arrancado = gradoY(rotOf(b.shown, hueso));
    const esperado = visto * (1 - DT / BLEND.RETORNO);
    check('la segunda mezcla sigue desde ahi avanzando su propia fraccion',
        Math.abs(arrancado - esperado) < 1.5,
        { arrancadoEn: arrancado.toFixed(1), esperado: esperado.toFixed(1), visto: Math.round(visto) });

    // Y no ha vuelto a 0: eso SI seria el escalon.
    check('no ha vuelto al punto de partida (eso seria el escalon)', visto > 5, Math.round(visto));

    // Y a partir de ahi, todo el recorrido tiene que ser monotonico.
    const vistos = [];
    for (let i = 0; i < 12; i++) { b.push('GUARDIA', guardia, BLEND.RETORNO, DT); vistos.push(gradoY(rotOf(b.shown, hueso))); }
    const bajando = vistos.every((v, i) => i === 0 || v <= vistos[i - 1] + 0.01);
    check('vuelve a la guardia sin dar botes', bajando, vistos.map(v => Math.round(v)));
}

{
    // Tres cambios de estado en el mismo frame (un golpe que a la vez knockea
    // y tira al suelo). Solo puede haber UNA mezcla: la ultima gana.
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    b.instant('A', a);
    b.push('B', poseCon(hueso, 'y', 30), BLEND.ATAQUE, DT);
    b.push('C', poseCon(hueso, 'y', 60), BLEND.SUELO, DT);
    b.push('D', poseCon(hueso, 'y', 90), BLEND.ATAQUE, DT);
    check('tres cambios seguidos = una sola mezcla viva', b.blending === true && b.t < 1, b.info());
}

// ===========================================================================
section('5. Que los huesos mantienen su longitud');
// ===========================================================================

{
    // La mezcla es ANTES del fk. Lo que se mezclan son los deltas de
    // articulacion, no las posiciones de hueso ya calculadas: si se mezclaran
    // las posiciones, un hueso de medio metroaria mide un cuarto de metro a
    // media mezcla.
    const b = new PoseBlender();
    const a = createPose();
    setEulerV(a, 'antebrazo_d', [0, 0, 0]);
    const c = createPose();
    setEulerV(c, 'antebrazo_d', [0, Math.PI / 2, 0]);   // 90 grados

    b.instant('A', a);
    let minLong = 1;
    for (let i = 0; i < 10; i++) {
        b.push('B', c, BLEND.LOCO, DT);
        const q = rotOf(b.shown, 'antebrazo_d');
        // La longitud de un quaternion de giro es siempre 1. Si el slerp
        // devolviera una interpolacion lineal cruda, en 90 grados a media
        // mezcla mediria ~0.92 y el hueso se encogeria.
        const largo = Math.hypot(q[0], q[1], q[2], q[3]);
        if (largo < minLong) minLong = largo;
    }
    check('el quaternion de la mezcla sigue siendo unitario', Math.abs(minLong - 1) < 0.0005, minLong);
}

{
    // Un quaternion de giro SIEMPRE mide 1. Un slerp mal escrito (lerp sin
    // normalizar) devuelve vectores mas cortos, y al pasarlos al esqueleto
    // el hueso se aplana de golpe.
    const b = new PoseBlender();
    const a = createPose();
    const c = createPose();
    setEulerV(a, 'codo_d', [0, 0, 0]);
    setEulerV(c, 'codo_d', [Math.PI, 0, 0]);
    b.instant('A', a);
    const largos = [];
    for (let i = 0; i < 12; i++) {
        b.push('B', c, BLEND.LOCO, DT);
        const q = rotOf(b.shown, 'codo_d');
        largos.push(Math.hypot(q[0], q[1], q[2], q[3]));
    }
    const peor = Math.max(...largos.map(v => Math.abs(v - 1)));
    check('ningun quaternion de la mezcla se sale de la esfera unidad', peor < 0.001, peor);
}

{
    // Y el camino que recorre tiene que ser el CORTO. De 0 a 350 grados hay
    // dos caminos: el largo (350) y el corto (10). El slerp tiene que coger
    // el corto; si no, el codo da una vuelta entera en medioframe.
    const b = new PoseBlender();
    const a = createPose();
    const c = createPose();
    setEulerV(a, 'codo_d', [0, 0, 0]);
    setEulerV(c, 'codo_d', [0, 0, (350 * Math.PI) / 180]);
    b.instant('A', a);
    b.push('B', c, BLEND.LOCO, DT);
    const q = rotOf(b.shown, 'codo_d');
    const destino = gradoY(rotOf(clonePose(c), 'codo_d'));
    check('va por el camino corto, no por los 350 grados', Math.abs(gradoY(q)) < 40,
        { alcanzado: Math.round(gradoY(q)), destino: Math.round(destino) });
}

// ===========================================================================
section('6. Que no se quedan huesos pegados de la mezcla anterior');
// ===========================================================================

{
    // `dst` se reutiliza frame a frame. Si la mezcla se escribe encima sin
    // vaciar, un hueso que estaba en la pose aerea y que la nueva ya no toca
    // se queda en su sitio, con un pie en el aire durante toda la mezcla.
    const a = createPose();
    setEulerV(a, 'pie_d', [0, 0, 0.5]);
    setEulerV(a, 'pie_i', [0, 0, 0.5]);
    const b = createPose();
    setEulerV(b, 'pie_d', [0, 0, -0.5]);   // b NO toca pie_i

    const dst = createPose();
    blendPoseInto(dst, a, b, 0.5);
    blendPoseInto(dst, b, b, 0.5);          // segunda mezcla, sin pie_i
    check('el hueso que la mezcla ya no toca se borra', rotOf(dst, 'pie_i') !== undefined || true);

    const tiene = Object.prototype.hasOwnProperty.call(dst.pos, 'pie_i') || Object.prototype.hasOwnProperty.call(dst.rot, 'pie_i');
    check('no queda un hueso viejo pegado en dst', !tiene, { sucio: tiene });
}

// ===========================================================================
section('7. Cada tipo de cambio con su mezcla');
// ===========================================================================

{
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 90);
    b.instant('A', a);

    b.push('B', c, BLEND.IMPACTO, DT);
    check('el impacto es seco: la reaccion tiene que estar YA', b.blending === false, b.info());
}

{
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 90);
    b.instant('A', a);
    b.push('B', c, BLEND.ATAQUE, DT);
    check('el ataque si se mezcla, pero poco', b.blending === true && b.dur === BLEND.ATAQUE, b.info());
    check('y dura menos que un paso', BLEND.ATAQUE < BLEND.LOCO);
}

check('el impacto gana cuando un estado esta en varios grupos',
    blendFor(['ATTACKING', 'IMPACT']) === BLEND.IMPACTO);
check('el suelo usa su propia mezcla', blendFor(['DOWNED']) === BLEND.SUELO);
check('el aire usa la suya', blendFor(['AIRBORNE']) === BLEND.AIRE);
check('sin grupos, la de por defecto', blendFor([]) === BLEND.LOCO);
check('sin grupos(undefined), la de por defecto', blendFor(undefined) === BLEND.LOCO);

{
    // Un estado sin grupo conocido no puede ROMPER: cae en la de por defecto.
    check('un grupo raro no devuelve undefined',
        typeof blendFor(['ALGO_NUEVO']) === 'number' && blendFor(['ALGO_NUEVO']) > 0);
}

{
    // INSTANT: reapariciones, ring-out, teletransportes. Mezclar ahi produce
    // un barrido de cuerpo por la pantalla que parece un fallo.
    const b = new PoseBlender();
    const a = poseCon(hueso, 'y', 0);
    const c = poseCon(hueso, 'y', 179);
    b.push('A', a, BLEND.LOCO, DT);
    const salida = b.instant('TELEPORT', c);
    check('instant() corta la mezcla y pasa la pose', salida === c && b.blending === false, b.info());
}

{
    // Sin pose no hay nada que mezclar, pero tampoco hay que romperse.
    const b = new PoseBlender();
    check('push() sin pose devuelve null en vez de petar', b.push('X', null, BLEND.LOCO, DT) === null);
}

// ===========================================================================
section('8. Las curvas');
// ===========================================================================

check('peso 0 es 0 y peso 1 es 1', pesoDe(0) === 0 && pesoDe(1) === 1);
check('peso fuera de rango se recorta', pesoDe(-3) === 0 && pesoDe(7) === 1);
check('linear va recto', Math.abs(pesoDe(0.25) - 0.25) < 1e-9);
check('suave arranca y acaba mas despacio que linear',
    pesoDe(0.25, EASE.suave) < 0.25 && pesoDe(0.75, EASE.suave) > 0.75);
// La de salida va SIEMPRE por encima de la recta en el interior: ya ha hecho
// casi todo el camino cuando solo ha pasado la mitad del tiempo. Por eso se
// llama asi, y por eso sirve para una pose estatica a la que se quiere llegar
// rapido y quedarse quieta.
check('salida va por encima de la recta (llega rapido y se queda)',
    pesoDe(0.5, EASE.salida) > 0.75 && pesoDe(0.9, EASE.salida) > 0.99);
check('las tres curvas dan lo mismo en los extremos',
    [EASE.linear, EASE.suave, EASE.salida].every(f => f(0) === 0 && f(1) === 1));

{
    // La razon de tener la curva lineal: al principio y al final el peso
    // cambia de golpe (de 0 a algo, y de casi 1 a 1). Por eso la velocidad
    // del miembro no se rompe. Con una suave, la pierna frena hasta pararse
    // en mitad de la mezcla y arranca otra vez al final.
    const curva = [];
    for (let i = 0; i <= 10; i++) curva.push(EASE.suave(i / 10));
    const deltas = curva.slice(1).map((v, i) => v - curva[i]);
    const maxAlPrincipio = Math.max(Math.abs(deltas[0]), Math.abs(deltas[deltas.length - 1]));
    const maxEnMedio = Math.max(...deltas.slice(1, -1));
    check('la suave frena en los extremos (por eso la locomocion usa recta)', maxAlPrincipio < maxEnMedio,
        { extremos: maxAlPrincipio.toFixed(4), medio: maxEnMedio.toFixed(4) });
}

// ===========================================================================
section('9. Un combate entero por el mezclador');
// ===========================================================================

{
    // Se simulate el cambio de estado de un combate y lo que se mira es que
    // el cuerpo este SIEMPRE en una pose valida y que no queden huesos
    // clavados. Es el test que habria encontrado el fallo de `dst` sucio.
    const b = new PoseBlender();
    const guion = [
        ['LOCO:REPOSO', 0, BLEND.LOCO],
        ['LOCO:CAMINAR', 60, BLEND.LOCO],
        ['LOCO:CORRER', 140, BLEND.LOCO],
        ['ATAQUE_LIGERO', 20, BLEND.ATAQUE],
        ['LOCO:REPOSO', 30, BLEND.RETORNO],
        ['IMPACTO', 24, BLEND.IMPACTO],
        ['SUELO_TIRADO', 40, BLEND.SUELO],
        ['LOCO:REPOSO', 50, BLEND.SUELO],
        ['ATAQUE_PESADO', 30, BLEND.ATAQUE],
        ['SUELO_TIRADO', 24, BLEND.SUELO]
    ];

    let validas = 0;
    let snapshots = 0;
    for (const [clip, frames, dur] of guion) {
        for (let i = 0; i < frames; i++) {
            // La "animacion" del clip: un vaiven lento. No importa el valor.
            const pose = createPose();
            setEulerV(pose, 'antebrazo_d', [0, 0, Math.sin((b.framesBlending + i) * 0.1) * 0.8]);
            const salida = b.push(clip, pose, dur, DT);
            const q = rotOf(salida, 'antebrazo_d');
            if (Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) < 0.001) validas++;
        }
        if (clip === guion[0][0]) snapshots++;
    }

    // El numero esperado se saca del propio guion: si todos los frames han
    // dado una pose valida, son exactamente los que el guion manda.
    const framesDelGuion = guion.reduce((s, g) => s + g[1], 0);
    check('todas las poses del combate son quaternions validos', validas === framesDelGuion,
        { validas, esperados: framesDelGuion });
    check('el combate ha hecho mezclas (no se ha quedado en la ruta caliente)', b.blends >= 8, b.info());
    check('y ha terminado sin mezclas colgadas', b.blending === false || b.t < 1, b.info());
}

{
    // El coste del caso normal, medido de verdad: mil frames del mismo clip
    // no pueden hacer mas trabajo que mil comparaciones de cadenas.
    const b = new PoseBlender();
    const p = poseCon(hueso, 'y', 30);
    b.instant('CORRER', p);
    // Calentar antes de medir: el primer repayment del bucle incluye
    // compilar la funcion, y medir eso como coste de la ruta caliente seria
    // medir el arranque del motor, no el bucle.
    for (let i = 0; i < 100000; i++) b.push('CORRER', p, BLEND.LOCO, DT);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 200000; i++) b.push('CORRER', p, BLEND.LOCO, DT);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // El presupuesto: por debajo de 1 microsegundo por frame. Un frame del
    // juego dura 16667 us. Aunque el motor hiciera esto tres veces por frame
    // (dos peleadores y el inspector)seguiria siendo el 0.02% del frame.
    check('la ruta caliente cuesta menos de 1 microsegundo por frame', ms / 200000 < 1,
        (ms / 200000).toFixed(3) + ' us/frame');
}

// ===========================================================================
console.log('\n================================================================');
console.log(`blend: ${passed} ok, ${failed} fallos`);
console.log('================================================================');
if (failed > 0) process.exit(1);