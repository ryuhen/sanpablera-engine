/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipLibrary.js
 * ----------------------------------------------------------------------------
 * LA BIBLIOTECA DE CLIPS: lo que le faltaba al maniqui.
 *
 * EL AGUJERO QUE ESTE ARCHIVO CIERRA
 * ----------------------------------------------------------------------------
 *   El motor pedia unos setenta nombres de clip: `atk_light`, `crouch`,
 *   `jump`, `walk`, `slide`, `down_prone`, `rv_gancho`... Todos declarados en
 *   las tablas, todos referenciados por un estado. Y **ninguno existia**.
 *
 *   Cada `clip: 'atk_light'` era una cadena que no llevaba a ninguna parte:
 *   `CharacterModel` no tiene `AnimationGroup` ni `beginAnimation`, porque la
 *   decision documentada en su cabecera es que las poses las escribe el
 *   generador, hueso a hueso, y los clips grabados se dejaban "para lo que si
 *   sea claveframe". Ese "si" nunca llego, y mientras tanto el juego se queda
 *   sin animaciones: la pelea funciona porque las poses se generan sueltas
 *   dentro de cada manejador de estado, pero no hay NADA con nombre.
 *
 * QUE NO ES ESTO (y por que no es lo que haria un motor normal)
 * ----------------------------------------------------------------------------
 *   No es una biblioteca de `Animation` de Babylon. Es una biblioteca de
 *   GENERADORES: cada clip es una funcion que, dado el instante, devuelve una
 *   Pose. Tres razones:
 *
 *   1. No hay donde traerlos. Mixamo y Xbot no se pueden redistribuir (Adobe),
 *      y el unico CC0 que hay (Quaternius) viene con su propio esqueleto, que
 *      es justo el que no recibe bien la postura procedural. Grabar clips
 *      para un modelo que no es el del juego es trabajo tirado.
 *
 *   2. El motor YA sabe hacer estas poses: `FighterRig.locoPose`,
 *      `attackPose`, `downPose`, `Stances.stancePose`... Todo lo que hay aqui
 *      es envuelver esos generadores con nombre, duracion y bucle. Nada se
 *      reescribe: se nombraba lo que ya se hacia.
 *
 *   3. Sigue funcionando lo que ya funcionaba. Reproducir un clip es "calcular
 *      la pose del clip y llamar a `applyPose` con su nombre", y `applyPose`
 *      ya mezcla (ver Blend.js). No hay motor nuevo ni camino nuevo.
 *
 * LO QUE DA Y QUE ANTES NO HABIA
 * ----------------------------------------------------------------------------
 *   - Un nombre por animacion. Antes `clip: 'atk_light'` no significaba nada.
 *   - Duracion y bucle declarados, no deducidos.
 *   - Un INFORME DE COBERTURA: que de los setenta nombres que pide el juego
 *     existen y cuales no. Es una lista de trabajo ejecutable en vez de una
 *     intuicion de que "faltan las animaciones".
 *   - Un sitio donde meter los ajustes por animacion, en vez de repartidos por
 *     los manejadores de estado.
 * ============================================================================
 */

import { createPose } from '../cine/Pose.js';
import { LOCO, LOCO_TABLE } from '../locomotion.js';


// ---------------------------------------------------------------------------
// EL REGISTRO
// ---------------------------------------------------------------------------

/**
 * Un clip. Todos los campos son datos y ninguno es opcional sin motivo:
 *
 *   dur ........ segundos que dura UNA vuelta
 *   loop ........ si al chegar al final vuelve a empezar
 *   generador ... (rig, t, opts) -> Pose. `t` va de 0 a 1 dentro del clip.
 *   continuo .... true si la pose depende del tiempo ABSOLUTO y no se puede
 *                mezclar con la anterior sin dar un salto. Los ciclos (andar,
 *                correr) lo son: mezclarlos con lo de antes produce una
 *                pierna que va con retraso, que es el clasico tiron.
 *   commitment .. 0..1, cuanto se compromete el cuerpo. Lo usa la FSM para
 *                 saber si se puede cancelar a mitad.
 */
function clip(nombre, dur, loop, generador, extra = {}) {
    return Object.freeze({
        nombre: nombre,
        dur: dur,
        loop: loop,
        generador: generador,
        continuo: !!extra.continuo,
        commitment: extra.commitment != null ? extra.commitment : 0.5,
        cancellable: extra.cancellable != null ? extra.cancellable : true,
        capa: extra.capa || 'PIE',
        /** Cuantos golpes encadenados aguanta este clip. 0 = no encadena. */
        encadenable: extra.encadenable != null ? extra.encadenable : false
    });
}

/**
 * La biblioteca. Se declara con una funcion aparte (no como constante) porque
 * los generadores necesitan `rig`, y los generadores son los de `FighterRig`,
 * que a su vez importa a este archivo en el futuro: montarlo aqui evita el
 * ciclo sin un import dinamico`.
 *
 * Los generadores se reciben por parametro (`deps`) en vez de importarse, y es
 * lo que hace que este archivo se pueda probar en Node sin el rig entero.
 */
export function crearBiblioteca(deps) {
    const { locoPose, attackPose, stancePoseFn } = deps;

    // El generador de posturas entra POR PARAMETRO y no por import. Es lo que
    // hace que este archivo se pueda probar sin un rig entero delante: la
    // biblioteca decide QUE pose, y el generador decide COMO se hace. Si se
    // importara aqui, stancePose traeria consigo Rig.js y el archivo
    // dejaria de ser una biblioteca para ser medio motor.
    if (typeof stancePoseFn !== 'function') {
        throw new TypeError('crearBiblioteca necesita stancePoseFn');
    }

    /** clip -> ficha */
    const C = Object.create(null);

    const registrar = (nombre, dur, loop, generador, extra) => {
        C[nombre] = clip(nombre, dur, loop, generador, extra);
        return C[nombre];
    };

    // -----------------------------------------------------------------------
    // 1. DE PIE Y LOCOMOCION
    //
    // Los ciclos son CONTINUOS: su pose depende del instante absoluto, y por
    // eso el blending no los mezcla con la pose anterior (ver Blend.js: mismo
    // clip no se mezcla). Aqui se declara igual, para que quien lea la tabla
    // entienda por que estos no llevan `peso` de mezcla.
    // -----------------------------------------------------------------------
    registrar('idle', 2.4, true, (rig, t, opts) => {
        // Respiracion: dos tiempos, uno al inhalar y otro al espirar. Es poco
        // y se nota, que es lo que se quiere: una guardia que respira parece
        // que esta viva; una guardia con los hombros clavados parece un mueble.
        //
        // El CUERPO lo pone `locoPose` y no `stancePoseFn` a proposito: el idle
        // es un clip de LOCOMOCION (`LOCO.IDLE` lo declara con este mismo
        // nombre), y si su postura la hiciera otra ruta habria dos caminos
        // para el mismo estado y el mismo sitio habria que corregir en los dos.
        // Aqui solo se le anade la respiracion por encima.
        const fase = t * Math.PI * 2;
        return locoPose(rig, LOCO.IDLE, Object.assign({}, opts, {
            breath: Math.sin(fase) * 0.5 + 0.5,
            style: 'IDLE', forward: 1, dist: 1.5, loco: LOCO.IDLE
        }));
    }, { continuo: true, commitment: 0, cancellable: true });

    registrar('stance_base', 2.4, true, (rig, t, opts) => {
        const resp = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, { breath: resp, forward: 1, dist: 1.5 }));
    }, { continuo: true, commitment: 0 });

    for (const k of Object.keys(LOCO_TABLE)) {
        const loc = LOCO_TABLE[k];
        const nombre = loc.clip || k.toLowerCase();

        // NO se pisa lo que ya hay. `idle` se registra arriba a mano (con la
        // respiracion) y la tabla lo vuelve a declarar con `cycle: 0`; si el
        // bucle escribiera encima, el idle GOOD se perderia y quedaria el de
        // la tabla, que es el mismo pero sin respirar y con una duracion
        // inventada de 0,6 s.
        if (tieneClip(C, nombre)) continue;

        registrar(nombre, loc.cycle || 0.6, true, (rig, t, opts) => {
            return locoPose(rig, k, Object.assign({}, opts, {
                style: 'IDLE', forward: 1, dist: 1.5, loco: k
            }));
        }, { continuo: true, commitment: loc.commitment != null ? loc.commitment : 0.5, cancellable: !!loc.cancellable });
    }

    // Alias. El motor llama a la carrera `sprint_f` (por delante) y el que
    // lee el codigo desde fuera la llama `run`. Sin el alias, quien busque
    // 'run' no lo encuentra y el juego cae a reposo.
    registrar('run', LOCO_TABLE[LOCO.RUN] ? LOCO_TABLE[LOCO.RUN].cycle : 0.44, true,
        (rig, t, opts) => locoPose(rig, LOCO.RUN, Object.assign({}, opts, {
            style: 'IDLE', forward: 1, dist: 1.5, loco: LOCO.RUN
        })), { continuo: true, commitment: 0.75, cancellable: false });

    // -----------------------------------------------------------------------
    // 2. MOVILIDAD ESPECIAL (spec 8, punto 4: "de rodillas, cuadrúpeda,
    //    tropezando, cayendo lentamente")
    //
    //    Son las posturas en las que el cuerpo NO esta de pie. No son estados
    //    de la FSM (esas ya existen) sino las POSES que corresponden, que es
    //    justamente lo que faltaba: el estado deia "cuadrúpeda" y no habia
    //    ninguna pose con ese nombre detras.
    // -----------------------------------------------------------------------
    registrar('quad', 0.90, false, (rig, t, opts) => {
        // Cuadrúpeda: baja a cuatro patas y se queda. La bajada es rapida
        // (0-30%) y el resto es meseta, porque aqui es donde vive el jugador
        // mientras espera el momento de levantarse.
        const baja = Math.min(1, Math.max(0, (t - 0.08) / 0.22));
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: 2.6 * baja, spread: 0.62, guard: 0.9, breath: baja
        }));
    }, { continuo: false, commitment: 0.6 });

    registrar('kneel', 0.70, false, (rig, t, opts) => {
        const baja = Math.min(1, Math.max(0, (t - 0.10) / 0.25));
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: 2.0 * baja, guard: 0.6, spread: 0.34, breath: baja
        }));
    }, { continuo: false, commitment: 0.55 });

    registrar('stumble', 0.85, true, (rig, t, opts) => {
        // Tropezar: el cuerpo va descuadrado y se recupera. El ciclo es de
        // TRES tiempos porque el tropezon tiene que verse: si solo se
        // inclinara y volviera, pareceria que se inclina por casualidad.
        const fase = t * 3 % 1;
        const caida = Math.sin(fase * Math.PI) * 0.9;
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: 1.2 * caida, spread: 0.5 + caida * 0.2, breath: caida
        }));
    }, { continuo: true, commitment: 0.7 });

    registrar('side_step', 0.42, false, (rig, t, opts) => {
        // Paso lateral: el peso va a un lado y vuelve. El lado lo decide el
        // motor, no el clip: el clip es el mismo para izquierda y derecha y
        // lo que cambia es el `forward` que ya se le pasa.
        const fase = Math.sin(Math.min(1, t) * Math.PI);
        return stancePoseFn(rig, 'PRESSING', Object.assign({}, opts, {
            crouch: fase * 0.5, lead: fase * 0.18, breath: fase
        }));
    }, { continuo: false, commitment: 0.4 });

    registrar('backdash', 0.40, false, (rig, t, opts) => {
        const fase = Math.sin(Math.min(1, t) * Math.PI);
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: fase * 0.7, lean: -fase * 8, guard: 1, breath: fase
        }));
    }, { continuo: false, commitment: 0.55 });

    registrar('acrobatics', 0.80, false, (rig, t, opts) => {
        //acrobatica: se estira y se recoge. Es un salto舞 mas: lo unico que
        // cambia es el `crouch` negativo, que en `stancePose` significa
        // ESTIRARSE (el cuerpo se alarga en vez de encogerse).
        const estira = Math.sin(Math.min(1, t) * Math.PI);
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, {
            crouch: -0.8 * estira, spread: 0.55, breath: estira
        }));
    }, { continuo: false, commitment: 0.75 });

    // -----------------------------------------------------------------------
    // 2. AGACHADO Y GUARDIA
    //
    // Aqui NO hay bucle: agacharse y levantarse es un movimiento de un solo
    // sentido, y hacerlo en bucle seria un pumping sin sentido. Por eso el
    // generador va por CUATRO fases y no por un seno.
    // -----------------------------------------------------------------------
    registrar('crouch', 0.34, false, (rig, t, opts) => {
        // Baja en el primer 35%, se queda en el 35%-70% y vuelve arriba. La
        // meseta es la parte que de verdad importa: es donde el jugador vive
        // mientras espera, y tiene que ser ESTABLE o el suelo parece vibrar.
        const bajo = Math.min(1, Math.max(0, (t - 0.05) / 0.30));
        const arriba = Math.min(1, Math.max(0, (t - 0.70) / 0.25));
        const amount = bajo * (1 - arriba);
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, { crouch: amount * 1.6, guard: amount * 0.4, forward: 1, dist: 1.2 }));
    }, { commitment: 0.15 });

    registrar('crouch_guard_high', 2.0, true, (rig, t, opts) => {
        const resp = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'GUARD', Object.assign({}, opts, { breath: resp, crouch: 1.4, guard: 1, forward: 1, dist: 1.0 }));
    }, { continuo: true, commitment: 0.2 });

    registrar('crouch_guard_low', 2.0, true, (rig, t, opts) => {
        const resp = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'GUARD', Object.assign({}, opts, { breath: resp, crouch: 2.4, guard: 1, forward: 1, dist: 0.8 }));
    }, { continuo: true, commitment: 0.2 });

    // -----------------------------------------------------------------------
    // 3. SALTO
    //
    // El salto es el primer caso donde el TIEMPO ABSOLUTO importa y donde
    // mezclar con la pose anterior esta PROHIBIDO: en el frame en que despega,
    // el cuerpo esta enExtension y un frame antes estaba encogido. Si se
    // mezclase, el despegue se veria como que el cuerpo "flota" desde abajo.
    // Por eso estos clips son `continuo: false`.
    // -----------------------------------------------------------------------
    registrar('jump', 0.62, false, (rig, t, opts) => {
        // Anticipacion (0-20%): se encoge. Extension (20-55%): se estira.
        // Recogida (55-100%): vuelve a encogerse para caer.
        const Anticipacion = Math.min(1, t / 0.20);
        const extension = (t - 0.20) / 0.35;
        const recogida = (t - 0.55) / 0.45;
        const altura = Anticipacion * 0.5 - Math.min(1, Math.max(0, extension)) * 0.9 +
            Math.min(1, Math.max(0, recogida)) * 0.5;
        return stancePoseFn(rig, 'IDLE', {
            crouch: 0.4 - altura * 0.8, guard: 0.3,
            stretch: altura,
            forward: 1, dist: 1.2, tiempo: (opts && opts.tiempo) || 0, loco: LOCO.IDLE
        });
    }, { continuo: false, commitment: 0.55 });

    registrar('fall', 1.6, true, (rig, t, opts) => {
        // En caida el cuerpo se abre y las piernas bajan. Es un ciclo largo y
        // continuo: la caida puede durar medio segundo o dos, y hacer que el
        // cuerpo se mueva poco a poco es lo que da sensacion de peso.
        const fase = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'IDLE', {
            crouch: -0.25, guard: 0.15, spread: 0.6, breath: fase,
            forward: 1, dist: 1.2, tiempo: (opts && opts.tiempo) || 0, loco: LOCO.IDLE
        });
    }, { continuo: true, commitment: 0.4 });

    registrar('slow_fall', 1.9, true, (rig, t, opts) => {
        const fase = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'DEFENSIVE', {
            crouch: -0.1, guard: 0.8, breath: fase,
            forward: 1, dist: 1.2, tiempo: (opts && opts.tiempo) || 0, loco: LOCO.IDLE
        });
    }, { continuo: true, commitment: 0.3 });

    registrar('hop', 0.28, false, (rig, t, opts) => {
        const sub = Math.sin(Math.min(1, t) * Math.PI);
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, { crouch: sub * 0.9, forward: 1, dist: 1.0 }));
    }, { continuo: false, commitment: 0.3 });

    registrar('land', 0.30, false, (rig, t, opts) => {
        const amortiguacion = Math.sin(Math.min(1, t) * Math.PI);
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, { crouch: amortiguacion * 1.5, forward: 1, dist: 1.0 }));
    }, { continuo: false, commitment: 0.5 });

    registrar('air_recover', 0.40, false, (rig, t, opts) => {
        const recupera = Math.min(1, t);
        return stancePoseFn(rig, 'IDLE', Object.assign({}, opts, { crouch: (1 - recupera) * 0.7, forward: 1, dist: 1.0 }));
    }, { continuo: false, commitment: 0.3 });

    // -----------------------------------------------------------------------
    // 4. GOLPES
    //
    // Los golpes SI encadenan, y ese es el dato que consume el sistema de
    // combos: `encadenable` dice si desde este golpe se puede seguir, y el
    // sistema de combos es quien decide SI. Aqui solo se declara la
    // posibilidad.
    //
    // La fase se pasa por `opts.phase` porque el motor ya la calcula
    // (STARTUP / ACTIVE / RECOVERY, ver AttackPhase). No se vuelve a
    // calcular aqui: si se calculara otra vez, la fase del golpe y la del
    // generador podrian no ser la misma y el golpe salia tarde.
    // -----------------------------------------------------------------------
    const golpe = (nombre, moveKey, extra = {}) => {
        registrar(nombre, extra.dur || 0.4, false, (rig, t, opts) => {
            return attackPose(rig, moveKey, (opts && opts.phase) || 'RECOVERY', t, opts || {});
        }, { continuo: false, commitment: extra.commitment != null ? extra.commitment : 0.7, encadenable: true, capa: 'GOLPE' });
    };

    golpe('atk_light', 'ATAQUE_LIGERO', { commitment: 0.5 });
    golpe('atk_heavy', 'ATAQUE_PESADO', { commitment: 0.8 });
    golpe('atk_special', 'ATAQUE_ESPECIAL', { commitment: 0.85 });
    golpe('atk_crouch', 'ATAQUE_LIGERO', { commitment: 0.55 });
    golpe('atk_air', 'ATAQUE_AEREO', { commitment: 0.6 });
    golpe('atk_sweep', 'BARRIDO', { commitment: 0.65 });

    return Object.freeze(C);
}

/**
 * El reloj de un clip: convierte un tiempo absoluto en el `t` normalizado del
 * clip, teniendo en cuenta si el clip es de una vuelta o de bucle.
 *
 * @param {object} c        ficha del clip
 * @param {number} segundos tiempo absoluto
 * @returns {number} 0..1
 */
export function tDeClip(c, segundos) {
    if (!c || !(c.dur > 0)) return 0;
    if (c.loop) {
        // El bucle va por el tiempo POSITIVO y con modulo estable: si el
        // tiempo absoluto puede retroceder (el motor unclamp en un pausa), un
        // `%` a secas daria negativo y la pose se daria la vuelta.
        const v = segundos % c.dur;
        return v < 0 ? (v + c.dur) / c.dur : v / c.dur;
    }
    const t = segundos / c.dur;
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/**
 * La pose del clip en este instante.
 *
 * @param {object} bib     la biblioteca (crearBiblioteca)
 * @param {string} nombre  clip
 * @param {object} rig     el esqueleto numerico
 * @param {number} segundos tiempo absoluto desde que empezo el clip
 * @param {object} [opts]  se pasa entero al generador (phase, context, ...)
 * @returns {object|null} la Pose, o null si el clip no existe
 */
export function poseDe(bib, nombre, rig, segundos = 0, opts = {}) {
    const c = bib && bib[nombre];
    if (!c) return null;
    const t = tDeClip(c, segundos);
    // `segundos` tambien se pasa entero para los ciclos: un ciclo de carrera
    // depende del instante, no del vuelta. Por eso el generador recibe las dos
    // cosas: `t` para el sitio dentro de la vuelta y `time` para el absoluto.
    return c.generador(rig, t, Object.assign({}, opts, { tiempo: segundos, clip: nombre, dur: c.dur }));
}

/** La ficha de un clip, o null. */
export function fichaDe(bib, nombre) {
    return bib && Object.prototype.hasOwnProperty.call(bib, nombre) ? bib[nombre] : null;
}

/** ¿Existe este clip? */
export function tieneClip(bib, nombre) {
    return !!fichaDe(bib, nombre);
}

/** Todos los nombres, ordenados. Copia. */
export function nombres(bib) {
    return Object.keys(bib).sort();
}

/**
 * EL INFORME DE COBERTURA.
 *
 * Se le pasa la lista de nombres que el JUEGO PIDE (los `clip:` de las tablas
 * y de los estados) y responde cuales existen y cuales no. Es la lista de
 * trabajo del maniqui convertida en algo que se puede comprobar: si el informe
 * dice que faltan doce, hay doce.
 *
 * @param {object} bib
 * @param {string[]} pedidos nombres que el motor referencia
 * @returns {object} { total, hay, faltan, sobran, cobertura }
 */
export function cobertura(bib, pedidos) {
    const lista = Array.isArray(pedidos) ? pedidos : [];
    const hay = [];
    const faltan = [];
    for (const n of lista) {
        if (tieneClip(bib, n)) hay.push(n); else faltan.push(n);
    }
    const pedidosSet = new Set(lista);
    const sobran = nombres(bib).filter(n => !pedidosSet.has(n));
    return {
        total: lista.length,
        hay: hay.length,
        faltan: faltan,
        sobran: sobran,
        cobertura: lista.length ? hay.length / lista.length : 1
    };
}

/** Una biblioteca vacia. Para las comprobaciones que no necesitan poses. */
export function bibliotecaVacia() {
    return Object.freeze(Object.create(null));
}

export default { crearBiblioteca, tDeClip, poseDe, fichaDe, tieneClip, nombres, cobertura, bibliotecaVacia };