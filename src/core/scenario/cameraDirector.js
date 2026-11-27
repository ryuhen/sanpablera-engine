/**
 * ============================================================================
 * SANPABLERA ENGINE · core/scenario/cameraDirector.js
 * ----------------------------------------------------------------------------
 * Director de cámara de combate (lógica pura).
 *
 * Objetivos:
 *   - Enfocar siempre a los dos peleadores.
 *   - Elegir un ángulo que favorezca la lectura de la acción.
 *   - Exponer datos para oclusión/transparencia (no toca Babylon).
 *
 * Convenciones:
 *   - Plano XZ, Y hacia arriba.
 *   - alpha en radianes alrededor del objetivo (estilo ArcRotateCamera).
 *   - beta en radianes desde eje Y (ArcRotateCamera: 0 arriba, PI/2 horizonte).
 * ============================================================================
 */

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function lerpAngle(a, b, t) {
    const d = normAngle(b - a);
    return a + d * t;
}

function vec2(x, z) { return { x: x || 0, z: z || 0 }; }
function sub(a, b) { return vec2(a.x - b.x, a.z - b.z); }
function len(v) { return Math.hypot(v.x, v.z); }
function dot(a, b) { return a.x * b.x + a.z * b.z; }
function crossY(a, b) { return a.x * b.z - a.z * b.x; } // escalar 2D

/**
 * Calcula oclusión aproximada en 2D para candidatos de ángulo.
 * @param {{x,z}} target
 * @param {number} radius
 * @param {Array} occluders - {position:{x,z}, size:{w,d}, occludes:true}
 * @param {{x,z}} aPos
 * @param {{x,z}} bPos
 */
function occlusionPenalty(alpha, target, radius, occluders, aPos, bPos) {
    if (!occluders || !occluders.length) return 0;
    // Posición de cámara aproximada en XZ (ArcRotate usa alpha; seno/coseno según Babylon).
    const camX = target.x + radius * Math.sin(alpha);
    const camZ = target.z + radius * Math.cos(alpha);
    let penalty = 0;
    for (const o of occluders) {
        if (!o || o.occludes === false) continue;
        const p = o.position || o;
        const s = o.size || { w: 1, d: 1 };
        const hw = Math.max(0.2, (s.w || 1) * 0.5);
        const hd = Math.max(0.2, (s.d || 1) * 0.5);
        penalty += rayAabbPenalty(camX, camZ, target.x, target.z, p.x, p.z, hw, hd) * 0.4;
        penalty += rayAabbPenalty(camX, camZ, aPos.x, aPos.z, p.x, p.z, hw, hd) * 0.3;
        penalty += rayAabbPenalty(camX, camZ, bPos.x, bPos.z, p.x, p.z, hw, hd) * 0.3;
    }
    return penalty;
}

function rayAabbPenalty(x1, z1, x2, z2, cx, cz, hw, hd) {
    // Penaliza si el segmento cámara->objetivo pasa cerca/dentro del AABB expandido.
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((cx - x1) * dx + (cz - z1) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = x1 + dx * t, pz = z1 + dz * t;
    const ex = Math.abs(px - cx) - hw;
    const ez = Math.abs(pz - cz) - hd;
    const outside = Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
    if (outside > 0.6) return 0;
    // Dentro o muy cerca: penalidad fuerte.
    return clamp(1 - outside / 0.6, 0, 1);
}

/**
 * @param {object} input
 * @param {{x,z}} input.a
 * @param {{x,z}} input.b
 * @param {number} input.currentAlpha
 * @param {number} input.currentBeta
 * @param {number} input.currentRadius
 * @param {Array} [input.occluders]
 * @param {boolean} [input.locked]  target-lock/cercano
 * @param {number} [input.dt]
 */
export function computeCombatCamera(input = {}) {
    const a = input.a || vec2(0, 0);
    const b = input.b || vec2(0, 0);
    const dt = Math.max(0.001, input.dt || 1 / 60);
    const smooth = 1 - Math.exp(-dt * 3);

    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const target = { x: mx, y: 1.0, z: mz };
    const span = Math.hypot(a.x - b.x, a.z - b.z);

    const baseRadius = input.locked ? 3.0 : 4.2;
    const desiredRadius = clamp(Math.max(baseRadius, span * 0.9 + 3.0), 2.6, 9.5);

    // Ángulo de la línea de acción. La cámara se pone perpendicular para ver ambos perfiles.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const actionAlpha = Math.atan2(dx, dz) + Math.PI / 2; // perpendicular
    const candidates = [
        actionAlpha,
        actionAlpha + Math.PI,
        actionAlpha + Math.PI / 2,
        actionAlpha - Math.PI / 2
    ];

    let bestAlpha = input.currentAlpha ?? actionAlpha;
    let bestScore = Infinity;
    for (const ca of candidates) {
        const na = normAngle(ca);
        const angleDiff = Math.abs(normAngle(na - (input.currentAlpha ?? na)));
        const occ = occlusionPenalty(na, target, desiredRadius, input.occluders || [], a, b);
        // Penaliza giros bruscos y oclusión; premia perpendicularidad a la acción.
        const perp = Math.abs(Math.cos(normAngle(na - actionAlpha)));
        const score = occ * 3.0 + angleDiff * 0.35 + perp * 0.15;
        if (score < bestScore) { bestScore = score; bestAlpha = na; }
    }

    // Beta: un poco más alta cuando están lejos, más baja/cercana cuando están cerca.
    const desiredBeta = clamp(1.05 - clamp(span / 12, 0, 1) * 0.12, 0.85, 1.2);

    return {
        target,
        radius: lerp(input.currentRadius ?? desiredRadius, desiredRadius, smooth),
        alpha: lerpAngle(input.currentAlpha ?? bestAlpha, bestAlpha, smooth),
        beta: lerp(input.currentBeta ?? desiredBeta, desiredBeta, smooth),
        span,
        bestScore
    };
}

export default computeCombatCamera;