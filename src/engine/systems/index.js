/**
 * ============================================================================
 * SANPABLERA ENGINE · engine/systems/index.js
 * ----------------------------------------------------------------------------
 * LA FACHADA: un solo sitio donde vive todo, y que NO reimplementa nada.
 *
 * QUE ES ESTO Y QUE NO ES
 * ----------------------------------------------------------------------------
 *   Este archivo es el INDICE DEL MOTOR. Cada uno de los nueve sistemas del
 *   diseno esta mapeado aqui a la ruta donde vive de verdad, y este archivo lo
 *   RE-EXPORTA. No hay una segunda implementacion de nada.
 *
 *   Existe porque el motor se habia ido dejando por `src/core`, `src/render` y
 *   `src/ui`, y saber "donde vive el sistema de agarres" exigia conocer el
 *   arbol entero. Con el indice, la pregunta se hace en un archivo.
 *
 *   LA REGLA DE ESTA CARPETA (importante, y es la que la hace util)
 * ----------------------------------------------------------------------------
 *   Un archivo en `engine/systems/` NO PUEDE importar nada de `core/`, `render/`
 *   ni `ui/` para reimplementarlo. Solo puede:
 *     1. RE-EXPORTAR lo que ya existe, o
 *     2. anadir algo que de verdad no exista todavia.
 *
 *   Si alguna vez un modulo de aqui tiene que importar `core/` para CALCULAR
 *   algo, esta fachada ha dejado de ser una fachada y ha empezado a ser un
 *   segundo motor. Ese es el fallo que hay que evitar.
 *
 * LOS NUEVE SISTEMAS Y DONDE VIVEN
 * ----------------------------------------------------------------------------
 *
 *   1. APPAREL / MALLA MODULAR ....... ui/wardrobe.js + render/CharacterModel.js
 *   2. STANCE MANAGER ................ core/boxing.js + fsm/states/CharacterStates.js
 *   3. IMPACT COLLISION .............. fsm/MoveTable.js (hitbox) + core/phases.js (zonas)
 *   4. FRAME DATA ENGINE ............. core/framedata.js
 *   5. ANY-POINT CANCEL .............. fsm/MoveTable.js (cancelTier) + fsm/Transitions.js
 *   6. NEUTRAL COLLISIONS ............ core/clinch.js
 *   7. GUARD IK DEFLECTION ........... cine/Rig.js (solveTwoBone) + cine/Stances.js
 *   8. GRAPPLING .................... fsm/states/GrappleStates.js (30 estados)
 *   9. GROUND GAME .................. fsm/states/GroundStates.js + fsm/ImpactStates.js
 *
 *   Mas los que se escribieron despues y no estaban en la lista original:
 *      AIRE ............... core/air.js (tipos de salto, familias de ataque aereo)
 *      LOCOMOTION ......... core/locomotion.js (paso por toque, ataques corriendo)
 *      CLOTH ............. core/cloth/Cloth.js
 *      CONTROLES ......... ui/InputRouter.js + ui/ControlsSettings.js
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 0. EL BUS  (lo primero, porque todo lo demas se suscribe a el)
// Esta en engine/, un nivel arriba.
// ---------------------------------------------------------------------------
export { EV, EVENT_COUNT, EventBus, bus } from '../events.js';

// ---------------------------------------------------------------------------
// 1. APPAREL / MALLA MODULAR
//
// El catalogo de atuendos es ui/wardrobe.js y declara que huesos del CONTRATO
// cubre cada pieza. El puente con el modelo real es CharacterModel, que cuelga
// los nodos de una raiz propia. Faltan las dos mitades unidas: colgar una malla
// de prenda de los huesos en tiempo real.
// ---------------------------------------------------------------------------
export { default as WARDROBE } from '../../ui/wardrobe.js';
export { loadCharacterModel, CharacterModel, measureMesh, readModelBones, wrapperTransform } from '../../render/CharacterModel.js';
export { buildBoneMap, normalizeBoneName } from '../../render/BoneMap.js';

// ---------------------------------------------------------------------------
// 2. STANCE MANAGER
//
// Ya existe entero: los puestos de boxeo, el arbol de tecnicas por postura y las
// reglas de derivacion de comandos (baile de posiciones, fijacion post-golpe).
// ---------------------------------------------------------------------------
export { default as Boxing } from '../../core/boxing.js';
export { ARCHETYPES, ARCHETYPE_LIST } from '../../core/archetypes.js';

// ---------------------------------------------------------------------------
// 3. IMPACT COLLISION
//
// La hitbox del golpe (radio, alcance, altura) vive en MoveTable y se resuelve
// en el `tryHit` de Engine. Las zonas del cuerpo y las fases de combate, en
// phases.js.
// ---------------------------------------------------------------------------
export { default as MoveTable } from '../../core/fsm/MoveTable.js';
export { default as Phases } from '../../core/phases.js';
export { ZONES, PHASE, PHASE_ORDER, REFEREE_STOP_FRAMES } from '../../core/phases.js';

// ---------------------------------------------------------------------------
// 4. FRAME DATA ENGINE
//
// Lo unico de los nueve que se escribio entero aqui: los frames ya estaban en
// MoveTable, faltaba la cuenta (hitAdvantage / blockAdvantage) y el indice de
// golpes para buscar en O(1).
// ---------------------------------------------------------------------------
export {
    FPS, secondsToFrames, framesToSeconds,
    hitAdvantage, blockAdvantage, knockdownStun, fullHitAdvantage,
    advantageBand, ADVANTAGE_BANDS,
    buildMoveIndex, frameSheet, compareFrameData
} from '../../core/framedata.js';

// ---------------------------------------------------------------------------
// 5. ANY-POINT CANCEL
//
// El cancel ya esta en la tabla (cancelTier) y las transiciones respetan el
// frame data. Y el BLENDING entre animaciones ya esta: PoseBlender mezcla los
// deltas de articulacion ANTES del fk, con una duracion por tipo de cambio (un
// impacto es seco, un paso es blando). Falta lo que el cancel significa de
// verdad: que se pueda ENCADEGAR golpe dentro de la recuperacion de otro.
// ---------------------------------------------------------------------------
export { default as StateMachine } from '../../core/fsm/StateMachine.js';
export { resolve as resolveTransition, explain as explainTransition, allRules, validateTargets } from '../../core/fsm/Transitions.js';
export { BASE_STATES, catalogReport } from '../../core/fsm/states/index.js';

// ---------------------------------------------------------------------------
// 6. NEUTRAL COLLISIONS
//
// Lo que decide "dos cuerpos se han encontrado y que pasa". Es ATAQUE x
// DEFENSA, no una matriz de posturas: un barrido pierde contra una guardia
// baja y un rodillazo es justo contra el agachado.
// ---------------------------------------------------------------------------
export {
    CLASH, CLASH_ATTACK, DEFENSE, INPUT as CLASH_INPUT,
    resolveClash, resolveClinch, defenseFrom, offlineRule, OFFLINE
} from '../../core/clinch.js';

// ---------------------------------------------------------------------------
// 7. GUARD IK DEFLECTION
//
// El IK de dos huesos ya resuelve la guardia: `applyGuard` coloca las manos
// con solveTwoBone. Lo que falta es la DEFLEXION: que el brazo busque la
// extremidad del atacante en 3D y desvie el golpe, no solo que se ponga en
// postura.
// ---------------------------------------------------------------------------
export { buildRig, fk, solveTwoBone, placeFoot, dropPelvisToFeet } from '../../core/cine/Rig.js';
export { stancePose, footTargets } from '../../core/cine/Stances.js';
export { CFG } from '../../core/cine/CineConstants.js';

// ---------------------------------------------------------------------------
// 8. GRAPPLING
//
// Los treinta estados (quince posturas x dos papeles) ya estan generados. Lo
// que falta son las VARIANTES por disciplina (judo, sambo, sumo, greco) y las
// cinematicas.
// ---------------------------------------------------------------------------
// Constants.js SOLO tiene export por defecto (el namespace SPF), asi que sus
// tablas se sacan de ahi. import { X } daria error en tiempo de carga.
import SPF from '../../core/fsm/Constants.js';
export const GRAPPLE_STATES = SPF.GRAPPLE_STATES;
export const grappleState = SPF.grappleState;
export const otherRole = SPF.otherRole;

// ---------------------------------------------------------------------------
// 9. GROUND GAME
//
// Los estados de suelo y los de caida estan separados por quien los usa, no
// por el orden del enunciado. Falta el modelo POSICIONAL (monteja, control
// lateral, control de espalda, tortuga) como posiciones con transiciones.
// ---------------------------------------------------------------------------
export { default as GroundStates } from '../../core/fsm/states/GroundStates.js';
export {
    POS as SUELO_POS, GEV as SUELO_EVENTO, ROL as SUELO_ROL, MOTIVO as SUELO_MOTIVO,
    resolverSuelo, peligroDe, presionDe, ventanaDe, rangoDe, info as sueloInfo,
    esPeor, porPeligro, porRango, otroRol as otroRolSuelo, hayArriba,
    estaEnPeligro, mejorAcercamiento, puedeCastigar, sumisionesDe,
    ZONA as SUELO_ZONA, ACERCAMIENTO
} from '../../core/ground/position.js';
export {
    BOTON as SUELO_BOTON, ACCION as SUELO_ACCION, CASTIGO, SUM as SUELO_SUM,
    castigoDe, resolverGiro, sumisionDe, proyeccionDe, posicionesDeRemate
} from '../../core/ground/punish.js';
export { GroundFight, GroundSystem } from '../../core/ground/GroundGame.js';
export {
    STANCE as SUELO_STANCE, ACCION as SUELO_STANCE_ACCION, STANCES as SUELO_STANCES,
    MOTIVO as SUELO_STANCE_MOTIVO, MAPEO as SUELO_MAPEO, DIRECCION_DE as SUELO_DIRECCION,
    resolverStance, accionDeBoton as sueloAccionDeBoton, accionDeDireccion, lecturaDe as sueloLectura
} from '../../core/ground/stance.js';
export {
    GUION as SUELO_GUION, ALTO_PLANO, REPOSO_ENTRELAZADO as SUELO_REPOSO,
    guionDe, duracionDe, planoEn, capaEn, pesoDelBeat,
    planDe as sueloPlan, planDeReposo, capaDeReposo, planoPara, tieneGuion
} from '../../core/ground/groundCine.js';
export { default as ImpactStates } from '../../core/fsm/states/ImpactStates.js';

// ---------------------------------------------------------------------------
// LOS QUE SE AÑADIERON DESPUES
// ---------------------------------------------------------------------------
export {
    JUMP, JUMP_TABLE, STANCE, AIR_FAMILY, AIR_FAMILY_RULES, AIR_PRESETS,
    COMMAND, COMMAND_TABLE, AIR_MOVES, ANTIAIR_BLOCK, ANTIAIR_SEND,
    canUseAirAttack, airAttacksOf, canDoubleJump, canAcroJump, checkPreset
} from '../../core/air.js';

export {
    LOCO, LOCO_TABLE, TAP, RUN_ATTACK, RUN_ATTACKS, RUN_PHASE,
    makeLocoState, readLoco, canAttackDuring,
    runAttackFor, isBlockable, chargedDamage, blockPunish
} from '../../core/locomotion.js';

export { default as Cloth } from '../../core/cloth/Cloth.js';
export { BLEND, EASE, PoseBlender, blendFor, pesoDe } from '../../core/anim/Blend.js';
export {
    crearBiblioteca as crearClips, tDeClip, poseDe as poseDeClip, fichaDe as clipDe,
    tieneClip, nombres as nombresDeClip, cobertura as coberturaDeClips
} from '../../core/anim/ClipLibrary.js';
export {
    resolver as clipDelEstado, familiaDe, clipDeGolpe, clipDeAgarre,
    sinClip as estadosSinClip, ORIGEN as ORIGEN_CLIP,
    FAMILIA as FAMILIA_DE_GOLPE, REPOSO as CLIP_REPOSO,
    CLIP_DE_ESTADO, CLIP_DE_LOCO, CLIP_DE_FAMILIA, CLIP_DE_GOLPE, FAMILIA_DE_GOLPE
} from '../../core/anim/ClipBoard.js';
export { ClipPlayer, mezclaDe as mezclaDeClip } from '../../core/anim/ClipPlayer.js';

// ---------------------------------------------------------------------------
// CONTROLES
// ---------------------------------------------------------------------------
export { InputRouter } from '../../ui/InputRouter.js';
export {
    ALL_ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS, DEFAULT_PAD,
    loadBindings, saveBindings, keyLabel, padLabel
} from '../../ui/ControlsSettings.js';

// ---------------------------------------------------------------------------
// EL ESTADO DEL MOTOR, en una foto
// ---------------------------------------------------------------------------

/**
 * Que hay puesto y que falta. Es una tabla, no una cuenta de archivos: lo que
 * importa es si un sistema esta TERMINADO o solo tiene la parte de datos.
 */
export const SYSTEM_STATUS = Object.freeze({
    APPAREL: { done: false, note: 'catalogo de atuendos hecho (wardrobe.js); falta colgar la malla de las prendas de los huesos' },
    STANCE: { done: true, note: 'estancias, arbol de golpe por postura y derivacion de comandos' },
    IMPACT: { done: true, note: 'hitbox por golpe, altura, zonas y knockback' },
    FRAMEDATA: { done: true, note: 'startup/active/recovery, hitAdvantage, blockAdvantage e indice O(1)' },
    CANCEL: { done: false, note: 'tabla, transiciones, blending y biblioteca de clips (26 clips de pie/agachado/salto/golpes) hechos; falta el encadenado real golpe-en-recuperacion' },
    CLASH: { done: true, note: 'ataque x defensa, explotacion RPS, guardia y evasion por aire/pisoton' },
    GUARD_IK: { done: false, note: 'el IK coloca la guardia; falta la DEFLEXION que busca la extremidad' },
    GRAPPLE: { done: true, note: '30 estados uke/tori; faltan las variantes por disciplina y la cinematica' },
    GROUND: { done: false, note: 'modelo posicional (13 posiciones), castigo por zonas, stance de 5 posturas con 10 acciones y cinematica de superposicion (10 guiones): TODO hecho y probado; falta un estado de la FSM por posicion y por accion' },
    AIR: { done: true, note: 'seis saltos, tres familias de ataque aereo y el antiaereo desde el suelo' },
    LOCOMOTION: { done: true, note: 'paso por toque frente a caminata, paso largo, dash y ataques corriendo' },
    CLOTH: { done: true, note: 'tela por cadenas de verlet cosida a los hombros' }
});

/** Los sistemas a medio hacer, por orden de lo que bloquea mas. */
export const PENDING = Object.freeze([
    'GROUND: un estado de la FSM por posicion y conectarlos a los botones',
    'CANCEL: encadenar golpe dentro de la recuperacion de otro',
    'GUARD_IK: deflection (el brazo busca la extremidad del atacante)',
    'APPAREL: colgar la malla de las prendas de los huesos en runtime',
    'GRAPPLE: variantes por disciplina (judo, sambo, sumo, greco)'
]);

export default { SYSTEM_STATUS, PENDING };