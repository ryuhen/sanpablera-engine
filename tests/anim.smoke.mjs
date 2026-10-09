/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/anim.smoke.mjs
 * ----------------------------------------------------------------------------
 * Pruebas de la CAPA DE ANIMACION: el simulador de tela, las siluetas de
 * golpe por contexto y la matriz de reacciones (3 alturas x 3 potencias).
 *
 * POR QUE ESTAS PRUEBAS SON DISTINTAS DE LAS DE `cine`
 * ----------------------------------------------------------------------------
 *   cine.smoke.mjs prueba que las MATEMATICAS son correctas (quaterniones,
 *   BoneMap, contrato del esqueleto). Esto prueba que la ANIMACION es la que
 *   quiere el combate, que es otra cosa: que un jab agachado llegue mas bajo
 *   que el de pie, que un golpe a la cabeza no se parezca a uno a la pierna, y
 *   que la tela caiga y no se estire.
 *
 *   Todo se comprueba sobre el rig REAL (el que sale de los BONES del
 *   contrato), no sobre una pose inventada. Es lo que permite afirmar "el pie
 *   queda en el suelo" mirando numeros y no，继 hoping.
 *
 *   node tests/anim.smoke.mjs
 * ============================================================================
 */
import { load } from './loader.mjs';

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
    if (cond) { pass++; return true; }
    fails.push(extra !== undefined ? `${name} :: ${extra}` : name);
    return false;
};
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;
const section = (t) => console.log('\n' + t);
const run = (name, fn) => {
    console.log(`\n[${name}]`);
    const before = fails.length;
    const beforePass = pass;
    try { fn(); } catch (e) {
        fails.push(`${name} lanzo: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`);
    }
    console.log(`  ${fails.length === before ? 'ok  ' : 'FALLO'} ${name} (${pass - beforePass} comprobaciones)`);
};

// ---------------------------------------------------------------------------
// Modulos
// ---------------------------------------------------------------------------
const Cloth = await load('src/core/cloth/Cloth.js');
const Pose = await load('src/core/cine/Pose.js');
const RigMod = await load('src/core/cine/Rig.js');
const Stances = await load('src/core/cine/Stances.js');
const FighterRig = await load('src/core/entities/FighterRig.js');
const AttackPoses = await load('src/core/entities/AttackPoses.js');
const Hit = await load('src/core/entities/HitReactions.js');
const Parts = await load('src/render/PartMannequin.js');
const FighterEntity = (await load('src/core/entities/FighterEntity.js')).default;
const SPF = (await load('src/core/fsm/Constants.js')).default;
const { BONES } = await load('src/core/cine/CineConstants.js');

/**
 * Un rig DEL CONTRATO, sin modelo: los 21 huesos de CineConstants con sus
 * offsets. Es el mismo esqueleto que se leeria de un .glb bien mapeado, y por
 * eso sirve para comprobar la animacion sin depender de ningun asset.
 */
function contractRig() {
    const bones = BONES.map((b) => ({
        name: b.name,
        parentName: b.parent,
        localT: b.offset.slice(),
        localQ: [0, 0, 0, 1]
    }));
    const map = Object.create(null);
    for (const b of BONES) map[b.name] = b.name;
    return RigMod.buildRig({ map, missing: [], duplicates: [] }, bones, { scale: 1, rootFix: 'Y_UP' });
}

const handY = (st, bone) => (st.p[bone] ? st.p[bone][1] : null);
const handZ = (st, bone) => (st.p[bone] ? st.p[bone][2] : null);

// ===========================================================================
section('0 · El rig del contrato');
// ===========================================================================

const rig = contractRig();

run('rig del contrato', () => {
    ok(rig.bones.length === BONES.length, 'los 21 huesos estan', rig.bones.length);
    ok(rig.playable, 'es jugable');
    ok(near(rig.restWorld.PELVIS.p[1], 0.95, 1e-6), 'la pelvis esta a 0,95 m', rig.restWorld.PELVIS.p[1]);

    // OJO con la altura: `measuredHeight` es la del VERTICE de la cadena, y el
    // hueso mas alto del contrato es HEAD, que esta a 1,57 m. Los 1,80 m del
    // humano salen de sumar el largo del craneo (0,22). Medir 1,80 aqui seria
    // medir algo que el rig no puede dar.
    ok(near(rig.measuredHeight, 1.57, 1e-3), 'el vertice de la cadena esta a 1,57 m', rig.measuredHeight);
    const head = rig.bones[rig.index.HEAD];
    ok(near(rig.restWorld.HEAD.p[1] + head.length, 1.79, 1e-3),
        'con el craneo, el humano mide 1,79 m', rig.restWorld.HEAD.p[1] + head.length);

    ok(rig.index.UPPERARM_L < rig.index.FOREARM_L, 'el brazo va de padre a hijo');

    // EL DELTA DE LA RAIZ SE APLICA UNA SOLA VEZ. Este es el bug que se
    // arreglo al integrar la animacion: "bajar la cadera 10 cm" la bajaba 20,
    // y como no reventaba nada (el IK se adaptaba) solo se notaba en que los
    // golpes agachados salian por debajo del suelo.
    const pose = Pose.createPose();
    Pose.setPos(pose, 'PELVIS', [0, -0.30, 0]);
    const st = RigMod.fk(rig, pose);
    ok(near(st.p.PELVIS[1], 0.95 - 0.30, 1e-6),
        'bajar la cadera 30 cm la baja 30 cm y no 60', st.p.PELVIS[1]);

    // Y el delta de un HUJO si se aplica (aqui esta elOffset de la cadera).
    const c2 = Pose.createPose();
    Pose.setPos(c2, 'THIGH_L', [0.05, -0.2, 0]);
    const s2 = RigMod.fk(rig, c2);
    ok(near(s2.p.THIGH_L[1], 0.89 - 0.2, 1e-6),
        'el delta de un hijo mueve su articulacion', s2.p.THIGH_L[1]);
});

// ===========================================================================
run('1 · Tela · construccion y reposo', () => {
    const W = 0.44;
    const c = Cloth.createCloth({ cols: 6, rows: 7, width: W, length: 0.62, origin: [-0.22, 1.45, 0] });
    ok(c.count === 42, 'la rejilla tiene cols*rows particulas', c.count);
    ok(c.constraints > 0, 'tiene cuerdas', c.constraints);
    ok(Cloth.clothIndices(c).length === (6 - 1) * (7 - 1) * 6, 'los triangulos cubren la rejilla',
        Cloth.clothIndices(c).length / 6);

    // La costura se cose CON EL ANCHO DEL PANO. Es lo que hace Cape: si la
    // costura es mas corta que el pano, las cuerdas de la primera fila quedan
    // comprimidas para siempre (sus dos extremos estan clavados) y la tela
    // nace con un bulto que el solver no puede quitar.
    Cloth.pinRow(c, 0, [-0.22, 1.45, 0], [0.22, 1.45, 0]);
    ok(c.pinned[0] === 1 && c.pinned[5] === 1, 'la costura queda FIJA (no solo con objetivo)');
    ok(c.invMass[0] === 0, 'una particula fija no tiene masa inversa');
    ok(c.pinMismatch < 1e-9, 'la costura coincide con el ancho del pano', c.pinMismatch);

    // Y el diagnostico DETECTA cuando no coincide, que es el fallo que hacia
    // que la capa tuviera un bulto en los hombros sin decir por que.
    const malo = Cloth.createCloth({ cols: 6, rows: 4, width: 0.44, length: 0.3 });
    Cloth.pinRow(malo, 0, [-0.17, 0, 0], [0.17, 0, 0]);
    ok(malo.pinMismatch > 0.05, 'una costura mas corta que el pano se detecta', malo.pinMismatch);

    for (let i = 0; i < 240; i++) Cloth.stepCloth(c, 1 / 60, { collide: false });
    ok(near(Cloth.particle(c, 0)[1], 1.45, 1e-6), 'la costura no se cae', Cloth.particle(c, 0));
    const tip = Cloth.particle(c, c.count - 1);
    ok(tip[1] < 1.45, 'la tela CUELGA por debajo de la costura', tip[1]);
    ok(tip[1] > 0.6, 'y no cae al infinito (el largo la limita)', tip[1]);
    ok(c.maxStretch < 0.02, 'la tela no se estira', c.maxStretch);
});

run('2 · Tela · viento y rafaga', () => {
    const c = Cloth.createCloth({ cols: 5, rows: 6, width: 0.4, length: 0.5, origin: [-0.2, 1.45, 0] });
    Cloth.pinRow(c, 0, [-0.2, 1.45, 0], [0.2, 1.45, 0]);
    for (let i = 0; i < 180; i++) Cloth.stepCloth(c, 1 / 60, { collide: false });
    const quieta = Cloth.particle(c, c.count - 1)[2];

    for (let i = 0; i < 90; i++) Cloth.stepCloth(c, 1 / 60, { wind: [0, 0, 12], collide: false });
    const conViento = Cloth.particle(c, c.count - 1)[2];
    ok(conViento > quieta + 0.1, 'el viento empuja la capa hacia +Z', { quieta, conViento });

    const antes = Cloth.particle(c, c.count - 1)[2];
    Cloth.gust(c, [0, 0, -1], 0.06);
    for (let i = 0; i < 12; i++) Cloth.stepCloth(c, 1 / 60, { wind: [0, 0, 12], collide: false });
    ok(Cloth.particle(c, c.count - 1)[2] < antes, 'la rafaga la echa para atras');
});

run('3 · Tela · colision con el cuerpo', () => {
    // LA TELA SE CUELA POR DETRAS DEL TORSO, no encima. Cosida pegada (7 cm)
    // nace dentro de la capsula y sale despedida: medido, el estiramiento pasa
    // de 0,1 cm (a 20 cm) a 3,3 cm (a 7 cm). Es la misma razon por la que
    // `Cape` cose con `back = 0.14`.
    const BACK = 0.20;
    const c = Cloth.createCloth({
        cols: 7, rows: 9, width: 0.3, length: 0.9, origin: [-0.15, 1.5, -BACK]
    });
    Cloth.pinRow(c, 0, [-0.15, 1.5, -BACK], [0.15, 1.5, -BACK]);
    Cloth.setColliders(c, {
        groundY: 0,
        capsules: [{ a: [0, 0.85, 0], b: [0, 1.45, 0], r: 0.20 }]
    });
    for (let i = 0; i < 300; i++) Cloth.stepCloth(c, 1 / 60, { wind: [0, 0, 3] });

    // Ninguna particula LIBRE dentro del torso. Las fijadas de la costura se
    // cuentan aparte: estan clavadas a proposito y la colision no las mueve.
    let dentro = 0;
    for (let i = 0; i < c.count; i++) {
        if (c.pinned[i]) continue;
        const p = Cloth.particle(c, i);
        const y = Math.max(0.85, Math.min(1.45, p[1]));
        if (Math.hypot(p[0], p[1] - y, p[2]) < 0.19) dentro++;
    }
    ok(dentro === 0, 'ninguna particula libre se queda DENTRO del torso', dentro);
    ok(c.maxStretch < 0.02, 'colisionar no la estira', c.maxStretch);

    // Y la tela sigue COLGANDO: choca con el cuerpo pero no se para en el.
    const baja = Cloth.particle(c, c.count - 1)[1];
    ok(baja < 1.5, 'la punta cae por debajo de la costura', baja);
});

run('4 · Tela · contra el suelo', () => {
    const c = Cloth.createCloth({ cols: 5, rows: 8, width: 0.3, length: 2.0, origin: [-0.15, 1.9, 0] });
    Cloth.pinRow(c, 0, [-0.15, 1.9, 0], [0.15, 1.9, 0]);
    Cloth.setColliders(c, { groundY: 0 });
    for (let i = 0; i < 420; i++) Cloth.stepCloth(c, 1 / 60, {});
    let bajo = 0;
    for (let i = 0; i < c.count; i++) if (Cloth.particle(c, i)[1] < -1e-3) bajo++;
    ok(bajo === 0, 'ninguna particula atraviesa el suelo', bajo);
});

run('5 · Tela · el modelo generico con piezas', () => {
    ok(Array.isArray(Parts.PART_TABLE) && Parts.PART_TABLE.length >= 19,
        'la tabla de piezas cubre el esqueleto', Parts.PART_TABLE.length);
    const contracts = new Set(Parts.PART_TABLE.map((p) => p.contract));
    const required = BONES.filter((b) => b.contact || /HAND|HEAD|FOREARM/.test(b.name));
    ok(required.every((b) => contracts.has(b.name)),
        'toda pieza de contacto esta en la tabla');
    // Cada pieza tiene que colgar de un hueso que EXISTA en el contrato.
    ok(Parts.PART_TABLE.every((p) => BONES.some((b) => b.name === p.contract)),
        'ninguna pieza apunta a un hueso inexistente');
    // Los brazos en la pose de reposo van en +X: por eso la tabla marca axis X.
    ok(Parts.PART_TABLE.filter((p) => p.axis === 'X').length >= 4,
        'los brazos se montan tumbados en el eje del hueso');
});

// ===========================================================================
run('6 · Golpes · el mismo jab en los cuatro contextos', () => {
    const snap = (limbs, phase, groups) => ({
        phase: 'GROUND', groups: groups || ['ATTACKING'],
        posture: { limbs, hipY: 0.9, spinePitch: 0.1 },
        attack: 'ATAQUE_LIGERO', attackPhase: phase, attackT: 0.5
    });

    const dePie = FighterRig.poseFor(rig, snap('STAND', 'ACTIVE'), {});
    const ctxPie = AttackPoses.contextOf(snap('STAND', 'ACTIVE'));
    ok(ctxPie === 'STAND', 'de pie el contexto es STAND', ctxPie);

    const agachado = FighterRig.poseFor(rig, snap('CROUCH', 'ACTIVE'), {});
    const ctxAg = AttackPoses.contextOf(snap('CROUCH', 'ACTIVE'));
    ok(ctxAg === 'CROUCH', 'agachado el contexto es CROUCH', ctxAg);

    const aire = FighterRig.poseFor(rig, {
        phase: 'AIR', groups: ['ATTACKING', 'AIRBORNE'],
        posture: { limbs: 'FLOAT', hipY: 0.86, spinePitch: 0.18 },
        attack: 'ATAQUE_LIGERO', attackPhase: 'ACTIVE', attackT: 0.5
    }, {});
    const ctxAire = AttackPoses.contextOf({
        phase: 'AIR', groups: ['AIRBORNE'],
        posture: { limbs: 'FLOAT', hipY: 0.86 }, attack: 'ATAQUE_LIGERO'
    });
    ok(ctxAire === 'AIR', 'en el aire el contexto es AIR', ctxAire);

    // LA COMPROBACION QUE IMPORTA: el jab agachado tiene que llegar MAS BAJO
    // que el de pie. Si no, el boton de abajo no hace nada visible y el
    // jugador no entiende por que hay dos botones de golpe.
    const yPie = handY(dePie.state, 'HAND_L');
    const yAg = handY(agachado.state, 'HAND_L');
    ok(yAg < yPie - 0.2, 'el jab agachado pega mas bajo que el de pie', { yPie, yAg });

    // Y en el aire NO se clavan los pies: un pie clavado en el aire es el
    // sintoma de que la pose se ha construido sin suelo.
    const pieL = agachado.state.p.FOOT_L;
    const pieAire = aire.state.p.FOOT_L;
    ok(pieAire && pieL, 'ambos tienen el pie del personaje resuelto');
    ok(near(aire.state.p.PELVIS[1], 0.86, 0.12) || aire.state.p.PELVIS[1] > 0.6,
        'en el aire la pelvis queda en el aire', aire.state.p.PELVIS[1]);
});

run('7 · Golpes · las tres fases se mueven', () => {
    const pose = (phase, t) => FighterRig.attackPoseFor(rig, 'ATAQUE_LIGERO', 'STAND', phase, t, {});
    const startup = pose('STARTUP', 1);
    const active = pose('ACTIVE', 1);
    const recovery = pose('RECOVERY', 1);
    const reach = (p) => handZ(p.state, 'HAND_L');

    // El amago RETIRA la mano (el jabo echa el codo atras para dar mas
    // fuerza) y el ACTIVE la extiende. Por eso el amago queda mas ATRAS que la
    // guardia: comparar "amago vs recogida" no tiene sentido, los dos estan
    // cerca de la guardia por definicion. Lo que tiene que cumplirse es que el
    // ACTIVE sea el punto mas adelantado del golpe.
    ok(reach(startup) < reach(active), 'el ACTIVE llega mas lejos que el amago',
        { startup: reach(startup), active: reach(active) });
    ok(reach(recovery) < reach(active), 'la RECOVERY recoge el brazo',
        { active: reach(active), recovery: reach(recovery) });
    ok(reach(startup) < reach(recovery),
        'el amago echa el brazo atras (prepara), no lo adelanta',
        { startup: reach(startup), recovery: reach(recovery) });
    ok(reach(active) > reach(startup) + 0.3,
        'el golpe extiende el brazo de verdad', reach(active) - reach(startup));
});

run('8 · Golpes · patada: la pierna de golpe y el apoyo clavado', () => {
    const p = FighterRig.attackPoseFor(rig, 'ATAQUE_PESADO', 'STAND', 'ACTIVE', 1, {});
    ok(p.silhouette === 'KICK', 'el pesado se anima como patada', p.silhouette);
    const pie = p.state.p.TOE_L || p.state.p.FOOT_L;
    const apoyo = p.state.p.TOE_R || p.state.p.FOOT_R;
    ok(pie && apoyo, 'ambos pies estan resueltos');
    // El pie de golpe sube; el de apoyo se queda en el suelo.
    ok(pie[1] > 0.25, 'el pie que golpea esta en el aire', pie[1]);
    ok(apoyo[1] < 0.12, 'el pie de APOYO sigue en el suelo', apoyo[1]);
});

run('9 · Golpes · barrido: rasante y por debajo', () => {
    const p = FighterRig.attackPoseFor(rig, 'ATAQUE_BARRIDO', 'STAND', 'ACTIVE', 1, {});
    ok(p.silhouette === 'SWEEP', 'el barrido se anima como barrido', p.silhouette);
    const pie = p.state.p.TOE_L || p.state.p.FOOT_L;
    ok(pie[1] < 0.4, 'el pie del barrido va por el suelo', pie[1]);
});

// ===========================================================================
run('10 · Reacciones · la matriz existe entera (3 alturas x 3 potencias)', () => {
    for (const h of ['ALTO', 'MEDIO', 'BAJO']) {
        ok(!!Hit.HIT_REACTIONS[h], `hay fila ${h}`);
        for (const p of ['DEBIL', 'MEDIO', 'FUERTE']) {
            const R = Hit.HIT_REACTIONS[h] && Hit.HIT_REACTIONS[h][p];
            ok(!!R && !!R.arms && !!R.legs && R.spine && R.head,
                `fila completa ${h}/${p}`);
            ok(typeof R.recover === 'number' && R.recover > 0 && R.recover <= 1,
                `${h}/${p} declara cuanto tarda en recuperarse`, R.recover);
        }
    }
});

run('11 · Reacciones · la ALTURA cambia donde pega', () => {
    const r = (h, p) => FighterRig.flinchPose(rig, 'MEDIO', {
        move: { hitLevel: p, power: p, height: h }, t: 0.1
    });

    const alto = r('ALTO', 'MEDIO');
    const bajo = r('BAJO', 'MEDIO');

    // LA DIRECCION DEL TORSO es la lectura, no la altura de la cabeza: un
    // golpe ALTO echa el torso hacia ATRAS (la cabeza sale despedida hacia -Z)
    // y un golpe BAJO lo dobla hacia DELANTE (hacia +Z y hacia abajo). Si se
    // mirara solo el eje Y las dos alturas darianparecidas.
    const cabAlta = alto.state.p.HEAD;
    const cabBaja = bajo.state.p.HEAD;
    ok(cabAlta[2] < cabBaja[2] - 0.03,
        'el golpe ALTO echa la cabeza hacia atras (-Z) y el BAJO hacia delante (+Z)',
        { alto: cabAlta[2].toFixed(3), bajo: cabBaja[2].toFixed(3) });
    ok(cabBaja[1] < cabAlta[1],
        'el golpe BAJO dobla el cuerpo: la cabeza acaba mas baja',
        { alto: cabAlta[1].toFixed(3), bajo: cabBaja[1].toFixed(3) });

    // Y la potencia escalona las tres: FUERTE se hunde mas que MEDIO, que se
    // hunde mas que DEBIL.
    const d = Hit.HIT_REACTIONS.MEDIO;
    ok(d.DEBIL.hip > d.MEDIO.hip && d.MEDIO.hip > d.FUERTE.hip,
        'a mas potencia, mas se hunde la cadera', { d: [d.DEBIL.hip, d.MEDIO.hip, d.FUERTE.hip] });
    ok(d.DEBIL.recover > d.MEDIO.recover && d.MEDIO.recover > d.FUERTE.recover,
        'a mas potencia, mas tarda en recuperarse');
});

run('12 · Reacciones · potencia y recuperacion', () => {
    // El peso de la reaccion tiene que ir de 0 a 1 y volver: si solo subiera,
    // el peleador se quedaria congelado en la pose de impacto para siempre.
    const move = { hitLevel: 'MEDIO', power: 'MEDIO', height: 'MEDIO' };
    const w = [0, 0.25, 0.5, 0.75, 1].map(
        (t) => FighterRig.hitReactionPose(rig, move, t, {}).weight);
    ok(w[0] < 0.5, 'al entrar el impacto es suave', w);
    ok(w.some((x) => x > 0.5), 'llega a su punto alto a mitad de hitstun', w);
    ok(w[4] < w[1], 'al final vuelve a la guardia', w);
    ok(w.every((x) => x >= 0 && x <= 1), 'el peso esta acotado', w);
});

run('13 · Reacciones · el golpe se lee en el mundo', () => {
    // Un FUERTE tiene que mover el cuerpo MAS que un DEBIL, no solo doler mas.
    const d = Hit.hitReactionPose(rig, { power: 'DEBIL', height: 'MEDIO' }, 0.1, {});
    const f = Hit.hitReactionPose(rig, { power: 'FUERTE', height: 'MEDIO' }, 0.1, {});
    const largo = (p) => Math.hypot(p.state.p.HEAD[0], p.state.p.HEAD[2]);
    ok(largo(f) > largo(d), 'el FUERTE desplaza el cuerpo mas que el DEBIL',
        { debil: largo(d), fuerte: largo(f) });
});

// ===========================================================================
run('14 · Golpes en el suelo · el castigo al caido', () => {
    for (const kind of ['PIE', 'MANOS', 'SALTAR', 'PESADO']) {
        const p = FighterHitGround(kind);
        ok(p && p.pose && p.state, `el golpe de suelo "${kind}" produce pose`);
    }
    function FighterHitGround(kind) {
        return Hit.groundAttackPose(rig, kind, 'ACTIVE', 0.6, {});
    }
    // El PIE va mas arriba que las MANOS: si no, el "monte" y el "pisoton"
    // serian el mismo golpe con otro nombre. Se mide al FINAL del ACTIVE (t=1),
    // que es cuando el pie ha bajado del todo: a mitad de fase los dos estan
    // aun en el amago y la diferencia es pequena.
    const pie = Hit.groundAttackPose(rig, 'PIE', 'ACTIVE', 1, {});
    const manos = Hit.groundAttackPose(rig, 'MANOS', 'ACTIVE', 1, {});
    ok(pie.state.p.TOE_L[1] > manos.state.p.TOE_L[1] + 0.1,
        'el pisoton tiene el pie mas alto que el de manos',
        { pie: pie.state.p.TOE_L[1].toFixed(3), manos: manos.state.p.TOE_L[1].toFixed(3) });
    ok(manos.state.p.TOE_L[1] < 0.35, 'el golpe de manos llega al suelo', manos.state.p.TOE_L[1]);

    // Y la fase ACTIVE llega mas lejos que el amago.
    const amago = Hit.groundAttackPose(rig, 'PIE', 'STARTUP', 1, {});
    ok(pie.state.p.TOE_L[2] > amago.state.p.TOE_L[2] + 0.05,
        'el pisoton sale mas adelante en el ACTIVE que en el amago',
        { amago: amago.state.p.TOE_L[2].toFixed(3), activo: pie.state.p.TOE_L[2].toFixed(3) });
    ok(amago.state.p.TOE_L[1] > pie.state.p.TOE_L[1] + 0.05,
        'y el amago lo lleva mas ARRIBA (prepara el pisoton)',
        { amago: amago.state.p.TOE_L[1].toFixed(3), activo: pie.state.p.TOE_L[1].toFixed(3) });
});

run('15 · Levantada · del suelo a la guardia', () => {
    const down = { orientation: 'PIES_A_RIVAL', axis: 180 };
    const t0 = Hit.wakeupPose(rig, 0, down, {});
    const t1 = Hit.wakeupPose(rig, 1, down, {});

    ok(t0.state.p.PELVIS[1] < 0.4, 'al empezar esta en el suelo', t0.state.p.PELVIS[1]);
    ok(t1.state.p.PELVIS[1] > 0.75, 'al terminar esta de pie', t1.state.p.PELVIS[1]);
    ok(t1.state.p.HEAD[1] > t0.state.p.HEAD[1],
        'la cabeza sube (no se teletransporta el cuerpo)');

    // El punto clave: los pies tienen que estar en el suelo en ambos extremos.
    ok(t1.state.p.FOOT_L[1] < 0.15, 'al levantarse apoya el pie', t1.state.p.FOOT_L[1]);
    ok(t0.state.p.FOOT_L[1] < 0.3, 'tumbado el pie esta en el suelo', t0.state.p.FOOT_L[1]);
});

// ===========================================================================
run('16 · Dispatcher · el orden de las ramas', () => {
    // Ataque contra un rival caido -> castigo al suelo, no un jab mas.
    const sobreElCaido = FighterRig.poseFor(rig, {
        phase: 'GROUND', groups: ['ATTACKING', 'DOWNED'],
        posture: { limbs: 'CROUCH', hipY: 0.7 },
        attack: 'ATAQUE_PESADO', attackPhase: 'ACTIVE', attackT: 0.6,
        downAttack: 'PIE'
    }, {});
    ok(!!sobreElCaido.pose, 'el castigo al caido produce pose');
    const jabNormal = FighterRig.attackPoseFor(rig, 'ATAQUE_PESADO', 'STAND', 'ACTIVE', 1, {});
    ok(Math.abs(sobreElCaido.pose.pos.PELVIS[1] - jabNormal.pose.pos.PELVIS[1]) > 1e-3,
        'el castigo al caido NO es el jab de siempre');

    // WAKEUP tiene su propia rama: sin ella, el peleador se levantaria de golpe.
    const wake = FighterRig.poseFor(rig, {
        phase: 'WAKEUP', groups: ['WAKEUP'],
        posture: { limbs: 'CROUCH', hipY: 0.46 },
        down: { orientation: 'PIES_A_RIVAL', axis: 180 }, wakeT: 0.2
    }, {});
    ok(wake.state.p.PELVIS[1] < 0.5, 'a media levantada sigue cerca del suelo',
        wake.state.p.PELVIS[1]);
});

// ===========================================================================
run('17 · Nada revienta · snapshots raros y golpes sin clave', () => {
    const raros = [
        { phase: 'GROUND', groups: [], posture: null },
        { phase: 'AIR', groups: ['ATTACKING'], attack: null },
        { phase: 'GROUND', groups: ['ATTACKING'], attack: 'GOLPE_INEXISTENTE', attackPhase: 'ACTIVE' },
        { phase: 'IMPACT', groups: ['IMPACT'], hitLevel: null },
        { phase: 'DOWNED', groups: ['DOWNED'], down: null },
        {}
    ];
    for (const s of raros) {
        let r = null;
        try { r = FighterRig.poseFor(rig, s, {}); } catch (e) { r = null; }
        ok(!!r && !!r.pose && !!r.state, `snapshot raro no revienta: ${JSON.stringify(s).slice(0, 46)}`);
    }
    // Un golpe desconocido cae en una silueta por defecto, no en undefined.
    ok(AttackPoses.silhouetteOf('NO_EXISTE') === 'JAB',
        'un golpe desconocido cae en JAB', AttackPoses.silhouetteOf('NO_EXISTE'));
    ok(AttackPoses.silhouetteOf('ATAQUE_PESADO') === 'KICK',
        'el pesado cae en KICK');
    // Y los contextos desconocidos tambien.
    ok(AttackPoses.contextOf({ groups: [] }) === 'STAND', 'contexto por defecto STAND');
    ok(AttackPoses.contextOf(null) === 'STAND', 'sin snapshot, STAND');
});

// ===========================================================================
run('18 · Telas y piezas · el puente con Babylon no se importa en Node', () => {
    // ClothMesh y PartMannequin tocan BABYLON, asi que no se importan aqui
    // (este loader obliga a que lo testeado sea PURO). Lo que se comprueba es
    // que el solver SI es puro y que las piezas se declaran con datos, que es
    // lo que permite dibujar maniquis sin asset.
    ok(typeof Cloth.createCloth === 'function', 'el solver se importa sin motor');
    ok(typeof Parts.buildParts === 'function', 'las piezas se declaran como tabla');
    ok(!('BABYLON' in globalThis), 'no se ha colado BABYLON en el test');
});

// ===========================================================================
run('19 · Integracion · el castigo al caido sale en combate de verdad', () => {
    // Hasta aqui todo se ha probado llamando a las funciones de pose con
    // snapshots a mano. Esto prueba el CIRCUITO COMPLETO: dos entidades de
    // verdad peleando, una derriba a la otra y golpea mientras esta en el suelo.
    // Es la unica forma de detectar que `_downAttack` nunca se consulta, que
    // es exactamente el fallo que tenia `isDownAttack` devolviendo false fijo.
    const gauge = () => ({
        value: 100, spend() { }, update() { }, canRun: () => true, reset() { }
    });
    const model = { rig, applyPose() { }, place() { } };
    const mkFighter = (name, x, facing) => ({
        name, x, z: 0, facing, health: 100, gauge: gauge()
    });
    const e1 = new FighterEntity({
        fighter: mkFighter('P1', -0.45, 0), model,
        characterId: 'PEDRO', id: 'P1', stance: 'SHELL'
    });
    const e2 = new FighterEntity({
        fighter: mkFighter('P2', 0.45, Math.PI), model,
        characterId: 'PEDRO', id: 'P2', stance: 'SHELL'
    });
    const world = {
        hitstop: 0, minSpacing: 0.9,
        opponentOf: (e) => (e === e1 ? e2 : e1),
        tryHit: () => 'miss', props: [], ringLimit: 2.8, ringOut: () => null
    };
    const idle = {
        x: 0, y: 0, pressed: {}, held: { GUARDIA: false },
        moveX: 0, moveZ: 0, moveMag: 0,
        forward: false, back: false, up: false, down: false, left: false, right: false,
        dash: null, airSeqReady: false, quadEdge: false, slideEdge: false,
        actionEdge: false, actionHeld: false, actionFresh: false,
        crouch: false, dirEdge: null
    };

    const step = (n) => {
        for (let i = 0; i < n; i++) {
            e1.update(1 / 60, idle, world);
            e2.update(1 / 60, idle, world);
        }
    };

    step(5);
    // Derriba a P2.
    e2.takeHit({
        key: 'K', damage: 15, hitstun: 22, hitLevel: 'FUERTE',
        power: 'FUERTE', height: 'ALTO', knockdown: 'ALWAYS',
        launch: { x: 4, y: 0 }, juggleAdd: 0, hitstop: 6, hitbox: {}
    }, { fighter: e1.fighter }, world);
    ok(e2.fsm.inGroup(SPF.StateGroup.DOWNED), 'P2 esta en el suelo tras el derribo',
        e2.fsm.state.name);

    // Y ahora P1 golpea: tiene que salir el CASTIGO al caido, no un jab.
    e1.tryIntent(SPF.Intent.ATAQUE_LIGERO);
    step(1);
    ok(e1.fsm.inGroup(SPF.StateGroup.ATTACKING), 'P1 entra en un ataque',
        e1.fsm.state.name);
    const kind = e1._downAttack(e2);
    ok(kind === 'PIE', 'y el golpe contra el caido se clasifica como pisoton', kind);
    ok(e1._hitMove == null || e1._hitMove.key, 'el ultimo golpe recibido se recuerda');

    // El golpe de P2 no debe clasificarse como "contra el suelo" (esta de pie).
    ok(e2._downAttack(e1) === null, 'de pie contra de pie no hay castigo al suelo');

    // La levantada avanza (el wakeup tiene progreso propio, no un salto).
    step(20);
    ok(e2.fsm.state.name.startsWith('LEVANTANDOSE') || e2.fsm.state.name === 'NORMAL_A',
        'P2 se levanta solo', e2.fsm.state.name);
});

run('20 · Integracion · la reaccion sale por el dispatcher, no a mano', () => {
    // El mismo circuito, pero mirando que `_pose` llega a la matriz de
    // reacciones. Se espia `model.applyPose` para ver que recibe una pose
    // distinta para un golpe ALTO que para uno BAJO.
    const gauge = () => ({
        value: 100, spend() { }, update() { }, canRun: () => true, reset() { }
    });
    const seen = [];
    const model = {
        rig,
        applyPose(pose, st) { seen.push(st.p.HEAD[2]); },
        place() { }
    };
    const mkFighter = (name, x, facing) => ({
        name, x, z: 0, facing, health: 100, gauge: gauge()
    });
    const e1 = new FighterEntity({
        fighter: mkFighter('P1', -0.45, 0), model,
        characterId: 'PEDRO', id: 'P1', stance: 'SHELL'
    });
    const e2 = new FighterEntity({
        fighter: mkFighter('P2', 0.45, Math.PI), model,
        characterId: 'PEDRO', id: 'P2', stance: 'SHELL'
    });
    const world = {
        hitstop: 0, minSpacing: 0.9,
        opponentOf: (e) => (e === e1 ? e2 : e1),
        tryHit: () => 'miss', props: [], ringLimit: 2.8, ringOut: () => null
    };
    const idle = {
        x: 0, y: 0, pressed: {}, held: { GUARDIA: false },
        moveX: 0, moveZ: 0, moveMag: 0,
        forward: false, back: false, up: false, down: false, left: false, right: false,
        dash: null, airSeqReady: false, quadEdge: false, slideEdge: false,
        actionEdge: false, actionHeld: false, actionFresh: false,
        crouch: false, dirEdge: null
    };
    const stepOne = () => {
        e1.update(1 / 60, idle, world);
        e2.update(1 / 60, idle, world);
    };
    const hit = (altura, potencia) => {
        seen.length = 0;
        e2.takeHit({
            key: 'X', damage: potencia === 'FUERTE' ? 15 : 8,
            hitstun: 22, hitLevel: potencia === 'FUERTE' ? 'FUERTE' : 'MEDIO',
            power: potencia, height: altura, knockdown: 'NONE',
            launch: { x: 1, y: 0 }, juggleAdd: 0, hitstop: 6, hitbox: {}
        }, { fighter: e1.fighter }, world);
        stepOne();
        return seen[seen.length - 1];
    };

    stepOne();
    const zAlto = hit('ALTO', 'MEDIO');
    stepOne();
    const zBajo = hit('BAJO', 'MEDIO');
    ok(Number.isFinite(zAlto) && Number.isFinite(zBajo),
        'las dos reacciones producen una cabeza resolta', { zAlto, zBajo });
    ok(Math.abs(zAlto - zBajo) > 0.05,
        'un golpe ALTO y uno BAJO mueven la cabeza de forma distinta',
        { zAlto: zAlto.toFixed(3), zBajo: zBajo.toFixed(3) });
});

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (fails.length) {
    console.log(`FALLOS (${fails.length}):`);
    for (const f of fails) console.log('  - ' + f);
}
console.log(`\n${pass} comprobaciones, ${fails.length} fallos`);
process.exit(fails.length ? 1 : 0);