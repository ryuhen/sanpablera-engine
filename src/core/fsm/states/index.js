/**
 * ============================================================================
 * SANPABLERA ENGINE · FSM · states/index.js
 * ----------------------------------------------------------------------------
 * Punto unico de registro del catalogo base.
 *
 * Quien importa ESTE archivo (StateMachine, Transitions, los tests) tiene
 * garantiza que los estados base estan registrados. Los estados propios de cada
 * personaje NO se registran aqui: viven en CharacterStates.js y se cargan por
 * luchador con createProfile(), para que un peleador pueda redefinir un estado
 * compartido (por ejemplo ATAQUE_ESPECIAL) sin tocar el catalogo comun.
 *
 * El orden no es estetico: los golpes primero porque su entrada valida los
 * ataques que los demas estados referencian.
 * ============================================================================
 */
import SPF from '../Constants.js';
import { registerStates, validateCatalog } from '../StateCatalog.js';

import groundStates from './GroundStates.js';
import airStates from './AirStates.js';
import impactStates from './ImpactStates.js';
import attackStates from './AttackStates.js';
import grappleStates from './GrappleStates.js';

/** Catalogo base del juego, ya registrado en el registry. */
export const BASE_STATES = registerStates([
    ...attackStates,
    ...groundStates,
    ...airStates,
    ...impactStates,
    ...grappleStates
]);

/**
 * Resumen legible del catalogo: cuantos estados hay, cuantos grupos, si el
 * enum esta cubierto. Lo usa el HUD de depuracion y los tests.
 */
export function catalogReport() {
    const byPhase = {};
    const byTag = {};
    for (const s of BASE_STATES) {
        byPhase[s.phase] = (byPhase[s.phase] || 0) + 1;
        byTag[s.tag] = (byTag[s.tag] || 0) + 1;
    }
    return { total: BASE_STATES.length, byPhase, byTag, validation: validateCatalog() };
}

export default BASE_STATES;