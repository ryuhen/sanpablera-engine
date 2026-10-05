/**
 * ============================================================================
 * SANPABLERA ENGINE · cine/CineConstants.js
 * ----------------------------------------------------------------------------
 * El VOCABULARIO de la cinematica: huesos, canales, planos de camara, morphs,
 * impactos y la configuracion global.
 *
 * POR QUE ESTA SEPARADO DE Math3.js
 *   Math3 es matematica (no sabe que existe un ser humano). Aqui vive todo lo
 *   que es DECISION del proyecto: como se llama un hueso, cuantos planos de
 *   camara hay, cuanta deformacion aguanta un cuerpo antes de verse roto.
 *   Cambiar el tuning de la cinematica (mas camara lenta, mas squash) se hace
 *   aqui y en ningun otro sitio.
 *
 * POR QUE NO USA SPF (el singleton de la FSM)
 *   SPF es el vocabulario de COMBATE: estados, intents, agarres. Este es el de
 *   CINEMATICA. Se mezclarian dos cosas con ritmos de cambio distintos: el
 *   combate se equilibra frame a frame, la cinematica se ajusta por proyecto.
 *   Los dos se hablan via StateCineMap (ver ClipLibrary.js), que traduce un
 *   State de combate a un clip de animacion.
 * ============================================================================
 */

// ===========================================================================
// CONFIGURACION
// ===========================================================================

export const CFG = Object.freeze({
    // Paso de simulacion de la cinematica. 60 Hz como la FSM: si las dos
    // maquinas no comparten el mismo tick, el anim se desincroniza del golpe
    // un frame y se ve el "tirón" clasico del golpe mal encuadrado.
    FPS: 60,
    FIXED_DT: 1 / 60,

    // Escala del personaje. El rig se mide en METROS con un humano de 1,80 m
    // (ver BONES). El motor 3D puede usar otra escala; esta constante es el
    // unico punto donde se convierte.
    CHARACTER_HEIGHT: 1.8,

    // --- Morphs ---
    // Limite duro de deformacion. Pasado esto el cuerpo deja de ser una
    // persona: es el seguro contra el "globo" cuando un impacto se repite.
    MORPH_MAX: 1.6,
    // Amortiguacion de los morphs (1/s). Mas alto = vuelven antes a su forma.
    MORPH_DAMPING: 9,
    // Frecuencia base de los muelles de deformacion (Hz).
    MORPH_FREQ: 7.5,

    // --- Camara ---
    // FOV por defecto en grados (el que usa Babylon en vertical).
    FOV_DEFAULT: 55,
    // Angulo maximo por frame de la camara de respuesta a un impacto, en grados.
    SHAKE_MAX_DEG: 3.2,
    // Golpes de camara por segundo a plena severidad.
    SHAKE_FREQ: 22,
    // Amortiguacion del temblor (1/s).
    SHAKE_DAMPING: 7,

    // --- Impacto ---
    // Frames de congelacion (hitstop) por unidad de severidad.
    HITSTOP_PER_SEVERITY: 4,
    HITSTOP_MAX: 14,

    // --- Timeline ---
    // Tope de seguridad para que un clip con duracion 0 no genere un bucle
    // infinito al calcular su numero de frames.
    MIN_CLIP_FRAMES: 1
});

// ===========================================================================
// ESQUELETO HUMANOIDE
// ---------------------------------------------------------------------------
// Es el esqueleto de referencia. El juego puede usar otro (el del modelo 3D
// final), pero TODOS deben cumplir el CONTRATO de abajo; la cinematica solo
// depende del contrato, no de los nombres:
//   1. UN hueso raiz sin padre.
//   2. Cada hueso tiene un padre (o es la raiz) y la cadena padre -> hijo no
//      tiene ciclos.
//   3. Todo hueso tiene `group` (para las mascaras de mezcla) y `length`
//      (para el IK y para colocar las hitboxes).
//   4. Los huesos de contacto (MANO_*, PIE_*) existen siempre: son los que
//      tocan el suelo y los que reciben el impacto.
// ===========================================================================

/** Grupos de huesos. Cada uno es una mascara de mezcla. */
export const BoneGroup = Object.freeze({
    ROOT: 'ROOT',           // pelvis: el "negro" del cuerpo
    SPINE: 'SPINE',         // columna
    HEAD: 'HEAD',           // cuello + cabeza
    ARM_L: 'ARM_L',
    ARM_R: 'ARM_R',
    LEG_L: 'LEG_L',
    LEG_R: 'LEG_R'
});

/** Laterales, para las mascaras de mitad de cuerpo. */
export const Side = Object.freeze({ L: 'L', R: 'R', NONE: 'NONE' });

/** Canales de una pista de animacion. */
export const Channel = Object.freeze({
    RX: 'RX', RY: 'RY', RZ: 'RZ',       // rotacion local (euler YXZ, radianes)
    TX: 'TX', TY: 'TY', TZ: 'TZ',       // traslacion local (metros)
    SX: 'SX', SY: 'SY', SZ: 'SZ',       // escala (multiplicador)
    VIS: 'VIS'                          // visibilidad (0/1)
});

export const ROT_CHANNELS = Object.freeze([Channel.RX, Channel.RY, Channel.RZ]);
export const TRANS_CHANNELS = Object.freeze([Channel.TX, Channel.TY, Channel.TZ]);
export const SCALE_CHANNELS = Object.freeze([Channel.SX, Channel.SY, Channel.SZ]);
export const ALL_CHANNELS = Object.freeze([
    ...ROT_CHANNELS, ...TRANS_CHANNELS, ...SCALE_CHANNELS, Channel.VIS
]);

/**
 * Huesos del esqueleto humanoide de referencia (21 huesos).
 *   offset : posicion LOCAL respecto a la articulacion del padre, en metros.
 *            Es la pose de REPOSO (T-pose modificada), no una animacion.
 *   length : largo del hueso (su hueso, no el siguiente). Lo usa el IK de dos
 *            huesos y el calculo de donde va la hitbox de un golpe.
 *   group  : mascara de mezcla.
 *   side   : lateral.
 *   contact: true si toca el mundo (pies) o recibe impactos (manos).
 *
 * Altura total con estos offsets: 1,80 m de pie, con los brazos caidos.
 */
export const BONES = Object.freeze([
    // --- Cadena central ---------------------------------------------------
    { name: 'PELVIS', parent: null, offset: [0, 0.95, 0], length: 0.14, group: BoneGroup.ROOT, side: Side.NONE },
    { name: 'SPINE', parent: 'PELVIS', offset: [0, 0.13, 0], length: 0.16, group: BoneGroup.SPINE, side: Side.NONE },
    { name: 'CHEST', parent: 'SPINE', offset: [0, 0.18, 0], length: 0.20, group: BoneGroup.SPINE, side: Side.NONE },
    { name: 'NECK', parent: 'CHEST', offset: [0, 0.22, 0], length: 0.09, group: BoneGroup.HEAD, side: Side.NONE },
    { name: 'HEAD', parent: 'NECK', offset: [0, 0.09, 0], length: 0.22, group: BoneGroup.HEAD, side: Side.NONE },

    // --- Brazo izquierdo --------------------------------------------------
    { name: 'CLAV_L', parent: 'CHEST', offset: [0.05, 0.16, 0], length: 0.14, group: BoneGroup.ARM_L, side: Side.L },
    { name: 'UPPERARM_L', parent: 'CLAV_L', offset: [0.16, 0, 0], length: 0.30, group: BoneGroup.ARM_L, side: Side.L },
    { name: 'FOREARM_L', parent: 'UPPERARM_L', offset: [0.30, 0, 0], length: 0.27, group: BoneGroup.ARM_L, side: Side.L },
    { name: 'HAND_L', parent: 'FOREARM_L', offset: [0.27, 0, 0], length: 0.10, group: BoneGroup.ARM_L, side: Side.L, contact: true },

    // --- Brazo derecho ---------------------------------------------------
    { name: 'CLAV_R', parent: 'CHEST', offset: [-0.05, 0.16, 0], length: 0.14, group: BoneGroup.ARM_R, side: Side.R },
    { name: 'UPPERARM_R', parent: 'CLAV_R', offset: [-0.16, 0, 0], length: 0.30, group: BoneGroup.ARM_R, side: Side.R },
    { name: 'FOREARM_R', parent: 'UPPERARM_R', offset: [-0.30, 0, 0], length: 0.27, group: BoneGroup.ARM_R, side: Side.R },
    { name: 'HAND_R', parent: 'FOREARM_R', offset: [-0.27, 0, 0], length: 0.10, group: BoneGroup.ARM_R, side: Side.R, contact: true },

    // --- Pierna izquierda ------------------------------------------------
    { name: 'THIGH_L', parent: 'PELVIS', offset: [0.10, -0.06, 0], length: 0.45, group: BoneGroup.LEG_L, side: Side.L },
    { name: 'SHIN_L', parent: 'THIGH_L', offset: [0, -0.45, 0], length: 0.42, group: BoneGroup.LEG_L, side: Side.L },
    { name: 'FOOT_L', parent: 'SHIN_L', offset: [0, -0.42, 0], length: 0.08, group: BoneGroup.LEG_L, side: Side.L, contact: true },
    { name: 'TOE_L', parent: 'FOOT_L', offset: [0, -0.06, 0.13], length: 0.06, group: BoneGroup.LEG_L, side: Side.L, contact: true },

    // --- Pierna derecha --------------------------------------------------
    { name: 'THIGH_R', parent: 'PELVIS', offset: [-0.10, -0.06, 0], length: 0.45, group: BoneGroup.LEG_R, side: Side.R },
    { name: 'SHIN_R', parent: 'THIGH_R', offset: [0, -0.45, 0], length: 0.42, group: BoneGroup.LEG_R, side: Side.R },
    { name: 'FOOT_R', parent: 'SHIN_R', offset: [0, -0.42, 0], length: 0.08, group: BoneGroup.LEG_R, side: Side.R, contact: true },
    { name: 'TOE_R', parent: 'FOOT_R', offset: [0, -0.06, 0.13], length: 0.06, group: BoneGroup.LEG_R, side: Side.R, contact: true }
]);

/** Huesos que el contrato exige que existan siempre. */
export const REQUIRED_BONES = Object.freeze([
    'PELVIS', 'HEAD',
    'UPPERARM_L', 'FOREARM_L', 'HAND_L',
    'UPPERARM_R', 'FOREARM_R', 'HAND_R',
    'THIGH_L', 'SHIN_L', 'FOOT_L',
    'THIGH_R', 'SHIN_R', 'FOOT_R'
]);

// ===========================================================================
// PLANOS DE CAMARA (VISTAS)
// ---------------------------------------------------------------------------
// `size` es el TAMANO DEL PLANO. Se declara en DESCRIPTIVOS (camara/Views.js)
// con el alto del sujeto visible en metros, no con "cerca" o "lejos": un plano
// se define por lo que ENCUADRA, y decir "primer plano" sin saber el tamano
// del sujeto no dice nada.
// ===========================================================================

export const ShotSize = Object.freeze({
    EXTREME_CLOSE: 'EXTREME_CLOSE',   // solo un ojo o una mano
    CLOSE: 'CLOSE',                   // cabeza y hombros
    MEDIUM_CLOSE: 'MEDIUM_CLOSE',     // del pecho arriba
    MEDIUM: 'MEDIUM',                 // de cintura arriba
    COWBOY: 'COWBOY',                 // de muslo arriba
    FULL: 'FULL',                     // cuerpo entero
    WIDE: 'WIDE',                     // cuerpo entero con aire
    ESTABLISHING: 'ESTABLISHING'      // el escenario entero
});

/** Movimiento de camara. Todos se pueden combinar (dolly + tilt a la vez). */
export const CameraMove = Object.freeze({
    STATIC: 'STATIC',
    PAN: 'PAN',               // gira sobre su eje vertical
    TILT: 'TILT',             // gira sobre su eje horizontal
    DOLLY: 'DOLLY',           // se acerca / se aleja
    TRUCK: 'TRUCK',           // se desplaza lateralmente
    PEDESTAL: 'PEDESTAL',     // sube / baja (grua)
    ORBIT: 'ORBIT',           // gira alrededor del sujeto
    FOLLOW: 'FOLLOW',         // sigue al sujeto
    HANDHELD: 'HANDHELD',     // mano alzada: micro-temblor procedural
    CRASH_ZOOM: 'CRASH_ZOOM'  // zoom de impacto con rebote
});

/** Como se pasa de un plano al siguiente. */
export const TransitionKind = Object.freeze({
    CUT: 'CUT',               // corte seco: el 90% de las veces, el correcto
    DISSOLVE: 'DISSOLVE',     // fundido cruzado
    FADE_BLACK: 'FADE_BLACK', // a negro y desde negro
    WHIP_PAN: 'WHIP_PAN',     // barrido: oculta el corte
    FLASH: 'FLASH',           // destello: impacta y corta
    MATCH_CUT: 'MATCH_CUT'    // corte por movimiento (misma direccion)
});

/** Transiciones que ocupan frames de la linea de tiempo. */
export const TRANSITION_DURATION = Object.freeze({
    [TransitionKind.CUT]: 0,
    [TransitionKind.DISSOLVE]: 12,
    [TransitionKind.FADE_BLACK]: 18,
    [TransitionKind.WHIP_PAN]: 8,
    [TransitionKind.FLASH]: 4,
    [TransitionKind.MATCH_CUT]: 6
});

// ===========================================================================
// MORPHS DE FISICA
// ---------------------------------------------------------------------------
// Un morph es un grado de libertad deformable, resuelto por fisica (muelle +
// amortiguacion) y no por keyframes. Se dispara con un impacto y vuelve solo.
// ===========================================================================

export const MorphId = Object.freeze({
    SQUASH: 'SQUASH',             // aplastarse al recibir un golpe
    STRETCH: 'STRETCH',           // estirarse al salir lanzado
    BULGE: 'BULGE',               // hinchar abdomen/musculo al tensar
    TORSO_LEAN: 'TORSO_LEAN',     // inclinarse por inercia
    HEAD_LAG: 'HEAD_LAG',         // la cabeza llega tarde (secundario)
    ARM_JIGGLE: 'ARM_JIGGLE',     // brazo con inercia
    LEG_JIGGLE: 'LEG_JIGGLE',     // pierna con inercia
    CONTACT_FLATTEN: 'CONTACT_FLATTEN',  // aplanar donde toca el suelo
    BREATH: 'BREATH'              // respiracion de espera (idle)
});

/**
 * Parametros fisicos por morph: frecuencia del muelle (Hz), amortiguamiento y
 * cuanto empuja cada eje de la pelvis (para repartir la deformacion).
 * Valores pensado en "el cuerpo humano": la cadencia del pecho es lenta, la
 * de un brazo al recibir un golpe es rapida.
 */
export const MORPH_PARAMS = Object.freeze({
    [MorphId.SQUASH]: { freq: 9, damping: 0.55, spread: 0.15 },
    [MorphId.STRETCH]: { freq: 7, damping: 0.7, spread: 0.2 },
    [MorphId.BULGE]: { freq: 5, damping: 0.9, spread: 0.1 },
    [MorphId.TORSO_LEAN]: { freq: 4.5, damping: 0.65, spread: 0.25 },
    [MorphId.HEAD_LAG]: { freq: 6, damping: 0.5, spread: 0.35 },
    [MorphId.ARM_JIGGLE]: { freq: 8, damping: 0.4, spread: 0.5 },
    [MorphId.LEG_JIGGLE]: { freq: 7, damping: 0.45, spread: 0.5 },
    [MorphId.CONTACT_FLATTEN]: { freq: 12, damping: 0.6, spread: 0.0 },
    [MorphId.BREATH]: { freq: 0.28, damping: 1.0, spread: 0.05 }
});

// ===========================================================================
// IMPACTOS
// ===========================================================================

/** Nivel del impacto. Define dano visual, camara, sonido y hitstop. */
export const ImpactKind = Object.freeze({
    GRAZE: 'GRAZE',         // roce: apenas se nota
    LIGHT: 'LIGHT',         // golpe normal
    HEAVY: 'HEAVY',         // golpe fuerte
    CRUSH: 'CRUSH',         // golpe que manda al suelo
    LAUNCH: 'LAUNCH',       // salvage en el aire
    SLAM: 'SLAM'            // caida contra el suelo
});

/**
 * Presets de impacto: severidad 0..1, reparto de morphs, camara y hitstop.
 *
 * `axis` es el eje del impacto en espacio LOCAL del cuerpo (adelante, atras,
 * arriba, abajo, lateral). Un golpe lateral y uno vertical tienen que
 * deformar el cuerpo de forma distinta: por eso es un vector, no un numero.
 */
export const IMPACT_PRESETS = Object.freeze({
    [ImpactKind.GRAZE]: {
        severity: 0.18, hitstop: 0, shake: 0.12,
        morphs: { SQUASH: 0.15, ARM_JIGGLE: 0.2 }
    },
    [ImpactKind.LIGHT]: {
        severity: 0.45, hitstop: 0.35, shake: 0.4,
        morphs: { SQUASH: 0.4, HEAD_LAG: 0.3, TORSO_LEAN: 0.35, ARM_JIGGLE: 0.4 }
    },
    [ImpactKind.HEAVY]: {
        severity: 0.75, hitstop: 0.7, shake: 0.8,
        morphs: { SQUASH: 0.7, HEAD_LAG: 0.6, TORSO_LEAN: 0.7, LEG_JIGGLE: 0.5, ARM_JIGGLE: 0.6 }
    },
    [ImpactKind.CRUSH]: {
        severity: 1.0, hitstop: 1.0, shake: 1.0,
        morphs: { SQUASH: 1.0, HEAD_LAG: 0.85, TORSO_LEAN: 0.9, LEG_JIGGLE: 0.7, ARM_JIGGLE: 0.8 }
    },
    [ImpactKind.LAUNCH]: {
        severity: 0.65, hitstop: 0.4, shake: 0.5,
        morphs: { STRETCH: 0.8, TORSO_LEAN: 0.5, HEAD_LAG: 0.4 }
    },
    [ImpactKind.SLAM]: {
        severity: 0.85, hitstop: 0.6, shake: 0.9,
        morphs: { SQUASH: 0.5, CONTACT_FLATTEN: 1.0, LEG_JIGGLE: 0.8 }
    }
});

/** Direccion del impacto en espacio local. */
export const ImpactAxis = Object.freeze({
    FRONT: 'FRONT',       // el cuerpo recibe un golpe de frente
    BACK: 'BACK',
    UP: 'UP',             // lo levantan
    DOWN: 'DOWN',         // lo machacan contra el suelo
    SIDE: 'SIDE'
});

/**
 * A que huesos llega el impacto y con que fuerza. Multiplica la severidad del
 * preset: un golpe a la cabeza se ve MUCHO mas que uno al muslo, y por eso no
 * puede ser solo "cuanto pegan".
 */
export const IMPACT_BONE_GAIN = Object.freeze({
    HEAD: 1.0,
    CHEST: 0.8,
    SPINE: 0.7,
    NECK: 0.9,
    PELVIS: 0.6,
    UPPERARM_L: 0.7, FOREARM_L: 0.6, HAND_L: 0.5,
    UPPERARM_R: 0.7, FOREARM_R: 0.6, HAND_R: 0.5,
    THIGH_L: 0.45, SHIN_L: 0.4, FOOT_L: 0.5,
    THIGH_R: 0.45, SHIN_R: 0.4, FOOT_R: 0.5
});
