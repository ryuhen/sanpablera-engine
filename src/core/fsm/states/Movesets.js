/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/Movesets.js
 * ----------------------------------------------------------------------------
 * LOS MOVISETS DE LOS PELEADORES. Aqui vive el ejemplo
 * completo: como se escribe el moveset de un peleador y
 * como se alcanza cada golpe.
 *
 * COMO FUNCIONA UN MOVISET (en 4 piezas)
 * ----------------------------------------------------------------------------
 *   1. FRAME DATA (defineMove): cuanto tarda en salir
 *      (startup), cuantos frames hace dano (active), cuanto
 *      dura la recuperacion (recovery), dano, hitstun, forma
 *      de la hitbox, CLASIFICACION (LINEAL se esquiva
 *      moviandose / AREA caza al que se mueve) y ALTURA
 *      (ALTO / MEDIO / BAJO / SUELO).
 *   2. REGISTRO (registerMoves): los golpes se registran
 *      POR CLAVE. Una clave que ya existe en el set base
 *      (ATAQUE_LIGERO...) lo SUSTITUYE para ese peleador:
 *      dos luchadores comparten el estado ATAQUE_LIGERO y se
 *      sienten distintos. Los golpes NUEVOS se suman con
 *      claves propias (GANCHO, BARREDO...).
 *   3. ESTADOS (defineState): cada golpe nuevo necesita un
 *      estado ATTACKING cuyo `attack` apunta a la clave.
 *      El estado dice EN QUE SITUACION esta el cuerpo; el
 *      moveset dice COMO es el golpe.
 *   4. ALCANCE (Transitions.js): el vocabulario de intents
 *      es el mismo para todos (ligero, pesado, especial...).
 *      Las reglas que llevan a los estados propios preguntan
 *      al MOVISET del peleador si define el golpe (hasMove):
 *      si no lo define, la regla no compite y sale el golpe
 *      base. Asi un moveset amplia el vocabulario sin tocar
 *      la FSM ni romper al resto de peleadores.
 *
 * PEDRO PÉREZ, "EL VECINO INVICTO" — EL MOVISET CAPA POR CAPA
 * ----------------------------------------------------------------------------
 * La especificacion de Sanpablera: cada peleador viene de un
 * estilo base y, en la calle, lo adapta con formas variadas
 * y mucha movilidad. Pedro es el ejemplo: empieza como
 * BOXEADOR y le crecen las capas:
 *
 *   CAPA 1 · BOXEO (su estilo base: puños rapidos y rectos)
 *     directo ....... ligero ................ LINEAL, MEDIO
 *     gancho ........ adelante + ligero ...... LINEAL, MEDIO (entra)
 *     codazo ........ atrás + ligero ......... LINEAL, ALTO
 *   CAPA 1b · ESTANCIAS (el sistema de posturas de boxeo)
 *     El arquetipo YUGO tiene TRES posturas rotativas y tres
 *     de comando (core/boxing.js). Cada una tiene SU propio
 *     moveset, y en CUALQUIER fotograma en que la postura
 *     este activa (incluso a mitad de una transicion) el
 *     peleador puede usarla:
 *       SHELL  (Peek-a-Boo)  ligero -> corto · pesado -> ascendente
 *       LEAD   (Puo al frente) ligero -> jab largo · pesado -> cruzado
 *       RELAX  (Descansada)   ligero -> gancho · pesado -> patada baja
 *       PRESS  (Presion)      ligero -> recto · pesado -> gancho
 *       ABSORB (Absorcion)    ligero -> corto · pesado -> patada baja
 *       CATCH  (Atrapamiento) ligero -> costillazo · pesado -> proyeccion
 *   CAPA 2 · PATADAS (la adaptacion del puerto: savate)
 *     patada giratoria  pesado ............... AREA, MEDIO (caza)
 *     patada frontal .. adelante + pesado .... LINEAL, MEDIO (distancia)
 *     barrido ....... abajo + pesado ......... LINEAL, BAJO (derriba)
 *   CAPA 3 · SUELO (la pelea del suelo del barrio)
 *     derribo ....... técnica ................. AREA, derribo
 *     embestida ... cuadrupeda + pesado ...... AREA, derribo (carga)
 *     sumisión ...... dentro del agarre (ver abajo)
 *   CAPA 4 · ARMA (el as de la calle)
 *     botellazo ..... especial (paga) ......... AREA, FUERTE, derribo
 *
 * LA MOVILIDAD (doble toque = dash, dash agachado que esquiva
 * altos, dash saltando que esquiva bajos, cuadrupeda,
 * deslizamiento...) es del motor y es de TODOS: Pedro la
 * hereda igual que cualquier otro peleador.
 *
 * LA SUMISION: el sistema de agarre ya tiene la accion
 * SUMISION (ATAQUE_ESPECIAL dentro del agarre, ver
 * Transitions.js). El cableado entre los dos peleadores (que
 * el rival entre en el estado espejo) es el paso siguiente;
 * el golpe, su frame data y su estado ya estan aqui, listos
 * para cuando el agarre se ligue entre los dos.
 * ============================================================================
 */
import SPF from '../Constants.js';
import { defineMove, registerMoves } from '../MoveTable.js';
import { defineState } from '../StateCatalog.js';
import { CHARACTER_STATE_BASE } from './CharacterStates.js';

const {
    State, StateGroup, Phase, VelocityPolicy,
    PhysicalFlag, HitLevel, GuardHeight, CancelTier
} = SPF;

/** Banderas de un ataque en el suelo (el golpe manda en el movimiento). */
const ATK = SPF.toFlags([PhysicalFlag.LOCK_ROTATION, PhysicalFlag.STAGE_CLAMP]);

// ===========================================================================
// PEDRO PÉREZ — "el vecino invicto"
// ===========================================================================

/**
 * El moveset de Pedro. Nota como las cuatro capas se
 * escriben en el mismo registro: el estilo base (boxeo)
 * SUSTITUYE las claves comunes y las capas que le crecen
 * (patadas propias, suelo, botella) se suman con claves
 * nuevas.
 */
registerMoves('PEDRO', {
    // --- CAPA 1 · BOXEO ------------------------------------------------
    // El directo es SU jab: mas rapido y mas corto que el
    // del set base, para el boxeo de esquina (pegada y
    // vuelta a la guardia).
    ATAQUE_LIGERO: defineMove('ATAQUE_LIGERO', {
        label: 'Directo', state: State.ATAQUE_LIGERO,
        startup: 3, active: 2, recovery: 6,
        damage: 5, hitstun: 11, blockstun: 7,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.LIGHT, meterGain: 9, meterCost: 0,
        hitstop: 4, radius: 0.46, forward: 0.46, centerY: 1.18,
        clip: 'atk_light'
    }),

    // El gancho: entra hacia delante, algo mas lento que el
    // jab pero con mas dano. LINEAL: quien da un paso lo
    // esquiva; quien se queda, lo come.
    GANCHO: defineMove('GANCHO', {
        label: 'Gancho', state: State.ATAQUE_LIGERO,
        startup: 6, active: 3, recovery: 10,
        damage: 9, hitstun: 15, blockstun: 9,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.LIGHT, meterGain: 11, meterCost: 0,
        hitstop: 6, radius: 0.52, forward: 0.55, centerY: 1.12,
        clip: 'sp_gancho'
    }),

    // El codazo: el golpe de clinch, alto (lo esquiva el
    // dash agachado) y rapido. Sirve para castigar al que
    // retrocede de espaldas.
    GOLPE_CODO: defineMove('GOLPE_CODO', {
        label: 'Codazo', state: State.ATAQUE_LIGERO,
        startup: 4, active: 2, recovery: 8,
        damage: 6, hitstun: 12, blockstun: 8,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.ALTA,
        type: 'LINEAL', height: 'ALTO',
        cancelTier: CancelTier.LIGHT, meterGain: 8, meterCost: 0,
        hitstop: 5, radius: 0.42, forward: 0.4, centerY: 1.3,
        clip: 'sp_codo'
    }),

    // --- CAPA 1b · EL MOVESET DE LAS ESTANCIAS (arquetipo YUGO) --------
    // Cada postura de boxeo (core/boxing.js) tiene SU PROPIO
    // moveset, accesible en cualquier fotograma en que este
    // activa (ver FighterEntity.stanceAttack). Estos son los
    // golpes que sustituyen a los del set base segun la
    // postura: el mismo boton, lectura distinta.
    //
    //   SHELL / ABSORB · golpe corto -> jab minimo y
    //     barato: es la respuesta mientras se absorbe.
    GOLPE_CORTO: defineMove('GOLPE_CORTO', {
        label: 'Corto', state: State.ATAQUE_LIGERO,
        startup: 2, active: 2, recovery: 5,
        damage: 5, hitstun: 10, blockstun: 6,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',   // lo esquiva el paso
        cancelTier: CancelTier.LIGHT, meterGain: 7, meterCost: 0,
        hitstop: 3, radius: 0.42, forward: 0.40, centerY: 1.22,
        clip: 'st_corto'
    }),
    //   LEAD · jab largo: el alcance que controla el espacio
    //   frontal. Rapido y con mas mano.
    JAB_LARGO: defineMove('JAB_LARGO', {
        label: 'Jab largo', state: State.ATAQUE_LIGERO,
        startup: 3, active: 2, recovery: 7,
        damage: 6, hitstun: 11, blockstun: 7,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.LIGHT, meterGain: 8, meterCost: 0,
        hitstop: 4, radius: 0.5, forward: 0.78, centerY: 1.18,
        clip: 'st_jab_largo'
    }),
    //   SHELL · upper: el angel. Sube por debajo de la guardia
    //   (rompe ALTA) y tira al rival hacia arriba.
    UPPERCUT: defineMove('UPPERCUT', {
        label: 'Ascendente', state: State.ATAQUE_PESADO,
        startup: 6, active: 3, recovery: 12,
        damage: 10, hitstun: 17, blockstun: 10,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.ALTA,
        type: 'LINEAL', height: 'ALTO',   // el dash agachado lo esquiva
        knockdown: 'LIGHT', launchX: 1.4, launchY: 3.4, juggleAdd: 1,
        cancelTier: CancelTier.HEAVY, meterGain: 10, meterCost: 0,
        hitstop: 8, radius: 0.5, forward: 0.5, centerY: 1.42,
        clip: 'st_uppercut'
    }),
    //   LEAD · cruzado: el recto de potencia. LINEAL y con
    //   mas empuje: es la respuesta larga del jab.
    CRUZADO: defineMove('CRUZADO', {
        label: 'Cruzado', state: State.ATAQUE_PESADO,
        startup: 7, active: 3, recovery: 12,
        damage: 11, hitstun: 18, blockstun: 10,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.ALTA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.HEAVY, meterGain: 11, meterCost: 0,
        hitstop: 8, radius: 0.56, forward: 0.82, centerY: 1.16,
        clip: 'st_cruzado'
    }),
    //   PRESS · recto de presion: rapido y con la guardia
    //   rota (rompe la guardia BAJA): abre la secuencia.
    RECTO: defineMove('RECTO', {
        label: 'Recto', state: State.ATAQUE_LIGERO,
        startup: 5, active: 2, recovery: 9,
        damage: 8, hitstun: 15, blockstun: 9,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.LIGHT, meterGain: 9, meterCost: 0,
        hitstop: 6, radius: 0.52, forward: 0.68, centerY: 1.18,
        clip: 'st_recto'
    }),
    //   RELAX / ABSORB · patada baja: el arma de las
    //   posturas bajas. LINEAL por el suelo (el dash
    //   saltando la salta) y levanta al rival.
    PATADA_BAJA: defineMove('PATADA_BAJA', {
        label: 'Patada baja', state: State.ATAQUE_PESADO,
        startup: 7, active: 3, recovery: 14,
        damage: 7, hitstun: 16, blockstun: 9,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.BAJA,
        type: 'LINEAL', height: 'BAJO',   // el dash saltando la esquiva
        knockdown: 'LIGHT', launchX: 1.2, launchY: 1.6, juggleAdd: 0,
        cancelTier: CancelTier.HEAVY, meterGain: 9, meterCost: 0,
        hitstop: 7, radius: 0.62, forward: 0.72, centerY: 0.5,
        clip: 'st_patada_baja'
    }),
    //   CATCH · costillazo: el trabajo del abrazo tactico,
    //   a la altura de las costillas (el unico golpe que
    //   la postura de atrapar necesita para el remate).
    COSTILLAZO: defineMove('COSTILLAZO', {
        label: 'Costillazo', state: State.ATAQUE_LIGERO,
        startup: 4, active: 2, recovery: 8,
        damage: 7, hitstun: 14, blockstun: 8,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.LIGHT, meterGain: 8, meterCost: 0,
        hitstop: 5, radius: 0.44, forward: 0.42, centerY: 0.82,
        clip: 'st_costillas'
    }),
    //   CATCH · proyeccion: el remate del abrazo. AREA y
    //   con derribo garantizado: el suelo es del que
    //   atrapa patadas.
    PROYECCION: defineMove('PROYECCION', {
        label: 'Proyección', state: State.ATAQUE_PESADO,
        startup: 10, active: 4, recovery: 22,
        damage: 14, hitstun: 24, blockstun: 0,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'ALWAYS', launchX: 5.4, launchY: 3.2, juggleAdd: 2,
        cancelTier: CancelTier.HEAVY, meterGain: 14, meterCost: 0,
        hitstop: 14, radius: 0.86, forward: 0.9, centerY: 0.95,
        clip: 'st_proyeccion'
    }),

    // --- CAPA 2 · PATADAS ----------------------------------------------
    // La patada giratoria: barre un arco. AREA: caza al
    // que se mueve (le aturde) y al que intenta esquivarlo
    // (le derriba). Es el castigo a la movilidad.
    ATAQUE_PESADO: defineMove('ATAQUE_PESADO', {
        label: 'Patada giratoria', state: State.ATAQUE_PESADO,
        startup: 10, active: 4, recovery: 19,
        damage: 13, hitstun: 19, blockstun: 11,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'LIGHT', launchX: 2.6, launchY: 2.2, juggleAdd: 1,
        cancelTier: CancelTier.HEAVY, meterGain: 13, meterCost: 0,
        hitstop: 10, radius: 0.78, forward: 0.72, centerY: 1.0,
        clip: 'sp_patada_giro'
    }),

    // La patada frontal: recta, larga, mantiene la
    // distancia. LINEAL: el que esquiva con un paso la
    // evita y queda a medio metro de Pedro.
    PATADA_FRONTAL: defineMove('PATADA_FRONTAL', {
        label: 'Patada frontal', state: State.ATAQUE_PESADO,
        startup: 8, active: 3, recovery: 14,
        damage: 8, hitstun: 14, blockstun: 10,
        hitLevel: HitLevel.MEDIO, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'LINEAL', height: 'MEDIO',
        cancelTier: CancelTier.HEAVY, meterGain: 10, meterCost: 0,
        hitstop: 7, radius: 0.5, forward: 0.95, centerY: 0.95,
        clip: 'sp_patada_frontal'
    }),

    // El barrido: el golpe BAJO de Pedro (abajo + pesado).
    // LINEAL por el suelo: el dash saltando lo salta. Clave
    // propia (no la base) porque el set comun ya trae un
    // barrido: asi la regla de alcance distingue "este
    // peleador tiene SU barrido".
    BARREDO: defineMove('BARREDO', {
        label: 'Barrido', state: State.ATAQUE_PESADO,
        startup: 7, active: 4, recovery: 20,
        damage: 7, hitstun: 0, blockstun: 9,
        hitLevel: HitLevel.BAJO, breaksGuardHeight: GuardHeight.BAJA,
        type: 'LINEAL', height: 'BAJO',
        knockdown: 'ALWAYS', launchX: 1.0, launchY: 0,
        cancelTier: CancelTier.HEAVY, meterGain: 10, meterCost: 0,
        hitstop: 8, radius: 0.85, forward: 0.7, centerY: 0.2,
        clip: 'sp_barrido'
    }),

    // --- CAPA 3 · SUELO -------------------------------------------------
    // El derribo: se agacha, entra y tumba. AREA (cierra
    // el espacio) y con derribo garantizado: es la puerta
    // de entrada a su pelea de suelo. Se pide con la tecla
    // de técnica.
    DERIBO: defineMove('DERIBO', {
        label: 'Derribo', state: State.ATAQUE_PESADO,
        startup: 12, active: 4, recovery: 24,
        damage: 10, hitstun: 18, blockstun: 12,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.MEDIA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'ALWAYS', launchX: 2.2, launchY: 0.6, juggleAdd: 0,
        cancelTier: CancelTier.HEAVY, meterGain: 12, meterCost: 0,
        hitstop: 11, radius: 0.7, forward: 0.8, centerY: 0.7,
        clip: 'sp_derribo'
    }),

    // La embestida: la carga desde la cuadrupeda. AREA y
    // con mucho alcance: cierra distancia de un golpe. Es
    // su movida de movilidad ofensiva (el dash es de todos;
    // esta carga es SUYA).
    EMBESTIDA: defineMove('EMBESTIDA', {
        label: 'Embestida', state: State.ATAQUE_PESADO,
        startup: 11, active: 5, recovery: 20,
        damage: 13, hitstun: 22, blockstun: 12,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'LIGHT', launchX: 4.0, launchY: 2.0, juggleAdd: 1,
        cancelTier: CancelTier.HEAVY, meterGain: 14, meterCost: 0,
        hitstop: 12, radius: 0.68, forward: 1.15, centerY: 1.0,
        clip: 'sp_embestida'
    }),

    // La sumisión: el cierre en el suelo. Su frame data ya
    // esta aqui; se alcanza DENTRO DEL AGARRE (la accion
    // SUMISION del sistema de agarre). Cuando el agarre se
    // ligue entre los dos peleadores, este es el golpe.
    SUMISION: defineMove('SUMISION', {
        label: 'Sumisión', state: State.ATAQUE_ESPECIAL,
        startup: 16, active: 6, recovery: 30,
        damage: 16, hitstun: 24, blockstun: 0,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'ALWAYS', launchX: 1.5, launchY: 0.5, juggleAdd: 1,
        cancelTier: CancelTier.SPECIAL, meterCost: 0, meterGain: 0,
        hitstop: 13, radius: 0.6, forward: 0.5, centerY: 0.6,
        clip: 'sp_sumision'
    }),

    // --- CAPA 4 · ARMA --------------------------------------------------
    // El botellazo: SU especial. Una botella rota de dos
    // manos: AREA (no la esquiva nadie que se mueva),
    // derriba y cuesta recurso. El as de la calle.
    ATAQUE_ESPECIAL: defineMove('ATAQUE_ESPECIAL', {
        label: 'Botellazo', state: State.ATAQUE_ESPECIAL,
        required: { meter: 25 },
        startup: 13, active: 5, recovery: 28,
        damage: 21, hitstun: 26, blockstun: 15,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'ALWAYS', launchX: 5.5, launchY: 3.6, juggleAdd: 2,
        cancelTier: CancelTier.SPECIAL, meterCost: 25, meterGain: 0,
        hitstop: 15, freeze: 40, radius: 0.9, forward: 0.95, centerY: 1.15,
        clip: 'sp_botellazo'
    })
});

// ===========================================================================
// JUAN GARCÍA — "el que no se raja"
// ===========================================================================

/**
 * El moveset de Juan: el remate (su finisher de proyección).
 * Lento, enorme, no perdona. El resto es el set base: su
 * personalidad vive en el agarre (garfios y proyecciones).
 */
registerMoves('JUAN', {
    RV_FIN: defineMove('RV_FIN', {
        label: 'Remate', state: State.ATAQUE_PESADO,
        startup: 14, active: 6, recovery: 24,
        damage: 18, hitstun: 26, blockstun: 12,
        hitLevel: HitLevel.FUERTE, breaksGuardHeight: GuardHeight.ALTA,
        type: 'AREA', height: 'MEDIO',
        knockdown: 'ALWAYS', launchX: 5.0, launchY: 3.4, juggleAdd: 2,
        cancelTier: CancelTier.HEAVY, meterGain: 16, meterCost: 0,
        hitstop: 14, radius: 0.9, forward: 0.95, centerY: 1.05,
        clip: 'rv_fin'
    })
});

// ===========================================================================
// ESTADOS DE LOS GOLPES PROPIOS
// ----------------------------------------------------------------------------
// Cada golpe nuevo necesita su estado ATTACKING. Los ids
// siguen el rango de personaje (100+) y SOLO se usan cuando
// el moveset del peleador define el golpe (ver Transitions.js).
// ===========================================================================

/** Nombre de estado propio -> id. Lo lee Transitions.js. */
export const MOVE_STATE_IDS = Object.create(null);

/** Registra estados de golpe propios y devuelve los estados. */
function registerMoveStates(defs) {
    const out = defs.map((def) => defineState(def));
    for (const s of out) MOVE_STATE_IDS[s.name] = s.id;
    return Object.freeze(out);
}

/**
 * Estados de los golpes propios de PEDRO (104-110). La
 * duracion de cada estado es startup+active+recovery de
 * SU golpe: la tabla de duracion del estado y la del
 * moveset son la MISMA cifra, calculada dos veces a mano
 * es como se desincronizan los juegos de pelea.
 */
export const PEDRO_MOVE_STATES = registerMoveStates([
    {
        id: CHARACTER_STATE_BASE + 4,   // 104
        tag: 'ATAQUE', name: 'SP_GANCHO',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'GANCHO',
        durationFrames: 19,               // 6 + 3 + 10
        clip: 'sp_gancho',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.14
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'BRACE', hipY: 0.86, spinePitch: 0.24 }
    },
    {
        id: CHARACTER_STATE_BASE + 5,   // 105
        tag: 'ATAQUE', name: 'SP_CODAZO',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'GOLPE_CODO',
        durationFrames: 14,               // 4 + 2 + 8
        clip: 'sp_codo',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.12
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'BRACE', hipY: 0.88, spinePitch: 0.2 }
    },
    {
        id: CHARACTER_STATE_BASE + 6,   // 106
        tag: 'ATAQUE', name: 'SP_PATADA_FRONTAL',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'PATADA_FRONTAL',
        durationFrames: 25,               // 8 + 3 + 14
        clip: 'sp_patada_frontal',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.18
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'BRACE', hipY: 0.84, spinePitch: 0.28 }
    },
    {
        id: CHARACTER_STATE_BASE + 7,   // 107
        tag: 'ATAQUE', name: 'SP_DERIBO',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'DERIBO',
        durationFrames: 40,               // 12 + 4 + 24
        clip: 'sp_derribo',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.2
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'CROUCH', hipY: 0.55, spinePitch: 0.45 }
    },
    {
        id: CHARACTER_STATE_BASE + 8,   // 108
        tag: 'ATAQUE', name: 'SP_EMBESTIDA',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'EMBESTIDA',
        durationFrames: 36,               // 11 + 5 + 20
        clip: 'sp_embestida',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.22
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'BRACE', hipY: 0.78, spinePitch: 0.4 }
    },
    {
        id: CHARACTER_STATE_BASE + 9,   // 109
        tag: 'ATAQUE', name: 'SP_SUMISION',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'SUMISION',
        durationFrames: 52,               // 16 + 6 + 30
        clip: 'sp_sumision',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.1
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'CROUCH', hipY: 0.5, spinePitch: 0.3 }
    },
    {
        id: CHARACTER_STATE_BASE + 10,  // 110
        tag: 'ATAQUE', name: 'SP_BARREDO',
        phase: Phase.GROUND,
        groups: [StateGroup.ATTACKING, StateGroup.GROUNDED],
        attack: 'BARREDO',
        durationFrames: 31,               // 7 + 4 + 20
        clip: 'sp_barrido',
        physics: {
            flags: ATK,
            velocityPolicy: VelocityPolicy.PRESERVE,
            frictionXZ: 0.16
        },
        control: { canAct: false, canTurn: false, buffersInput: true },
        posture: { limbs: 'CROUCH', hipY: 0.62, spinePitch: 0.35 }
    }
]);

export default { PEDRO_MOVE_STATES, MOVE_STATE_IDS };
