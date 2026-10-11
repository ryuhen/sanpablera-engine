/**
 * ============================================================================
 * SANPABLERA ENGINE · core/ground/GroundGame.js
 * ----------------------------------------------------------------------------
 * EL SISTEMA DE SUELO ENTERO: junta el modelo posicional y el de castigo, y
 * avisa por el bus lo que pasa.
 *
 * POR QUE HACE FALTA UNA TERCERA PIEZA
 * ----------------------------------------------------------------------------
 *   `position.js` sabe donde esta cada uno y como se cambia de sitio.
 *   `punish.js` sabe que castiga cada boton y cual es la sumision. Los dos son
 *   PUROS: no saben nada del mundo, y por eso se prueban enteros en Node.
 *
 *   Faltaba el hilo que los cose: quien guarda la posicion actual, quien lleva
 *   la cuenta del giro, quien hace pasar el tiempo y avisa a los demas. Eso es
 *   este archivo, y es lo unico que tiene estado.
 *
 * EL ESTADO, Y QUE NO SE PIERDE
 * ----------------------------------------------------------------------------
 *   El error clasico de este tipo de sistema es guardar la posicion en el
 *   peleador. Serian DOS posiciones que tienen que decir siempre lo mismo, y en
 *   cuanto se desincronizan (un frame de retraso al entrar, un ring-out, una
 *   reaparicion) los dos peleadores estan en sitios distintos y no hay forma
 *   de saber cual es el bueno.
 *
 *   Aqui hay UN SOLO objeto para los dos. Es lo que hace que el modelo entero
 *   quepa en doce estados y no en doce por dos.
 *
 * QUE EMITE Y POR QUE
 * ----------------------------------------------------------------------------
 *   Que el motor se entere por el bus y no por una llamada. Quien mira el HUD
 *   del suelo se suscribe a POSITION_UP; quien suena cuando se acaba el suelo
 *   se suscribe a REVERSAL. Ninguno de los dos sabe que este archivo existe,
 *   y este archivo no sabe que ellos existen.
 * ============================================================================
 */

import { bus, EV } from '../../engine/events.js';
import {
    POS, GEV, ROL, MOTIVO, resolverSuelo, info, peligroDe, ventanaDe,
    rangoDe, hayArriba, estaEnPeligro, mejorAcercamiento
} from './position.js';
import {
    BOTON, castigoDe, resolverGiro, sumisionDe, proyeccionDe, GIRO_NECESARIO
} from './punish.js';
import {
    STANCE, resolverStance, accionDeBoton, accionDeDireccion, lecturaDe
} from './stance.js';
import {
    planDe, planDeReposo, capaEn, capaDeReposo, tieneGuion
} from './groundCine.js';

/**
 * El combate de suelo de UNA pelea. Los dos peleadores comparten este objeto.
 */
export class GroundFight {
    /**
     * @param {object} [opts]
     * @param {string} [opts.pos]    posicion inicial (por defecto, de pie)
     * @param {object} [opts.bus]    bus donde avisar (por defecto, el global)
     */
    constructor(opts = {}) {
        this.bus = opts.bus || bus;

        /** Donde estan. Uno para los dos. */
        this.pos = opts.pos || POS.DE_PIE;

        /** Quien esta arriba. Se deduce de la posicion, no se guarda aparte. */
        this.rol = hayArriba(this.pos) ? ROL.ARRIBA : ROL.ARRIBA;

        /** Frames que lleva el combate EN ESTA posicion. */
        this.frames = 0;

        /** Golpes de giro que lleva el de arriba (para las costillas). */
        this.giro = 0;

        /** Historial, para el HUD y para depurar. Recortado, no es infinito. */
        this.historial = [];
        this.maxHistorial = 32;

        /** true mientras la pelea esta en el suelo. */
        this.enSuelo = false;
    }

    /** Frames que le quedan al de abajo para salir de la posicion actual. */
    get ventanaRestante() {
        return Math.max(0, ventanaDe(this.pos) - this.frames);
    }

    /** Como esta la pelea, de un vistazo. */
    estado() {
        return {
            pos: this.pos,
            nombre: info(this.pos) ? info(this.pos).nombre : '?',
            rango: rangoDe(this.pos),
            peligro: peligroDe(this.pos),
            ventana: this.ventanaRestante,
            giro: this.giro,
            enSuelo: this.enSuelo,
            enPeligro: estaEnPeligro(this.pos, this.frames),
            sumision: sumisionDe(this.pos).sumision
        };
    }

    /**
     * El reloj. El motor lo llama una vez por frame.
     *
     * OJO con el giro: se pone a CERO al cambiar de posicion, no se arrastra.
     * Si no, de la montaja a la espalda se llegaria con el giro ya cheio y el
     * siguiente golpe a las costillas entraria solo.
     */
    tick(dtFrames = 1) {
        if (!this.enSuelo) return this;
        this.frames += dtFrames;
        return this;
    }

    /** El suelo empieza: alguien ha derribado a alguien. */
    entrar(pos = POS.GUARDIA_ABIERTA) {
        this.pos = pos;
        this.frames = 0;
        this.giro = 0;
        this.enSuelo = pos !== POS.DE_PIE;
        this._anotar('ENTRAR');
        this.bus.emit(EV.GROUND_ENTER, { pos: pos, estado: this.estado() });
        return this;
    }

    /** El suelo se acaba: los dos se han levantado. */
    salir() {
        const antes = this.pos;
        this.pos = POS.DE_PIE;
        this.frames = 0;
        this.giro = 0;
        this.enSuelo = false;
        this._anotar('SALIR');
        this.bus.emit(EV.GROUND_EXIT, { desde: antes, estado: this.estado() });
        return this;
    }

    /**
     * Intenta un cambio de posicion.
     *
     * @param {string} rol    ROL.ARRIBA o ROL.ABAJO (quien lo intenta)
     * @param {string} evento una clave de GEV
     * @returns {object} el resultado de `resolverSuelo`, MAS `applied`:
     *   si de verdad se ha movido. `resolverSuelo` dice si la jugada era legal;
     *   esto dice si ademas se ha aplicado, que no es lo mismo.
     */
    mover(rol, evento) {
        const antes = this.pos;
        const r = resolverSuelo(antes, rol, evento, this.frames);
        r.applied = false;

        if (r.ok) {
            this.pos = r.to;
            this.frames = 0;
            this.giro = 0;
            this.enSuelo = this.pos !== POS.DE_PIE;
            r.applied = true;
            this._anotar(evento);

            // AVISAR POR EL BUS. Cada movimiento dice lo suyo, para que quien
            // escuche no tenga que comparar posiciones por su cuenta.
            if (evento === GEV.AVANZAR) {
                this.bus.emit(EV.POSITION_UP, { desde: antes, hasta: this.pos, rol: rol });
            } else if (evento === GEV.RETIRAR) {
                this.bus.emit(EV.POSITION_DOWN, { desde: antes, hasta: this.pos, rol: rol });
            } else if (evento === GEV.REVERSAR) {
                this.bus.emit(EV.REVERSAL, { desde: antes, hasta: this.pos, rol: rol });
            } else if (this.pos === POS.DE_PIE) {
                this.bus.emit(EV.GROUND_EXIT, { desde: antes, estado: this.estado() });
            } else if (antes === POS.DE_PIE) {
                this.bus.emit(EV.GROUND_ENTER, { desde: antes, estado: this.estado() });
            }
        } else if (r.motivo === MOTIVO.FUERA_DE_VENTANA) {
            // Un fallo con nombre propio merece su propio evento: quien dibuje
            // el HUD tiene que poder poner "no puedes salir" sin tener que
            // adivinarlo leyendo el motivo.
            this.bus.emit(EV.ESCAPE_BLOCKED, { pos: antes, rol: rol, motivo: r.motivo });
        }

        return r;
    }

    /** El de arriba usa un boton de castigo. */
    castigar(boton) {
        const r = castigoDe(this.pos, boton);
        r.applied = false;
        if (!r.ok) return r;

        const g = resolverGiro(this.pos, boton, this.giro);
        this.giro = g.giro;
        r.applied = true;

        // El giro que se lleva la pelea se devuelve AQUI, antes de que se
        // limpie al cambiar de posicion. Sin esto, quien dibuja el contador
        // veria un cero justo en el golpe que completo el giro, que es
        // cuando mas le interesa que se vea.
        r.giro = g.giro;

        // El giro completo cambia la posicion. Se hace aqui y no en `mover` a
        // proposito: no es una decision del peleador, es la consecuencia de
        // tres golpes seguidos en la misma zona.
        if (g.completo && g.hacia) {
            const antes = this.pos;
            this.pos = g.hacia;
            this.frames = 0;
            this.giro = 0;
            this._anotar('GIRO');
            r.giroCompletado = true;
            r.posicionCambiada = { desde: antes, hasta: g.hacia };
            this.bus.emit(EV.POSITION_UP, { desde: antes, hasta: g.hacia, por: 'COSTILLAS' });
        }
        return r;
    }

    /** El de arriba intenta la sumision. */
    sumar(stamina = 99) {
        return sumisionDe(this.pos, stamina);
    }

    /** El de arriba intenta una proyeccion. */
    proyectar(stamina = 99) {
        const r = proyeccionDe(this.pos, stamina);
        if (r.ok) this.mover(ROL.ARRIBA, GEV.AVANZAR);
        return r;
    }

    /** Como se llega al suelo desde lejos. */
    acercarse(distancia) {
        return mejorAcercamiento(distancia);
    }

    // -----------------------------------------------------------------------
    // LA STANCE Y LA CINEMATICA
    //
    // Son las dos mitades que el motor llama en cada frame, y estan aqui
    // juntas a proposito: la pregunta que se hace es "que esta haciendo este
    // cuerpo ahora", y la respuesta son las tres cosas a la vez (postura,
    // relacion, plano). Separarlas obligaria al motor a hacer tres llamadas y
    // a recordar en que orden.
    // -----------------------------------------------------------------------

    /**
     * Que puede hacer este cuerpo con ESE boton ahora mismo.
     *
     * @param {string} stance  STANCE, la postura del cuerpo
     * @param {string} boton   BOTON.LIGERO / PESADO / GUARDIA / ACCION
     * @param {string} [rol]   que papel juega este cuerpo
     * @param {number} [energia]
     * @returns {object|null} la accion resuelta, o null si ese boton no hace
     *   nada desde aqui. Null y no un error: que un boton no sirva es lo
     *   normal en un estado concreto.
     */
    conBoton(stance, boton, rol = ROL.ABAJO, energia = 99) {
        return accionDeBoton(stance, boton, this.pos, energia);
    }

    /** Lo mismo, pero con la direccion del mando. */
    conDireccion(stance, direccion, rol = ROL.ABAJO, energia = 99) {
        return accionDeDireccion(stance, direccion, this.pos, energia);
    }

    /**
     * Ejecuta una accion de la stance y actualiza la pelea.
     *
     * Aqui es donde las tres piezas se juntan de verdad: se decide si el
     * cuerpo puede hacerlo, si la jugada es legal en la posicion de ahora, y
     * si sale, se cambia la posicion y se AVISA para que la cinematema sepa que
     * hay que enseñar otra cosa.
     *
     * @returns {object} el resultado de `resolverStance`, mas `pelicula`:
     *   el plan de camara de esa accion. Va SIEMPRE, tambien cuando la
     *   jugada no se pudo hacer: en ese caso el plan es el de reposo, porque
     *   si no pasa nada, el plano tiene que ser el plano base.
     */
    actuar(stance, accion, rol = ROL.ABAJO, energia = 99) {
        const r = resolverStance({
            stance: stance, accion: accion, pos: this.pos,
            rol: rol, energia: energia, framesInside: this.frames
        });

        // SIEMPRE hay pelicula, success o failure. Un fallo es informacion
        // para la camara tambien: si el de abajo intenta salir y no puede,
        // ESO es lo que hay que ver.
        r.pelicula = tieneGuion(accion) ? planDe(accion) : planDeReposo();

        if (r.ok) {
            if (r.posicionCambiada && r.posTras !== this.pos) {
                const antes = this.pos;
                this.pos = r.posTras;
                this.frames = 0;
                this.giro = 0;
                this.enSuelo = this.pos !== POS.DE_PIE;
                this._anotar(accion);
                this.bus.emit(r.invierte ? EV.REVERSAL : EV.POSITION_UP,
                    { desde: antes, hasta: this.pos, rol: rol, por: accion });
            } else {
                this._anotar(accion);
            }
        } else if (r.motivo === MOTIVO.FUERA_DE_VENTANA) {
            this.bus.emit(EV.ESCAPE_BLOCKED, { pos: this.pos, rol: rol, motivo: r.motivo });
        }
        return r;
    }

    /**
     * El plan de camara de ESTE frame.
     *
     * @param {string} [accion] la accion en curso; si no hay ninguna, sale el
     *   plano de reposo, que es lo que se ve el 90% del tiempo
     * @param {number} [frame] frame dentro de la secuencia
     * @returns {object} { existe, plano, capa } · `plano` y `capa` son null si
     *   la secuencia ya acabo, y eso es lo normal: se deja la camara como
     *   estaba y no se superpone nada.
     */
    pelicula(accion = null, frame = 0) {
        if (!accion || !tieneGuion(accion)) {
            const r = planDeReposo();
            return { existe: true, plano: r.planos[0], capa: capaDeReposo(frame) };
        }
        const e = (() => {
            const p = planDe(accion);
            let f = Math.max(0, frame);
            for (let i = 0; i < p.planos.length; i++) {
                if (f < p.planos[i].dur) return { plano: p.planos[i], i: i, dentro: f, t: f / p.planos[i].dur };
                f -= p.planos[i].dur;
            }
            return null;
        })();
        if (!e) return { existe: false, plano: null, capa: [] };
        return { existe: true, plano: e.plano, capa: capaEn(accion, frame) };
    }

    /** La lectura completa de un cuerpo en el suelo, para el HUD. */
    leer(stance, rol = ROL.ABAJO) {
        return lecturaDe(stance, this.pos, rol, this.frames);
    }

    _anotar(motivo) {
        this.historial.push(motivo + ':' + this.pos);
        if (this.historial.length > this.maxHistorial) this.historial.shift();
    }
}

/**
 * El sistema de suelo. UNA PELEA por combate, no una por peleador.
 *
 * LA CLAVE DEL MAPA ES EL COMBATE, Y NO EL LUCHADOR. Es la diferencia entre
 * que esto funcione y que no:
 *
 *   Si la clave fuese el peleador, cada uno tendria su propia GroundFight con
 *   su propia posicion. Bastaria con que uno entrase al suelo un frame antes
 *   que el otro (y en un motor a 60 fps eso pasa) para que los dos estuvieran
 *   en sitios distintos, sin ningun aviso, hasta que alguien se preguntara
 *   quien demonios esta arriba.
 *
 *   Con la clave siendo el combate, los dos peleadores de un combate reciben
 *   SIEMPRE el mismo objeto. No hay dos posiciones que puedan discrepar porque
 *   solo hay una. Y como el mapa sigue existiendo, un torneo con dos
 *   combates a la vez sigue cabiendo.
 */
export class GroundSystem {
    constructor(opts = {}) {
        this.bus = opts.bus || bus;
        /** combateId -> GroundFight */
        this.peleas = new Map();
    }

    /**
     * La pelea de suelo de un COMBATE. Los dos peleadores del mismo combate
     * tienen que pasar el MISMO id.
     *
     * @param {string} combateId id del combate (no del peleador)
     * @returns {object} la GroundFight, creandola si no existe
     */
    de(combateId = 'P1') {
        let g = this.peleas.get(combateId);
        if (!g) {
            g = new GroundFight({ bus: this.bus });
            this.peleas.set(combateId, g);
        }
        return g;
    }

    /**
     * Se entra al suelo. Los dos peleadores comparten la MISMA pelea: por eso
     * no hay dos entradas, hay una. Es la regla que hace que la posicion no se
     * pueda desincronizar.
     */
    entrar(combateId = 'P1', pos = POS.GUARDIA_ABIERTA) {
        const g = this.de(combateId);
        g.entrar(pos);
        return g;
    }

    salir(combateId = 'P1') {
        const g = this.peleas.get(combateId);
        if (g) g.salir();
        return g || null;
    }

    tick(combateId = 'P1', dtFrames = 1) {
        const g = this.peleas.get(combateId);
        if (g) g.tick(dtFrames);
        return g || null;
    }

    /** Que peleas hay abiertas. Para el HUD y para la pantalla de resultados. */
    abiertas() {
        return this.peleas.size;
    }

    reiniciar() {
        this.peleas.clear();
        return this;
    }
}

export default { GroundFight, GroundSystem };