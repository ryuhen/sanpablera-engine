/**
 * ============================================================================
 * SANPABLERA ENGINE · render/ClothMesh.js
 * ----------------------------------------------------------------------------
 * El puente entre el solver de tela (core/cloth/Cloth.js, PURO) y la malla de
 * Babylon. Es el unico archivo de la tela que toca BABYLON.
 *
 * POR QUE ESTA SEPARADO
 *   El solver son 200 lineas de Verlet que se testean en Node en 2 ms. La
 *   malla necesita BABYLON y una escena. Separarlas permite probar la fisica
 *   (que es donde estan los bugs: telecolado de la costura, particulas que se
 *   van de rango, tela que se estira) sin abrir el navegador.
 *
 * QUE SE ACTUALIZA Y QUE NO
 * ----------------------------------------------------------------------------
 *   - Las VERTICES se vuelcan en la malla cada frame (updateVerticesData).
 *   - Las NORMALES se recalculan y se vuelcan tambien: sin ellas la tela se ve
 *     plana y apagada, que es como se ve el 90% de las capas mal hechas.
 *   - Los INDICES y las UV solo se escriben al construir. Recalcularlos cada
 *     frame seria tirar la mitad del coste del render por una geometria que
 *     no cambia.
 *
 * LA MALLA ES "UPDATABLE" Y POR QUE
 *   Babylon tiene dos tipos de malla con vertices. La estatica manda su buffer
 *   una vez y la GPU lo copia al VBOs; la actualizable la regenera cada frame
 *   en la CPU y la sube. La tela es del segundo tipo por definicion (cambia
 *   cada frame), asi que se pide `updatable: true` al construir. Marcarlo mal
 *   no da error: da una tela que se congela en la primera pose.
 * ============================================================================
 */

import {
    createCloth, pinRow, movePin, stepCloth, clothIndices, clothNormals,
    clothBounds, collidersFromRig, gust as gustCloth
} from '../core/cloth/Cloth.js';

/**
 * Una pieza de tela lista para dibujar.
 */
export class ClothMesh {
    /**
     * @param {object} B        BABYLON
     * @param {object} scene
     * @param {object} def      definicion (ver core/cloth/Cloth.js createCloth)
     *   + `material` material de Babylon
     *   + `name` nombre
     *   + `castShadow`
     * @param {object} [cloth] solver ya hecho (para reusarlo)
     */
    constructor(B, scene, def, cloth) {
        this.B = B;
        this.scene = scene;
        this.cloth = cloth || createCloth(def);

        const c = this.cloth;
        const positions = new Float32Array(c.count * 3);
        positions.set(c.pos);
        const normals = new Float32Array(c.count * 3);
        normals.set(clothNormals(c));

        const uvs = new Float32Array(c.count * 2);
        for (let r = 0; r < c.rows; r++) {
            for (let col = 0; col < c.cols; col++) {
                const i = (r * c.cols + col) * 2;
                uvs[i] = c.cols > 1 ? col / (c.cols - 1) : 0;
                uvs[i + 1] = c.rows > 1 ? r / (c.rows - 1) : 0;
            }
        }

        this.mesh = new B.Mesh(def.name || 'cloth', scene);
        const vd = new B.VertexData();
        vd.positions = positions;
        vd.normals = normals;
        vd.uvs = uvs;
        vd.indices = clothIndices(c);
        vd.applyToMesh(this.mesh, true);   // true = ACTUALIZABLE
        if (def.material) this.mesh.material = def.material;
        this.mesh.isPickable = false;
        if (def.castShadow !== false) this.mesh.receiveShadows = false;

        this._normBuf = normals;
    }

    /**
     * Un paso de simulacion + volcado a la GPU.
     *
     * @param {number} dt  segundos
     * @param {object} [env]  gravedad, viento, viento, colision (ver Cloth.stepCloth)
     */
    update(dt, env = {}) {
        stepCloth(this.cloth, dt, env);
        this.mesh.updateVerticesData(
            this.B.VertexBuffer.PositionKind, this.cloth.pos
        );
        this.mesh.updateVerticesData(
            this.B.VertexBuffer.NormalKind, this._normBuf
        );
        return this.mesh;
    }

    /** Recalcula las normales (una vez cada N frames es suficiente). */
    refreshNormals() {
        this._normBuf.set(clothNormals(this.cloth));
        this.mesh.updateVerticesData(this.B.VertexBuffer.NormalKind, this._normBuf);
    }

    setEnabled(on) { this.mesh.setEnabled(!!on); }

    dispose() { this.mesh.dispose(false, true); }
}

/**
 * Una CAPA: la tela que cuelga de los hombros y sigue al peleador.
 *
 * POR QUE ES UNA CLASE Y NO UN createCloth SUELTO
 *   La capa necesita tres cosas encadenadas y en este orden exacto cada frame,
 *   y ese orden es donde estan todos los fallos:
 *
 *     1. La pose del rig YA ESTA ESCRITA (el peleador esta donde debe).
 *     2. La costura se mueve a los puntos que dice la FK de los huesos.
 *     3. Se integra la tela y se colisiona contra el cuerpo.
 *
 *   Si se invirtiera 2 y 3, la costura iria un frame por detras del cuerpo y
 *   la capa "arrastraria": se ve como si el pelo tuviera un frame de retraso.
 *   Por eso esta clase ata los tres pasos y no deja que se llame sueltos.
 */
export class Cape {
    /**
     * @param {object} B
     * @param {object} scene
     * @param {object} model  el CharacterModel (da .rig y .nodes)
     * @param {object} opts
     *   width, length   medidas de la capa
     *   cols, rows      rejilla
     *   anchor          'CHEST' | 'SPINE' | 'UPPERARM_L'
     *   spread          separacion de los dos puntos de cosido (m)
     *   material
     *   groundY         altura del suelo en espacio de personaje
     */
    constructor(B, scene, model, opts = {}) {
        this.B = B;
        this.model = model;
        this.opts = opts;
        const width = opts.width != null ? opts.width : 0.44;
        const length = opts.length != null ? opts.length : 0.62;
        // SEMILLA (semilla de la costura). Se recuerda porque la costura se
        // re cose en cada frame entre los dos hombros, y con una semilla
        // distinta el pano aparecia cortado al construirlo.
        this.seed = [opts.seedX != null ? opts.seedX : -width / 2,
            opts.seedY != null ? opts.seedY : 1.45,
            opts.seedZ != null ? opts.seedZ : -0.07];

        // La costura arranca en el pecho, un poco por detras: una capa cosida
        // en el hombro se queda pegada al cuello y al girar se ve el enganche.
        this.anchor = opts.anchor || 'CHEST';
        // Separacion del pecho a la espalda en -Z (metros). Es la unica
        // constante que hay que tocar para que la capa quede pegada al cuerpo
        // en vez de flotando detras.
        this.back = opts.back != null ? opts.back : 0.07;

        this.cloth = createCloth({
            cols: opts.cols || 6,
            rows: opts.rows || 7,
            width, length,
            origin: this.seed,
            u: [1, 0, 0],
            v: [0, -1, 0],
            mass: opts.mass || 0.03,
            stiffness: 0.92,
            shear: 0.6,
            bend: 0.3,
            damping: opts.damping != null ? opts.damping : 0.982,
            groundY: opts.groundY != null ? opts.groundY : 0
        });

        // La costura se ata al pecho y se actualiza cada frame con la FK.
        //
        // LA ANCHURA DE LA COSTURA TIENE QUE SER LA DEL PANO. Se cose con el
        // ancho declarado (`width`) y no con la distancia entre los hombros
        // reales, porque si no las cuerdas horizontales de la primera fila
        // quedan comprimidas para siempre (los dos extremos estan clavados y el
        // solver no puede ganar) y la capa nace con un bulto en los hombros que
        // no se va nunca. La anchura real del cuerpo se ajusta cambiando
        // `width`, no la costura.
        const halfW = width / 2;
        this.pinned = pinRow(this.cloth, 0,
            [this.seed[0], this.seed[1], this.seed[2]],
            [this.seed[0] + width, this.seed[1], this.seed[2]]);

        this.mesh = new ClothMesh(B, scene, {
            name: opts.name || 'cape',
            material: opts.material
        }, this.cloth);

        // Colision: el torso y las piernas, de la FK del rig.
        this.chains = opts.chains || [
            { a: 'PELVIS', b: 'HEAD', radius: 0.19 },
            { a: 'THIGH_L', b: 'SHIN_L', radius: 0.12 },
            { a: 'THIGH_R', b: 'SHIN_R', radius: 0.12 }
        ];
        this.env = {
            gravity: opts.gravity || [0, -9.81, 0],
            wind: opts.wind || [0, 0, 0],
            iterations: opts.iterations || 5,
            substeps: opts.substeps || 2
        };
        this._normTick = 0;
        this.normEvery = opts.normEvery || 3;
    }

    /**
     * Un frame completo. Se llama DESPUES de model.applyPose().
     *
     * @param {number} dt
     * @param {object} [fkState] estado de FK ya calculado (si no, se usa el del
     *                         modelo, que es el de la pose ya escrita)
     * @param {object} [env] override del entorno (viento de prueba, etc.)
     */
    update(dt, fkState, env) {
        if (env) this.env = Object.assign({}, this.env, env);
        // OJO AL SEGUNDO PARAMETRO: es el estado de FK, NO un entorno de
        // simulacion (por eso un `cape.update(dt, {wind: [...]})` reventaba al
        // buscar CHEST dentro). Para cambiar el viento se toca `this.env.wind`
        // o se pasa el TERCER argumento.
        const st = (fkState && fkState.p) ? fkState : this.model.fkState;
        const anchor = st && st.p[this.anchor];
        if (anchor) {
            // La costura se coloca sobre la clavicula de cada lado y se
            // interpola entre las dos. Los dos puntos de los hombros son los
            // que GIRAN con el torso: si se usara un punto fijo en el pecho,
            // la capa se quedaria quieta mientras el peleador gira el tronco y
            // se veria que "flota" sin estar cosida a nada.
            const l = st.p.CLAV_L || st.p.UPPERARM_L;
            const r = st.p.CLAV_R || st.p.UPPERARM_R;
            const A = l || anchor;
            const C = r || anchor;
            // La capa cuelga POR DETRAS: en el espacio de personaje la espalda
            // es -Z (el personaje mira a +Z). Sin este desplazamiento la capa
            // cae por delante del pecho, que es donde no lleva ninguna.
            const back = this.back != null ? this.back : 0.07;
            for (let i = 0; i < this.pinned.length; i++) {
                const t = this.pinned.length > 1 ? i / (this.pinned.length - 1) : 0;
                movePin(this.cloth, this.pinned[i],
                    A[0] + (C[0] - A[0]) * t,
                    A[1] + (C[1] - A[1]) * t,
                    A[2] + (C[2] - A[2]) * t - back);
            }
        }

        // Colision contra el cuerpo, con la FK del frame actual.
        if (st) collidersFromRig(this.cloth, st, { chains: this.chains, margin: 0.02 });

        this.mesh.update(dt, this.env);

        // Las normales cada 3 frames: recalcularlas cada frame cuesta lo
        // mismo que la simulacion y el ojo no nota la diferencia en una tela
        // que se mueve de mas.
        if (++this._normTick >= this.normEvery) {
            this._normTick = 0;
            this.mesh.refreshNormals();
        }
        return this.mesh;
    }

    /** Rafaga de viento o golpe que echa la capa para atras. */
    gust(dir, power) {
        return gustCloth(this.cloth, dir, power);
    }

    setEnabled(on) { this.mesh.setEnabled(!!on); }

    dispose() { this.mesh.dispose(); }
}

export default { ClothMesh, Cape };