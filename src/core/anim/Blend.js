/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/Blend.js
 * ----------------------------------------------------------------------------
 * EL BLENDING: que no de un salto el cuerpo al cambiar de estado.
 *
 * EL PROBLEMA QUE RESUELVE
 * ----------------------------------------------------------------------------
 *   El motor genera la postura de un peleador cada frame. Cuando el estado
 *   cambia, la postura objetivo tambien, y el motor se la ponia encima de la
 *   anterior sin mas: el antebrazo que estaba en guardia aparece estirado a la
 *   altura de la cintura, y el pie que estaba plantado se desliza de golpe. En
 *   un juego de pelea eso se lee como que el peleador "se teletransporta".
 *
 * LA REGLA QUE GOBIERNA TODO EL ARCHIVO
 * ----------------------------------------------------------------------------
 *   LA MEZCLA OCURRE ANTES DEL FK, NUNCA DESPUES.
 *
 *   El FK convierte las rotaciones locales en posiciones de hueso. Es una suma
 *   de longitudes de huesos, y la suma no se puede mezclar despues: mezclar dos
 *   posiciones finales produce un hueso mas corto o mas largo que el suyo, y
 *   el esqueleto se estira mientras dura la mezcla. Lo que se mezcla son los
 *   DELTAS de articulacion (la Pose), y el FK se calcula una sola vez sobre la
 *   pose ya mezclada: el hueso mantiene siempre su longitud.
 *
 * QUE ES "UN CLIP" AQUI
 * ----------------------------------------------------------------------------
 *   Una cadena que identifica de donde viene la postura de este frame:
 *   'LOCO:CAMINAR', 'GOLPE_PESADO', 'SUELO_TIRADO'...
 *
 *   Es lo unico que decide si hay mezcla. Mismo clip y no hay nada que mezclar,
 *   aunque la postura cambie frame a frame: un ciclo de carrera se genera
 *   distinto en cada frame por definicion, y ahi no se quiere NADA de mezcla
 *   (mezclarla con la anterior seria ir siempre con retraso). Cambio de clip y
 *   si: se mezcla.
 *
 * EL COSTE, Y POR QUE ES EL QUE MOLA
 * ----------------------------------------------------------------------------
 *   En el frame NORMAL no hay mezcla, y el caso normal es el 95% de los
 *   frames. Ahi `push` compara dos cadenas, ve que no ha cambiado nada y
 *   DEVUELVE LA MISMA POSE QUE LE HAN DADO: sin clonar, sin mixar, sin tocar
 *   el FK. La mezcla no cuesta hasta que ocurre un cambio de estado, y hay
 *   como treinta cambios de estado por combate.
 * ============================================================================
 */

import { createPose, clonePose, resetPose, blendPoseInto } from '../cine/Pose.js';

// ---------------------------------------------------------------------------
// DURACIONES POR TIPO DE SALTO
//
// El numero de la derecha es SEGUNDOS de mezcla. No son todos iguales porque no
// todos los saltos son el mismo salto: un jab tiene que verse seco o no se ve
// rapido, y un paso a paso largo tiene que verse blando o las piernas dan un
// tiron. Un golpe con mezcla larga se ve lento SIEMPRE, por muy rapidos que
// sean sus frames.
// ---------------------------------------------------------------------------
export const BLEND = Object.freeze({
    SNAP: 0,        // corte seco: nada de mezcla
    IMPACTO: 0,     // te pegan y te mueves EN EL MISMO frame. Si se mezclase,
                    // el golpe se veria como que rebota: la reaccion tiene que
                    // empezar ya, no aparecer gradually.
    ATAQUE: 0.05,   // el golpe entra rapido, pero 50 ms quitan el escalon sin
                    // retrasar lo mas un frame de la sensacion de golpe.
    GUARDIA: 0.09,  // el brazo sube con algo de blandura
    SUELO: 0.10,    // caida y levantada
    AIRE: 0.09,     // despegue y aterrizaje
    LOCO: 0.13,     // entre pasos: el mayor de todos, es el salto mas visible
    RETORNO: 0.11   // volver a la guardia desde un ataque
});

/**
 * Curvas. La diferencia entre ellas NO es academica, se nota:
 *
 *   LINEAR .... la velocidad no se rompe en los extremos. Al mezclar, el peso
 *                empieza y acaba cambiando rapido. Una pierna que corria sigue
 *                corriendo durante la mezcla. Con una curva suave, la pierna
 *                frenaria hasta pararse en el punto de mezcla y arrancaria otra
 *                vez al final: el clasico "rebote de goma", que es lo que hace
 *                que una mezcla se note a PEOR.
 *                Es la correcta para la locomocion, donde el movimiento es
 *                continuo y ese frenazo se ve.
 *
 *   SUAVE ..... empieza y acaba despacio. Sirve cuando lo que se mezcla son
 *                POSTURAS ESTATICAS (de pie a guardia) y no un ciclo de
 *                movimiento: alli la lentitud en los extremos es indistinguible
 *                y queda mas pulido.
 *
 *   SALIDA .... arranca rapido y frena. Es el termino medio, y el que se ve
 *                mejor cuando no se sabe cual de los dos casos es.
 */
export const EASE = Object.freeze({
    linear: (t) => t,
    suave: (t) => t * t * (3 - 2 * t),
    salida: (t) => 1 - (1 - t) * (1 - t) * (1 - t)
});

/**
 * Devuelve el peso (0..1) de la mezcla para un progreso dado, sin tocar nada.
 * Se exporta aparte para poder razonar sobre la curva en los tests sin tener
 * que montar un PoseBlender.
 */
export function pesoDe(t, ease) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return (ease || EASE.linear)(t);
}

/**
 * ============================================================================
 * EL MEZCLADOR
 * ============================================================================
 *
 * Se guarda UNA pose por peleador, y en cada frame se le pasa la postura
 * destino con el clip al que pertenece. Devuelve la postura que hay que
 * escribir en el esqueleto: la misma si no ha pasado nada, o la mezclada si
 * acaba de cambiar el estado.
 */
export class PoseBlender {
    constructor(opts = {}) {
        /** Clip que se esta mostrando ahora mismo. null = todavia nada. */
        this.clip = null;

        /** Foto de lo que se veia EN EL MOMENTO en que empezo la mezcla. */
        this.from = createPose();

        /** Foto de lo que se esta mostrando, refreshing cada frame. */
        this.shown = null;

        /** Donde se escribe la mezcla. Se reutiliza: no se crea por frame. */
        this.cur = createPose();

        /** Progreso 0..1 de la mezcla en curso. 1 =terminada. */
        this.t = 1;

        /** Segundos que dura la mezcla en curso. */
        this.dur = 0;

        /** Curva de la mezcla en curso. */
        this.ease = opts.ease || EASE.linear;

        /** true mientras se esta mezclando de verdad. */
        this.blending = false;

        // --- contadores, solo para depurar y para los tests ------------------
        this.blends = 0;        // cuantos cambios de clip se han mezclado
        this.snapshots = 0;     // cuantas fotos se han tomado
        this.framesBlending = 0;// cuantos frames se han pasado a medio mezclar
        this.peakWeight = 0;    // el peso mas alto visto en una mezcla
    }

    /**
     * Le pasa la postura destino de este frame.
     *
     * @param {string} clip      identificador del origen de la postura.
     *                           Mismo string = mismo clip.
     * @param {object} pose      la Pose destino de este frame (Pose.js)
     * @param {number} dur       segundos de mezcla para ARRANCAR ahora
     * @param {number} dt        segundos que ha durado este frame
     * @param {function} [ease]  curva; si se omite se usa la que tenga puesta
     * @returns {object} la Pose que hay que aplicar. Puede ser `pose` mismo.
     */
    push(clip, pose, dur = BLEND.LOCO, dt = 1 / 60, ease) {
        if (!pose) return null;

        // --- CASO NORMAL: mismo clip. Comparar dos cadenas y salir. ---------
        // Es la ruta caliente: aqui no se clona nada, no se mezcla nada y no
        // se toca el esqueleto mas de lo que ya se tocaba.
        if (clip === this.clip && !this.blending) {
            this.shown = pose;
            return pose;
        }

        // --- CAMBIO DE CLIP: se arranca una mezcla nueva. ------------------
        if (clip !== this.clip) {
            this.clip = clip;
            this.ease = ease || this.ease || EASE.linear;

            // La foto se toma de lo que se veia AHORA, no de la pose destino
            // anterior. Si ya se estaba mezclando, esto es lo que evita el
            // "escalon por escalon": si no, al segundo cambio se volveria al
            // punto de partida y el personaje daria dos tirones en vez de uno.
            this.from = clonePose(this.shown || createPose());
            this.snapshots++;
            this.t = 0;
            this.dur = Math.max(0, dur) || 0;

            // Sin duracion no hay mezcla: se pasa directamente. Asi el impacto
            // y el corte seco no pasan por el slerp ni por el FK otra vez.
            if (this.dur <= 0) {
                this.blending = false;
                this.shown = pose;
                return pose;
            }
            this.blends++;
        } else {
            this.ease = ease || this.ease || EASE.linear;
        }

        // --- AVANZAR Y MEZCLAR ---------------------------------------------
        this.t = Math.min(1, this.t + (dt > 0 ? dt : 0) / this.dur);
        const w = pesoDe(this.t, this.ease);
        if (w > this.peakWeight) this.peakWeight = w;

        blendPoseInto(this.cur, this.from, pose, w);
        this.shown = this.cur;
        this.blending = true;
        this.framesBlending++;

        if (this.t >= 1) {
            // La mezcla ha terminado. A partir de aqui el proximo frame ya
            // entra por la ruta caliente, y este se devuelve tal cual.
            this.blending = false;
            this.shown = pose;
            return pose;
        }
        return this.cur;
    }

    /**
     * Corta la mezcla: lo que haya en pantalla pasa a ser instantaneo.
     *
     * Para lo que no admite transicion: el reaparicion, el ring-out, una
     * teletransporte. Mezclar ahi produce un barrido de cuerpo por la pantalla
     * que parece un fallo.
     *
     * @param {string} clip  el clip al que se pasa
     * @param {object} pose  la Pose destino
     * @returns {object} `pose`, sin mezcla
     */
    instant(clip, pose) {
        this.clip = clip;
        this.t = 1;
        this.dur = 0;
        this.blending = false;
        this.shown = pose;
        return pose;
    }

    /** ¿Hay una mezcla a medias? Para el HUD de depuracion. */
    get active() { return this.blending; }

    /** Progreso de la mezcla en curso, 0..1. 1 si no hay ninguna. */
    get progress() { return this.blending ? this.t : 1; }

    /** Datos para el HUD de depuracion / los tests. */
    info() {
        return {
            clip: this.clip,
            blending: this.blending,
            t: this.t,
            dur: this.dur,
            blends: this.blends,
            snapshots: this.snapshots,
            framesBlending: this.framesBlending,
            peakWeight: this.peakWeight
        };
    }

    /** Vacia el historial de contadores (el estado actual se conserva). */
    resetStats() {
        this.blends = 0;
        this.snapshots = 0;
        this.framesBlending = 0;
        this.peakWeight = 0;
        return this;
    }
}

/**
 * El blend que corresponde a un cambio de estado concreto.
 *
 * Se decide por el GRUPO del estado destino y no por el estado: hay treinta
 * estados de agarre y todos entran igual, y pedir la duracion estado a estado
 * seria copiar treinta veces el mismo numero.
 *
 * @param {string[]} groups  grupos del estado destino (StateGroup)
 * @param {number} [defecto]  si el estado no esta en ningun grupo conocido
 */
export function blendFor(groups, defecto = BLEND.LOCO) {
    if (!groups || !groups.length) return defecto;
    // El impacto va PRIMERO: un estado puede estar en varios grupos a la vez
    // (golpear a alguien que esta en el suelo) y el que manda es el seco.
    if (groups.indexOf('IMPACT') !== -1) return BLEND.IMPACTO;
    if (groups.indexOf('STUNNED') !== -1) return BLEND.IMPACTO;
    if (groups.indexOf('DOWNED') !== -1 || groups.indexOf('WAKEUP') !== -1) return BLEND.SUELO;
    if (groups.indexOf('AIRBORNE') !== -1) return BLEND.AIRE;
    if (groups.indexOf('ATTACKING') !== -1) return BLEND.ATAQUE;
    if (groups.indexOf('GRAPPLE') !== -1) return BLEND.GUARDIA;
    return defecto;
}

/** Libera los buffers de un mezclador. Para no tenerlos en memoria al parar. */
export function disposeBlender(b) {
    if (!b) return false;
    resetPose(b.from);
    resetPose(b.cur);
    b.shown = null;
    b.clip = null;
    b.blending = false;
    b.t = 1;
    b.dur = 0;
    return true;
}

export default { BLEND, EASE, pesoDe, PoseBlender, blendFor, disposeBlender };