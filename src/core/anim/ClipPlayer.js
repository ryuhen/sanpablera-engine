/**
 * ============================================================================
 * SANPABLERA ENGINE · core/anim/ClipPlayer.js
 * ----------------------------------------------------------------------------
 * EL RELOJ DE LOS CLIPS: el unico sitio donde se decide cuanto lleva puesto un
 * clip, y cuando hay que cambiarlo.
 * ============================================================================
 *
 * POR QUE ESTO NO ESTA EN `Blend.js`
 * ----------------------------------------------------------------------------
 *   El mezclador (`Blend.js`) ya sabe UNA cosa: como pasar de una pose a otra
 *   sin que el cuerpo de un salto. Eso lo decide el identificador de clip, que
 *   `FighterEntity._pose` fabricaba como `'FSM:' + state.id`.
 *   Ese identificador era el problema. No era un clip: era un numero de estado.
 *   Tres fallos salian de ahi, y los tres se ven en pantalla:
 *
 *     1. NORMAL_A y NORMAL_B se ven IGUAL (los dos son "de pie quieto"), pero
 *        sus cadenas no coinciden, asi que al pasar de uno al otro el mezclador
 *        arranca una transicion de 130 ms para llegar a la misma pose. El
 *        personaje da un parpadeo en el sitio.
 *     2. Un jab puede salir GANCHO o PUNO_ADELANTE_IZQ segun la cruceta
 *        (`stanceAttackKey`), pero el identificador seguia siendo el del ESTADO.
 *        Animacion de jab con silueta de gancho, y el mezcla no enterandose.
 *     3. No habia ningun reloj. Las poses se generaban con `opts.time`, el
 *        tiempo absoluto de la entidad, asi que un ciclo de carrera empezaba
 *        donde le salia: al volver a la guardia el peleador hacia el resto de
 *        su ciclo de un tiron.
 *
 *   Aqui el identificador es el NOMBRE DEL CLIP, que es el unico dato que
 *   describe de verdad lo que se ve, y el reloj lo lleva este objeto.
 *
 * EL RELOJ, Y POR QUE HAY DOS TIEMPOS
 * ----------------------------------------------------------------------------
 *   `tDeClip` (ClipLibrary) ya resuelve la diferencia:
 *
 *     - un clip de UN SENTIDO se queda en 1 al pasar de su duracion, asi que la
 *       pose queda congelada en el ultimo frame. Un jab no vuelve a empezar.
 *     - un CICLO da la vuelta con el modulo, asi que hay que darle tiempo
 *       ACUMULADO desde que empezo el clip, no el absoluto: si no, al cambiar de
 *       estado el ciclo saltaria a un punto al azar del paso.
 *
 *   Por eso el reloj lleva dos cuentas y por eso se.resetea al cambiar de clip.
 *
 * QUE NO HACE
 * ----------------------------------------------------------------------------
 *   No genera poses y no mezcla: eso es lo de la biblioteca y lo del mezclador.
 *   Aqui solo se responde a dos preguntas: QUE CLIP se esta viendo y CUANTO
 *   LLEVA PUESTO. Son dos funciones y un numero, y son las dos que el tablero
 *   (`ClipBoard.js`) deja de responder a ojo.
 *
 * ES PURO: ni Babylon ni DOM. `tests/clipboard.smoke.mjs` lo monta entero.
 * ============================================================================
 */

/**
 * El reloj de un clip.
 *
 * No es un singleton: hay uno por peleador. Dos peleadores en la misma fase
 * pueden llevar clips distintos y aiyah, y un reloj
 * compartido los haria parpadear el mismo frame.
 */
export class ClipPlayer {
    constructor(opts = {}) {
        /** El clip que se esta viendo ahora mismo. null = todavia nada. */
        this.clip = null;

        /** Segundos desde que empezo ESTE clip. Lo que se pasa al generador. */
        this.t = 0;

        /** Cambios de clip. Para el HUD de depuracion y los tests. */
        this.cambios = 0;

        /** Si el ultimo cambio fue por un corte (sin mezcla). */
        this.ultimoCorte = false;

        // El tiempo del reloj se puede fijar desde fuera (una pausa, un hitstop
        // largo). Guardarlo aqui es lo que permite que `avanzar` no lo ejecute
        // dos veces si el engine llama dos veces con el mismo dt.
        this.ignorarFrames = opts.ignorarFrames || 0;
    }

    /**
     * Avanza el reloj y devuelve el instante dentro del clip actual.
     *
     * LLAMAR SIEMPRE UNA VEZ POR FRAME, con el `dt` real. Es lo que garantiza
     * que dos peleadores que entran en el mismo estado el mismo frame lleven el
     * mismo `t`, y por eso no se puede llamar desde dos sitios.
     *
     * @param {string} clip    el nombre del clip que toca (del tablero)
     * @param {number} dt      segundos que ha durado este frame
     * @param {number} [abs]   tiempo absoluto, para los ciclos
     * @returns {number} segundos dentro del clip actual
     */
    avanzar(clip, dt, abs) {
        if (clip !== this.clip) {
            this.clip = clip;
            this.cambios++;
            this.ultimoCorte = false;
            // Un clip nuevo empieza en cero, SIEMPRE. Es lo que hace que un
            // jab se vea entero cada vez que se pulsa y no dependa de cuando
            // se pulsara la ultima vez.
            this.t = 0;
        }
        if (this.ignorarFrames > 0) {
            this.ignorarFrames--;
            return this.t;
        }
        this.t += (dt > 0 ? dt : 0);
        return this.t;
    }

    /**
     * Marca el proximo `avanzar` como un CORTE: la pose se escribe sin mezclar.
     *
     * Lo llama el engine cuando el mundo da un salto (ring-out, reaparicion).
     * Sin esto, mezclar el cuerpo entre "estaba en las cuerdas" y "esta en el
     * centro" produce un barrido a lo largo de la pantalla que no parece un
     * efecto, parece que el render va roto.
     */
    corte() {
        this.ultimoCorte = true;
        return this;
    }

    /** ¿Ha cambiado el clip desde la ultima llamada? Para decidir la mezcla. */
    cambioEnEsteFrame() {
        return this.cambios > 0 && this.ultimoCorte === false && this.t <= 1e-9;
    }

    /** Datos para el HUD de depuracion / los tests. */
    info() {
        return {
            clip: this.clip,
            t: this.t,
            cambios: this.cambios,
            corte: this.ultimoCorte
        };
    }

    /** Vacia el reloj. Un corte de escena o un reinicio. */
    reset() {
        this.clip = null;
        this.t = 0;
        this.cambios = 0;
        this.ultimoCorte = false;
        return this;
    }
}

/**
 * Cuanto tiene que durar la MEZCLA cuando se cambia a este clip.
 *
 * POR QUE NO ES UN NUMERO FIJO POR CLIP
 *   Volver a la guardia desde un jab y volver desde una caida no pueden
 *   tardar lo mismo. Y `Blend.blendFor` ya lo resuelve por GRUPOS, que es la
 *   misma informacion que tiene el estado. Este helper solo anade el matiz que
 *   los grupos no ven: si el clip destino es un CICLO, la mezcla se alarga
 *   un poco mas, porque un cambio a un ciclo con mezcla corta se ve como un
 *   tropezon (la pierna que llega tarde a la siguiente zancada).
 *
 * @param {string} clip     nombre del clip destino
 * @param {string[]} groups grupos del estado destino
 * @param {number} defecto  lo que devuelve `blendFor` si no hay grupos
 * @param {object} ficha   la ficha del clip, para saber si es ciclo
 * @returns {number} segundos
 */
export function mezclaDe(clip, groups, defecto, ficha) {
    const base = defecto != null ? defecto : 0.13;
    if (ficha && ficha.loop && base < 0.13) return 0.13;
    return base;
}

export default { ClipPlayer, mezclaDe };
