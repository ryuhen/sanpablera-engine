/**
 * ============================================================================
 * SANPABLERA ENGINE · core/bodyTypes.js
 * ----------------------------------------------------------------------------
 * TIPOLOGIAS DE CUERPO (somatotipos) + GENERO para personajes.
 *
 * OBJETIVO
 *   Dar variedad visual y de identidad a los personajes sin romper el moveset.
 *   Las diferencias de tamaño son MINIMAS: el mismo set de animaciones/golpes
 *   debe seguir leyendo bien en todos los cuerpos.
 *
 * SOMATOTIPOS
 *   ECTOMORFO  - complexión ligera, extremidades largas, poca masa.
 *   MESOMORFO  - complexión atlética equilibrada, referencia base.
 *   ENDOMORFO  - complexión robusta, más masa y volumen, centro bajo.
 *
 * GENERO
 *   Se modela como atributo del personaje (`gender`: 'M' | 'F'), no como
 *   somatotipo. El somatotipo define proporciones de cuerpo; el genero define
 *   identidad de personaje y puede usarse para voz, vestuario o variantes
 *   cosmeticas sin cambiar la logica de combate.
 *
 * NOTA DE DISEÑO
 *   Alturas en rango estrecho (1.72-1.82) y masa/reach con variacion pequena
 *   para que el moveset compartido siga adaptandose sin retargeting agresivo.
 * ============================================================================
 */

export const SOMATOTYPES = Object.freeze({
    ECTOMORFO: Object.freeze({
        id: 'ECTOMORFO',
        name: 'Ectomorfo',
        height: 1.78,
        mass: 0.94,
        reach: 1.03,
        description: 'Complexión ligera, hombros estrechos y extremidades largas. Silueta agil y alcance ligeramente mayor.',
        proportions: Object.freeze({
            torso: 0.94, pelvis: 0.93, head: 0.98,
            shoulder: 0.92, upperArm: 0.93, foreArm: 0.93, hand: 0.96,
            thigh: 0.95, shin: 0.95, foot: 0.97
        })
    }),
    MESOMORFO: Object.freeze({
        id: 'MESOMORFO',
        name: 'Mesomorfo',
        height: 1.76,
        mass: 1.00,
        reach: 1.00,
        description: 'Complexión atlética y equilibrada. Referencia base para que el moveset se lea neutro.',
        proportions: Object.freeze({
            torso: 1.00, pelvis: 1.00, head: 1.00,
            shoulder: 1.00, upperArm: 1.00, foreArm: 1.00, hand: 1.00,
            thigh: 1.00, shin: 1.00, foot: 1.00
        })
    }),
    ENDOMORFO: Object.freeze({
        id: 'ENDOMORFO',
        name: 'Endomorfo',
        height: 1.74,
        mass: 1.08,
        reach: 0.98,
        description: 'Complexión robusta, tronco más ancho y centro de gravedad bajo. Silueta sólida con alcance levemente menor.',
        proportions: Object.freeze({
            torso: 1.07, pelvis: 1.07, head: 1.01,
            shoulder: 1.05, upperArm: 1.05, foreArm: 1.03, hand: 1.03,
            thigh: 1.05, shin: 1.02, foot: 1.02
        })
    })
});

/** Alias de compatibilidad con la primera iteracion del modulo. */
export const BODY_TYPES = SOMATOTYPES;

export const SOMATOTYPE_LIST = Object.freeze([
    SOMATOTYPES.ECTOMORFO,
    SOMATOTYPES.MESOMORFO,
    SOMATOTYPES.ENDOMORFO
]);

export const BODY_TYPE_LIST = SOMATOTYPE_LIST;

export const GENDERS = Object.freeze({
    M: Object.freeze({ id: 'M', name: 'Masculino', short: 'M' }),
    F: Object.freeze({ id: 'F', name: 'Femenino', short: 'F' })
});

export function somatotypeOf(id) {
    return SOMATOTYPES[id] || SOMATOTYPES.MESOMORFO;
}

export function bodyTypeOf(id) {
    return somatotypeOf(id);
}

export function genderOf(id) {
    return GENDERS[id] || GENDERS.M;
}

/**
 * Escala una tabla de medidas de PartMannequin segun somatotipo.
 * Devuelve tabla nueva; no muta la original.
 */
export function scalePartTable(partTable, type) {
    const t = typeof type === 'string' ? somatotypeOf(type) : (type || SOMATOTYPES.MESOMORFO);
    const p = t.proportions || SOMATOTYPES.MESOMORFO.proportions;
    return partTable.map((part) => {
        const key = proportionKey(part.contract);
        const f = p[key] == null ? 1 : p[key];
        if (f === 1) return part;
        const size = scaleSize(part.size, f);
        const at = part.at ? scaleAt(part.at, part.contract, f) : part.at;
        return Object.assign({}, part, { size, at });
    });
}

function proportionKey(contract) {
    if (contract === 'PELVIS') return 'pelvis';
    if (contract === 'SPINE' || contract === 'CHEST') return 'torso';
    if (contract === 'HEAD' || contract === 'NECK') return 'head';
    if (contract === 'CLAV_L' || contract === 'CLAV_R') return 'shoulder';
    if (contract === 'UPPERARM_L' || contract === 'UPPERARM_R') return 'upperArm';
    if (contract === 'FOREARM_L' || contract === 'FOREARM_R') return 'foreArm';
    if (contract === 'HAND_L' || contract === 'HAND_R') return 'hand';
    if (contract === 'THIGH_L' || contract === 'THIGH_R') return 'thigh';
    if (contract === 'SHIN_L' || contract === 'SHIN_R') return 'shin';
    if (contract === 'FOOT_L' || contract === 'FOOT_R' || contract === 'TOE_L' || contract === 'TOE_R') return 'foot';
    return 'torso';
}

function scaleSize(size, f) {
    if (!size) return size;
    const out = {};
    for (const k of Object.keys(size)) {
        out[k] = typeof size[k] === 'number' ? size[k] * f : size[k];
    }
    return Object.freeze(out);
}

function scaleAt(at, contract, f) {
    if (!Array.isArray(at)) return at;
    const out = at.slice();
    if (/^(UPPERARM_|FOREARM_|HAND_)/.test(contract)) out[0] = out[0] * f;
    else if (/^(THIGH_|SHIN_|FOOT_|TOE_)/.test(contract)) out[1] = out[1] * f;
    return Object.freeze(out);
}

/**
 * Crea una ficha de personaje compatible con el roster.
 */
export function createCharacter(spec) {
    const bodyType = typeof spec.bodyType === 'string' ? somatotypeOf(spec.bodyType) : (spec.bodyType || SOMATOTYPES.MESOMORFO);
    const gender = typeof spec.gender === 'string' ? genderOf(spec.gender) : (spec.gender || GENDERS.M);
    return {
        id: spec.id,
        name: spec.name,
        tag: spec.tag || '',
        characterId: spec.characterId === undefined ? null : spec.characterId,
        archetype: spec.archetype || null,
        rgb: spec.rgb || [0.7, 0.7, 0.7],
        hex: spec.hex || '#b3b3b3',
        story: spec.story || '',
        style: spec.style || '',
        gender: gender.id,
        bodyType: bodyType.id,
        height: bodyType.height,
        mass: bodyType.mass,
        reach: bodyType.reach
    };
}

/**
 * Personajes generados con cobertura de las 6 combinaciones pedidas:
 * ectomorfo/mesomorfo/endomorfo x masculino/femenino.
 * Las diferencias de tamaño son minimas para preservar compatibilidad de moveset.
 */
export const GENERATED_CHARACTERS = Object.freeze([
    createCharacter({
        id: 'E_M', name: 'Leo Varga', tag: 'El hilo rapido',
        characterId: null, archetype: 'YUGO',
        rgb: [0.34, 0.74, 0.92], hex: '#57bdeb',
        gender: 'M', bodyType: 'ECTOMORFO',
        story: 'Mensajero y boxeador de callejon. Brazos largos, poco peso, mucha entrada y salida.',
        style: 'Boxeo agil · jab largo · contraataque'
    }),
    createCharacter({
        id: 'E_F', name: 'Nia Sol', tag: 'La aguja',
        characterId: null, archetype: 'MONTE',
        rgb: [0.92, 0.52, 0.76], hex: '#eb85c2',
        gender: 'F', bodyType: 'ECTOMORFO',
        story: 'Bailarina urbana. Usa la distancia y el ritmo para castigar antes de que la alcancen.',
        style: 'Movilidad · patadas largas · evasion'
    }),
    createCharacter({
        id: 'M_M', name: 'Bruno Cruz', tag: 'El pulso parejo',
        characterId: null, archetype: 'YUGO',
        rgb: [0.48, 0.68, 0.36], hex: '#7aad5c',
        gender: 'M', bodyType: 'MESOMORFO',
        story: 'Mecanico del puerto. Ni el mas grande ni el mas rapido: el que aguanta y responde limpio.',
        style: 'Boxeo equilibrado · combo medio · presion'
    }),
    createCharacter({
        id: 'M_F', name: 'Vera Rios', tag: 'La medida justa',
        characterId: null, archetype: 'MUSASHI',
        rgb: [0.86, 0.72, 0.36], hex: '#dbb85c',
        gender: 'F', bodyType: 'MESOMORFO',
        story: 'Ex instructora de defensa personal. Lee el ritmo del rival y lo rompe con tecnica limpia.',
        style: 'Tecnica mixta · control · respuesta'
    }),
    createCharacter({
        id: 'EN_M', name: 'Tito Grava', tag: 'El peso quieto',
        characterId: null, archetype: 'MUSASHI',
        rgb: [0.78, 0.44, 0.30], hex: '#c7704d',
        gender: 'M', bodyType: 'ENDOMORFO',
        story: 'Cargador de mercado. No necesita perseguirte: cuando te agarra o te alcanza, la pelea cambia.',
        style: 'Agarre · golpes cortos · clinch'
    }),
    createCharacter({
        id: 'EN_F', name: 'Mara Brasa', tag: 'La muralla',
        characterId: null, archetype: 'YUGO',
        rgb: [0.62, 0.46, 0.84], hex: '#9e75d6',
        gender: 'F', bodyType: 'ENDOMORFO',
        story: 'Guardia de feria. Avanza poco, aguanta mucho, y cada golpe corto sale con peso real.',
        style: 'Presion corta · guardia fuerte · castigo'
    })
]);

export default SOMATOTYPES;
