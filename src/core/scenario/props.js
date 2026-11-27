/**
 * ============================================================================
 * SANPABLERA ENGINE · core/scenario/props.js
 * ----------------------------------------------------------------------------
 * Nomenclatura y datos de objetos de escenario (cobertura, obstáculos, props).
 *
 * OBJETIVO
 *   - Dar a cada objeto una etiqueta clara para gameplay, cámara y debug.
 *   - Permitir que la cámara haga transparentes los objetos que ocluyen la acción,
 *     dejando un marcador de sombra en el suelo con el código del objeto.
 *   - Definir qué acciones admite cada objeto en combate/navegación.
 *
 * NOMENCLATURA (código corto)
 *   Formato: <FORMA><PERFIL><ACCION><DESPLAZAMIENTO><RESISTENCIA>
 *   Ejemplo: C1E-F4 = Columna, alta/solida, Escalable, Fija, resistencia 4.
 *
 *   1) FORMA (geometría/silueta)
 *      P = Plano/Pared      (cara plana, bloquea visión en plano)
 *      C = Columna/Cilindro (redondeado)
 *      A = Árbol/Irregular  (silueta orgánica)
 *      V = Valla/Baranda    (delgada, parcialmente permeable visualmente)
 *      M = Mueble/Caja      (volumen sólido)
 *      R = Rampa/Escalón
 *
 *   2) PERFIL/ALTURA
 *      1 = Alto completo (bloquea visión/cuerpo, tipo pared)
 *      2 = Media altura (se puede saltar/empujar por encima según acción)
 *      3 = Bajo (obstáculo menor, tropiezo/cobertura baja)
 *      0 = Marca de suelo (sin oclusión vertical)
 *
 *   3) ACCION DE COMBATE / INTERACCION
 *      E = Escalar
 *      S = Saltar/vault
 *      P = Empujar/desplazar
 *      R = Romper
 *      G = Agarrarse/cover
 *      B = Rebotar/wall-jump
 *      T = Atravesar (frágil/scripted)
 *      N = Ninguna especial
 *
 *   4) DESPLAZAMIENTO / COMPORTAMIENTO FISICO
 *      F = Fijo
 *      D = Desplazable
 *      B = Rebotable/elástico
 *      C = Colapsa al romperse
 *      K = Cinemático/scripted
 *
 *   5) RESISTENCIA
 *      1 = Frágil (se rompe fácil)
 *      2 = Media
 *      3 = Robusta
 *      4 = Indestructible
 *
 * El marcador de suelo debe mostrar el código y, opcionalmente, un texto corto:
 *   "C1E-F4  Columna escalable"
 * ============================================================================
 */

export const PROP_SHAPE = Object.freeze({
    PLANO: 'P',
    COLUMNA: 'C',
    ARBOL: 'A',
    VALLA: 'V',
    MUEBLE: 'M',
    RAMPA: 'R'
});

export const PROP_PROFILE = Object.freeze({
    ALTO: '1',
    MEDIO: '2',
    BAJO: '3',
    SUELO: '0'
});

export const PROP_ACTION = Object.freeze({
    ESCALAR: 'E',
    SALTAR: 'S',
    EMPUJAR: 'P',
    ROMPER: 'R',
    AGARRAR: 'G',
    REBOTAR: 'B',
    ATRAVESAR: 'T',
    NINGUNA: 'N'
});

export const PROP_MOBILITY = Object.freeze({
    FIJO: 'F',
    DESPLAZABLE: 'D',
    REBOTABLE: 'B',
    COLAPSA: 'C',
    CINEMATICO: 'K'
});

export const PROP_RESISTANCE = Object.freeze({
    FRAGIL: '1',
    MEDIA: '2',
    ROBUSTA: '3',
    INDESTRUCTIBLE: '4'
});

const SHAPE_LABEL = Object.freeze({
    P: 'Pared/plano', C: 'Columna', A: 'Árbol', V: 'Valla', M: 'Mueble', R: 'Rampa'
});
const PROFILE_LABEL = Object.freeze({
    '1': 'alto', '2': 'media altura', '3': 'bajo', '0': 'suelo'
});
const ACTION_LABEL = Object.freeze({
    E: 'escalable', S: 'saltable', P: 'empujable', R: 'rompible',
    G: 'cover', B: 'rebotable', T: 'atravesable', N: 'sin acción'
});
const MOBILITY_LABEL = Object.freeze({
    F: 'fijo', D: 'desplazable', B: 'rebotable', C: 'colapsa', K: 'cinemático'
});
const RESISTANCE_LABEL = Object.freeze({
    '1': 'frágil', '2': 'media', '3': 'robusta', '4': 'indestructible'
});

export function makePropCode(spec = {}) {
    const shape = spec.shape || PROP_SHAPE.MUEBLE;
    const profile = spec.profile || PROP_PROFILE.ALTO;
    const action = spec.action || PROP_ACTION.NINGUNA;
    const mobility = spec.mobility || PROP_MOBILITY.FIJO;
    const resistance = spec.resistance || PROP_RESISTANCE.MEDIA;
    return `${shape}${profile}${action}-${mobility}${resistance}`;
}

export function parsePropCode(code = '') {
    const m = String(code).trim().toUpperCase().match(/^([PCAVMR])([0123])([ESPRGBTN])-([FDBCK])([1234])$/);
    if (!m) return null;
    return { shape: m[1], profile: m[2], action: m[3], mobility: m[4], resistance: m[5], code: m[0] };
}

export function describePropCode(code = '') {
    const p = typeof code === 'string' ? parsePropCode(code) : code;
    if (!p) return 'Objeto desconocido';
    return [
        SHAPE_LABEL[p.shape] || p.shape,
        PROFILE_LABEL[p.profile] || p.profile,
        ACTION_LABEL[p.action] || p.action,
        MOBILITY_LABEL[p.mobility] || p.mobility,
        RESISTANCE_LABEL[p.resistance] || p.resistance
    ].join(', ');
}

export function makeScenarioProp(spec = {}) {
    const code = spec.code || makePropCode(spec);
    const parsed = parsePropCode(code);
    return Object.freeze({
        id: spec.id || `prop_${Math.random().toString(36).slice(2, 8)}`,
        name: spec.name || 'Objeto',
        code,
        ...parsed,
        // Transform en espacio de escenario (metros, Y-up)
        position: Object.freeze({
            x: Number(spec.x ?? spec.position?.x ?? 0),
            y: Number(spec.y ?? spec.position?.y ?? 0),
            z: Number(spec.z ?? spec.position?.z ?? 0)
        }),
        size: Object.freeze({
            w: Number(spec.w ?? spec.size?.w ?? 1),
            h: Number(spec.h ?? spec.size?.h ?? 1),
            d: Number(spec.d ?? spec.size?.d ?? 1)
        }),
        rotationY: Number(spec.rotationY ?? 0),
        // Comportamiento de render/cámara
        occludes: spec.occludes ?? (parsed ? parsed.profile !== '0' : true),
        transparentWhenOccluding: spec.transparentWhenOccluding ?? true,
        shadowMarker: spec.shadowMarker ?? true,
        tags: Object.freeze(spec.tags || [])
    });
}

/** Catálogo base para escenarios de Sanpablera. */
export const PROP_CATALOG = Object.freeze({
    PARED_ALTA_ESCALABLE: makeScenarioProp({
        id: 'PARED_ALTA_ESCALABLE', name: 'Pared alta escalable',
        shape: PROP_SHAPE.PLANO, profile: PROP_PROFILE.ALTO, action: PROP_ACTION.ESCALAR,
        mobility: PROP_MOBILITY.FIJO, resistance: PROP_RESISTANCE.INDESTRUCTIBLE
    }),
    PARED_MEDIA_SALTABLE: makeScenarioProp({
        id: 'PARED_MEDIA_SALTABLE', name: 'Pared media saltable',
        shape: PROP_SHAPE.PLANO, profile: PROP_PROFILE.MEDIO, action: PROP_ACTION.SALTAR,
        mobility: PROP_MOBILITY.FIJO, resistance: PROP_RESISTANCE.ROBUSTA
    }),
    COLUMNA_ESCALABLE: makeScenarioProp({
        id: 'COLUMNA_ESCALABLE', name: 'Columna escalable',
        shape: PROP_SHAPE.COLUMNA, profile: PROP_PROFILE.ALTO, action: PROP_ACTION.ESCALAR,
        mobility: PROP_MOBILITY.FIJO, resistance: PROP_RESISTANCE.INDESTRUCTIBLE
    }),
    ARBOL_REBOTABLE: makeScenarioProp({
        id: 'ARBOL_REBOTABLE', name: 'Árbol rebotable',
        shape: PROP_SHAPE.ARBOL, profile: PROP_PROFILE.ALTO, action: PROP_ACTION.REBOTAR,
        mobility: PROP_MOBILITY.FIJO, resistance: PROP_RESISTANCE.ROBUSTA
    }),
    CAJA_EMPUJABLE: makeScenarioProp({
        id: 'CAJA_EMPUJABLE', name: 'Caja empujable',
        shape: PROP_SHAPE.MUEBLE, profile: PROP_PROFILE.MEDIO, action: PROP_ACTION.EMPUJAR,
        mobility: PROP_MOBILITY.DESPLAZABLE, resistance: PROP_RESISTANCE.MEDIA
    }),
    VALLA_ROMPIBLE: makeScenarioProp({
        id: 'VALLA_ROMPIBLE', name: 'Valla rompible',
        shape: PROP_SHAPE.VALLA, profile: PROP_PROFILE.MEDIO, action: PROP_ACTION.ROMPER,
        mobility: PROP_MOBILITY.COLAPSA, resistance: PROP_RESISTANCE.FRAGIL
    })
});

export function propMarkerLabel(prop) {
    const p = prop && prop.code ? prop : makeScenarioProp(prop || {});
    return `${p.code} ${p.name}`;
}

export default PROP_CATALOG;