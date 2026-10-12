/**
 * ============================================================================
 * SANPABLERA ENGINE · render/ClipGrabber.js
 * ----------------------------------------------------------------------------
 * TRAE LOS ARCHIVOS .glb Y LOS CONVIERTE EN POSES DEL MOTOR.
 * ============================================================================
 *
 * QUE HACE Y POR QUE ESTA SEPARADO DE `core/anim/`
 * ----------------------------------------------------------------------------
 *   `core/anim/` es puro por una razon que no es estetica: `tests/` carga esos
 *   modulos en Node con `tests/loader.mjs`, que no tiene `fetch` ni Babylon.
 *   Un modulo de core que hiciera red no se podria probar. Este hace red, asi
 *   que vive en `render/`, que es donde ya vive todo lo que necesita el motor.
 *
 *   Lo que hace, en este orden:
 *
 *     1. trae el esqueleto (`_rig-human.glb`) y saca el `BoneMap` de el. El
 *        mapa se hace con el ESQUELETO, no con el clip: asi vale para todos los
 *        archivos, que estan hechos sobre el mismo rig.
 *     2. trae cada .glb una vez y lo pasa por `GlbClip.crearClip`, que lo deja
 *        con sus pistas ya apuntando a los huesos DEL CONTRATO.
 *     3. `pose(clip, t)` devuelve la Pose en el instante `t`.
 *
 * POR QUE EL PERSONAJE TIENE QUE SER EL DE ESTE MISMO RIG
 * ----------------------------------------------------------------------------
 *   Un .glb guarda rotaciones ABSOLUTAS y el motor compose DELTAS sobre el
 *   reposo del MODELO (ver `GlbClip.js`). Si el peleador fuera el maniqui de
 *   Khronos, sus huesos en reposo serian otros y el delta daria un cuerpo
 *   descuadrado: los clips se verian, pero de lado. Por eso `Engine` pone de
 *   serie el maniqui del rig, y este modulo avisa si no es el que toca.
 *
 * CUANDO FALLA UN ARCHIVO
 * ----------------------------------------------------------------------------
 *   Un clip que no se puede traer NO tumba el juego: se marca como ausente y
 *   el motor cae a la postura procedural de ese estado. Perder el animacion de
 *   la rodada es malo; perder el arranque es peor.
 * ============================================================================
 */

import { partirGlb, crearClip, muestrear } from '../core/anim/GlbClip.js';
import { buildBoneMap } from './BoneMap.js';
import { RUTA, RIG, ARCHIVOS, archivoDe, nombresQueSePiden, CLIP_A_ARCHIVO, RESERVADO } from '../core/anim/ClipAssets.js';

/**
 * Trae un .glb y lo devuelve como { json, bin }.
 *
 * Se inyecta para poder probar el resto sin red: los tests pasan un lector de
 * memoria y este archivo entero se monta en Node sin tocar la red ni Babylon.
 *
 * @param {string} ruta
 * @param {function} [leer] `(url) => Promise<ArrayBuffer>`
 * @returns {Promise<{json: object, bin: Uint8Array}>}
 */
export async function traerGlb(ruta, leer) {
    const fetchFn = leer || ((url) => globalThis.fetch(url).then(r => {
        if (!r.ok) throw new Error(r.status + ' al traer ' + url);
        return r.arrayBuffer();
    }));
    const buf = await fetchFn(ruta);
    return partirGlb(buf);
}

/**
 * El almacen de clips grabados de UNA partida.
 *
 * Uno por partida, no por peleador: los archivos son los mismos para los dos y
 * traerlos dos veces seria tirar 2,6 MB de red. Lo que es por peleador es la
 * POSE de trabajo, que va en `ClipRunner`.
 */
export class ClipGrabber {
    constructor(opts = {}) {
        this.leer = opts.leer;
        this.ruta = opts.ruta || RUTA;

        /** nombre de archivo -> clip preparado, o `null` si no se pudo. */
        this.clips = Object.create(null);

        /** archivos que se pidieron y fallaron. Para el HUD de depuracion. */
        this.fallidos = [];

        /** El BoneMap del rig. Null hasta que se traiga. */
        this.boneIndex = null;

        /** true cuando todos los archivos estan listos. */
        this.listo = false;

        /** Nombres del rig, que hacen falta para el mapa. */
        this.nombresRig = [];
    }

    /**
     * Trae el esqueleto y el BoneMap. Va PRIMERO: sin el no se puede
     * preparar ningun clip, porque las pistas apuntan a los huesos del
     * contrato y el mapa es quien traduce los nombres.
     */
    async cargarRig() {
        const { json } = await traerGlb(this.ruta + '_rig-human.glb', this.leer);
        this.nombresRig = json.nodes.map(n => n.name);
        this.boneIndex = buildBoneMap(this.nombresRig);
        return this.boneIndex;
    }

    /**
     * Trae un archivo y lo deja preparado. Una sola vez: si ya se pidio y no
     * funciono, no se vuelve a pedir en cada frame.
     *
     * @param {string} nombre nombre SIN extension (`punch_jab`)
     * @returns {Promise<object|null>} el clip, o null si no se pudo
     */
    async cargar(nombre) {
        if (this.clips[nombre] !== undefined) return this.clips[nombre];
        if (!this.boneIndex) await this.cargarRig();
        try {
            const { json, bin } = await traerGlb(this.ruta + nombre + '.glb', this.leer);
            const clip = crearClip(json, bin, this.boneIndex, nombre);
            this.clips[nombre] = clip;
            return clip;
        } catch (err) {
            // Se guarda como null (y no se quita la clave) para no reintentar.
            this.clips[nombre] = null;
            this.fallidos.push(nombre + ': ' + (err && err.message ? err.message : err));
            return null;
        }
    }

    /**
     * Trae TODOS los archivos que el catalogo puede pedir.
     *
     * Se hace de golpe al arrancar la pelea y NO en el primer frame que los
     * pide: si no, el primer jab que salga haria esperar al juego mientras
     * descarga 100 KB, y eso se ve como un tirón.
     *
     * @returns {Promise<{traidos:number, fallos:number}>}
     */
    async cargarTodo() {
        if (!this.boneIndex) await this.cargarRig();

        // Los nombres salen del CATALOGO, no de la lista de archivos: lo que
        // se carga es lo que el tablero puede PEDIR, que es lo que importa.
        const claves = new Set();
        for (const v of Object.values(CLIP_A_ARCHIVO)) claves.add(v);
        for (const v of Object.values(RESERVADO)) claves.add(v);
        // Mas los que solo se usan puntualmente: el empujon, el aterrizaje, la
        // levantada y el arrodillado. No hace falta pedirlos por el tablero,
        // pero conviene tenerlos delante para no esperar red en mitad de una
        // pelea.
        for (const v of ['hit_knockback', 'jump_land', 'laytoidle', 'fixing_kneeling', 'chest_open']) {
            claves.add(v);
        }

        let traidos = 0;
        for (const nombre of claves) {
            if (await this.cargar(nombre)) traidos++;
        }
        this.listo = true;
        return { traidos, fallos: claves.size - traidos };
    }

    /** El clip de un nombre del tablero, o null si no hay animacion grabada. */
    de(clip) {
        const nombre = archivoDe(clip);
        if (!nombre) return null;
        return this.clips[nombre] || null;
    }

    /** ¿Este clip del tablero tiene animacion grabada? */
    tiene(clip) {
        return !!this.de(clip);
    }

    /** Resumen para el HUD de depuracion y los tests. */
    info() {
        const nombres = Object.keys(this.clips);
        const pedidos = new Set();
        for (const c of nombresQueSePiden()) pedidos.add(c);
        const sinPoder = [...pedidos].filter(c => !this.tiene(c));
        return {
            listo: this.listo,
            preparados: nombres.filter(n => this.clips[n]).length,
            ausentes: nombres.filter(n => !this.clips[n]),
            fallidos: this.fallidos.slice(),
            /** Los clips del tablero que NO tienen animacion grabada. */
            sinAnimacion: sinPoder
        };
    }
}

/**
 * LA POSE DE UN CLIP EN UN INSTANTE, PARA UN PELEADOR.
 *
 * Va por peleador (no por clip) porque cada uno lleva su propia Pose de
 * trabajo: `muestrear` escribe dentro, y si dos peleadores compartieran el
 * mismo objeto se pisarian en el mismo frame y se verian la pose del otro.
 *
 * Tambien es el que RESPETA el final del clip: un jab no vuelve a empezar solo
 * porque el jugador lo mantenga pulsado, y eso se decide aqui y no en el
 * lector de archivos, que no sabe nada de peleadores.
 */
export class ClipRunner {
    /**
     * @param {ClipGrabber} grabber
     * @param {object} pose  Pose de trabajo (`createPose()`)
     */
    constructor(grabber, pose) {
        this.grabber = grabber;

        // OJO CON EL NOMBRE: esto NO se llama `pose`. El metodo que devuelve la
        // pose del clip se llama `pose()`, y un campo de instancia con el
        // mismo nombre lo TAPA: `runner.pose` seria el objeto y `runner.pose()`
        // reventaria con "not a function". Es el error mas tonto que se puede
        // hacer en una clase y sale justo al final, en el navegador.
        this.poseTrabajo = pose;

        /** El clip que se esta viendo, por el identificador de mezcla. */
        this.actual = null;
        /** Ultimo resultado valido, para no devolver un null sin querer. */
        this.ultimaPose = null;
    }

    /**
     * La pose del clip en el instante `t`, o `null` si no hay animacion
     * grabada para ese nombre (y entonces el motor usa la postura procedural).
     *
     * @param {string} clip nombre del tablero
     * @param {number} t    segundos dentro del clip, yagilados por ClipPlayer
     * @returns {object|null} Pose, o null
     */
    pose(clip, t) {
        const c = this.grabber.de(clip);
        if (!c) { this.actual = null; return null; }
        this.actual = clip;

        // El archivo es el que dice si es CICLO. Si no lo es, el instante se
        // sujeta a la duracion: un jab se queda con el brazo estirado en vez de
        // volver a la guardia por su cuenta.
        const ficha = ARCHIVOS[archivoDe(clip)];
        const final = ficha && !ficha.loop ? Math.min(t, c.duracion) : t;

        const Pose = this.poseTrabajo;
        for (const k in Pose.rot) delete Pose.rot[k];
        for (const k in Pose.pos) delete Pose.pos[k];
        muestrear(c, final, Pose);
        this.ultimaPose = Pose;
        return Pose;
    }
}

export default { ClipGrabber, ClipRunner, traerGlb };