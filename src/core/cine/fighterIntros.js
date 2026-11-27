/**
 * ============================================================================
 * SANPABLERA ENGINE · core/cine/fighterIntros.js
 * ----------------------------------------------------------------------------
 * INTROS DE PELEADORES (momentos guionizados) usando el motor de animacion.
 *
 * OBJETIVO
 *   Definir la entrada de cada personaje antes del round: camara, ritmo,
 *   clip/pose y tono narrativo. Sirve como:
 *   1. Guion reproducible por un director de intros.
 *   2. Lista de tomas para grabar/ajustar clips en el editor de animacion.
 *
 * COMO GRABAR CON EL MOTOR DE ANIMACION
 *   - Abrir el editor (F3 / AnimEditor) y seleccionar el personaje.
 *   - Para cada beat con `clip`, reproducir el clip base y ajustar pose/timing.
 *   - Para beats con `record: true`, capturar una variante y guardarla como clip
 *     con el nombre sugerido en `recordAs` (ej: intro_pedro_01).
 *   - Mantener diferencias de tamaño minimas entre somatotipos: no cambiar
 *     alcance real del moveset, solo silueta/actitud.
 *
 * FORMATO
 *   intro = { id, fighterId, duration, camera, beats[] }
 *   beat  = { t, dur, clip, cam, action, text?, record?, recordAs? }
 *
 * `clip` usa nombres compatibles con ClipLibrary/ClipMap (o aliases conocidos).
 * Cuando se necesite un clip nuevo, se marca `record: true`.
 * ============================================================================
 */

import { ROSTER } from '../roster.js';
import { clipEfectivo } from '../anim/ClipMap.js';

function beat(t, dur, clip, cam, action, extra = {}) {
    return Object.freeze({
        t, dur, clip, cam, action,
        text: extra.text || null,
        record: !!extra.record,
        recordAs: extra.recordAs || null,
        focus: extra.focus || 'fighter'
    });
}

const CAM = Object.freeze({
    WIDE: 'WIDE',
    MEDIUM: 'MEDIUM',
    CLOSE: 'CLOSE',
    PUSH_IN: 'PUSH_IN',
    LOW: 'LOW',
    ORBIT: 'ORBIT'
});

export const FIGHTER_INTROS = Object.freeze({
    PEDRO: Object.freeze({
        id: 'INTRO_PEDRO',
        fighterId: 'PEDRO',
        duration: 4.8,
        camera: 'cinematic',
        theme: 'vecindario / boxeo',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Respira en guardia, mira al rival.', { text: 'Pedro Pérez' }),
            beat(1.2, 1.2, 'walk', CAM.MEDIUM, 'Da un paso corto al frente, marca distancia.', { record: true, recordAs: 'intro_pedro_walkin' }),
            beat(2.4, 1.2, 'st_recto', CAM.PUSH_IN, 'Suelta un jab al aire, seco y controlado.'),
            beat(3.6, 1.2, 'idle', CAM.CLOSE, 'Vuelve a guardia; sonrisa de esquina.', { text: 'El vecino invicto' })
        ])
    }),

    JUAN: Object.freeze({
        id: 'INTRO_JUAN',
        fighterId: 'JUAN',
        duration: 5.0,
        camera: 'cinematic',
        theme: 'mercado / agarre',
        beats: Object.freeze([
            beat(0.0, 1.4, 'idle', CAM.WIDE, 'Postura pesada, hombros bajos.', { text: 'Juan García' }),
            beat(1.4, 1.2, 'rv_clinch', CAM.MEDIUM, 'Abre brazos como buscando el clinch.'),
            beat(2.6, 1.2, 'rv_agarre_gancho', CAM.LOW, 'Marca un agarre imaginario, manos fuertes.'),
            beat(3.8, 1.2, 'idle', CAM.CLOSE, 'Asiente lento; no retrocede.', { text: 'El que no se raja' })
        ])
    }),

    JOSE: Object.freeze({
        id: 'INTRO_JOSE',
        fighterId: 'JOSE',
        duration: 5.2,
        camera: 'cinematic',
        theme: 'calle / capoeira',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Quieto, peso en una pierna.', { text: 'José López' }),
            beat(1.2, 1.6, 'quad', CAM.ORBIT, 'Baja a cuadrupedia y gira alrededor de su eje.', { record: true, recordAs: 'intro_jose_ginga' }),
            beat(2.8, 1.2, 'sp_patada_giro', CAM.MEDIUM, 'Marca patada de giro sin extender completo.'),
            beat(4.0, 1.2, 'idle', CAM.CLOSE, 'Vuelve de pie, relajado.', { text: 'El de la esquina' })
        ])
    }),

    MARIA: Object.freeze({
        id: 'INTRO_MARIA',
        fighterId: 'MARIA',
        duration: 4.8,
        camera: 'cinematic',
        theme: 'muay thai / disciplina',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Guardia alta, codos cerrados.', { text: 'María González' }),
            beat(1.2, 1.2, 'st_patada_baja', CAM.MEDIUM, 'Marca low kick corto de calentamiento.'),
            beat(2.4, 1.2, 'st_gancho', CAM.PUSH_IN, 'Gira cadera con gancho al aire.'),
            beat(3.6, 1.2, 'idle', CAM.CLOSE, 'Respira, mirada fija.', { text: 'La que siempre llega' })
        ])
    }),

    JOHN: Object.freeze({
        id: 'INTRO_JOHN',
        fighterId: 'JOHN',
        duration: 5.0,
        camera: 'cinematic',
        theme: 'callejon / arma improvisada',
        beats: Object.freeze([
            beat(0.0, 1.3, 'idle', CAM.WIDE, 'Entra caminando lento, manos bajas.', { text: 'John Doe' }),
            beat(1.3, 1.2, 'walk', CAM.MEDIUM, 'Se acerca midiendo distancia.'),
            beat(2.5, 1.3, 'sp_botellazo', CAM.LOW, 'Levanta la mano como si sacara algo del suelo.', { record: true, recordAs: 'intro_john_weapon' }),
            beat(3.8, 1.2, 'idle', CAM.CLOSE, 'Se queda quieto; no muestra prisa.', { text: 'El desconocido que gana' })
        ])
    }),

    JANE: Object.freeze({
        id: 'INTRO_JANE',
        fighterId: 'JANE',
        duration: 5.0,
        camera: 'cinematic',
        theme: 'vara / alcance',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Postura larga, perfil fino.', { text: 'Jane Doe' }),
            beat(1.2, 1.4, 'rv_proyeccion', CAM.MEDIUM, 'Marca un paso de vara imaginaria, punta al frente.', { record: true, recordAs: 'intro_jane_staff' }),
            beat(2.6, 1.2, 'sp_patada_frontal', CAM.PUSH_IN, 'Patada frontal de distancia.'),
            beat(3.8, 1.2, 'idle', CAM.CLOSE, 'Baja la guardia solo un instante.', { text: 'La anónima de oro' })
        ])
    }),

    CARLOS: Object.freeze({
        id: 'INTRO_CARLOS',
        fighterId: 'CARLOS',
        duration: 5.0,
        camera: 'cinematic',
        theme: 'suelo / BJJ',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Guardia baja, manos abiertas.', { text: 'Carlos Ruiz' }),
            beat(1.2, 1.4, 'crouch', CAM.MEDIUM, 'Baja nivel buscando entrada.', { record: true, recordAs: 'intro_carlos_levelchange' }),
            beat(2.6, 1.2, 'rv_agarre_pie', CAM.LOW, 'Toca el suelo con la mano, amenaza derribo.'),
            beat(3.8, 1.2, 'idle', CAM.CLOSE, 'Sube lento, sin quitar ojos del rival.', { text: 'El primo de la final' })
        ])
    }),

    ANA: Object.freeze({
        id: 'INTRO_ANA',
        fighterId: 'ANA',
        duration: 5.2,
        camera: 'cinematic',
        theme: 'graffiti / improvisacion',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Postura suelta, casi despreocupada.', { text: 'Ana Torres' }),
            beat(1.2, 1.4, 'slide', CAM.ORBIT, 'Deslizamiento corto lateral, jugueton.', { record: true, recordAs: 'intro_ana_slide' }),
            beat(2.6, 1.2, 'sp_patada_giro', CAM.MEDIUM, 'Gira con patada improvisada.'),
            beat(3.8, 1.4, 'idle', CAM.CLOSE, 'Provocacion breve; vuelve a guardia.', { text: 'La última en pie' })
        ])
    })
});

export function introForFighter(fighterId) {
    if (FIGHTER_INTROS[fighterId]) return FIGHTER_INTROS[fighterId];
    // Intro generico para personajes sin intro authored: usa datos del roster.
    const slot = ROSTER.find((r) => r.id === fighterId || r.characterId === fighterId);
    const name = slot ? slot.name : fighterId;
    const tag = slot ? slot.tag : '';
    return Object.freeze({
        id: `INTRO_${fighterId}`,
        fighterId,
        duration: 4.0,
        camera: 'cinematic',
        theme: 'generico',
        beats: Object.freeze([
            beat(0.0, 1.2, 'idle', CAM.WIDE, 'Entrada neutral.', { text: name }),
            beat(1.2, 1.4, 'walk', CAM.MEDIUM, 'Avance corto al ring.'),
            beat(2.6, 1.4, 'idle', CAM.CLOSE, 'Guardia final.', { text: tag })
        ])
    });
}

export function listIntroBeats(fighterId) {
    const intro = introForFighter(fighterId);
    return intro.beats.map((b, i) => ({ index: i, ...b }));
}

/**
 * Comprueba estructura y, si se pasa `validClips`, que cada clip del guion
 * existe en la biblioteca (resolviendo alias antes de mirar). Sin la lista de
 * clips solo se valida el guion; con ella se detecta el nombre que no existe,
 * que es el fallo que antes se descubria al reproducir la intro.
 */
export function validateIntros(roster = ROSTER, validClips = null) {
    const issues = [];
    for (const slot of roster) {
        const intro = FIGHTER_INTROS[slot.id];
        if (!intro) { issues.push(`${slot.id}: falta intro`); continue; }
        if (!Array.isArray(intro.beats) || intro.beats.length === 0) issues.push(`${slot.id}: intro sin beats`);
        let t = 0;
        for (const b of intro.beats) {
            if (typeof b.dur !== 'number' || b.dur <= 0) issues.push(`${slot.id}: beat con duracion invalida`);
            if (typeof b.t !== 'number' || b.t < t - 0.001) issues.push(`${slot.id}: beat fuera de orden temporal`);
            if (validClips && b.clip && !validClips.has(clipEfectivo(b.clip))) {
                issues.push(`${slot.id}: clip desconocido ${b.clip}`);
            }
            t = b.t;
        }
    }
    return issues;
}

export default FIGHTER_INTROS;
