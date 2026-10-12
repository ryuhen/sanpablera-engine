/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipAssets.js
 * ----------------------------------------------------------------------------
 * EL CATALOGO: que nombre de clip del tablero es QUE ARCHIVO.
 * ============================================================================
 *
 * POR QUE HACE FALTA UN ARCHIVO MAS
 * ----------------------------------------------------------------------------
 *   `ClipBoard.js` ya decide QUE ANIMACION corresponde a cada cosa y lo llama
 *   con nombres del vocabulario del combate: `st_recto`, `hitstun`, `rv_top`,
 *   `sp_embestida`. Esos nombres estan bien para el motor, que razona en golpes
 *   y estados, pero NO SON NOMBRES DE FICHERO. El tablero no puede contener
 *   rutas porque es puro y no debe saber de donde vienen los .glb; y el
 *   cargador de archivos no debe saber que existe un tablero.
 *
 *   Este archivo es la frontera entre los dos: un unico sitio donde se dice
 *   "el clip `st_recto` es el fichero `punch_jab.glb`".
 *
 * POR QUE HAY 22 ARCHIVOS PARA 60 NOMBRES Y NO AL REVES
 * ----------------------------------------------------------------------------
 *   Porque son preguntas distintas. El tablero pregunta QUE se ve (un gancho,
 *   un barrido, un agarre montado) y tiene 60 respuestas distintas porque son
 *   60 gestures diferentes. Los archivos disponibles son 22 y muchos nombres
 *   comparten gesto: todos los agarres `_rv_*` que no tienen archivo propio se
 *   sirven con `melee_hook`, que es literalmente un gancho.
 *
 *   Y aqui esta el punto IMPORTANT: un nombre sin archivo NO es un fallo ni un
 *   hueco, es la respuesta "este gesto todavia no tiene animacion grabada". Por
 *   eso `archivoDe` devuelve `null` y quien pregunta decide que hacer. Lo que
 *   NO se hace es inventarse una equivalencia: que `rv_top` se vea como un
 *   gancho es solo parecido; que se vea como el otro es mentira. Por eso hay
 *   TRES listas y no una: `CLIP_A_ARCHIVO` (el gesto es ESE), `RESERVADO` (se
 *   sirve de otro y se declara que mentira se esta contando) y
 *   `SIN_ANIMACION` (no hay y no se va a inventar). Lo que no puede existir es
 *   un nombre en ninguna: ese seria un agujero, y lo cazan los tests.
 *
 * LA REGLA DE LAS RESERVAS
 * ----------------------------------------------------------------------------
 *   Una reserva solo es aceptable cuando el gesto es el MISMO y no "parecido":
 *
 *     - `fall` / `juggle` -> `jump_loop`: un cuerpo en el aire es un cuerpo en
 *       el aire, y no hay distincion entre "cayendo" y "en un jaleo" en un
 *       archivo de 22.
 *     - `hitstun` -> `hit_chest` / `hit_head`: son las DOS reacciones que hay.
 *     - los agarres -> `melee_hook`: es un gancho, y un agarre lo es.
 *
 *   Lo que NO se reserva jamas: `st_uppercut` con el jab, `sp_patada_giro` con
 *   la patada de frente, o un `hitstun` de cabeza con uno de pecho. Esos se
 *   dejan sin archivo, y el motor cae a la postura procedural, que por lo
 *   menos no miente.
 *
 * ES PURO
 * ----------------------------------------------------------------------------
 *   Ni fetch, ni Babylon, ni DOM: solo una tabla. Por eso `tests/` puede
 *   comprobar que TODO clip que el tablero puede pedir tiene o bien un archivo
 *   o bien una reserva declarada, sin tocar la red.
 * ============================================================================
 */

/** Donde viven los archivos. Relativo a la raiz del sitio. */
export const RUTA = 'assets/animations/quaternius/';

/** El esqueleto contra el que estan hechos. Sin el, los deltas no casan. */
export const RIG = RUTA + '_rig-human.glb';

/**
 * Los 22 archivos que hay, y lo que son.
 *
 * `loop` importa: un ciclo que se reabre de golpe da un salto en pantalla, y
 * el mezclador no lo arregla porque no sabe nada del clip. Los que no son
 * ciclo se dejan en su ultimo frame (ver `muestrear` en GlbClip.js).
 */
export const ARCHIVOS = Object.freeze({
    idle_loop: { loop: true, uso: 'reposo, el clip que nunca se acaba' },
    walk_loop: { loop: true, uso: 'andar' },
    jog_fwd_loop: { loop: true, uso: 'trote' },
    sprint_loop: { loop: true, uso: 'correr' },
    crouch_idle_loop: { loop: true, uso: 'agachado quieto' },
    crouch_fwd_loop: { loop: true, uso: 'agachado andando' },
    punch_jab: { loop: false, uso: 'ataque ligero' },
    punch_cross: { loop: false, uso: 'ataque medio' },
    sword_attack: { loop: false, uso: 'ataque pesado' },
    hit_chest: { loop: false, uso: 'golpe recibido al pecho' },
    hit_head: { loop: false, uso: 'golpe recibido a la cabeza' },
    hit_knockback: { loop: false, uso: 'empujon' },
    jump_start: { loop: false, uso: 'despegue' },
    jump_loop: { loop: true, uso: 'cuerpo en el aire' },
    jump_land: { loop: false, uso: 'aterrizaje' },
    roll: { loop: false, uso: 'rodada' },
    slide_start: { loop: false, uso: 'arranque del deslizamiento' },
    slide_loop: { loop: true, uso: 'deslizandose' },
    melee_hook: { loop: false, uso: 'gancho, y el agarre por defecto' },
    interact: { loop: true, uso: 'agarre / interaccion' },
    laytoidle: { loop: false, uso: 'levantarse del suelo' },
    fixing_kneeling: { loop: true, uso: 'arrodillado' },
    chest_open: { loop: false, uso: 'abrir los brazos' }
});

/**
 * Nombre de clip del tablero -> archivo que lo representa.
 *
 * SOLO van aqui los clips que son ESE gesto. Un jab con el jab, una carrera con
 * la carrera. Lo que no cabe, esta en `RESERVADO`, y no mezclado: asi la
 * diferencia entre "esto es un jab" y "esto se parece a un jab" se ve de un
 * vistazo al leer la tabla.
 */
export const CLIP_A_ARCHIVO = Object.freeze({
    // --- de pie --------------------------------------------------------
    idle: 'idle_loop',
    walk: 'walk_loop',
    step: 'walk_loop',
    step_long: 'walk_loop',
    jog: 'jog_fwd_loop',
    sprint_f: 'sprint_loop',

    // --- agachado -------------------------------------------------------
    crouch: 'crouch_idle_loop',
    crouch_walk: 'crouch_fwd_loop',
    crouch_guard_high: 'crouch_idle_loop',
    crouch_guard_low: 'crouch_idle_loop',

    // --- golpes ----------------------------------------------------------
    st_recto: 'punch_jab',
    st_jab_largo: 'punch_jab',
    st_cruzado: 'punch_cross',
    st_costillas: 'punch_cross',
    st_gancho: 'melee_hook',
    sp_patada_frontal: 'sword_attack',
    sp_carga_alpine: 'sword_attack',
    sp_botellazo: 'sword_attack',

    // --- suelo y caidas --------------------------------------------------
    roll: 'roll',
    slide: 'slide_loop',
    jump: 'jump_start',
    hop: 'jump_start',
    air_recover: 'jump_land',
    wakeup_crouch: 'laytoidle',
    wakeup_prone: 'laytoidle',
    kneel: 'fixing_kneeling',
    stance_base: 'idle_loop',
    backdash: 'sprint_loop',
    dash_side: 'sprint_loop'
});

/**
 * Los clips SIN animacion grabada que se sirven de OTRO, y por que.
 *
 * OJO: el segundo campo no es decorativo. Es la lista de MENTIRAS que el
 * motor esta contando a proposito, y por eso `tests/clipassets.smoke.mjs` la
 * imprime entera: cuando se vea una patada giratoria haciendo un jab, la
 * respuesta esta aqui escrita, no hay que buscarla.
 *
 * Y por eso NO esta la mayoria. Un `rv_bottom` (el de abajo en el suelo) con
 * `melee_hook` seria alguien de pie haciendo un gancho: el archivo es un gancho
 * y no hay grabada a nadie en el suelo. Esos se quedan sin archivo a proposito.
 */
export const RESERVADO = Object.freeze({
    // Un cuerpo en el aire es un cuerpo en el aire: no hay grabacion
    // distinta para "cayendo" y para "en un jaleo".
    fall: 'jump_loop',
    juggle: 'jump_loop',
    juggle_dead: 'jump_loop',
    slow_fall: 'jump_loop',
    atk_air: 'jump_loop',

    // Las dos unicas reacciones que hay, y se eligen por el hueso del golpe.
    hitstun: 'hit_chest',
    dizzy: 'hit_head',
    combo_breaker: 'hit_knockback',

    // El suelo: no hay clip de caida tendida, se sirve el que mas se le
    // parece y el motor mezcla encima la postura tendida.
    down_prone: 'laytoidle',
    down_supine: 'laytoidle',

    // El gancho es el unico agarre grabado, asi que es el agarre por defecto.
    rv_agarre_pie: 'melee_hook',
    rv_agarre_agachado: 'melee_hook',
    rv_agarre_montado: 'melee_hook',
    rv_atemi_uke: 'melee_hook',
    rv_atemi_tori: 'melee_hook',
    rv_ukemi: 'melee_hook',
    rv_proyeccion: 'melee_hook',
    rv_sumision: 'melee_hook',
    rv_escape: 'melee_hook',
    rv_presion: 'melee_hook',
    rv_clinch: 'melee_hook',
    rv_bottom: 'melee_hook',
    rv_top: 'melee_hook'
});

/**
 * Los clips que NO tienen animacion grabada, y se dice a proposito.
 *
 * Un nombre que esta en la tabla del tablero, en la reserva, o aqui, es un
 * nombre que alguien ha decidido. Un nombre que no esta en ninguna de las tres
 * es un agujero: nadie ha dicho que pasa con el, y el motor lo descubriria
 *Frame a frame.
 *
 * La lista se imprime entera en `tests/clipassets.smoke.mjs`. Es la lista de
 * trabajo de las animaciones que quedan por grabar, y es lo que decide cuando
 * se puede decir "la biblioteca esta completa": cuando esta lista este vacia.
 * Por eso esta escrita A MANO y no se deduce: si se dedujese, vacia significaria
 * "no queda ninguna" y no "nadie lo ha mirado".
 *
 * Y hay una razon en cada grupo, porque "no hay animacion" no es siempre lo
 * mismo:
 *
 *   - golpes con gesto propio (`st_uppercut`, `sp_patada_giro`): hay que
 *     GRABARLOS, no prestarlos. Un uppercut con el jab es un maniqui que hace
 *     mal un jab, y se ve peor que no hacer nada.
 *   - agarres en el suelo (`rv_bottom_hit`...): falta grabarlos tumbados.
 *   - movilidad: `couch_dash` y `jump_dash` no son el mismo ritmo que el
 *     deslizamiento normal.
 */
export const SIN_ANIMACION = Object.freeze({
    // --- golpes que hay que GRABAR, no prestar ----------------------------
    st_uppercut: 'el uppercut tiene un gesto que el jab no',
    st_patada_lateral: 'la patada de lado no es la de frente',
    sp_patada_giro: 'la patada giratoria se ve de espaldas',
    st_patada_baja: 'el barrido va al suelo y el jab no',
    sp_derribo: 'el derribo acaba tumbando; el gancho no',
    sp_pasa_pie_abajo: 'la jugada de pasa pies es propia',
    sp_embestida: 'la embestida mueve el cuerpo entero hacia delante',
    sp_sumision: 'la sumision es su propia jugada',

    // --- agarres tumbados ------------------------------------------------
    rv_bottom_hit: 'falta el agarre tumbado de abajo',
    rv_top_strike: 'falta el golpe desde arriba en el suelo',
    rv_bottom_escape: 'falta la fuga tumbada',
    rv_top_escape: 'falta la fuga tumbada de arriba',
    rv_bottom_ukemi: 'falta la ukemi tumbada',
    rv_top_ukemi: 'falta la ukemi de arriba',

    // --- movilidad -------------------------------------------------------
    sprint_b: 'correr hacia atras es otro ritmo',
    side_step: 'el desplazamiento de lado no es el sprint',
    quad: 'el gateo no es una agachada profunda',
    stagger: 'el tropiezo es un solo instante',
    acrobatics: 'la pirueta no es una rodada',
    couch_dash: 'deslizarse agachado tiene otro ritmo',
    jump_dash: 'el dash en el aire no es el despegue'
});

/**
 * Archivos descargados que todavia no usa nadie.
 *
 * No es basura y no es un fallo: son animaciones_metricas que ya estan en el
 * disco para cuando haya un gesto que las pida. Se declaran aqui, con el
 * motivo, para que la pregunta "por que esta este archivo aqui" tenga
 * respuesta y no haya que abrir el .glb a adivinar.
 */
export const GUARDADOS = Object.freeze({
    interact: 'agarre por proximidad; de momento los agarres usan melee_hook',
    slide_start: 'el arranque del deslizamiento, para cuando se pueda encadenar con el bucle',
    chest_open: 'abrir los brazos; es un gesto de victoria que el combate todavia no tiene'
});

/**
 * El archivo de un clip del tablero, o `null` si no hay animacion grabada.
 *
 * @param {string} clip nombre del tablero (`ClipBoard`)
 * @returns {string|null} nombre de archivo SIN extension
 */
export function archivoDe(clip) {
    if (!clip) return null;
    const directo = CLIP_A_ARCHIVO[clip];
    if (directo) return directo;
    const reserva = RESERVADO[clip];
    if (reserva) return reserva;
    return null;
}

/** ¿Este clip se ha declarado SIN animacion a proposito? */
export function declaradoSinAnimacion(clip) {
    return Object.prototype.hasOwnProperty.call(SIN_ANIMACION, clip);
}

/**
 * El mismo dato pero dicho como tabla, que es lo que necesita el HUD de
 * depuracion para poder ensenyar "este clip esta mintiendo".
 *
 * @returns {{clip: string, archivo: string, propia: boolean}[]}
 */
export function reservas() {
    return Object.keys(RESERVADO).map(c => ({
        clip: c, archivo: RESERVADO[c], propia: false
    }));
}

/**
 * Los clips del tablero que NO tienen animacion grabada y no se sirven de
 * ninguna reserva.
 *
 * @param {string[]} clips nombres del tablero
 * @returns {string[]} los que quedan de pie
 */
export function sinArchivo(clips) {
    return (clips || []).filter(c => c && !archivoDe(c));
}

/** Todos los nombres de clip que el tablero puede llegar a pedir. */
export function nombresQueSePiden() {
    const out = new Set();
    for (const k of Object.keys(CLIP_A_ARCHIVO)) out.add(k);
    for (const k of Object.keys(RESERVADO)) out.add(k);
    for (const k of Object.keys(SIN_ANIMACION)) out.add(k);
    return [...out].sort();
}

export default {
    RUTA, RIG, ARCHIVOS, CLIP_A_ARCHIVO, RESERVADO, SIN_ANIMACION, GUARDADOS,
    archivoDe, declaradoSinAnimacion, reservas, sinArchivo, nombresQueSePiden
};