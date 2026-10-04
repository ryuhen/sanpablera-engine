/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · Constants.js
 * ----------------------------------------------------------------------------
 * FUENTE UNICA DE VERDAD para toda la maquina de estados.
 *
 * Por que este archivo existe y no esta "dentro" de la FSM:
 *   - Los estados, fases y banderas fisicas se referencian desde el catalogo
 *     de estados, la tabla de transiciones, los handlers y los adaptadores.
 *     Si cada uno declarara sus propios literales ("CROUCH" aqui, "AGACHADO"
 *     alla) la maquina se desincroniza en la primera semana de desarrollo.
 *   - Al estar todo en un solo objeto congelado (Object.freeze) un typo como
 *     `State.AGACHADD` falla de forma explicita en lugar de devolver undefined
 *     y producir un estado fantasma que jamas aparece en la tabla de
 *     transiciones (fallo silencioso clasico de los FSM).
 *
 * NOTA DE CONVENCION (importante para el resto del sistema):
 *   Todos los datos de frame data (startup/active/recovery/cancel windows) se
 *   expresan en FRAMES a 60 Hz, nunca en segundos. Motivo: el combate de
 *   fighters es determinista frame a frame. Guardar frames permite replay,
 *   lockstep de red y tests sin depender del framerate del dispositivo movil.
 *   `SPF.CONFIG.FIXED_DT` hace la conversion una unica vez, en el acumulador
 *   del update().
 * ============================================================================
 */
(function (global) {
    'use strict';

    // Namespace raiz. Todo el motor vive bajo SPF (SanPablera Fighter).
    const SPF = (global.SPF = global.SPF || {});

    // =========================================================================
    // CONFIGURACION GLOBAL
    // =========================================================================
    const CONFIG = {
        // Paso de simulacion fijo. update(deltaTime) acumula y ejecuta el FSM
        // en pasos de 1/60 s para que el frame data signifique algo real.
        REFERENCE_FPS: 60,
        FIXED_DT: 1 / 60,

        // Techo de pasos por update. Evita el "spiral of death": si el movil
        // se atasca 2 s, el motor no intenta recuperar 120 pasos de golpe.
        MAX_STEPS_PER_UPDATE: 5,

        // --- ANY POINT CANCEL ------------------------------------------------
        // Enfriamiento global: frames que deben pasar tras un APC antes de
        // permitir otro. Es el freno anti-spam (encadenar APC infinitamente).
        APC_COOLDOWN_FRAMES: 18,
        // Frames de recuperacion que el APC restaura al luchador. La
        // penalizacion es lo que hace que el APC tenga riesgo/recompensa.
        APC_FRAME_PENALTY: 4,
        // Escalado de dano por hit encadenado.
        COMBO_DAMAGE_SCALE_STEP: 0.12,
        COMBO_DAMAGE_SCALE_MIN: 0.25,

        // --- JUGGLE ----------------------------------------------------------
        // A partir de este numero de golpes en el aire, el rival pierde el
        // derecho a Air Recovery y solo le queda Combo Breaker.
        JUGGLE_MAX: 6,

        // --- VENTANAS TECNICAS ----------------------------------------------
        // Ventana para desbloquear POSTURA_DERIVADA_TECNICA tras un ataque
        // (el "just frame" para hacer la tecnica).
        TECH_WINDOW_FRAMES: 12,
        // Invulnerabilidad al levantarse del suelo (anti-otaku wakeup loop).
        WAKEUP_INVULN_FRAMES: 8,
        // Frames de invulnerabilidad tras un air recovery.
        AIR_RECOVERY_INVULN_FRAMES: 6
    };

    // =========================================================================
    // ESTADOS
    // -------------------------------------------------------------------------
    // Los valores numericos son opacos para la logica: solo se comparan entre
    // si. Se usan enteros y no el string del nombre para que el estado que
    // viaja por la red (si en el futuro hay rollback) ocupe 1 byte.
    // =========================================================================
    const State = {
        // --- 1. BASE Y POSICIONAMIENTO -------------------------------------
        NORMAL_A: 1,
        NORMAL_B: 2,
        AGACHADO: 3,
        AGACHADO_GUARDIA_ALTA: 4,
        AGACHADO_GUARDIA_BAJA: 5,
        MOVIMIENTO_8_DIRECCIONES: 6,
        POSTURA_ESTILO_BASE: 7,
        POSTURA_DERIVADA_TECNICA: 8,

        // --- 2. MOVILIDAD RAPIDA E INERCIA ---------------------------------
        SPRINT_FRONTAL: 10,
        SPRINT_ATRAS: 11,
        DASH_LATERAL: 12,
        SIDE_STEP: 13,
        DASH_ATRAS: 14,
        DESLIZAMIENTO: 15,
        CUADRUPEDA: 16,
        DE_RODILLAS: 17,
        TROPEZON: 18,
        RODANDO: 19,
        ACROBACIA: 20,

        // --- 3. AEREOS Y JUGGLE --------------------------------------------
        SALTO_NORMAL_A: 30,
        SALTO_NORMAL_B: 31,
        SALTO_CORTO_A: 32,
        SALTO_CORTO_B: 33,
        AIRE_LIBRE: 34,
        JUGGLER: 35,
        SALTO_AEREO_RECUPERACION: 36,

        // --- 4. IMPACTO, SUELO Y RECUPERACION ------------------------------
        GOLPEADO: 40,
        MAREADO: 41,
        SIN_AIRE: 42,
        // Las 4 orientaciones espaciales del suelo se generan programaticamente
        // mas abajo (ver buildKnockdownStates) para no duplicar 8 bloques
        // identicos de configuracion.
        SUELO_TUMBADO_BOCA_ABAJO: 43,
        SUELO_TUMBADO_BOCA_ARRIBA: 44,
        LEVANTANDOSE_DESDE_AGACHADO: 45,
        LEVANTANDOSE_DESDE_PECHO_TIERRA: 46,

        // --- 5. MECANICAS ESPECIALES ----------------------------------------
        ANY_POINT_CANCEL: 50,
        COMBO_BREAKER: 51,

        // --- ATAQUES (andamiaje para que el APC tenga sentido) ---------------
        // El APC cancela de un ataque a otro; sin ataques el sistema seria
        // inerte. Se declaran aqui para poder inyectarlos desde un moveset
        // externo sin tocar la maquina.
        ATAQUE_LIGERO: 60,
        ATAQUE_PESADO: 61,
        ATAQUE_ESPECIAL: 62,
        ATAQUE_AEREO: 63
    };

    // =========================================================================
    // ORIENTACIONES ESPACIALES DEL SUELO
    // -------------------------------------------------------------------------
    // El angulo del cuerpo en el suelo importa de verdad: define hacia donde
    // mira el primer frame de la levantada (wakeup) y cual es el frame mas
    // cercano al rival (el "close side"), que es por donde te van a pegado.
    // Se modela como dato del estado, NO como 8 estados distintos, para evitar
    // la explosion combinatoria (2 bocas x 4 orientaciones x variantes).
    // =========================================================================
    const DownOrientation = {
        CABEZA_A_RIVAL: 'CABEZA_A_RIVAL',
        PIES_A_RIVAL: 'PIES_A_RIVAL',
        FLANCO_IZQUIERDO: 'FLANCO_IZQUIERDO',
        FLANCO_DERECHO: 'FLANCO_DERECHO'
    };

    // =========================================================================
    // GRUPOS DE ESTADOS
    // -------------------------------------------------------------------------
    // Los grupos son etiquetas para escribir reglas de transicion "para todo
    // el grupo". En vez de duplicar la regla "todo estado en suelo puede hacer
    // backdash" 30 veces, se declara una vez contra StateGroup.GROUNDED.
    // La tabla de transiciones resuelve el grupo en tiempo de lookup.
    // =========================================================================
    const StateGroup = {
        GROUNDED: 'GROUNDED',              // De pie o agachado, controlables
        GROUNDED_LOCOMOTION: 'GROUNDED_LOCOMOTION',
        GROUNDED_AIRBORNE_PROJ: 'GROUNDED_AIRBORNE_PROJ', // Saltos y proyectiles inicial
        AIRBORNE: 'AIRBORNE',
        IMPACT: 'IMPACT',                  // Reaccion a golpe
        DOWNED: 'DOWNED',                  // En el suelo
        WAKEUP: 'WAKEUP',                  // Levantandose
        ATTACKING: 'ATTACKING',
        STUNNED: 'STUNNED'                 // Mareado / sin aire
    };

    // =========================================================================
    // FASES
    // -------------------------------------------------------------------------
    // La fase responde a "donde esta el cuerpo respecto al suelo" y es la que
    // decide si un input puede siquiera evaluarse. Es una guarda de primer
    // nivel: si la fase es IMPACT, no se pierde tiempo leyendo el mando.
    // =========================================================================
    const Phase = {
        GROUND: 'GROUND',
        AIR: 'AIR',
        IMPACT: 'IMPACT',
        DOWNED: 'DOWNED',
        WAKEUP: 'WAKEUP',
        SYSTEM: 'SYSTEM'
    };

    // =========================================================================
    // INPUTS
    // -------------------------------------------------------------------------
    // Se mantiene el alfabeto de variables.js (U/D/L/R, P, K, S, G) para no
    // romper el prototipo existente, y se anade lo que un fighter necesita de
    // verdad: ejes analógicos, buffer de entrada y modificadores.
    // =========================================================================
    const Input = {
        // Direcciones (cruce de 2 ejes -> 8 direcciones + neutral)
        UP: 'U',
        DOWN: 'D',
        LEFT: 'L',
        RIGHT: 'R',
        NEUTRAL: 'N',

        // Botones
        PUNCH: 'P',        // Ligero / rapido
        KICK: 'K',          // Pesado
        SPECIAL: 'S',       // Tecnica
        GUARD: 'G',         // Defensa mantenida
        DASH: 'A',          // Modificador de guardia (doble toque) o dash

        // Flags de la lectura del frame actual
        PRESSED: 'PRESSED', // Solo el frame en que se pulsa
        HELD: 'HELD',       // Mientras se mantiene
        RELEASED: 'RELEASED'
    };

    // Intenciones de alto nivel. La tabla de transiciones razona sobre
    // INTENCIONES, no sobre botones crudos: asi "punch" y "kick" pueden
    // mapear a ataques distintos por personaje sin tocar la FSM.
    const Intent = {
        ATAQUE_LIGERO: 'ATAQUE_LIGERO',
        ATAQUE_PESADO: 'ATAQUE_PESADO',
        ATAQUE_ESPECIAL: 'ATAQUE_ESPECIAL',
        GUARDIA: 'GUARDIA',
        SALTAR: 'SALTAR',
        AGACHARSE: 'AGACHARSE',
        LEVANTARSE: 'LEVANTARSE',
        DASH: 'DASH',
        SPRINT: 'SPRINT',
        ACROBACIA: 'ACROBACIA',
        TECNICA: 'TECNICA',
        CANCEL: 'CANCEL'     // Any-Point Cancel explicito
    };

    // Guardias y su altura: define contra que altura de golpe bloquea.
    const GuardHeight = {
        ALTA: 'ALTA',     // Cubre depie
        MEDIA: 'MEDIA',   // Cubre el centro
        BAJA: 'BAJA'      // Cubre agachado
    };

    // =========================================================================
    // FUENTES DE TRANSICION
    // -------------------------------------------------------------------------
    // La clave arquitectonica del sistema: una transicion NO nace de un
    // "if" monolithico en el update, nace de una FUENTE y un EVENTO.
    // Esto permite que la tabla declare todas las transiciones sin condicionales
    // anidados y hace trivial depurar "por que no entro en ese estado"
    // (se consulta Transitions.resolve(source, state, event)).
    // =========================================================================
    const TransitionSource = {
        INPUT: 'INPUT',        // Boton / intencion del jugador
        TIMER: 'TIMER',        // Se agoto la duracion del estado
        CONTACT: 'CONTACT',    // Contacto con suelo / pared / rival
        HIT: 'HIT',            // Recibio un golpe
        CANCEL: 'CANCEL',      // Cancelacion (Any-Point Cancel)
        SYSTEM: 'SYSTEM'       // Round start, KO, respawn, match reset
    };

    // =========================================================================
    // BANDERAS FISICAS
    // -------------------------------------------------------------------------
    // Declaradas como bitmask para que el motor de fisicas pueda hacer
    // colisiones broad-phase cheaply: un solo entero por estado en lugar de
    // un objeto con 8 booleanos.
    // =========================================================================
    const PhysicalFlag = {
        NONE: 0,
        // Puede empujar/ser empujado por el rival (masa efectiva > 0)
        PUSHABLE: 1 << 0,
        // Recibe impulsos externos (golpes, dashes). Si esta apagado, el estado
        // es "inmune a fisicas": es lo que hace que un attack sea invulnerable.
        IMPULSE_SENSITIVE: 1 << 1,
        // No se le aplica gravedad (dash, knockback suspendido, wall grab)
        GRAVITY_OFF: 1 << 2,
        // Bloquea rotacion (mantiene la capsula vertical). Critico: sin esto
        // el luchador se voltea como un bolster al recibir un backdash.
        LOCK_ROTATION: 1 << 3,
        // Puede deslizarse por el suelo conservando velocidad (slide, sweep)
        GROUND_FRICTION_OFF: 1 << 4,
        // Se auto-limita para no salirse del escenario
        STAGE_CLAMP: 1 << 5,
        // Puede hacer backdash / wall-bounce (choca contra pared)
        WALL_REACT: 1 << 6,
        // El estado controla la velocidad manualmente cada frame
        MANAGES_VELOCITY: 1 << 7
    };

    // Politica de velocidad al entrar a un estado. Sin esto, cada estado
    // tendria que acordarse de si preserva o borra la inercia, y olvidarse
    // es justamente lo que produce el bug clasico de fighters: "el backdash
    // se queda pegado al suelo" o "el hitstun conserva velocidad del dash".
    const VelocityPolicy = {
        PRESERVE: 'PRESERVE',   // Conserva la inercia del estado anterior
        ZERO: 'ZERO',           // Frena en seco (hitstun, wakeup)
        DECAY: 'DECAY'          // Rozamiento suave (slide, tropezon)
    };

    // =========================================================================
    // CAPA DE COLISION / HITBOX
    // -------------------------------------------------------------------------
    // Cambia el volumen de colision segun la postura. De pie la capsula es
    // alta y fina; tumbado es baja y ancha. Sin esto el hurtbox de un agachado
    // es identico al de un personaje de pie y el low poke nunca conecta.
    const HullKind = {
        CAPSULE: 'CAPSULE',
        CYLINDER: 'CYLINDER',
        BOX: 'BOX',
        SPHERE: 'SPHERE',
        DISABLED: 'DISABLED'
    };

    // Niveles de cancelacion, de mas barato a mas potente. El APC solo
    // permite subir de nivel, nunca bajar: cancelar un especial con un jab
    // seria romper el juego.
    const CancelTier = {
        LIGHT: 'LIGHT',        // Ligero -> cualquier cosa
        HEAVY: 'HEAVY',        // Pesado -> pesado/especial
        SPECIAL: 'SPECIAL',    // Especial -> solo especial (o la tecnica)
        TECHNIQUE: 'TECHNIQUE'// Derivada tecnica -> nada (es el final de la cadena)
    };

    // Orden de prioridad de cancelacion. Un ataque de cancelTier X solo puede
    // ser cancelado por un ataque de tier >= este valor.
    const CANCEL_TIER_ORDER = {
        [CancelTier.LIGHT]: 0,
        [CancelTier.HEAVY]: 1,
        [CancelTier.SPECIAL]: 2,
        [CancelTier.TECHNIQUE]: 3
    };

    // =========================================================================
    // EXPORT
    // =========================================================================
    SPF.CONFIG = Object.freeze(CONFIG);
    SPF.State = Object.freeze(State);
    SPF.StateGroup = Object.freeze(StateGroup);
    SPF.Phase = Object.freeze(Phase);
    SPF.Input = Object.freeze(Input);
    SPF.Intent = Object.freeze(Intent);
    SPF.GuardHeight = Object.freeze(GuardHeight);
    SPF.TransitionSource = Object.freeze(TransitionSource);
    SPF.PhysicalFlag = Object.freeze(PhysicalFlag);
    SPF.VelocityPolicy = Object.freeze(VelocityPolicy);
    SPF.HullKind = Object.freeze(HullKind);
    SPF.DownOrientation = Object.freeze(DownOrientation);
    SPF.CancelTier = Object.freeze(CancelTier);
    SPF.CANCEL_TIER_ORDER = Object.freeze(CANCEL_TIER_ORDER);

    // Utilidad de.flags -> bitmask. Permite escribir un perfil de fisicas
    // legible en el catalogo: physicalFlags: [PhysicalFlag.LOCK_ROTATION, ...]
    SPF.toFlags = function (list) {
        let mask = 0;
        for (let i = 0; i < list.length; i++) mask |= list[i];
        return mask;
    };

    // Utilidad para validar que el catalogo de estados cubra el enum completo.
    // Se usa en el smoke test: si alguien anade un estado al enum y olvida
    // registrarlo en el catalogo, esto lo delata en vez de fallar en runtime.
    SPF.hasFlag = function (mask, flag) {
        return (mask & flag) === flag;
    };

})(typeof window !== 'undefined' ? window : globalThis);