/**
 * FighterStateMachine - Máquina de Estados Finitos (FSM) para Combate 3D
 * Sanpablera Engine
 */
class FighterStateMachine {
    constructor(fighterInstance) {
        this.fighter = fighterInstance; // Referencia al objeto del luchador (mesh, físicas, etc.)
        this.currentState = null;
        this.previousState = null;
        this.stateTime = 0; // Tiempo transcurrido en el estado actual (en segundos)
        
        // Catálogo completo de estados clasificados por categorías
        this.STATES = {
            // Base
            NORMAL_A: 'NORMAL_A',
            NORMAL_B: 'NORMAL_B',
            AGACHADO: 'AGACHADO',
            MOVIMIENTO_8_DIRECCIONES: 'MOVIMIENTO_8_DIRECCIONES',
            POSTURA_ESTILO_BASE: 'POSTURA_ESTILO_BASE',
            POSTURA_DERIVADA_TECNICA: 'POSTURA_DERIVADA_TECNICA',

            // Movilidad e inercia
            SPRINT_FRONTAL: 'SPRINT_FRONTAL',
            SPRINT_ATRAS: 'SPRINT_ATRAS',
            DASH_LATERAL: 'DASH_LATERAL',
            DASH_ATRAS: 'DASH_ATRAS',
            DESLIZAMIENTO: 'DESLIZAMIENTO',
            CUADRÚPEDA: 'CUADRÚPEDA',
            DE_RODILLAS: 'DE_RODILLAS',
            TROPEZÓN: 'TROPEZÓN',
            RODANDO: 'RODANDO',
            ACROBACIA: 'ACROBACIA',

            // Aéreos y Juggle
            SALTO_NORMAL_A: 'SALTO_NORMAL_A',
            SALTO_NORMAL_B: 'SALTO_NORMAL_B',
            SALTO_CORTO_A: 'SALTO_CORTO_A',
            SALTO_CORTO_B: 'SALTO_CORTO_B',
            AIRE_LIBRE: 'AIRE_LIBRE',
            JUGGLER: 'JUGGLER',
            SALTO_AEREO_RECUPERACION: 'SALTO_AEREO_RECUPERACION',

            // Impacto y suelo
            GOLPEADO: 'GOLPEADO',
            MAREADO_SIN_AIRE: 'MAREADO_SIN_AIRE',
            SUELO_TUMBADO_BOCA_ABAJO: 'SUELO_TUMBADO_BOCA_ABAJO',
            SUELO_TUMBADO_BOCA_ARRIBA: 'SUELO_TUMBADO_BOCA_ARRIBA',
            LEVANTANDOSE_DESDE_AGACHADO: 'LEVANTANDOSE_DESDE_AGACHADO',
            LEVANTANDOSE_PECHO_TIERRA: 'LEVANTANDOSE_PECHO_TIERRA'
        };

        // Reglas de interrupción rápida / Any-Point Cancel (Matriz de transiciones permitidas o penalizaciones)
        // Define qué estados pueden ser interrumpidos de forma global o bajo qué condiciones
        this.globalCancelRules = {
            // Ejemplo: Estados de impacto permiten escape/combo breaker bajo ciertas condiciones
            [this.STATES.JUGGLER]: [this.STATES.SALTO_AEREO_RECUPERACION, this.STATES.ACROBACIA],
            [this.STATES.GOLPEADO]: [this.STATES.RODANDO, this.STATES.ACROBACIA]
        };

        // Inicializar en estado base
        this.changeState(this.STATES.NORMAL_A);
    }

    /**
     * Cambia de estado de manera controlada ejecutando ciclos de salida y entrada.
     * @param {string} newState - Nuevo estado al que se desea transicionar.
     */
    changeState(newState) {
        if (!Object.values(this.STATES).includes(newState)) {
            console.warn(`[FSM] El estado "${newState}" no existe en el catálogo.`);
            return false;
        }

        // Ejecutar lógica de salida del estado anterior si existe
        if (this.currentState && typeof this.currentState.onExit === 'function') {
            this.currentState.onExit();
        }

        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateTime = 0; // Reiniciar cronómetro del estado

        // Ejecutar lógica de entrada del nuevo estado
        this._onStateEnter(newState);
        return true;
    }

    /**
     * Actualiza la lógica del estado actual en cada frame.
     * @param {number} deltaTime - Tiempo transcurrido entre frames.
     */
    update(deltaTime) {
        this.stateTime += deltaTime;

        // Aquí puedes agregar un mapeo de funciones update por estado si prefieres desacoplar la lógica
        switch (this.currentState) {
            case this.STATES.SPRINT_FRONTAL:
                // Lógica específica de inercia o detección de colisión con paredes para rebote
                break;
            default:
                break;
        }
    }

    /**
     * Mecánica "Any-Point Cancel": Evalúa si el estado actual puede interrumpirse 
     * para pasar a un estado objetivo validando enfriamientos (cooldowns) y recursos.
     * @param {string} targetState - Estado destino al que se quiere saltar.
     * @param {object} playerResources - Objeto con recursos del jugador (ej. energía, barra de cancel).
     */
    canCancelInto(targetState, playerResources = { stamina: 100, cooldownReady: true }) {
        // 1. Validar si el estado objetivo es válido
        if (!Object.values(this.STATES).includes(targetState)) return false;

        // 2. Comprobar reglas globales de cancelación si aplica
        const allowedCancels = this.globalCancelRules[this.currentState];
        if (allowedCancels && allowedCancels.includes(targetState)) {
            // Aplicar penalización de recursos por cancelación de emergencia
            if (playerResources.stamina >= 15) {
                playerResources.stamina -= 15; // Costo por cancelar desde estado crítico
                return true;
            }
            return false;
        }

        // 3. Validación estándar de tiempo mínimo en el estado (evita spam instantáneo)
        const MIN_STATE_TIME_FOR_CANCEL = 0.05; // 50ms
        if (this.stateTime < MIN_STATE_TIME_FOR_CANCEL) {
            return false;
        }

        // Por defecto, permitir la transición si pasó las validaciones básicas
        return true;
    }

    /**
     * Método interno privado para manejar eventos al entrar a un estado.
     */
    _onStateEnter(state) {
        // Configuración inicial por estado (reproducir animaciones, ajustar físicas base)
    }
}

// Exportar para uso modular en el proyecto
// export { FighterStateMachine };
