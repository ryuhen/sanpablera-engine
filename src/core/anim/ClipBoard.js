/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipBoard.js
 * ----------------------------------------------------------------------------
 * EL TABLERO: que animacion es cada estado, cada paso y cada golpe.
 * ============================================================================
 *
 * EL AGUJERO QUE CIERRA
 * ----------------------------------------------------------------------------
 *   `CineConstants.js` dice, en su cabecera, que la FSM y la cinematica "se
 *   hablan via StateCineMap, que traduce un State de combate a un clip de
 *   animacion". Ese mapa no existia. No habia ninguna tabla en ningun sitio que
 *   dijera "el estado ATAQUE_LIGERO se ve con el clip atk_light", asi que:
 *
 *     - `FighterEntity._pose` inventaba su propio identificador de mezcla
 *       (`'FSM:' + state.id`), que no es un clip: es un numero de estado. Dos
 *       estados que se ven IGUAL (NORMAL_A y NORMAL_B) mezclaban entre si
 *       porque sus cadenas no coincidian.
 *     - `ClipLibrary` tenia 26 clips y el juego pedia 60: los 34 que faltaban
 *       no se veian porque nadie los pedia por su nombre en ningun sitio.
 *     - Y con `stanceAttackKey` la matriz de direcciones puede cambiar el GOLPE
 *       en runtime (un jab puede salir GANCHO, ATAQUE_AGACHADO o
 *       PUNO_ADELANTE_IZQ), pero el identificador de mezcla seguia siendo el del
 *       ESTADO. Animacion de jab con datos de gancho.
 *
 *   Este archivo es el tablero que falta: el unico sitio donde se decide que
 *   animacion corresponde a cada cosa.
 *
 * POR QUE ES UNA TABLA Y NO SE DEDUCE
 * ----------------------------------------------------------------------------
 *   Podria deducirse del `tag` y de los `groups` de cada estado. Se deduce la
 *   FAMILIA (`hitstun` para todo lo que esta en IMPACT) y se elige un clip
 *   dentro de la familia por el resto de datos, pero ELEGIR cual de los tres
 *   golpes de suelo va con MAREADO es una decision de diseno, no una consecuencia
 *   de los grupos. Lo mismo que en `ground/stance.js`: el mapa es explicito
 *   porque un criterio deducido cambia en cuanto se toca un dato.
 *
 * POR QUE EL GOLPE MANDA SOBRE EL ESTADO
 * ----------------------------------------------------------------------------
 *   El estado dice "estoy atacando". El GOLPE dice "con que". Y como el golpe lo
 *   decide la matriz de direcciones y la postura (ver `stanceAttackKey`), la
 *   animacion tiene que seguir al golpe: si no, el peleador hace la cara del jab
 *   con la silueta del gancho.
 *
 * LA JERARQUIA, EN ORDEN
 * ----------------------------------------------------------------------------
 *       1. el estado exacto ......... el que se ha declarado en la tabla
 *       2. el golpe ................. si el estado es de ataque, manda el golpe
 *       3. los grupos ............... IMPACT / DOWNED / WAKEUP / AIRBORNE / GRAPPLE
 *       4. la locomocion ............ de pie, la maquina de movimiento decide
 *       5. `idle` ................... el suelo del suelo: nunca falla
 *
 *   El orden importa en los estados que estan en VARIOS grupos a la vez, que son
 *   muchos: JUGGLER esta en AIRBORNE, IMPACT y STUNNED, y SIN_AIRE esta en
 *   IMPACT, AIRBORNE y STUNNED. El impacto va antes que el aire porque a quien
 *   le pegan en el aire lo que hay que ver es la reaccion, no que esta flotando.
 *   Es el mismo criterio que ya usa `Blend.blendFor`, y por deliberado los dos
 *   tienen que dar la misma respuesta: si la mezcla dura 0 s pero el clip es el
 *   de caida, el cuerpo aparece quieto un instante en el sitio que no es.
 *
 * ES PURO
 * ----------------------------------------------------------------------------
 *   Ni Babylon, ni DOM, ni el rig. Solo datos y decision, asi que `tests/` puede
 *   comprobar que los 71 estados tienen clip, que la jerarquia se respeta y que
 *   no hay dos estados con el mismo nombre de clipote^tipo.
 * ============================================================================
 */

/** De donde salio el clip. Se usa para el HUD de depuracion y los tests. */
export const ORIGEN = Object.freeze({
    ESTADO: 'ESTADO',   // fila 1: el estado exacto de la tabla
    GOLPE: 'GOLPE',     // fila 2: la animacion la decide el golpe
    GRUPO: 'GRUPO',     // fila 3: IMPACT / DOWNED / WAKEUP / AIRBORNE / GRAPPLE
    LOCO: 'LOCO',       // fila 4: la maquina de locomocion
    REPOSO: 'REPOSO'    // fila 5: idle, el suelo del suelo
});

// ===========================================================================
// 1. EL TABLERO DE ESTADOS
// ===========================================================================

/**
 * Estado -> clip.
 *
 * `null` NO es "no hay clip": es "este estado no tiene voz propia", y es lo
 * correcto para NORMAL_A, NORMAL_B y MOVIMIENTO_8_DIRECCIONES, que son los
 * estados de ESTAR de pie. En esos manda la fila 4, la locomocion, que es la
 * que sabe si el peleador esta quieto, andando o corriendo. Ponerles un clip
 * aqui los anclaria a `idle` y nunca volverian a andar.
 */
export const CLIP_DE_ESTADO = Object.freeze({
    // --- base y posicionamiento ------------------------------------------
    1: null,                    // NORMAL_A            -> la locomocion
    2: null,                    // NORMAL_B            -> la locomocion
    3: 'crouch',                // AGACHADO
    4: 'crouch_guard_high',     // AGACHADO_GUARDIA_ALTA
    5: 'crouch_guard_low',      // AGACHADO_GUARDIA_BAJA
    6: null,                    // MOVIMIENTO_8_DIR    -> la locomocion
    7: 'stance_base',           // POSTURA_ESTILO_BASE
    8: 'stance_base',           // POSTURA_DERIVADA_TECNICA

    // --- movilidad rapida e inercia --------------------------------------
    10: null,                   // SPRINT_FRONTAL      -> la locomocion (carrera)
    11: 'sprint_b',             // SPRINT_ATRAS
    12: 'dash_side',            // DASH_LATERAL
    13: 'side_step',            // SIDE_STEP
    14: 'backdash',             // DASH_ATRAS
    15: 'slide',                // DESLIZAMIENTO
    16: 'quad',                 // CUADRUPEDA
    17: 'kneel',                // DE_RODILLAS
    18: 'stagger',              // TROPEZON
    19: 'roll',                 // RODANDO
    20: 'acrobatics',           // ACROBACIA

    // --- aire --------------------------------------------------------------
    30: 'jump',                 // SALTO_NORMAL_A       (despegue)
    31: 'jump',                 // SALTO_NORMAL_B
    32: 'hop',                  // SALTO_CORTO_A
    33: 'hop',                  // SALTO_CORTO_B
    34: 'fall',                 // AIRE_LIBRE
    35: 'juggle',               // JUGGLER
    36: 'air_recover',          // SALTO_AEREO_RECUPERACION
    37: 'slow_fall',            // CAIDA_LENTA

    // --- impactos ---------------------------------------------------------
    40: 'hitstun',              // GOLPEADO
    41: 'dizzy',                // MAREADO
    42: 'juggle_dead',          // SIN_AIRE

    // --- suelo ------------------------------------------------------------
    43: 'down_prone',           // SUELO_TUMBADO_BOCA_ABAJO
    44: 'down_supine',          // SUELO_TUMBADO_BOCA_ARRIBA
    45: 'wakeup_crouch',        // LEVANTANDOSE_DESDE_AGACHADO
    46: 'wakeup_prone',         // LEVANTANDOSE_DESDE_PECHO_TIERRA
    47: 'down_prone',           // PECHO_TIERRA

    // --- sistema ----------------------------------------------------------
    50: null,                   // ANY_POINT_CANCEL    -> la locomocion
    51: 'combo_breaker',        // COMBO_BREAKER

    // --- ataque -----------------------------------------------------------
    // Aqui NO hay clip a proposito: estos cuatro estados dicen "estoy
    // golpeando" y no "con que". El golpe lo decide `stanceAttackKey` en
    // runtime (matriz de direcciones + postura), asi que la animacion tiene que
    // salir del golpe (fila 2 de la jerarquia) o se veria la cara del jab con la
    // silueta del gancho.
    60: null,                   // ATAQUE_LIGERO
    61: null,                   // ATAQUE_PESADO
    62: null,                   // ATAQUE_ESPECIAL
    63: null,                   // ATAQUE_AEREO

    // --- agarres ----------------------------------------------------------
    70: 'rv_agarre_pie',        // AGARRE_UKE_PIE
    71: 'rv_agarre_pie',        // AGARRE_TORI_PIE
    72: 'rv_agarre_agachado',   // AGARRE_UKE_AGACHADO
    73: 'rv_agarre_agachado',   // AGARRE_TORI_AGACHADO
    74: 'rv_agarre_montado',    // AGARRE_UKE_TORI_AGACHADO
    75: 'rv_agarre_montado',    // AGARRE_TORI_TORI_AGACHADO
    76: 'rv_atemi_uke',         // AGARRE_ATEMI_UKE
    77: 'rv_atemi_tori',        // AGARRE_ATEMI_TORI
    78: 'rv_ukemi',             // AGARRE_UKEMI_UKE
    79: 'rv_ukemi',             // AGARRE_UKEMI_TORI
    80: 'rv_proyeccion',        // AGARRE_PROYECCION_UKE
    81: 'rv_proyeccion',        // AGARRE_PROYECCION_TORI
    82: 'rv_sumision',          // AGARRE_SUMISION_UKE
    83: 'rv_sumision',          // AGARRE_SUMISION_TORI
    84: 'rv_escape',            // AGARRE_ESCAPE_UKE
    85: 'rv_escape',            // AGARRE_ESCAPE_TORI
    86: 'rv_presion',           // AGARRE_PRESION_UKE
    87: 'rv_presion',           // AGARRE_PRESION_TORI
    88: 'rv_bottom',            // AGARRE_SUELO_UKE      (el de abajo)
    89: 'rv_top',               // AGARRE_SUELO_TORI     (el de arriba)
    90: 'rv_bottom',            // AGARRE_SUELO_AGACHADO_UKE
    91: 'rv_top',               // AGARRE_SUELO_AGACHADO_TORI
    92: 'rv_bottom_hit',        // AGARRE_SUELO_ATEMI_UKE
    93: 'rv_top_strike',        // AGARRE_SUELO_ATEMI_TORI
    94: 'rv_bottom_escape',     // AGARRE_SUELO_ESCAPE_UKE
    95: 'rv_top_escape',        // AGARRE_SUELO_ESCAPE_TORI
    96: 'rv_bottom_ukemi',      // AGARRE_SUELO_UKEMI_UKE
    97: 'rv_top_ukemi',         // AGARRE_SUELO_UKEMI_TORI
    98: 'rv_clinch',            // AGARRE_UKE_CLINCH
    99: 'rv_clinch',            // AGARRE_TORI_CLINCH
});

// ===========================================================================
// 2. EL TABLERO DE GOLPES
// ===========================================================================

/**
 * Las familias de golpe.
 *
 * POR QUE FAMILIAS Y NO 53 FILAS
 *   El motor define 53 golpes (`MoveTable.CORE_MOVES`) mas los que cada peleador
 *   anade, y la matriz de direcciones referencia la mayoria por patron
 *   (`PUNO_*`, `PATADA_*`). Escribir 53 filas seria copiar el mismo dato 53
 *   veces y se desincronizaria en cuanto se anadiera un golpe. Lo que se
 *   declara es la FAMILIA de cada golpe, que es lo que de verdad decide como se
 *   ve: un `PUNO_AEREO_ADELANTE_DER` se ve como un `PUNO_AEREO_IZQ`.
 *
 *   Y la familia tambien es lo que hace que un golpe NUEVO tenga animacion sin
 *   tocar este archivo: si el nombre encaja en un patron, sale clip.
 */
export const FAMILIA = Object.freeze({
    RECTO: 'RECTO',           // jab, recto, el puñetazo de base
    CRUZADO: 'CRUZADO',       // el cruzado, el que remata con mas peso
    GANCHO: 'GANCHO',         // gancho y codo: entra girando
    ALTO: 'ALTO',             // uppercut / caballero: de abajo arriba
    FRONTAL: 'FRONTAL',       // patada de frente, la que mantiene distancia
    LADO: 'LADO',             // patadas de lado
    GIRO: 'GIRO',             // patada giratoria, la que se ve de espaldas
    BAJA: 'BAJA',             // barrido y patada baja: al suelo
    AIRE: 'AIRE',             // todo lo que se golpea en el aire
    ESPECIAL: 'ESPECIAL',     // los golpes con nombre propio (sp_*)
    ZANCADA: 'ZANCADA',       // embestida: el cuerpo entero va adelante
    AGARRE: 'AGARRE'          // agarres y derribos
});

/**
 * Familia de golpe por clave. Se declara lo que NO se deduce del nombre.
 *
 * OJO con lo que parece deducible y no lo es: `ATAQUE_PESADO` es un puño en el
 * combate, no una patada. El nombre del ESTADO no dice con que extremidad pega,
 * porque el estado se puede entrar desde los dos botones. Por eso la fila
 * `ATAQUE_PESADO` esta aqui notwithstanding lo que sugiera su nombre.
 */
export const FAMILIA_DE_GOLPE = Object.freeze({
    ATAQUE_LIGERO: FAMILIA.RECTO,
    ATAQUE_AGACHADO: FAMILIA.RECTO,
    ATAQUE_PESADO: FAMILIA.CRUZADO,
    ATAQUE_BARRIDO: FAMILIA.BAJA,
    ATAQUE_ESPECIAL: FAMILIA.ESPECIAL,
    ATAQUE_AEREO: FAMILIA.AIRE,
    DERIVADA_TECNICA: FAMILIA.ESPECIAL
});

/**
 * Los patrones del nombre, para los golpes que no tienen fila propia.
 *
 * El ORDEN importa: se prueban en orden y gana el primero que encaja, asi que
 * los especificos van antes que los genericos. `PATADA_SPIN_*` tiene que ganar a
 * `PATADA_*`, y `PATADA_BAJA_ALTA_*` a `PATADA_*`.
 */
const PATRONES = Object.freeze([
    [/_AEREO/, FAMILIA.AIRE],
    [/^PATADA_SPIN_/, FAMILIA.GIRO],
    [/^PATADA_BAJA_/, FAMILIA.BAJA],
    [/^PATADA_ALTA_/, FAMILIA.ALTO],
    [/^PATADA_LADO_/, FAMILIA.LADO],
    [/^PATADA_GIR/, FAMILIA.GIRO],
    [/^PATADA_ATRAS/, FAMILIA.LADO],
    [/^BARRIDO/, FAMILIA.BAJA],
    [/^PATADA/, FAMILIA.FRONTAL],
    [/^PUNO_/, FAMILIA.RECTO],
    [/^STRAIGHT/, FAMILIA.RECTO],
    [/^(UPPERCUT|SP_CABALLERO_ALTO)/, FAMILIA.ALTO],
    [/^(GANCHO|SP_GANCHO|GOLPE_CODO|SP_CODO)/, FAMILIA.GANCHO],
    [/^(EMBESTIDA|SP_EMBESTIDA)/, FAMILIA.ZANCADA],
    [/^(DERIBO|SP_DERIBO|AGARRE|SP_PASA_PIE_ABajo)/, FAMILIA.AGARRE],
    [/^SP_/, FAMILIA.ESPECIAL]
]);

/**
 * De que familia es un golpe.
 *
 * @param {string} key clave de golpe (`ATAQUE_LIGERO`, `PUNO_AEREO_DER`...)
 * @returns {string} una de `FAMILIA`; `RECTO` si no se reconoce
 */
export function familiaDe(key) {
    if (!key) return FAMILIA.RECTO;
    const directa = FAMILIA_DE_GOLPE[key];
    if (directa) return directa;
    for (const [re, fam] of PATRONES) if (re.test(key)) return fam;
    return FAMILIA.RECTO;
}

/**
 * Familia -> clip. La unica tabla que hay que tocar para cambiar de estilo.
 */
export const CLIP_DE_FAMILIA = Object.freeze({
    [FAMILIA.RECTO]: 'st_recto',
    [FAMILIA.CRUZADO]: 'st_cruzado',
    [FAMILIA.GANCHO]: 'st_gancho',
    [FAMILIA.ALTO]: 'st_uppercut',
    [FAMILIA.FRONTAL]: 'sp_patada_frontal',
    [FAMILIA.LADO]: 'st_patada_lateral',
    [FAMILIA.GIRO]: 'sp_patada_giro',
    [FAMILIA.BAJA]: 'st_patada_baja',
    [FAMILIA.AIRE]: 'atk_air',
    [FAMILIA.ESPECIAL]: 'sp_botellazo',
    [FAMILIA.ZANCADA]: 'sp_embestida',
    [FAMILIA.AGARRE]: 'sp_derribo'
});

/**
 * Los golpes que tienen animacion propia aunque sean de otra familia.
 *
 * Son los golpes con nombre de personaje (el botellazo de Pedro) y los que
 * describen una jugada, no un golpe. Van ANTES que la familia, porque una
 * jugada con nombre es siempre mas especifica que su familia.
 */
export const CLIP_DE_GOLPE = Object.freeze({
    SP_GANCHO: 'st_gancho',
    SP_CODO: 'st_gancho',
    SP_CABALLERO_ALTO: 'st_uppercut',
    SP_BARRIDO: 'st_patada_baja',
    SP_PATADA_FRONTAL: 'sp_patada_frontal',
    SP_PATADA_GIRO: 'sp_patada_giro',
    SP_CARGA_ALPINE: 'sp_carga_alpine',
    SP_DERIBO: 'sp_derribo',
    SP_PASA_PIE_ABAJO: 'sp_pasa_pie_abajo',
    SP_BOTELLAZO: 'sp_botellazo',
    SP_EMBESTIDA: 'sp_embestida',
    SP_SUMISION: 'sp_sumision',
    // Agarres de carrera (locomotion.js): entran con su propia silueta.
    RUN_CHARGE_PUNCH: 'st_cruzado',
    RUN_SHOULDER_CHARGE: 'sp_embestida',
    RUN_LEG_GRAB: 'sp_pasa_pie_abajo',
    RUN_NECK_GRAB: 'sp_derribo',
    RUN_TAKEDOWN_RUN: 'sp_derribo',
    // Suelo (ground/punish.js): el castigo por zonas tiene su propia lectura.
    ST_COSTILLAS: 'st_costillas',
    ST_CRUZADO: 'st_cruzado',
    ST_JAB_LARGO: 'st_jab_largo',
    ST_PATADA_BAJA: 'st_patada_baja',
    ST_PROYECCION: 'rv_proyeccion',
    ST_RECTO: 'st_recto',
    ST_UPPERCUT: 'st_uppercut'
});

/**
 * El clip de un golpe.
 *
 * @param {string} key
 * @returns {string} nombre de clip; `st_recto` si el golpe no se reconoce
 */
export function clipDeGolpe(key) {
    if (!key) return CLIP_DE_FAMILIA[FAMILIA.RECTO];
    const propio = CLIP_DE_GOLPE[key];
    if (propio) return propio;
    return CLIP_DE_FAMILIA[familiaDe(key)] || CLIP_DE_FAMILIA[FAMILIA.RECTO];
}

// ===========================================================================
// 3. EL TABLERO DE LOCOMOCION
// ===========================================================================

/**
 * Estado de la maquina de movimiento -> clip.
 *
 * `LOCO_TABLE` ya declara `clip` para cada uno, pero con OTRO vocabulario
 * (`sprint_f`, `dash_side`) y sin los estados que la entidad anade por su cuenta
 * (CUADRUPEDA, TROPEZON...). Aqui estan TODOS, con el mismo vocabulario que el
 * resto del tablero, para que un solo `clip` sea el identificador de mezcla.
 */
export const CLIP_DE_LOCO = Object.freeze({
    IDLE: 'idle',
    STEP: 'step',
    STEP_LONG: 'step_long',
    WALK: 'walk',
    RUN: 'sprint_f',
    DASH: 'dash_side',
    CROUCH_DASH: 'couch_dash',
    JUMP_DASH: 'jump_dash',
    QUAD: 'quad',
    SLIDE: 'slide',
    ROLL: 'roll'
});

// ===========================================================================
// 4. LA RESOLUCION
// ===========================================================================

/** El clip del que no se pasa nunca. */
export const REPOSO = 'idle';

/**
 * Los grupos, en el orden en que mandan.
 *
 * POR QUE IMPACT ANTES QUE AIRBORNE
 *   Hay estados en los dos grupos a la vez (JUGGLER, SIN_AIRE) y la pregunta no
 *   es "donde esta el cuerpo" sino "que le esta pasando". A quien le pegan en el
 *   aire lo que hay que ver es la reaccion. Si el aire ganara, el peleador se
 *   quedaria flotando con la cara de reposo mientras le barren, que es
 *   exactamente el fallo que el hitstop vino a tapar.
 */
const ORDEN_GRUPOS = Object.freeze([
    'IMPACT', 'STUNNED', 'DOWNED', 'WAKEUP', 'GRAPPLE', 'AIRBORNE', 'ATTACKING'
]);

/**
 * El clip de un estado, siguiendo la jerarquia.
 *
 * @param {object} ctx
 * @param {number} [ctx.id]      id del estado
 * @param {string[]} [ctx.groups]
 * @param {object} [ctx.posture] `{ limbs }` del estado
 * @param {string} [ctx.loco]    estado de la maquina de locomocion
 * @param {string} [ctx.move]    clave del golpe en curso (si ataca)
 * @returns {{clip: string, origen: string}}
 */
export function resolver(ctx = {}) {
    // --- 1. el estado exacto ------------------------------------------
    const propio = CLIP_DE_ESTADO[ctx.id];
    if (propio) return { clip: propio, origen: ORIGEN.ESTADO };

    const groups = ctx.groups || [];
    const limbs = ctx.posture && ctx.posture.limbs;

    for (let i = 0; i < ORDEN_GRUPOS.length; i++) {
        if (groups.indexOf(ORDEN_GRUPOS[i]) === -1) continue;
        const g = ORDEN_GRUPOS[i];

        if (g === 'ATTACKING') {
            // El golpe manda sobre el estado: es el unico dato que sabe QUE se
            // esta haciendo, y con la matriz de direcciones puede cambiar dentro
            // del mismo estado.
            return { clip: clipDeGolpe(ctx.move), origen: ORIGEN.GOLPE };
        }
        if (g === 'IMPACT' || g === 'STUNNED') {
            // En el aire la reaccion es otra: el cuerpo esta joldeado.
            if (limbs === 'JUGGLE') return { clip: 'juggle', origen: ORIGEN.GRUPO };
            if (limbs === 'FLOAT') return { clip: 'air_recover', origen: ORIGEN.GRUPO };
            return { clip: 'hitstun', origen: ORIGEN.GRUPO };
        }
        if (g === 'DOWNED') {
            return {
                clip: limbs === 'SUPINE' ? 'down_supine' : 'down_prone',
                origen: ORIGEN.GRUPO
            };
        }
        if (g === 'WAKEUP') {
            return {
                clip: limbs === 'CROUCH' ? 'wakeup_crouch' : 'wakeup_prone',
                origen: ORIGEN.GRUPO
            };
        }
        if (g === 'GRAPPLE') {
            return { clip: clipDeAgarre(limbs), origen: ORIGEN.GRUPO };
        }
        if (g === 'AIRBORNE') {
            return { clip: 'fall', origen: ORIGEN.GRUPO };
        }
    }

    // --- 4. la locomocion ----------------------------------------------
    const l = CLIP_DE_LOCO[ctx.loco];
    if (l) return { clip: l, origen: ORIGEN.LOCO };

    // --- 5. el suelo del suelo -----------------------------------------
    return { clip: REPOSO, origen: ORIGEN.REPOSO };
}

/**
 * El clip de agarre segun la postura del estado.
 *
 * SOLO se usa de reserva, para los estados de agarre que no tengan fila propia.
 * Los treinta estados estan declarados uno a uno en `CLIP_DE_ESTADO` porque el
 * papel (uke / tori) y la postura (de pie, agachado, en el suelo) SIEMPRE estan
 * presentes en el estado, y esta funcion solo recibe `limbs`, que no los
 * distingue. Adivinar el papel desde los grupos seria FALSO: los dos cuerpos
 * estan en los mismos grupos y solo uno esta agarrando al otro.
 */
export function clipDeAgarre(limbs) {
    if (!limbs) return 'rv_agarre_pie';
    if (limbs === 'GRAPPLE_TORI') return 'rv_agarre_pie';
    if (limbs === 'GRAPPLE_UKE') return 'rv_agarre_pie';
    if (limbs === 'TOP' || limbs === 'TOP_CROUCH') return 'rv_top';
    if (limbs === 'BOTTOM' || limbs === 'BOTTOM_HIT' || limbs === 'BOTTOM_ESCAPE') return 'rv_bottom';
    return 'rv_agarre_pie';
}

// ===========================================================================
// 5. LA COBERTURA
// ===========================================================================

/**
 * Que estados se quedan sin clip.
 *
 * Solo se puede calcular pasando la biblioteca: un estado con fila en la tabla
 * puede tener un clip que la biblioteca no tenga todavia (y al reves). Lo que se
 * mira aqui es que la JERARQUIA cubre todos los estados, que es lo que depende
 * solo de este archivo.
 *
 * @param {Array<{id:number, groups:string[], posture:object}>} estados
 * @returns {Array<{id:number, sinClip:string[]}>} los que no llegan a ningun sitio
 */
export function sinClip(estados) {
    const out = [];
    for (const s of estados || []) {
        const nombres = new Set();
        if (CLIP_DE_ESTADO[s.id]) nombres.add(CLIP_DE_ESTADO[s.id]);
        for (const g of s.groups || []) {
            const r = resolver({
                id: null, groups: [g], posture: s.posture, loco: 'IDLE',
                move: 'ATAQUE_LIGERO'
            });
            nombres.add(r.clip);
        }
        // Un estado sin fila, sin grupo util y sin locomocion no tiene clip.
        if (!nombres.size) out.push({ id: s.id, sinClip: ['(sin fila ni grupo)'] });
    }
    return out;
}

export default {
    ORIGEN, FAMILIA, REPOSO,
    CLIP_DE_ESTADO, CLIP_DE_LOCO, CLIP_DE_FAMILIA, CLIP_DE_GOLPE, FAMILIA_DE_GOLPE,
    familiaDe, clipDeGolpe, clipDeAgarre, resolver, sinClip
};
