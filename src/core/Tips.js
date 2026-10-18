/**
 * ============================================================================
 * SANPABLERA ENGINE · core/Tips.js
 * ----------------------------------------------------------------------------
 * LOS TIPS DE LA PANTALLA DE CARGA. Y POR QUE NO SON TEXTO FIJO.
 * ============================================================================
 *
 * LA REGLA: UN TIP QUE MIENTE ES PEOR QUE NINGUN TIP
 *   Un tip dice un numero, y un numero puede quedarse viejo. Si el tip dice
 *   "hay 24 golpes" y el dia que se anaden cuatro son 28, el tip no es una
 *   pista: es una contradiccion, y el jugador que la cuenta pierde la
 *   confianza en los otros veinte.
 *
 *   Asi que cada numero sale de la TABLA, aqui y ahora, en el momento de
 *   arrancar. `tests/tips.smoke.mjs` comprueba ademas que el texto coincide con
 *   lo que dicen las tablas, para que alguien que retoque la tabla sin tocar
 *   aqui se entere en la suite y no en pantalla.
 *
 * LO QUE NO HAY Y POR QUE
 *   No hay consejos de "intenta esto". Un tip tiene que decir una verdad del
 *   motor que el jugador no puede deducir mirando, no una frase de manual. Por
 *   eso casi todos son reglas que no se ven jugando: la reserva de ATAQUE_LIGERO
 *   con ATAQUE_PESADO, o que la postura decide el golpe.
 *
 * Y UN AVISO QUE ESTA EN EL MISMO SITIO QUE LOS DATOS
 *   Venezuela limita con Guyana por una linea que la ONU todavia no ha
 *   drawing. Aqui no se dibuja ese limite y no se habla de el.
 */
import { MOVE_SILHOUETTES } from './entities/AttackPoses.js';
import { ALL_STANCES, STANCE_CYCLE } from './boxing.js';
import { ESCENARIOS, RING_OUT } from './geo/escenarios.js';
import { RINGS } from './geo/rings.js';
import { LUGARES } from './geo/margarita.js';

/** Los identificadores de los cuatro modos de ring out, en orden de dureza. */
const RING_OUPS = [RING_OUT.NINGUNO, RING_OUT.PUNTOS, RING_OUT.VIDA, RING_OUT.KO];

/**
 * Cuenta los golpes distintos que usa cada familia, para poder decir "el jab
 * lo comparten N golpes" sin escribir el numero a mano.
 */
function repartoDe(golpes) {
    const c = new Map();
    for (const g of golpes) c.set(g, (c.get(g) || 0) + 1);
    return c;
}

/**
 * Los tips. Se CONSTRUYEN al importar, no se escriben.
 *
 * @type {ReadonlyArray<{titulo:string, texto:string}>}
 */
export const TIPS = Object.freeze([
    {
        titulo: 'El combo',
        texto: 'ATAQUE_LIGERO con ATAQUE_PESADO a la vez es el especial. Esos dos botones estan vivos por separado, pero juntos ya no son dos ataques.'
    },
    {
        titulo: 'La postura manda',
        texto: 'Con la cruceta suelta manda la postura: el golpe es el del personaje. Con la cruceta en una direccion manda la direccion.'
    },
    {
        titulo: 'Stance',
        texto: 'Rotas postura con ACCION y cada una tiene su moveset: ' + STANCE_CYCLE.length + ' en el abanico. Cambia lo que hace el mismo boton.'
    },
    {
        titulo: 'Las diagonales',
        texto: 'Las diagonales pegan mas fuerte y llegan mas lejos que las rectas. Arriba es mas que abajo; en diagonal, mas que de lado.'
    },
    {
        titulo: 'Golpes compartidos',
        texto: 'Hay ' + Object.keys(MOVE_SILHOUETTES).length + ' golpes repartidos en solo '
            + new Set(Object.values(MOVE_SILHOUETTES)).size + ' animaciones. El jab lo comparten '
            + repartoDe(Object.values(MOVE_SILHOUETTES)).get('JAB') + ' golpes distintos.'
    },
    {
        titulo: 'Ring out',
        texto: 'Se puede perder sin que te peguen. Hay cuatro modos y no todos hacen lo mismo: ' + RING_OUPS.join(' / ') + '.'
    },
    {
        titulo: 'El escenario manda',
        texto: 'Un mismo ring se comporta distinto segun donde este: ' + ESCENARIOS.length
            + ' escenarios cruzando lugar, organizacion, si es cerrado o abierto, y que pasa al salirse.'
    },
    {
        titulo: 'Los recintos',
        texto: RINGS.length + ' recintos y cada uno tiene su FORMA: jaula, cuerdas, tatami, esterilla, takedown y el dohyo. La forma decide el alcance.'
    },
    {
        titulo: 'La isla',
        texto: LUGARES.length + ' lugares y no estan todos abiertos a la vez. Hay que ganar en uno para llegar al siguiente.'
    },
    {
        titulo: 'Guardia',
        texto: 'Con la guardia puesta, arriba es salto y abajo es guardia baja. Y doble toque abajo te tira al suelo.'
    },
    {
        titulo: 'Combinar',
        texto: 'Guardia + golpe es un bloqueo con castigo. Bloquear bien hace que el rival se descuadre y ahi es cuando entra tu jab.'
    },
    {
        titulo: 'Posturas',
        texto: 'Hay ' + ALL_STANCES.length + ' posturas en total, entre las del abanico y las que se piden por comando.'
    }
]);

/**
 * Cada cuanto cambia de tip, en milisegundos.
 *
 * Va aqui y no en la pantalla porque es una REGLA del juego, no un detalle de
 * la pantalla: si se cambiasen cinco a dos, se veria en la pantalla pero la
 * verdad esta en el dato.
 */
export const CADA_TIP = 5000;

/** Cuantos tips hay, y el que toca. */
export function tip(indice) {
    return TIPS[((indice % TIPS.length) + TIPS.length) % TIPS.length];
}
