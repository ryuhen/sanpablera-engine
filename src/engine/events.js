/**
 * ============================================================================
 * SANPABLERA ENGINE · engine/events.js
 * ----------------------------------------------------------------------------
 * EL BUS DE EVENTOS: detectar y repartir, sin buscar a quien tocar.
 *
 * QUE HAY AQUI Y POR QUE
 * ----------------------------------------------------------------------------
 *   La forma en que el motor funciona hoy es de LLAMADA DIRECTA: el bucle pide
 *   el input, la entidad decide, `world.tryHit` pregunta si conecta. Funciona,
 *   pero cada nueva pieza tiene que conocer a todas las anteriores para poder
 *   avisarlas, y en cuanto hay diez piezas ya nadie sabe a quien hay que
 *   llamar.
 *
 *   Aqui se cambia eso por DETECTAR Y REPARTIR: alguien emite un evento
 *   ("ha conecta un golpe") y el bus se lo pasa a quien este suscrito. Quien
 *   detecta no sabe quien escucha, y quien escucha no sabe quien emite.
 *
 * POR QUE ES RAPIDO
 * ----------------------------------------------------------------------------
 *   El reparto es un objeto plano de arrays, no una busqueda: mirar quien
 *   escucha un evento es una lectura de propiedad, no un recorrido. Y hay una
 *  optimizacion que importa: un evento que NO tiene suscriptores ni se
 *   construye. En un frame normal eso es la mayoria.
 * ============================================================================
 */

/**
 * Los eventos del juego. Son strings cortos a proposito: se comparan por
 * identidad de internacion, asi que un string aqui se compara en nanosegundos.
 *
 * Se agrupan por quien los emite:
 *   input ....... de donde viene el mando
 *   golpe ....... ha pasado algo con un ataque
 *   choque ...... los dos cuerpos se han encontrado
 *   suelo ....... alguien se ha ido al suelo o vuelve
 *   agarre ...... se ha abierto o cerrado un clinch
 */
export const EV = Object.freeze({
    // --- entrada ---
    INPUT_MOVE: 'INPUT_MOVE',              // el boton de mover cambia
    INPUT_LOCO: 'INPUT_LOCO',              // tipo de desplazamiento leido
    INPUT_ATTACK: 'INPUT_ATTACK',          // se ha pulsado un golpe

    // --- golpe ---
    HIT_LANDED: 'HIT_LANDED',              // un golpe ha conectado
    HIT_BLOCKED: 'HIT_BLOCKED',            // un golpe ha sido bloqueado
    HIT_WHIFFED: 'HIT_WHIFFED',            // un golpe ha fallado
    KNOCKDOWN: 'KNOCKDOWN',                // alguien ha caido al suelo
    FRAME_DATA: 'FRAME_DATA',              // se han calculado los cuadros

    // --- choque ---
    CLASH_RESOLVED: 'CLASH_RESOLVED',      // los dos cuerpos se han tocado
    RING_OUT: 'RING_OUT',                  // alguien se ha salido del ring

    // --- suelo ---
    GROUND_ENTER: 'GROUND_ENTER',          // entra en suelo
    GROUND_EXIT: 'GROUND_EXIT',            // sale del suelo
    DOWNED_GETUP: 'DOWNED_GETUP',          // se ha levantado

    // --- agarre ---
    GRAPPLE_OPEN: 'GRAPPLE_OPEN',          // se abre un clinch
    GRAPPLE_CLOSE: 'GRAPPLE_CLOSE',        // se cierra
    GRAPPLE_ESCAPE: 'GRAPPLE_ESCAPE'       // alguien se ha soltado
});

/** Cuantos eventos hay, para las comprobaciones. */
export const EVENT_COUNT = Object.keys(EV).length;

export class EventBus {
    constructor() {
        /** evento -> array de suscriptores. Objeto plano, sin prototipo. */
        this.handlers = Object.create(null);
        /** Cuantos eventos se han emitido, por tipo (para depurar). */
        this.counts = Object.create(null);
        /** Si es true, avisa de eventos emitidos sin suscriptores. */
        this.strict = false;
    }

    /**
     * Se suscribe a un evento.
     * @returns {function} la funcion para darse de baja (mas comodo que
     *   guardar la referencia y tener que llamar a off con la misma pareja)
     */
    on(event, fn) {
        if (typeof fn !== 'function') throw new TypeError('on() necesita una funcion');
        (this.handlers[event] || (this.handlers[event] = [])).push(fn);
        return () => this.off(event, fn);
    }

    /** Se da de baja. Silencioso si no estaba suscrito. */
    off(event, fn) {
        const arr = this.handlers[event];
        if (!arr) return false;
        const i = arr.indexOf(fn);
        if (i === -1) return false;
        arr.splice(i, 1);
        return true;
    }

    /** ¿Hay alguien escuchando? La comprobacion MAS BARATA: leer una propiedad. */
    has(event) {
        const arr = this.handlers[event];
        return !!arr && arr.length > 0;
    }

    /**
     * Emite un evento. Devuelve cuantos suscriptores lo han recibido.
     *
     * `payload` se construye SIEMPRE antes de llamar (es un argumento), asi
     * que el "no construir si nadie escucha" hay que resolverlo en el sitio que
     * emite, con `has()`. Este metodo no lo puede hacer por si solo.
     */
    emit(event, payload) {
        this.counts[event] = (this.counts[event] || 0) + 1;
        const arr = this.handlers[event];
        if (!arr || !arr.length) return 0;

        // Se COPIA siempre antes de recorrer. Si un suscriptor se da de baja
        // mientras se reparte, el splice acortaria el array y el siguiente se
        // saltaria sin enterarse. Con 'copiar solo si hay mas de 4' el fallo salia
        // justo con POUCOS suscriptores, que es lo habitual.
        const copia = arr.slice();
        for (let i = 0; i < copia.length; i++) {
            try {
                copia[i](payload, event);
            } catch (err) {
                // Un suscriptor que peta no puede tumbar el frame entero.
                console.error('[bus] fallo en el manejador de ' + event, err);
            }
        }
        return copia.length;
    }

    /** Quita todos los suscriptores de un evento. */
    clear(event) {
        if (event === undefined) {
            this.handlers = Object.create(null);
        } else {
            delete this.handlers[event];
        }
        return this;
    }

    /** Resumen para depurar: cuantos suscriptores y cuantos eventos. */
    stats() {
        const porEvento = {};
        let total = 0;
        for (const k of Object.keys(this.handlers)) {
            const n = this.handlers[k].length;
            if (n === 0) continue;
            porEvento[k] = n;
            total += n;
        }
        return { suscriptores: total, porEvento: porEvento, emitidos: this.counts };
    }
}

/**
 * El bus del juego. Una sola instancia para todo el motor: si hubiera varios,
 * dos sistemas no se hablarian y el fallo seria invisible.
 */
export const bus = new EventBus();

export default { EV, EVENT_COUNT, EventBus, bus };