/**
 * ============================================================================
 * SANPABLERA ENGINE · render/BoneMap.js
 * ----------------------------------------------------------------------------
 * Traduce los nombres de hueso de un MODELO 3D a los nombres del CONTRATO del
 * rig del proyecto (CineConstants.js: PELVIS, CHEST, UPPERARM_L, ...).
 *
 * POR QUE HACE FALTA
 *   El motor no puede depender de los nombres de un archivo: el modelo de hoy
 *   es `torso_joint_3` (Khronos) y el de manana sera `mixamorig:Spine2`. Si el
 *   motor usara nombres literales, cambiar de modelo seria reescribir el juego.
 *   Con este mapa, cambiar de modelo es cambiar una entrada de ALIASES y ya.
 *
 * QUE PONE Y QUE DEJA
 *   BoneMap NO dice que es un humano: solo traduce. Decide que una articulacion
 *   es obligatoria (REQUIRED_BONES) para poder jugar, y lo demas lo deja como
 *   "hueso extra" que se puede animar sin que la cinematica lo entienda.
 *   Un modelo con 60 huesos (dedos, Mixamo) y uno con 19 funcionan igual.
 *
 * ES MODULO PURO
 *   No importa BABYLON ni toca el DOM: se puede testear en Node. El modulo que
 *   si necesita el motor grafico es render/CharacterModel.js.
 * ============================================================================
 */
import { BONES, REQUIRED_BONES, BoneGroup, Side } from '../core/cine/CineConstants.js';

/**
 * Alias por CONVENCION de exportacion, no por modelo.
 *
 * Se listan de mas especifico a menos especifico porque el primero que case
 * gana: asi un `mixamorig:LeftForeArm` no se confunde con un `LeftForeArm`.
 */
export const ALIASES = Object.freeze({
    // --- Khronos / Cesium (el mannequin que hay en assets/) -----------------
    CESIUM: Object.freeze({
        PELVIS: ['torso_joint_1'],
        SPINE: ['torso_joint_2'],
        CHEST: ['torso_joint_3'],
        NECK: ['neck_joint_1'],
        HEAD: ['neck_joint_2'],
        UPPERARM_L: ['arm_joint_L_1'],
        FOREARM_L: ['arm_joint_L_2'],
        HAND_L: ['arm_joint_L_3'],
        UPPERARM_R: ['arm_joint_R_1'],
        FOREARM_R: ['arm_joint_R_2'],
        HAND_R: ['arm_joint_R_3'],
        THIGH_L: ['leg_joint_L_1'],
        SHIN_L: ['leg_joint_L_2'],
        FOOT_L: ['leg_joint_L_3'],
        TOE_L: ['leg_joint_L_5'],
        THIGH_R: ['leg_joint_R_1'],
        SHIN_R: ['leg_joint_R_2'],
        FOOT_R: ['leg_joint_R_3'],
        TOE_R: ['leg_joint_R_5']
    }),

    // --- Mixamo (Xbot, Soldier, cualquier export de Mixamo) ----------------
    MIXAMO: Object.freeze({
        PELVIS: ['Hips'],
        SPINE: ['Spine'],
        CHEST: ['Spine2'],
        NECK: ['Neck'],
        HEAD: ['Head', 'HeadTop_End'],
        CLAV_L: ['LeftShoulder'],
        UPPERARM_L: ['LeftArm'],
        FOREARM_L: ['LeftForeArm'],
        HAND_L: ['LeftHand'],
        CLAV_R: ['RightShoulder'],
        UPPERARM_R: ['RightArm'],
        FOREARM_R: ['RightForeArm'],
        HAND_R: ['RightHand'],
        THIGH_L: ['LeftUpLeg'],
        SHIN_L: ['LeftLeg'],
        FOOT_L: ['LeftFoot'],
        TOE_L: ['LeftToeBase'],
        THIGH_R: ['RightUpLeg'],
        SHIN_R: ['RightLeg'],
        FOOT_R: ['RightFoot'],
        TOE_R: ['RightToeBase']
    }),

    // --- Mixamo con prefijo (Xbot.glb los lleva todos: mixamorig:Hips) ------
    MIXAMO_PREFIXED: Object.freeze({
        PELVIS: ['mixamorig:Hips'],
        SPINE: ['mixamorig:Spine'],
        CHEST: ['mixamorig:Spine2'],
        NECK: ['mixamorig:Neck'],
        HEAD: ['mixamorig:Head'],
        CLAV_L: ['mixamorig:LeftShoulder'],
        UPPERARM_L: ['mixamorig:LeftArm'],
        FOREARM_L: ['mixamorig:LeftForeArm'],
        HAND_L: ['mixamorig:LeftHand'],
        CLAV_R: ['mixamorig:RightShoulder'],
        UPPERARM_R: ['mixamorig:RightArm'],
        FOREARM_R: ['mixamorig:RightForeArm'],
        HAND_R: ['mixamorig:RightHand'],
        THIGH_L: ['mixamorig:LeftUpLeg'],
        SHIN_L: ['mixamorig:LeftLeg'],
        FOOT_L: ['mixamorig:LeftFoot'],
        TOE_L: ['mixamorig:LeftToeBase'],
        THIGH_R: ['mixamorig:RightUpLeg'],
        SHIN_R: ['mixamorig:RightLeg'],
        FOOT_R: ['mixamorig:RightFoot'],
        TOE_R: ['mixamorig:RightToeBase']
    }),

    // --- Convenciones genericas (Kenney, Quaternius, Ready Player Me, ...) --
    GENERIC: Object.freeze({
        PELVIS: ['Hips', 'hips', 'root', 'pelvis', 'Hip', 'Bip01_Pelvis'],
        SPINE: ['Spine', 'spine', 'Bip01_Spine'],
        CHEST: ['Chest', 'chest', 'Spine1', 'Spine2', 'upper_chest', 'Bip01_Spine1', 'Bip01_Spine2'],
        NECK: ['Neck', 'neck', 'Bip01_Neck'],
        HEAD: ['Head', 'head', 'Bip01_Head'],
        CLAV_L: ['LeftShoulder', 'left_shoulder', 'shoulder.L', 'clavicle_l', 'Bip01_Clavicle_L'],
        UPPERARM_L: ['LeftArm', 'left_arm', 'upperarm_l', 'arm.L', 'lUpperArm', 'Bip01_UpperArm_L'],
        FOREARM_L: ['LeftForeArm', 'left_forearm', 'LowerArm.L', 'lowerarm_l', 'lForearm', 'Bip01_LowerArm_L'],
        HAND_L: ['LeftHand', 'left_hand', 'hand.L', 'hand_l', 'lHand', 'Bip01_Hand_L'],
        CLAV_R: ['RightShoulder', 'right_shoulder', 'shoulder.R', 'clavicle_r', 'Bip01_Clavicle_R'],
        UPPERARM_R: ['RightArm', 'right_arm', 'upperarm_r', 'arm.R', 'rUpperArm', 'Bip01_UpperArm_R'],
        FOREARM_R: ['RightForeArm', 'right_forearm', 'LowerArm.R', 'lowerarm_r', 'rForearm', 'Bip01_LowerArm_R'],
        HAND_R: ['RightHand', 'right_hand', 'hand.R', 'hand_r', 'rHand', 'Bip01_Hand_R'],
        THIGH_L: ['LeftUpLeg', 'left_up_leg', 'LeftLeg', 'thigh_l', 'leg.L', 'lThigh', 'Bip01_Thigh_L'],
        SHIN_L: ['LeftLeg', 'left_leg', 'LeftLowerLeg', 'shin_l', 'calf.L', 'lShin', 'Bip01_Calf_L'],
        FOOT_L: ['LeftFoot', 'left_foot', 'foot.L', 'foot_l', 'lFoot', 'Bip01_Foot_L'],
        TOE_L: ['LeftToeBase', 'left_toe_base', 'LeftToe', 'ball.L', 'lToe', 'Bip01_Toe_L'],
        THIGH_R: ['RightUpLeg', 'right_up_leg', 'RightLeg', 'thigh_r', 'leg.R', 'rThigh', 'Bip01_Thigh_R'],
        SHIN_R: ['RightLeg', 'right_leg', 'RightLowerLeg', 'shin_r', 'calf.R', 'rShin', 'Bip01_Calf_R'],
        FOOT_R: ['RightFoot', 'right_foot', 'foot.R', 'foot_r', 'rFoot', 'Bip01_Foot_R'],
        TOE_R: ['RightToeBase', 'right_toe_base', 'RightToe', 'ball.R', 'rToe', 'Bip01_Toe_R']
    })
});

/**
 * Normaliza un nombre de hueso para comparar: quita espacios, pasa a minusculas
 * y quita los separadores. Asi "mixamorig:Left ForeArm" y "left_forearm" son el
 * mismo hueso a efectos de esta tabla.
 */
export function normalizeBoneName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[\s\-.:_]+/g, '');
}

/**
 * Construye el indice bones -> nombre real del modelo.
 *
 * @param {string[]} modelBones nombres de hueso tal cual vienen en el archivo
 * @param {object[]} [tables] tablas de alias a usar, en orden de prioridad
 * @returns {object} indice
 */
export function buildBoneMap(modelBones, tables) {
    const present = new Map();
    for (const raw of modelBones) present.set(normalizeBoneName(raw), raw);

    const ordered = tables || [ALIASES.CESIUM, ALIASES.MIXAMO_PREFIXED, ALIASES.MIXAMO, ALIASES.GENERIC];
    const map = Object.create(null);
    const missing = [];
    const duplicates = [];

    for (const bone of BONES) {
        let hit = null;
        for (const table of ordered) {
            const candidates = table[bone.name];
            if (!candidates) continue;
            for (const c of candidates) {
                const key = normalizeBoneName(c);
                if (present.has(key)) { hit = present.get(key); break; }
            }
            if (hit) break;
        }
        if (hit) map[bone.name] = hit;
        else missing.push(bone.name);
    }

    // Un nombre real no puede mapear a dos huesos del contrato: si pasa, el
    // modelo tiene una articulacion fusionada y hay que decidir a mano. Se
    // avisa en vez de elegir en silencio, porque elegir mal aqui produce un
    // personaje que se dobla por la mitad sin ningun error en consola.
    const used = new Map();
    for (const bone of BONES) {
        const real = map[bone.name];
        if (!real) continue;
        if (used.has(real)) duplicates.push({ bone: bone.name, real, other: used.get(real) });
        else used.set(real, bone.name);
    }

    return {
        map,
        missing,
        duplicates,
        /** ¿El modelo cumple el minimo para jugar? */
        playable() {
            return this.missing.every((b) => !REQUIRED_BONES.includes(b)) && this.duplicates.length === 0;
        },
        /** Solo los huesos del contrato que el modelo tiene de verdad. */
        resolved() {
            const out = {};
            for (const [k, v] of Object.entries(this.map)) out[k] = v;
            return out;
        },
        /** Los huesos del modelo que NADIE reclama (dedos, dedos del pie...). */
        extras(modelBones) {
            const claimed = new Set(Object.values(this.map));
            return modelBones.filter((b) => !claimed.has(b));
        }
    };
}

/** El nombre real de un hueso del contrato, o null. */
export function resolveBone(index, contractName) {
    return index && index.map[contractName] ? index.map[contractName] : null;
}

/**
 * Separa el "nucleo" del nombre de su lado.
 *
 * POR QUE
 *   El lado va en dos sitios distintos segun quien exporto el modelo:
 *   `LeftForeArm` (Mixamo) lo pone delante y `FOREARM_L` (el contrato) lo pone
 *   detras. Sin quitarlo, comparar los dos textos jamas encuentra nada y este
 *   helper fallaria justo con el nombre mas habitual de la industria.
 *
 *   'leftforearm' -> { core: 'forearm', side: 'L' }
 *   'forearml'    -> { core: 'forearm', side: 'L' }
 *   'pelvis'      -> { core: 'pelvis', side: 'NONE' }
 *
 * @returns {{core: string, side: string}}
 */
export function splitSide(normalizedName) {
    if (!normalizedName) return { core: '', side: Side.NONE };
    // Palabras completas primero: 'leftforearm' acaba en 'm', asi que si se
    // mirase el final primero no se detectaria el lado.
    if (normalizedName.startsWith('left') && normalizedName.length > 4) {
        return { core: normalizedName.slice(4), side: Side.L };
    }
    if (normalizedName.startsWith('right') && normalizedName.length > 5) {
        return { core: normalizedName.slice(5), side: Side.R };
    }
    if (normalizedName.endsWith('l')) return { core: normalizedName.slice(0, -1), side: Side.L };
    if (normalizedName.endsWith('r')) return { core: normalizedName.slice(0, -1), side: Side.R };
    // Prefijo de una sola letra: 'lfoot' -> 'foot' por la izquierda.
    const pre = normalizedName.match(/^([lr])(.+)$/);
    if (pre && pre[2].length > 1) return { core: pre[2], side: pre[1] === 'l' ? Side.L : Side.R };
    return { core: normalizedName, side: Side.NONE };
}

/**
 * Devuelve el hueso del contrato que se parece mas a un nombre real, o null.
 *
 * Sirve para depurar: "mi animacion mueve Spine2, que hueso del contrato es?".
 * Compara el NUCLEO del nombre y luego el lado, asi que reconoce las dos
 * convenciones (LeftForeArm y FOREARM_L) a la vez. No lanza nunca.
 */
export function closestContractBone(modelBoneName) {
    const target = splitSide(normalizeBoneName(modelBoneName));
    if (!target.core) return null;
    let best = null;
    let bestLen = -1;
    for (const bone of BONES) {
        const key = splitSide(normalizeBoneName(bone.name));
        if (key.core === target.core && (target.side === Side.NONE || target.side === key.side)) {
            // Coincidencia exacta del nucleo: no hay nada mejor.
            return bone;
        }
        const compatible = target.side === Side.NONE || target.side === key.side;
        if (!compatible) continue;
        if (!key.core || !target.core.includes(key.core) && !key.core.includes(target.core)) continue;
        const len = Math.min(key.core.length, target.core.length);
        if (len > bestLen) { bestLen = len; best = bone; }
    }
    return best;
}

/** Nombres de grupo y lateral de un hueso del contrato (para las mascaras). */
export function boneMeta(contractName) {
    const bone = BONES.find((b) => b.name === contractName);
    if (!bone) return null;
    return {
        group: bone.group || BoneGroup.SPINE,
        side: bone.side || Side.NONE,
        length: bone.length,
        parent: bone.parent,
        offset: bone.offset,
        contact: !!bone.contact
    };
}
