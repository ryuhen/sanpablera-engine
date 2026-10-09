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
// El destino del namespace. Se declara FUERA de la IIFE y no dentro por una
// razon concreta: el `export default` del final del archivo necesita alargar el
// nombre, y dentro de la IIFE `SPF` es una constante local que no se ve desde
// fuera. Con `SPF` declarado aqui, tanto la IIFE como el export se refieren al
// MISMO objeto.
//
// La version anterior de esta nota decia que el export funcionaba. No lo hacia:
// `const SPF = ...` estaba dentro de `(function(global){...})(window)`, asi que
// el `export default SPF` de la ultima linea era un `ReferenceError` siempre que
// el archivo se cargaba como modulo ES (que es como lo carga el motor). Nadie
// lo habia visto porque las pruebas usan el mismo patron de namespace global
// y ningun modulo Node importaba Constants.js todavia.
const RAIZ = (typeof window !== 'undefined' ? window : globalThis);

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

        // --- AGARRE ---------------------------------------------------------
        // Frames que el UKE tiene que machacar ESCAPE para romper el agarre.
        // Alto a proposito: el agarre tiene que "darse", no ganarse con un
        // dedo, y da tiempo a que el TORI suelte una sumision.
        GRAPPLE_ESCAPE_MASH_FRAMES: 26,
        // Presion acumulada que necesita el UKE para poder escapar. Cada
        // ATEMI del TORI la sube; si llega al maximo, el UKE se libera solo
        // (fallo del TORI) y el TORI entra en recuperacion.
        GRAPPLE_PRESSURE_MAX: 100,
        GRAPPLE_PRESSURE_PER_ATEMI: 34,
        GRAPPLE_PRESSURE_PER_FRAME: 2,
        GRAPPLE_PRESSURE_DECAY: 1,
        // Frames de aplicacion de cada accion dentro del agarre.
        GRAPPLE_ACTION_FRAMES: {
            ATACAR: 14, PROYECCION: 26, SUMISION: 40, ESCAPE: 18
        },
        // Ventana de frames en la que se puede pedir un escape. Fuera de ella
        // el escape no se registra (así el UKE no puede pre-mash).
        GRAPPLE_ESCAPE_WINDOW_START: 6,
        GRAPPLE_ESCAPE_WINDOW_END: 150,

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
// Caida lenta: el cuerpo cae flotando tras una tecnica o un air dash.
        // Se separa de AIRE_LIBRE porque aqui el motor tiene que REDUCIR la
        // velocidad de caida (es la ventana para los ataques aereos) y
        // permitir un ataque de caida.
        CAIDA_LENTA: 37,

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
        ATAQUE_AEREO: 63,

        // --- 6. AGARRE / GRAPPLING -----------------------------------------
        // Los estados de agarre se generan en pares (uno por papel: UKE y
        // TORI) a partir de GrappleStance, para que anadir una postura nueva
        // no obligue a escribir 2 bloques de codigo. La numeracion reserva el
        // rango 70-99 para esto. El mapeo Paper x Postura -> id esta en
        // SPF.GRAPPLE_STATES mas abajo.
        AGARRE_UKE_PIE: 70,
        AGARRE_TORI_PIE: 71,
        AGARRE_UKE_AGACHADO: 72,
        AGARRE_TORI_AGACHADO: 73,
        AGARRE_UKE_TORI_AGACHADO: 74,
        AGARRE_TORI_TORI_AGACHADO: 75,
        AGARRE_ATEMI_UKE: 76,
        AGARRE_ATEMI_TORI: 77,
        AGARRE_UKEMI_UKE: 78,
        AGARRE_UKEMI_TORI: 79,
        AGARRE_PROYECCION_UKE: 80,
        AGARRE_PROYECCION_TORI: 81,
        AGARRE_SUMISION_UKE: 82,
        AGARRE_SUMISION_TORI: 83,
        AGARRE_ESCAPE_UKE: 84,
        AGARRE_ESCAPE_TORI: 85,
        AGARRE_PRESION_UKE: 86,
        AGARRE_PRESION_TORI: 87,
        AGARRE_SUELO_UKE: 88,
        AGARRE_SUELO_TORI: 89,
        AGARRE_SUELO_AGACHADO_UKE: 90,
        AGARRE_SUELO_AGACHADO_TORI: 91,
        AGARRE_SUELO_ATEMI_UKE: 92,
        AGARRE_SUELO_ATEMI_TORI: 93,
        AGARRE_SUELO_ESCAPE_UKE: 94,
        AGARRE_SUELO_ESCAPE_TORI: 95,
        AGARRE_SUELO_UKEMI_UKE: 96,
        AGARRE_SUELO_UKEMI_TORI: 97,
        // El clinch bajo (los dos agachados) NO es lo mismo que "el tori
        // agachado": el clinch es donde los dos estan abajo, asi que el UKE
        // escapa mejor y no admite sumision. Por eso tiene ids propios.
        AGARRE_UKE_CLINCH: 98,
        AGARRE_TORI_CLINCH: 99
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
        STUNNED: 'STUNNED',                // Mareado / sin aire
        GRAPPLE: 'GRAPPLE',                // Cualquier estado de agarre
        GRAPPLE_UKE: 'GRAPPLE_UKE',        // Papel: recibe la tecnica
        GRAPPLE_TORI: 'GRAPPLE_TORI'        // Papel: aplica la tecnica
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
        GRAPPLE: 'GRAPPLE',   // agarre: la fase que decide paper y postura
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
    // NIVELES DE IMPACTO
    // -------------------------------------------------------------------------
    // No es solo "cuanto dano": decide QUE estado de reaccion se entra y COMO
    // se cae al suelo. Un golpe BAJO derriba de cara (barrido), uno FUERTE
    // rompe guardia y garantiza KD, uno MEDIO solo escalda. Mezclar el dano con
    // esta decision es el bug clasico: un jab que hace KD.
    // =========================================================================
    const HitLevel = {
        BAJO: 'BAJO',       // Barrido / golpe bajo: derriba de cara
        MEDIO: 'MEDIO',     // Cuerpo a cuerpo: hitstun, sin KD
        FUERTE: 'FUERTE'    // Rompe guardia, KD garantizado
    };

    // =========================================================================
    // FASES DE ATAQUE
    // -------------------------------------------------------------------------
    // Sub-estado dentro de un estado ATAQUE_*. Se deriva del contador de frames
    // del propio estado (ver StateMachine#getAttackPhase), no es un estado del
    // enum: separate los 4 ataques en 12 estados distintos haria la tabla de
    // transiciones ilegible sin ganar nada.
    // =========================================================================
    const AttackPhase = {
        STARTUP: 'STARTUP',   // Anticipacion: el golpe AUN no sale
        ACTIVE: 'ACTIVE',     // Hitbox activa: este es el unico frame que hace dano
        RECOVERY: 'RECOVERY'  // Follow-through: cancelable segun tier
    };

// =========================================================================
    // SISTEMA DE AGARRE (GRAPPLING)
    // -------------------------------------------------------------------------
    // En un agarre hay SIEMPRE dos papeles y el motor tiene que saber cual es
    // cual en cada frame, porque no tienen los mismos permisos:
    //
    //   TORI = el que APLICA la tecnica (engancha, golpea, lanza, suma).
    //   UKE  = el que la RECIBE (la sufre, intenta escapar).
    //
    // Por eso el papel es parte del estado (`GrappleRole`) y no una variable
    // suelta: cambiar de estado por papel es lo que activa las animaciones,
    // el hull y el control correctos.
    //
    // Y dentro del papel, la POSTURA del agarre (de pie, agachado, atemi,
    // ukemi, suelo...) tambien es estado, porque cada combinacion tiene
    // animaciones propias para ataque, escape, proyeccion y sumision.
    // =========================================================================
    const GrappleRole = {
        UKE: 'UKE',     // recibe la tecnica
        TORI: 'TORI'    // aplica la tecnica
    };

    // Posturas/variantes de agarre. Cada valor genera DOS estados (uno por
    // papel) en states/GrappleStates.js, y cada uno declara las animaciones
    // de ATACAR, ESCAPE, PROYECCION y SUMISION.
    const GrappleStance = {
        // --- agarres de pie ---
        PIE: 'PIE',                                     // los dos de pie
        UKE_AGACHADO: 'UKE_AGACHADO',                   // uke abajo, tori de pie
        TORI_AGACHADO: 'TORI_AGACHADO',                 // tori abajo, uke de pie
        AGACHADO: 'AGACHADO',                           // clinch bajo, los dos abajo
        // --- momentos dentro del agarre ---
        ATEMI: 'ATEMI',                                 // golpe corto en el agarre
        UKEMI: 'UKEMI',                                 // rotura de caida
        PROYECCION: 'PROYECCION',                       // la proyeccion se ejecuta
        SUMISION: 'SUMISION',                           // sumision (no se puede matar)
        ESCAPE: 'ESCAPE',                               // escape / raijin
        PRESION: 'PRESION',                             // mantener al rival preso
        // --- agarres en el suelo (groundwork) ---
        SUELO: 'SUELO',                                 // top position
        SUELO_AGACHADO: 'SUELO_AGACHADO',               // bottom position
        SUELO_ATEMI: 'SUELO_ATEMI',                     // ground and pound
        SUELO_ESCAPE: 'SUELO_ESCAPE',                   // escape desde el suelo
        SUELO_UKEMI: 'SUELO_UKEMI'                      // rotura en el suelo
    };

    // Acciones que se pueden resolver dentro de un agarre. El orden del array
    // ES la prioridad cuando tori y uke pulsan a la vez en el mismo frame.
    const GrappleAction = {
        ESCAPE: 'ESCAPE',
        ATACAR: 'ATACAR',
        PROYECCION: 'PROYECCION',
        SUMISION: 'SUMISION'
    };

    // Prioridad de resolucion: la sumision gana a la proyeccion, que gana al
    // golpe, que pierde contra el escape. Se invierte a proposito para que el
    // TORI (el que ataca) tenga que ganarse la posicion: si el escape ganara
    // siempre, no habria agarre posible.
    const GRAPPLE_PRIORITY = Object.freeze([
        GrappleAction.SUMISION,
        GrappleAction.PROYECCION,
        GrappleAction.ATACAR,
        GrappleAction.ESCAPE
    ]);

    // =========================================================================
    // ORIENTACION DEL CUERPO RESPECTO AL RIVAL
    // -------------------------------------------------------------------------
    // Grados sobre el eje de combate (0 = la cabeza mira al rival). Es la
    // generalizacion de DownOrientation: el suelo (43/44) y el knockdown usan el
    // MISMO eje, de modo que "caido de espaldas mirando al rival" y "caido de
    // costado a 45 grados" son el mismo dato, no dos estados distintos.
    // =========================================================================
    const FacingAxis = {
        CABEZA_A_RIVAL: 0,     // De espaldas: la cabeza mira al oponente
        DIAGONAL_45: 45,       // Angulo intermedio (flanco derecho)
        DIAGONAL_135: 135,     // Angulo intermedio (flanco izquierdo)
        PIES_A_RIVAL: 180      // De frente: los pies apuntan al oponente
    };

    // Traduccion de la orientacion del suelo al eje numerico. Sin este mapa
    // cada consumidor tendria que switchear sobre DownOrientation.
    const ORIENTATION_TO_AXIS = {
        [DownOrientation.CABEZA_A_RIVAL]: FacingAxis.CABEZA_A_RIVAL,
        [DownOrientation.FLANCO_DERECHO]: FacingAxis.DIAGONAL_45,
        [DownOrientation.FLANCO_IZQUIERDO]: FacingAxis.DIAGONAL_135,
        [DownOrientation.PIES_A_RIVAL]: FacingAxis.PIES_A_RIVAL
    };

    // =========================================================================
    // ORIENTACION VISUAL RESPECTO A LA CAMARA
    // -------------------------------------------------------------------------
    // Los juegos de lucha necesitan dos sets de animacion para la MISMA accion
    // (normal / agachado / salto): una con el personaje de espaldas a camara y
    // otra de frente. Se modela como dato resuelto en runtime, NO duplicando
    // estados: NORMAL_A y NORMAL_B son los dos sets para los momentos
    // guionizados (intro, KO), y para el combate everyday la FSM elige el set
    // en runtime segun hacia donde mire el personaje.
    // =========================================================================
    const VisualFacing = {
        ESPALDA_A_CAMARA: 'ESPALDA_A_CAMARA',
        FRENTE_A_CAMARA: 'FRENTE_A_CAMARA'
    };

    // =========================================================================
    // LADO DEL COMBATE
    // =========================================================================
    const FighterSide = {
        P1: 'P1',
        P2: 'P2'
    };

    // Sufijo de animacion por orientacion visual. `__f` = de frente a camara,
    // `__b` = de espaldas. Se mantiene corto porque los clips vienen del
    // exportador del modelo y los nombres largos revientan los pipelines.
    const ANIM_SUFFIX = {
        [VisualFacing.FRENTE_A_CAMARA]: '__f',
        [VisualFacing.ESPALDA_A_CAMARA]: '__b'
    };

    // Clave de animacion concreta para un estado y una orientacion visual dados.
    // Un unico punto de verdad para el nombre del clip: si el exportador cambia
    // el sufijo, se cambia aqui y no en 20 sitios.
    SPF.animationKey = function (baseKey, visualFacing) {
        if (!baseKey) return null;
        const suffix = ANIM_SUFFIX[visualFacing];
        return suffix ? baseKey + suffix : baseKey;
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

    // A donde lleva cada tier de cancelacion. Es DATO y no una funcion porque el
    // estado puente ANY_POINT_CANCEL solo tiene que saber leerlo: el cancel se
    // pide con un tier y la tabla de transiciones se encarga del resto.
    const CANCEL_TARGET_STATE = {
        [CancelTier.LIGHT]: State.ATAQUE_LIGERO,
        [CancelTier.HEAVY]: State.ATAQUE_PESADO,
        [CancelTier.SPECIAL]: State.ATAQUE_ESPECIAL,
        [CancelTier.TECHNIQUE]: State.POSTURA_DERIVADA_TECNICA
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
    SPF.HitLevel = Object.freeze(HitLevel);
    SPF.AttackPhase = Object.freeze(AttackPhase);
    SPF.GrappleRole = Object.freeze(GrappleRole);
    SPF.GrappleStance = Object.freeze(GrappleStance);
    SPF.GrappleAction = Object.freeze(GrappleAction);
    SPF.GRAPPLE_PRIORITY = Object.freeze(GRAPPLE_PRIORITY);
    SPF.FacingAxis = Object.freeze(FacingAxis);
    SPF.VisualFacing = Object.freeze(VisualFacing);
    SPF.FighterSide = Object.freeze(FighterSide);
    SPF.TransitionSource = Object.freeze(TransitionSource);
    SPF.PhysicalFlag = Object.freeze(PhysicalFlag);
    SPF.VelocityPolicy = Object.freeze(VelocityPolicy);
    SPF.HullKind = Object.freeze(HullKind);
    SPF.DownOrientation = Object.freeze(DownOrientation);
    SPF.CancelTier = Object.freeze(CancelTier);
    SPF.CANCEL_TIER_ORDER = Object.freeze(CANCEL_TIER_ORDER);
    SPF.CANCEL_TARGET_STATE = Object.freeze(CANCEL_TARGET_STATE);
    SPF.ORIENTATION_TO_AXIS = Object.freeze(ORIENTATION_TO_AXIS);

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

    // =========================================================================
    // MAPEO DE AGARRE: (postura, papel) -> id de estado
    // -------------------------------------------------------------------------
    // Es la unica tabla que hay que tocar para anadir una postura de agarre
    // nueva: el estado, su FSM y sus animaciones salen de aqui.
    // =========================================================================
    SPF.GRAPPLE_STATES = Object.freeze({
        [GrappleStance.PIE]: Object.freeze({ UKE: State.AGARRE_UKE_PIE, TORI: State.AGARRE_TORI_PIE }),
        [GrappleStance.UKE_AGACHADO]: Object.freeze({ UKE: State.AGARRE_UKE_AGACHADO, TORI: State.AGARRE_TORI_AGACHADO }),
        [GrappleStance.TORI_AGACHADO]: Object.freeze({ UKE: State.AGARRE_UKE_TORI_AGACHADO, TORI: State.AGARRE_TORI_TORI_AGACHADO }),
        [GrappleStance.AGACHADO]: Object.freeze({ UKE: State.AGARRE_UKE_CLINCH, TORI: State.AGARRE_TORI_CLINCH }),
        [GrappleStance.ATEMI]: Object.freeze({ UKE: State.AGARRE_ATEMI_UKE, TORI: State.AGARRE_ATEMI_TORI }),
        [GrappleStance.UKEMI]: Object.freeze({ UKE: State.AGARRE_UKEMI_UKE, TORI: State.AGARRE_UKEMI_TORI }),
        [GrappleStance.PROYECCION]: Object.freeze({ UKE: State.AGARRE_PROYECCION_UKE, TORI: State.AGARRE_PROYECCION_TORI }),
        [GrappleStance.SUMISION]: Object.freeze({ UKE: State.AGARRE_SUMISION_UKE, TORI: State.AGARRE_SUMISION_TORI }),
        [GrappleStance.ESCAPE]: Object.freeze({ UKE: State.AGARRE_ESCAPE_UKE, TORI: State.AGARRE_ESCAPE_TORI }),
        [GrappleStance.PRESION]: Object.freeze({ UKE: State.AGARRE_PRESION_UKE, TORI: State.AGARRE_PRESION_TORI }),
        [GrappleStance.SUELO]: Object.freeze({ UKE: State.AGARRE_SUELO_UKE, TORI: State.AGARRE_SUELO_TORI }),
        [GrappleStance.SUELO_AGACHADO]: Object.freeze({ UKE: State.AGARRE_SUELO_AGACHADO_UKE, TORI: State.AGARRE_SUELO_AGACHADO_TORI }),
        [GrappleStance.SUELO_ATEMI]: Object.freeze({ UKE: State.AGARRE_SUELO_ATEMI_UKE, TORI: State.AGARRE_SUELO_ATEMI_TORI }),
        [GrappleStance.SUELO_ESCAPE]: Object.freeze({ UKE: State.AGARRE_SUELO_ESCAPE_UKE, TORI: State.AGARRE_SUELO_ESCAPE_TORI }),
        [GrappleStance.SUELO_UKEMI]: Object.freeze({ UKE: State.AGARRE_SUELO_UKEMI_UKE, TORI: State.AGARRE_SUELO_UKEMI_TORI })
    });

    // Id de estado de agarre para (postura, papel). Devuelve null si la
    // combinacion no existe, que es preferible a devolver un id equivocado:
    // el llamante lo detecta y avisa en vez de meter al luchador en un estado
    // fantasma.
    SPF.grappleState = function (stance, role) {
        const row = SPF.GRAPPLE_STATES[stance];
        return row ? (row[role] != null ? row[role] : null) : null;
    };

    // Papel contrario. En un agarre los dos papeles se/heredan al cambiar de
    // momento (si el uke escapa, el tori pasa a ESCAPE_TORI).
    SPF.otherRole = function (role) {
        return role === GrappleRole.TORI ? GrappleRole.UKE : GrappleRole.TORI;
    };
    // =========================================================================
    // El resto del papel se mantiene: si el uke escapa, el tori pasa a
    // ESCAPE_TORI con la misma mecanica y el otro rol.
    // =========================================================================

    // -------------------------------------------------------------------------
    // Utilidad de depuracion: nombre legible de un estado a partir de su id.
    // El enum es numerico a proposito (1 byte por red); a la hora de leer un
    // log "estado 43" no dice nada, y en un juego de lucha el 90% del trabajo
    // es leer logs.
    // -------------------------------------------------------------------------
    SPF.stateName = function (stateId) {
        for (const name in State) {
            if (Object.prototype.hasOwnProperty.call(State, name) && State[name] === stateId) {
                return name;
            }
        }
        return 'UNKNOWN(' + stateId + ')';
    };

    // Direccion opuesta de un eje de combate. El wakeup y el knockdown lo usan
    // para decidir si el primer frame sale mirando al rival o de espaldas.
    SPF.oppositeAxis = function (axis) {
        return FacingAxis.PIES_A_RIVAL - axis;
    };

} )(RAIZ);

// El archivo mantiene su diseño de namespace global (SPF en window) para
// poder cargarse tambien como script clásico, pero expone el namespace como
// export por defecto para que el resto del motor lo importe como módulo ES.
// Se exporta el MISMO objeto que la IIFE ha rellenado, no una copia: el motor
// lee `SPF.State` por un lado y lo escribe por otro, y si fueran dos objetos
// distintos los estados del motor no serian los que ve el resto del codigo.
export default RAIZ.SPF;