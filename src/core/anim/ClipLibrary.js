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

    // =========================================================================
    // LOS GENERADORES QUE ADEMAS APORTAN EL RIG COMPLETO
    // ---------------------------------------------------------------------
    // `locoPose`, `attackPose` y `stancePoseFn` son OBLIGATORIOS: los necesitan
    // los clips de la primera mitad, y sin ellos esta biblioteca no tiene nada
    // que devolver.
    //
    // Los de abajo son OPCIONALES, y no por pereza: son los que hacen falta
    // para las RECONCIONES y el SUELO, que son las partes del cuerpo que el
    // combate ya sabe hacer (`FighterRig.flinchPose`, `downPose`, `wakeupPose`)
    // pero que viven en el rig y no en los tres generadores de siempre.
    //
    // Se pueden omitir porque la biblioteca se monta con generadores falsos en
    // las pruebas (`tests/clips.smoke.mjs` pasa tres) y porque un motor que
    // solo sepa hacer posturas todavia tiene que poder nombrar sus clips: si no,
    // el tablero de `ClipBoard.js` pediria un clip que la biblioteca no tiene y
    // el informe de cobertura diria que falta una animacion que en realidad solo
    // necesita el generador del suelo.
    //
    // Cuando faltan, el clip NO se cae: usa un equivalente construido con
    // `stancePoseFn`, que siempre esta. La pose sale peor pero sale, y el motor
    // no se queda con el cuerpo en reposo a mitad de una reaccion.
    // =========================================================================
    const flinchPose = typeof deps.flinchPose === 'function' ? deps.flinchPose : null;
    const downPose = typeof deps.downPose === 'function' ? deps.downPose : null;
    const wakeupPose = typeof deps.wakeupPose === 'function' ? deps.wakeupPose : null;
    const floatPose = typeof deps.floatPose === 'function' ? deps.floatPose : null;
    const groundAttackPose = typeof deps.groundAttackPose === 'function' ? deps.groundAttackPose : null;
    const attackPoseFor = typeof deps.attackPoseFor === 'function' ? deps.attackPoseFor : null;
    // La BASE de la que parten los golpes. `attackPoseFor` la necesita resuelta
    // (es la que clava las puntas en el suelo ANTES de mover la cadera), y sin
    // ella los golpes se ven con los pies flotando.
    const posturaBase = typeof deps.posturePose === 'function' ? deps.posturePose : stancePoseFn;


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
        //acrobatica: se estira y se recoge. Es un salto mas: lo unico que
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
            const o = opts || {};
            const phase = o.phase || 'RECOVERY';

            // El castigo al RIVAL TUMBADO tiene silueta propia (un pie encima, las
            // manos al suelo, la patada descendente) y sale de un generador que
            // no es el del golpe. Se comprueba aqui y no en `poseFor` para que el
            // camino sea el mismo de los demas: un clip, un generador.
            if (o.downAttack) {
                const kind = o.downAttack === true ? 'PIE' : o.downAttack;
                if (groundAttackPose) {
                    return groundAttackPose(rig, kind, phase, t, o);
                }
            }

            // `attackPoseFor` es el generador con CONTEXTO: elige la base
            // (de pie / agachado / aire / suelo) y la silueta del golpe. Es el
            // que produce el jab agachado MAS BAJO que el de pie, que es una de
            // las cosas que el motor ya sabia hacer y que `attackPose` a secas
            // no puede dar.
            if (attackPoseFor) {
                const ctx = o.context || 'STAND';
                const base = o.posture || posturaBase(rig,
                    { limbs: 'BRACE', hipY: ctx === 'CROUCH' ? 0.52 : 0.88, spinePitch: 0.10 }, o);
                return attackPoseFor(rig, moveKey, ctx, phase, t,
                    Object.assign({}, o, { posture: base, silhouette: o.silhouette }));
            }

            return attackPose(rig, moveKey, phase, t, o);
        }, { continuo: false, commitment: extra.commitment != null ? extra.commitment : 0.7, encadenable: true, capa: 'GOLPE' });
    };

    golpe('atk_light', 'ATAQUE_LIGERO', { commitment: 0.5 });
    golpe('atk_heavy', 'ATAQUE_PESADO', { commitment: 0.8 });
    golpe('atk_special', 'ATAQUE_ESPECIAL', { commitment: 0.85 });
    golpe('atk_crouch', 'ATAQUE_LIGERO', { commitment: 0.55 });
    golpe('atk_air', 'ATAQUE_AEREO', { commitment: 0.6 });
    golpe('atk_sweep', 'BARRIDO', { commitment: 0.65 });

    // -----------------------------------------------------------------------
    // 5. LOS GOLPES POR FAMILIA
    //
    //   Los seis de arriba son el GOLPE BASE: el mismo para todos, y lo que
    //   sale cuando no hay nada mas que decir. A partir de aqui estan las
    //   SILUETAS, que son lo que hace que un jab y un gancho no se confundan.
    //
    //   Cada familia del tablero (`ClipBoard.FAMILIA`) tiene aqui su clip, y
    //   todos se generan con `attackPose` pasando una clave REAL de
    //   `FighterRig.ATTACK_KEYS`. Eso importa: `attackPose` cae a
    //   `ATAQUE_LIGERO` cuando no reconoce la clave, y ese silencio convierte
    //   "se me olvido esta clave" en "todos los golpes se ven igual", que es
    //   justo el fallo que la matriz de siluetas vino a arreglar.
    // -----------------------------------------------------------------------
    golpe('st_recto', 'ATAQUE_LIGERO', { commitment: 0.5 });
    golpe('st_jab_largo', 'JAB_LARGO', { commitment: 0.6 });
    golpe('st_cruzado', 'CRUZADO', { commitment: 0.8 });
    golpe('st_gancho', 'GANCHO', { commitment: 0.75 });
    golpe('st_uppercut', 'UPPERCUT', { commitment: 0.85 });
    golpe('st_patada_baja', 'ATAQUE_BARRIDO', { commitment: 0.65 });
    golpe('st_patada_lateral', 'ATAQUE_PESADO', { commitment: 0.7 });
    golpe('st_costillas', 'COSTILLAZO', { commitment: 0.5 });
    golpe('sp_patada_frontal', 'PATADA_FRONTAL', { commitment: 0.8 });
    golpe('sp_patada_giro', 'ATAQUE_PESADO', { commitment: 0.75 });
    golpe('sp_botellazo', 'ATAQUE_ESPECIAL', { commitment: 0.85 });
    golpe('sp_derribo', 'DERIBO', { commitment: 0.9 });
    golpe('sp_embestida', 'EMBESTIDA', { commitment: 0.95 });
    golpe('sp_sumision', 'SUMISION', { commitment: 0.9 });
    golpe('sp_carga_alpine', 'PROYECCION', { commitment: 0.95 });
    golpe('sp_pasa_pie_abajo', 'DERIBO', { commitment: 0.8 });

    // -----------------------------------------------------------------------
    // 6. LAS RECONCIONES
    //
    //   `hitstun`, `dizzy`... no son "golpes que recibe el cuerpo": son el
    //   tiempo que el cuerpo pasa recovering, y cada uno tiene su lectura.
    //
    //   El generador delega en `FighterRig.flinchPose`, que ya sabe DONDE ha
    //   pegado el golpe (por `opts.move`) y con que potencia: la matriz de
    //   reacciones 3x3 (alto/medio/bajo x suave/fuerte) vive ahi, y duplicarla
    //   aqui seria tener dos sitios distintos para lo mismo.
    //
    //   Lo que aporta este archivo es el RELOJ: el clip es el de un solo sentido
    //   y su `t` es el progreso de la reaccion, que es lo que la matriz necesita
    //   para volver a la guardia cuando toca.
    // -----------------------------------------------------------------------
    const reaccion = (nombre, hitLevel, dur, extra = {}) => {
        registrar(nombre, dur, false, (rig, t, opts) => {
            if (flinchPose) {
                return flinchPose(rig, hitLevel, Object.assign({}, opts, {
                    t: t,
                    // El golpe que entro lo trae la entidad; sin el, la matriz
                    // se deduce solo del nivel y se pierde la altura real.
                    move: opts.move || null,
                    breath: 0
                }));
            }
            // Sin el generador del rig: un retroceso con la misma lectura (el
            // torso se echa atras segun lo fuerte que sea), construido con la
            // postura. Peor que la matriz, pero no es "no hay animacion".
            const k = hitLevel === 'FUERTE' ? 1 : hitLevel === 'BAJO' ? 0.5 : 0.75;
            const pico = Math.sin(Math.min(1, t) * Math.PI);
            return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
                crouch: k * pico * 0.7, lean: -k * pico * 14, guard: 1 - k * pico * 0.6,
                spread: 0.5 + k * pico * 0.2, breath: pico
            }));
        }, { continuo: false, commitment: extra.commitment != null ? extra.commitment : 0.4, capa: 'GOLPE' });
    };

    reaccion('hitstun', 'MEDIO', 0.32, { commitment: 0.35 });
    reaccion('stagger', 'BAJO', 0.55, { commitment: 0.55 });
    reaccion('dizzy', 'FUERTE', 1.10, { commitment: 0.7 });
    reaccion('combo_breaker', 'FUERTE', 0.45, { commitment: 0.6 });

    registrar('juggle', 0.80, false, (rig, t, opts) => {
        // En el aire la reaccion no es una caida: es un deriva hacia el suelo
        // con el cuerpo torcido. Sin `floatPose` (que es el generador del aire)
        // se compone con la postura flotante.
        const pico = Math.sin(Math.min(1, t) * Math.PI);
        if (floatPose) {
            const base = floatPose(rig, opts);
            return base;
        }
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: -0.2 * (1 - pico), lean: -pico * 20, guard: 0.2, spread: 0.7, breath: pico
        }));
    }, { continuo: false, commitment: 0.3 });

    registrar('juggle_dead', 1.40, false, (rig, t, opts) => {
        // Sin aire: no vuelve a la guardia por su cuenta. El cuerpo cae plano y
        // se queda asi hasta que otro estado lo sacude. Por eso NO es un ciclo
        // y por eso dura mas que el juggle normal.
        const tt = Math.min(1, t);
        const twist = Math.min(1, tt * 2.4) * (1 - Math.max(0, (tt - 0.6) / 0.4));
        if (floatPose) return floatPose(rig, Object.assign({}, opts, { twist: twist }));
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, {
            crouch: -0.35 * (1 - tt * 0.5), lean: -twist * 24, guard: 0, spread: 0.8, breath: 0
        }));
    }, { continuo: false, commitment: 0.1 });

    // -----------------------------------------------------------------------
    // 7. EL SUELO
    //
    //   `down_prone` / `down_supine` son la cara de la caida y `wakeup_*` la
    //   levantada. Se generan con `downPose` y `wakeupPose`, que yaPONEN el
    //   cuerpo en el suelo con la orientacion de la caida (la FSM guarda el eje
    //   al derribar) y la desenrollan bien.
    // -----------------------------------------------------------------------
    registrar('down_prone', 1.20, true, (rig, t, opts) => {
        if (downPose) return downPose(rig, opts.down || { orientation: 'CABEZA_A_RIVAL', axis: 0 }, opts);
        const resp = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, { crouch: 2.4, guard: 0, breath: resp }));
    }, { continuo: true, commitment: 0 });

    registrar('down_supine', 1.20, true, (rig, t, opts) => {
        if (downPose) return downPose(rig, opts.down || { orientation: 'PIES', axis: 180 }, opts);
        const resp = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, { crouch: 2.4, guard: 0.1, breath: resp }));
    }, { continuo: true, commitment: 0 });

    registrar('wakeup_prone', 0.70, false, (rig, t, opts) => {
        if (wakeupPose) return wakeupPose(rig, t, opts.down || { orientation: 'CABEZA_A_RIVAL', axis: 0 }, opts);
        const sube = Math.min(1, t);
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, { crouch: 2.2 * (1 - sube), guard: 0.4 * sube, breath: sube }));
    }, { continuo: false, commitment: 0.6 });

    registrar('wakeup_crouch', 0.50, false, (rig, t, opts) => {
        if (wakeupPose) return wakeupPose(rig, t, opts.down || { orientation: 'PIES', axis: 180 }, opts);
        const sube = Math.min(1, t);
        return stancePoseFn(rig, 'DEFENSIVE', Object.assign({}, opts, { crouch: 1.6 * (1 - sube), guard: 0.7 * sube, breath: sube }));
    }, { continuo: false, commitment: 0.5 });

    // -----------------------------------------------------------------------
    // 8. LOS AGARRES
    //
    //   Treinta estados de agarre y NINGUN generador de agarre en el motor: el
    //   `poseFor` los cacha en la ultima rama (la postura del catalogo) y todos
    //   se ven igual. Aqui se generan desde la postura, y la diferencia entre
    //   ellos son tres numeros: cuanto tira del cuerpo (`lean`), cuanto baja la
    //   cadera (`crouch`) y como de abiertas estan las manos (`spread`).
    //
    //   El tiempo va con un ciclo de TRES tiempos (abrir, sostener, cerrar) porque
    //   un agarre que solo "se mantiene" parece un tope con las manos, y un
    //   agarre que solo se cierra parece que el rival se suelta solo.
    // -----------------------------------------------------------------------
    const agarre = (nombre, opt) => {
        registrar(nombre, opt.dur || 0.9, true, (rig, t, opts) => {
            const fase = t * 3 % 1;
            // Triangular: sube, meseta, baja. La meseta es la parte que se ve
            // larga, porque es donde el agarre esta de verdad.
            const s = fase < 0.34 ? fase / 0.34 : fase < 0.62 ? 1 : 1 - (fase - 0.62) / 0.38;
            const k = opt.pulso != null ? opt.pulso : s;
            return stancePoseFn(rig, opt.stance || 'PRESSING', Object.assign({}, opts, {
                crouch: (opt.crouch || 0) * (0.7 + k * 0.3),
                lean: (opt.lean || 0) * (0.6 + k * 0.4),
                spread: (opt.spread != null ? opt.spread : 0.5),
                guard: opt.guard != null ? opt.guard : 0.5,
                lead: opt.lead != null ? opt.lead : 0.1 * k,
                breath: k
            }));
        }, { continuo: true, commitment: opt.commitment != null ? opt.commitment : 0.8, capa: 'GOLPE' });
    };

    // --- la entrada: coger al rival ---------------------------------------
    agarre('rv_agarre_gancho', { crouch: 0.5, lean: 8, spread: 0.42, guard: 0.8, dur: 0.8 });
    agarre('rv_clinch', { crouch: 0.6, lean: 10, spread: 0.40, guard: 0.9, dur: 0.9 });
    agarre('rv_guardia_alta', { crouch: 0.3, lean: 4, spread: 0.38, guard: 1.0, dur: 1.0 });

    // --- el mantenimiento: de pie, agachado y montado ----------------------
    agarre('rv_agarre_pie', { crouch: 0.5, lean: 8, spread: 0.46, guard: 0.7 });
    agarre('rv_agarre_agachado', { crouch: 1.4, lean: 12, spread: 0.52, guard: 0.7 });
    agarre('rv_agarre_montado', { crouch: 1.6, lean: 14, spread: 0.50, guard: 0.6, stance: 'PRESSING' });
    agarre('rv_presion', { crouch: 1.8, lean: 16, spread: 0.44, guard: 0.5 });
    agarre('rv_atemi_uke', { crouch: 1.2, lean: -6, spread: 0.62, guard: 0.2, dur: 0.5, commitment: 0.5 });
    agarre('rv_atemi_tori', { crouch: 1.3, lean: 12, spread: 0.50, guard: 0.6, dur: 0.5, commitment: 0.5 });

    // --- las jugadas que acaban elAgarre ----------------------------------
    agarre('rv_ukemi', { crouch: 1.0, lean: 8, spread: 0.56, guard: 0.4, dur: 0.7 });
    agarre('rv_proyeccion', { crouch: 0.8, lean: -12, spread: 0.60, guard: 0.3, dur: 0.8 });
    agarre('rv_sumision', { crouch: 0.9, lean: 6, spread: 0.48, guard: 0.5, dur: 1.0 });
    agarre('rv_escape', { crouch: 0.6, lean: -8, spread: 0.58, guard: 0.6, dur: 0.7 });
    agarre('rv_fin', { crouch: 0.7, lean: 4, spread: 0.50, guard: 0.6, dur: 0.9 });
    agarre('rv_fin_de_juan', { crouch: 0.7, lean: 2, spread: 0.54, guard: 0.6, dur: 0.9 });

    // --- el suelo: el de arriba y el de abajo ------------------------------
    // Arriba y abajo tienen que verse OPUESTOS, no parecidos: si los dos se
    // ven igual, el suelo no tiene dueñno y el castigo al del suelo pierde todo
    // el sentido (la posicion deja de leerse y pasa a ser decoracion).
    agarre('rv_top', { crouch: 2.4, lean: 20, spread: 0.44, guard: 0.7, dur: 1.0 });
    agarre('rv_top_strike', { crouch: 2.2, lean: 24, spread: 0.40, guard: 0.6, dur: 0.6, commitment: 0.6 });
    agarre('rv_top_escape', { crouch: 2.6, lean: 26, spread: 0.50, guard: 0.5, dur: 0.7 });
    agarre('rv_top_ukemi', { crouch: 1.2, lean: -18, spread: 0.60, guard: 0.3, dur: 0.8 });
    agarre('rv_bottom', { crouch: 2.8, lean: -14, spread: 0.66, guard: 0.15, dur: 1.0 });
    agarre('rv_bottom_hit', { crouch: 2.8, lean: -18, spread: 0.70, guard: 0.1, dur: 0.6, commitment: 0.5 });
    agarre('rv_bottom_escape', { crouch: 2.6, lean: -10, spread: 0.62, guard: 0.25, dur: 0.7 });
    agarre('rv_bottom_ukemi', { crouch: 2.0, lean: -6, spread: 0.58, guard: 0.2, dur: 0.8 });

    // -----------------------------------------------------------------------
    // 9. LOS MOVIMIENTOS QUE FALTABAN DE LA LOCOMOCION
    //
    //   Los once de la tabla de `LOCO_TABLE` no cubren los tres estados que la
    //   entidad anade por su cuenta (el dash agachado, el dash saltando y el
    //   sprint hacia atras). Sin ellos, el tablero caia a `idle` mientras el
    //   peleador corria de lado, que es el peor sitio posible para caerse a
    //   reposo: el dash es el momento en que la camara esta mas cerca.
    // -----------------------------------------------------------------------
    registrar('sprint_b', 0.46, true, (rig, t, opts) => {
        return locoPose(rig, LOCO.RUN, Object.assign({}, opts, {
            style: 'IDLE', forward: -1, dist: 1.5, loco: LOCO.RUN
        }));
    }, { continuo: true, commitment: 0.75, cancellable: false });

    registrar('couch_dash', 0.30, true, (rig, t, opts) => {
        return locoPose(rig, 'CROUCH_DASH', Object.assign({}, opts, {
            style: 'DEFENSIVE', forward: 1, dist: 1.2, loco: 'CROUCH_DASH'
        }));
    }, { continuo: true, commitment: 1.0, cancellable: false });

    registrar('jump_dash', 0.32, true, (rig, t, opts) => {
        return locoPose(rig, 'JUMP_DASH', Object.assign({}, opts, {
            style: 'IDLE', forward: 1, dist: 1.2, loco: 'JUMP_DASH'
        }));
    }, { continuo: true, commitment: 1.0, cancellable: false });

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