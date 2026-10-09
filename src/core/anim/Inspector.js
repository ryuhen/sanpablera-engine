/**
 * ============================================================================
 * SANPABLERA ENGINE · anim/Inspector.js
 * ----------------------------------------------------------------------------
 * EL INSPECTOR: el "cual te deja ver y tocar las animaciones" en el navegador.
 *
 * QUE ES Y QUE NO ES
 *   NO es un editor de animaciones con linea de tiempo. Aqui no hay clips que
 *   reproducir: cada pose se RESUELVE cada frame con IK a partir de una tabla
 *   de numeros (ver AttackPoses.js y HitReactions.js). No hay keyframes que
 *   arrastrar, asi que un editor de keyframes seria una caja negra.
 *
 *   Es un INSPECTOR DE POSES: eliges que quieres ver (que golpe, en que
 *   contexto, en que fotograma del golpe, que combinacion de reaccion), lo ves
 *   en 3D, y los numeros de esa fila salen como sliders que se mueven en vivo.
 *
 *   Analogia: no es una mesa de mezcla (un editor de clips), es un multimetro
 *   sobre la tabla de mixing. Mide y ajusta los numeros que hay.
 *
 * QUE HACE ESTE ARCHIVO Y QUE HACE EL ENGINE
 *   Aqui se RESUELVE la pose (el inspector llama al mismo `attackPoseFor` y
 *   `hitReactionPose` que el combate, y por eso lo que se ve es lo que se ve en
 *   partida, no una aproximacion). El engine solo hace tres cosas: parar a los
 *   peleadores,le pasa el modelo, y dejar que este pinte.
 *
 *   Esa separacion es lo que hace que el inspector pueda testearse: `pose()`
 *   y `lectura()` son funciones puras que devuelven numeros.
 *
 * QUE SE PUEDE EDITAR
 *   - Los OBJETIVOS de las 5 familias de golpe, en los 4 contextos.
 *     `ATTACK_SILHOUETTES.JAB.CROUCH.armL.active.2` = la z del punto de
 *     extension del jab agachado.
 *   - Las 9 filas de la matriz de reacciones
 *     (`HIT_REACTIONS.ALTO.FUERTE.recover` = cuanto tarda en recuperarse).
 *   - Las bases por contexto (cadera, guardia, inclinacion).
 *
 * QUE NO HACE (y por que)
 *   - No guarda en el repo. Vuelve a los ficheros como codigo (boton COPIAR),
 *     porque un ajuste de animacion es codigo y tiene que acabar en un commit.
 *   - No exporta clips .glb. El motor no los usa.
 *
 * EL CICLO QUE PROPONE
 *   1. Abrir con F2.
 *   2. Elegir golpe / fase / contexto.
 *   3. Mover un slider. Ver.
 *   4. Cuando este bien: COPIAR y pegar en `AttackPoses.js`.
 * ============================================================================
 */

import * as Overrides from './Overrides.js';
import { liveSilhouettes, silhouetteOf } from '../entities/AttackPoses.js';
import {
    liveReactions, groundAttackPose, wakeupPose
} from '../entities/HitReactions.js';
import { poseFor, flinchPose } from '../entities/FighterRig.js';
import { CORE_MOVES } from '../fsm/MoveTable.js';

const FAMILIES = ['JAB', 'GANCHO', 'UPPERCUT', 'KICK', 'SWEEP'];
const CONTEXTS = ['STAND', 'CROUCH', 'AIR', 'DOWN'];
const PHASES = ['STARTUP', 'ACTIVE', 'RECOVERY'];
const HEIGHTS = ['ALTO', 'MEDIO', 'BAJO'];
const POWERS = ['DEBIL', 'MEDIO', 'FUERTE'];
const GROUND_KINDS = ['PIE', 'MANOS', 'SALTAR', 'PESADO'];

/** Un golpe concreto de cada familia, para que la lista tenga nombres reales. */
const EJEMPLOS = {
    JAB: 'ATAQUE_LIGERO',
    GANCHO: 'GANCHO',
    UPPERCUT: 'UPPERCUT',
    KICK: 'ATAQUE_PESADO',
    SWEEP: 'ATAQUE_BARRIDO'
};

const STORE_KEY = 'sanpablera.anim.overrides';

// ===========================================================================
// LA POSE (puro: sin DOM, testeable)
// ===========================================================================

/**
 * Resuelve la pose de lo que se esta viendo, y devuelve tambien los numeros
 * que se leen en el panel (para el "esta el pie en el suelo").
 *
 * @param {object} model  { rig }
 * @param {object} view   el estado del inspector (kind, family, context, ...)
 * @returns {{pose, state, move, lectura}}
 */
export function pose(model, view) {
    const rig = model.rig;
    const t = Math.max(0, Math.min(1, view.t || 0));

    let res, move = null;

    if (view.kind === 'ATTACK') {
        // El frame data REAL del golpe. No se inventa: son los mismos numeros
        // que usa el combate, asi que el inspector no puede mentir sobre
        // cuantos frames dura el amago.
        move = CORE_MOVES[view.moveKey] || CORE_MOVES.ATAQUE_LIGERO;
        // Se llama a `poseFor` y NO a `attackPoseFor` directamente.
        //
        // POR QUE (es la decision de codigo mas importante de este archivo)
        //   `poseFor` es el camino que recorre el combate: el que decide el
        //   contexto, el que pasa la postura de base y el que aplica los
        //   overrides. Si aqui se llamara a `attackPoseFor`, el inspector
        //   enseñaria SU version del golpe, que es la de hoy; en cuanto el
        //   combate anadiera un matiz (una correccion de estilo, un
        //   acompanamiento, un ajuste de moveset), el inspector seguiria
        //   enseñando la suya y dejaria de servir para lo unico que sirve:
        //   comprobar que lo que se ve aqui es lo que sale en la partida.
        //
        //   Se replica el `snap` que arma la entidad (entities/FighterEntity.js)
        //   con el contexto IMPUESTO, que es lo unico que el inspector cambia:
        //   en combate el contexto sale del estado y aqui se elige a mano, para
        //   poder ver el jab agachado con el peleador de pie.
        res = poseFor(rig, {
            phase: 'GROUND',
            groups: ['ATTACKING'],
            context: view.context,
            attack: view.moveKey,
            attackPhase: view.phase,
            attackT: t
        }, {});

    } else if (view.kind === 'REACTION') {
        // Un golpe de mentira con la altura y la potencia que se han elegido.
        // El resto (hitstun, knockback) da igual para la pose; lo que decide
        // la fila de la matriz son solo esos dos.
        move = {
            key: 'DEBUG', label: 'Inspector', state: 0, phase: 'GROUND',
            startup: 4, active: 3, recovery: 12, duration: 19,
            damage: 10, hitstun: 20, blockstun: 0,
            hitLevel: view.power === 'FUERTE' ? 'FUERTE' : 'MEDIO',
            power: view.power, height: view.height,
            type: 'LINEAL', breaksGuardHeight: 'ALTA',
            knockdown: 'NONE', launch: { x: 0, y: 0 }, juggleAdd: 0,
            hitstop: 6, radius: 0.5, forward: 0.5,
            hitbox: { radius: 0.5, forward: 0.5, centerY: 1.1 }
        };
        res = flinchPose(rig, view.power, { move, t });

    } else if (view.kind === 'GROUND') {
        move = { key: view.groundKind, startup: 8, active: 4, recovery: 20, duration: 32 };
        res = groundAttackPose(rig, view.groundKind, view.phase, t, {});

    } else {
        // WAKEUP: los mismos frames que la levantada de la FSM (14 y 22).
        move = { key: 'wakeup', startup: 0, active: 0, recovery: 14, duration: 14 };
        res = wakeupPose(rig, t, { orientation: 'PIES_A_RIVAL', axis: 180 }, {});
    }

    return {
        pose: res.pose, state: res.state, move,
        lectura: lectura(res.state, view),
        alcance: alcanceDe(res.state, objetivoDeLaVista(view, model), alcanceDelModelo(model))
    };
}

/**
 * El objetivo que se esta viendo AHORA (el de la fase elegida), tal cual esta
 * en la tabla. Es lo que hay que comparar con el alcance real.
 */
export function objetivoDeLaVista(view, model) {
    if (view.kind !== 'ATTACK') return null;
    const T = liveSilhouettes();
    const sil = T[view.family] || T.JAB;
    const fila = sil[view.context] || sil.STAND;
    const K = fila.armL || fila.legL;
    if (!K) return null;
    return K[view.phase === 'ACTIVE' ? 'active'
        : view.phase === 'STARTUP' ? 'startup' : 'active'] || null;
}

/**
 * Cuanto alcanza el brazo del modelo del inspector.
 *
 * POR QUE SE MIDE Y NO SE ADIVINA
 *   El alcance depende de los huesos del .glb que se haya cargado: con un
 *   modelo distinto el brazo es mas largo o mas corto y el aviso cambiaria. Un
 *   numero escrito en el inspector mentiria en cuanto se cambie de modelo.
 *
 * @returns {number|null} metros, o null si el modelo no da bones
 */
export function alcanceDelModelo(model) {
    const rig = model && model.rig;
    if (!rig || !rig.bones || !rig.index) return null;
    const u = rig.index.UPPERARM_L, f = rig.index.FOREARM_L;
    if (u === undefined || f === undefined) return null;
    const L1 = rig.bones[u] && rig.bones[u].length;
    const L2 = rig.bones[f] && rig.bones[f].length;
    if (!(L1 > 1e-5) || !(L2 > 1e-5)) return null;
    return L1 + L2;
}

/**
 * Los numeros que un humano puede mirar de un vistazo.
 *
 * POR QUE `groundY` SOLO CUANDO PROCEDE
 *   En el aire no hay suelo bajo los pies, asi que avisar de "el pie flota" no
 *   tiene sentido. Es tambien el aviso mas util del inspector: una postura
 * *   agachada* que no apoya el pie, o un golpe que mete el pie bajo tierra.
 */
export function lectura(state, view) {
    const p = state.p || {};
    const at = (b, i) => (p[b] && typeof p[b][i] === 'number') ? p[b][i] : null;
    // El "pie" que importa es el de APOYO: el que va detras en un golpe de
    // pierna y el delantero en el resto. Se mira el mas bajo de los dos, que es
    // el que tiene que estar en el suelo.
    const piesY = [at('TOE_L', 1), at('TOE_R', 1)].filter((y) => y !== null);
    const pieY = piesY.length ? Math.min.apply(null, piesY) : null;
    const airborne = view.kind === 'AIR' || (view.context === 'AIR' && view.kind === 'ATTACK');
    return {
        hipY: at('PELVIS', 1),
        handY: at('HAND_L', 1),
        handZ: at('HAND_L', 2),
        footY: pieY,
        footZ: at('TOE_L', 2),
        headY: at('HEAD', 1),
        headZ: at('HEAD', 2),
        // El suelo solo existe cuando hay suelo de verdad.
        groundY: airborne ? null : 0,
        // Y lo que hace falta para el aviso de alcance (ver `alcanceDe`).
        shoulder: [at('UPPERARM_L', 0), at('UPPERARM_L', 1), at('UPPERARM_L', 2)],
        armReach: view.reach || null
    };
}

/**
 * How much the limb is missing compared to what the table asks for.
 *
 * POR QUE ESTE AVISO ES EL MAS IMPORTANTE DEL PANEL
 *   El IK recorta en silencio lo que no alcanza (cine/Rig.js). Un objetivo a
 *   40 cm mas lejos del hombro que el brazo no da error, no se avisa y se ve
 *   casi igual: el brazo se estira entero y ya. Lo unico que se nota es que el
 *   slider deja de responder al final de su recorrido, que es el sintoma mas
 *   dificil de diagnosticar que hay ("el slider esta roto").
 *
 *   Aqui se mide la distancia REAL del hombro a la mano y se compara con la
 *   que pide la tabla. Si la diferencia es notable, el objetivo no se puede
 *   alcanzar con este cuerpo y hay que bajarlo.
 *
 * @returns {{faltan:number, pedido:number, real:number}|null}
 */
export function alcanceDe(state, objetivo, alcance) {
    if (!objetivo || typeof alcance !== 'number') return null;
    const p = state.p || {};
    const raiz = p.UPPERARM_L;
    const mano = p.HAND_L;
    if (!raiz || !mano) return null;
    const pedido = Math.hypot(
        objetivo[0] - raiz[0], objetivo[1] - raiz[1], objetivo[2] - raiz[2]);
    const real = Math.hypot(mano[0] - raiz[0], mano[1] - raiz[1], mano[2] - raiz[2]);
    return { faltan: pedido - alcance, pedido, real };
}

/**
 * La parte de la tabla que se esta viendo, con su prefijo. Null si la vista no
 * tiene numeros (WAKEUP y los golpes de suelo se ajustan por codigo).
 */
export function filaDeLaVista(view) {
    if (view.kind === 'ATTACK') {
        const T = liveSilhouettes();
        const sil = T[view.family] || T.JAB;
        return {
            tabla: 'ATTACK_SILHOUETTES',
            raiz: sil[view.context] || sil.STAND,
            nota: 'la extension de la vista depende tambien de ' +
                'ATTACK_BASES.' + view.context
        };
    }
    if (view.kind === 'REACTION') {
        const T = liveReactions();
        const alto = T[view.height] || T.MEDIO;
        return {
            tabla: 'HIT_REACTIONS',
            raiz: alto[view.power] || alto.MEDIO,
            nota: ''
        };
    }
    return null;
}

// ===========================================================================
// LA INTERFAZ
// ===========================================================================

export class AnimInspector {
    /**
     * @param {object} opts
     *   model   { rig, applyPose(pose, state), place(x, z, facing) }
     *   onApply   (res) => void  se llama con la pose ya resuelta
     *   onClose   () => void
     *   onZoom    (delta) => void  acerca (+) o aleja (-) la camara
     */
    constructor(opts) {
        this.model = opts.model;
        this.onApply = opts.onApply || null;
        this.onClose = opts.onClose || null;
        this.onZoom = opts.onZoom || null;

        this.view = {
            kind: 'ATTACK',
            family: 'JAB',
            moveKey: EJEMPLOS.JAB,
            context: 'STAND',
            phase: 'ACTIVE',
            t: 1,
            height: 'ALTO',
            power: 'MEDIO',
            groundKind: 'PIE'
        };
        this.playing = false;
        this.speed = 1;
        // Fuente de verdad del estado abierto/cerrado. Arranca cerrado, y el
        // DOM tambien (lo pone `_buildDOM`). No se llama a `close()` aqui
        // porque eso dispararia `onClose` durante el arranque, que soltaria el
        // router del teclado antes de que hubiera nada que soltar.
        this.abierto = false;

        this._buildDOM();
        this._wire();
    }

    // =====================================================================
    /**
     * ¿Esta abierto? Lo consulta el bucle del engine en CADA frame.
     *
     * POR QUE HAY UN CAMPO ADEMAS DE MIRAR EL ESTILO
     *   `style.display` es la verdad de lo que se ve, pero depende de que nadie
     *   haya tocado ese estilo por fuera. Con un atributo `hidden` del HTML, o
     *   con una regla de CSS que gane en especificidad, el panel se ve mientras
     *   esta "cerrado": el bucle congelaria el combate sin que haya nada en
     *   pantalla, que es el peor fallo posible de este panel (el juego se
     *   queda congelado y no se ve por que).
     *
     *   Con `this.abierto` como fuente de verdad, el bucle y el panel no pueden
     *   desincronizarse; el estilo es solo la consecuencia.
     */
    isOpen() {
        return this.abierto === true;
    }

    open() {
        this.abierto = true;
        this.el.style.display = '';
        this.el.removeAttribute('hidden');
        this.refresh();
        this.apply();
    }

    close() {
        this.abierto = false;
        this.el.style.display = 'none';
        this.el.setAttribute('hidden', '');
        this.playing = false;
        if (this.onClose) this.onClose();
    }

    toggle() {
        if (this.isOpen()) this.close(); else this.open();
    }

    togglePlay() {
        this.playing = !this.playing;
        this.$('spf-play').textContent = this.playing ? '❚❚' : '▶';
    }

    /**
     * Un frame del inspector: avanza el scrubber si toca y escribe la pose.
     * Lo llama el bucle del engine mientras el inspector esta abierto.
     */
    tick(dt) {
        if (!this.isOpen()) return;
        if (this.playing) {
            this.view.t += dt * this.speed * 1.2;
            if (this.view.t > 1) this.view.t -= 1;
            this._syncT();
        }
        this.apply();
    }

    /** Resuelve la pose de la vista actual y la escribe en el modelo. */
    apply() {
        const res = pose(this.model, this.view);
        if (this.model.applyPose) this.model.applyPose(res.pose, res.state);
        this._renderLectura(res.lectura);
        this._renderAlcance(res.alcance);
        if (this.onApply) this.onApply(res);
        return res;
    }

    // =====================================================================
    _buildDOM() {
        const el = document.createElement('div');
        el.className = 'spf-insp';
        // POR QUE EL PANEL NO OCUPA TODA LA PANTALLA
        //   El inspector existe para VER la pose en 3D mientras se tocan sus
        //   numeros. Un panel a pantalla completa taparia al peleador y dejaria
        //   un formulario: seria un editor de numeros, no de animaciones.
        //
        //   Se coloca en el lateral izquierdo y la escena se ve a la derecha,
        //   con el canvas por debajo (transparente, sin fondo propio). La
        //   camara no se toca, asi que el luchador sale en el centro de la
        //   pantalla, un poco tapado: por eso el ancho es de 420 px y no mas.
        el.innerHTML = `
<div class="spf-insp-head">
  <span class="spf-insp-title">INSPECTOR DE ANIMACIONES</span>
  <button class="spf-insp-x" id="spf-close" title="Cerrar (F2)">x</button>
</div>
<div class="spf-insp-hint">
  F2 cierra · espacio reproduce · rueda sobre un slider lo ajusta ·
  ctrl+rueda acerca la camara
</div>
<div class="spf-insp-body">
  <div class="spf-insp-col spf-insp-sel">
    <div class="spf-insp-sec">QUE VER</div>
    <div class="spf-tabs" id="spf-kind"></div>
    <div id="spf-opts"></div>
    <div class="spf-insp-sec">TIMELINE DEL GOLPE</div>
    <div class="spf-frames" id="spf-frames"></div>
    <div class="spf-insp-sec">LECTURA</div>
    <div class="spf-read" id="spf-read"></div>
    <div id="spf-alcance"></div>
  </div>
  <div class="spf-insp-col spf-insp-mid">
    <div class="spf-insp-sec">REPRODUCIR</div>
    <div class="spf-transport">
      <button id="spf-play">&#9654;</button>
      <input type="range" id="spf-t" min="0" max="1" step="0.005" value="1">
      <span id="spf-tv">100%</span>
    </div>
    <div class="spf-insp-sec">AJUSTES <span id="spf-nota" class="spf-nota"></span></div>
    <div class="spf-sliders" id="spf-sliders"></div>
  </div>
</div>
<div class="spf-insp-foot">
  <button id="spf-copy" class="spf-insp-btn">COPIAR PARA EL CODIGO</button>
  <button id="spf-copy-json" class="spf-insp-btn">COPIAR JSON</button>
  <button id="spf-save" class="spf-insp-btn">GUARDAR</button>
  <button id="spf-load" class="spf-insp-btn">CARGAR</button>
  <button id="spf-reset" class="spf-insp-btn spf-insp-warn">DESCARTAR</button>
  <span id="spf-count" class="spf-insp-count"></span>
</div>`;
        document.body.appendChild(el);
        this.el = el;
        this.$ = (id) => el.querySelector('#' + id);
        // Oculto de las dos maneras (estilo y atributo), porque `isOpen()` usa un
        // campo propio y estos dos tienen que estar de acuerdo con el.
        this.el.style.display = 'none';
        this.el.setAttribute('hidden', '');

        if (!document.getElementById('spf-insp-style')) {
            const s = document.createElement('style');
            s.id = 'spf-insp-style';
            s.textContent = CSS;
            document.head.appendChild(s);
        }

        // La rueda sobre un slider lo mueve un paso. Sin esto, ajustar el
        // numero exacto es imposible con un raton: hay que acertar el pixel.
        this.$('spf-sliders').addEventListener('wheel', (e) => {
            const r = e.target;
            if (!r.classList || !r.classList.contains('spf-rng')) return;
            e.preventDefault();
            const min = Number(r.min), max = Number(r.max);
            const paso = Number(r.step) * (e.deltaY > 0 ? -1 : 1);
            const v = Math.max(min, Math.min(max, Number(r.value) + paso));
            r.value = String(v);
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, { passive: false });

        // El resto de la rueda (sobre la escena) acerca la camara, con ctrl.
        //
        // POR QUE CTRL Y NO RUEDA A SECO
        //   La rueda suelta sobre el canvas ya la usa el juego para acercar y
        //   alejar (el bucle de camara). Si el panel se comiera la rueda sin
        //   modificador, el inspector dejaria de poderTE mover la camara al
        //   Peleador, y sin zoom no se comprueba si un jab llega a la altura
        //   de la cara. Con ctrl el juego lo pasa porque ya es suyo: aqui se
        //   reenvia a la camara a proposito.
        this.el.addEventListener('wheel', (e) => {
            if (e.target.classList && e.target.classList.contains('spf-rng')) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            if (this.onZoom) this.onZoom(delta);
        }, { passive: false });
    }

    _wire() {
        this.$('spf-close').addEventListener('click', () => this.close());
        this.$('spf-play').addEventListener('click', () => this.togglePlay());

        // --- atajos de teclado -----------------------------------------
        //
        // POR QUE ESTAN AQUI Y NO EN EL LISTENER GLOBAL DEL ENGINE
        //   Un input[type=range] con el foco ya se mueve con las flechas, y el
        //   espacio en un <button> ya lo pulsa. Si el engine escuchara tambien,
        //   los atajos se dispararian dos veces: el play arrancaba y se paraba
        //   en el mismo frame, que es un fallo que parece aleatorio.
        //
        //   Por eso el panel se queda con lo suyo (y detiene la propagacion
        //   para que el combate no lo vea) y el engine solo gestiona F2.
        window.addEventListener('keydown', (e) => {
            if (!this.isOpen()) return;
            if (e.code === 'Space') {
                // Solo si el foco NO esta en un control: si el usuario esta
                // moviendo un slider con las flechas, el espacio no debe
                // arrancar la reproduccion.
                const activo = document.activeElement;
                const enControl = activo && (activo.tagName === 'INPUT'
                    || activo.tagName === 'BUTTON' || activo.tagName === 'SELECT');
                if (enControl) return;
                e.preventDefault();
                e.stopPropagation();
                this.togglePlay();
            }
        });
        this.$('spf-t').addEventListener('input', (e) => {
            this.view.t = Number(e.target.value);
            this.playing = false;
            this.$('spf-play').textContent = '▶';
            this._syncT();
            this.apply();
        });
        this.$('spf-copy').addEventListener('click', () => {
            const txt = Overrides.exportAsSource(
                '// Ajustado con el INSPECTOR (F2). Pega esto dentro del bloque.');
            this._copiar(txt, 'copiado');
        });
        this.$('spf-copy-json').addEventListener('click', () => {
            this._copiar(JSON.stringify(Overrides.exportPatch(), null, 2), 'json copiado');
        });
        this.$('spf-save').addEventListener('click', () => {
            localStorage.setItem(STORE_KEY, JSON.stringify(Overrides.exportPatch()));
            this._flash('guardado en este navegador');
        });
        this.$('spf-load').addEventListener('click', () => {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) { this._flash('no hay nada guardado'); return; }
            try {
                Overrides.applyPatch(JSON.parse(raw));
                this._flash('cargado');
                this.refresh();
            } catch (e) { this._flash('el JSON guardado esta malo'); }
        });
        this.$('spf-reset').addEventListener('click', () => {
            const n = Overrides.overrideCount();
            Overrides.clearAll();
            this._flash(n ? 'descartados ' + n : 'no habia nada');
            this.refresh();
        });
    }

    _copiar(texto, msg) {
        // El portapapeles moderno pide permiso: si falla, se cae al metodo
        // viejo, que siempre funciona en un contexto de usuario (un click).
        const fin = () => this._flash(msg);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(fin, () => this._copiarViejo(texto, fin));
        } else {
            this._copiarViejo(texto, fin);
        }
    }

    _copiarViejo(texto, fin) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* nada */ }
        document.body.removeChild(ta);
        fin();
    }

    // =====================================================================
    refresh() {
        this._renderKindTabs();
        this._renderOpts();
        this._renderFrames();
        this._renderSliders();
        this._renderCount();
        this._syncT();
    }

    _renderKindTabs() {
        const cont = this.$('spf-kind');
        cont.innerHTML = '';
        for (const [k, label] of [
            ['ATTACK', 'GOLPE'], ['REACTION', 'REACCION'],
            ['GROUND', 'SUELO'], ['WAKEUP', 'LEVANTADA']
        ]) {
            const b = document.createElement('button');
            b.className = 'spf-tab' + (this.view.kind === k ? ' on' : '');
            b.textContent = label;
            b.addEventListener('click', () => {
                this.view.kind = k;
                this.view.t = 1;
                this.refresh();
                this.apply();
            });
            cont.appendChild(b);
        }
    }

    _renderOpts() {
        const cont = this.$('spf-opts');
        cont.innerHTML = '';
        const v = this.view;

        const fila = (label, opciones, actual, alCambiar) => {
            const d = document.createElement('div');
            d.className = 'spf-fila';
            const l = document.createElement('span');
            l.className = 'spf-lab';
            l.textContent = label;
            d.appendChild(l);
            const g = document.createElement('div');
            g.className = 'spf-group';
            for (const o of opciones) {
                const b = document.createElement('button');
                b.className = 'spf-chip' + (o === actual ? ' on' : '');
                b.textContent = o;
                b.addEventListener('click', () => { alCambiar(o); this.refresh(); this.apply(); });
                g.appendChild(b);
            }
            d.appendChild(g);
            cont.appendChild(d);
        };

        if (v.kind === 'ATTACK') {
            fila('FAMILIA', FAMILIES, v.family, (x) => {
                v.family = x; v.moveKey = EJEMPLOS[x];
            });
            fila('CONTEXTO', CONTEXTS, v.context, (x) => { v.context = x; });
            fila('FASE', PHASES, v.phase, (x) => { v.phase = x; v.t = 1; });
            const sil = silhouetteOf(v.moveKey);
            if (sil !== v.family) {
                cont.appendChild(this._aviso(
                    `${v.moveKey} usa la silueta ${sil}, no ${v.family}. ` +
                    'Los sliders salen de ' + sil + '.'));
            }
        } else if (v.kind === 'REACTION') {
            fila('ALTURA', HEIGHTS, v.height, (x) => { v.height = x; });
            fila('POTENCIA', POWERS, v.power, (x) => { v.power = x; });
        } else if (v.kind === 'GROUND') {
            fila('GOLPE', GROUND_KINDS, v.groundKind, (x) => { v.groundKind = x; });
            fila('FASE', PHASES, v.phase, (x) => { v.phase = x; v.t = 1; });
            cont.appendChild(this._aviso(
                'Los golpes contra el suelo estan en funciones de HitReactions.js ' +
                '(los objetivos de pie y mano estan ahi dentro, no en una tabla). ' +
                'Se ajustan por codigo.'));
        } else {
            cont.appendChild(this._aviso(
                'La levantada va del suelo a la guardia. Arrastra el scrubber para ' +
                'ver el apoyo en el codo y el despliegue.'));
        }
    }

    _aviso(txt) {
        const d = document.createElement('div');
        d.className = 'spf-nota';
        d.textContent = txt;
        return d;
    }

    /**
     * El scrubber va de 0 a 1 dentro de la FASE, no dentro del golpe entero.
     * Por eso el scrubber tiene que advances dentro del tramo, y por eso hay
     * que decir cuanto dura cada tramo en frames.
     */
    _renderFrames() {
        const cont = this.$('spf-frames');
        const m = CORE_MOVES[this.view.moveKey];
        if (this.view.kind !== 'ATTACK' || !m) {
            cont.innerHTML = '<div class="spf-vacio">sin timeline: el scrubber va dentro de la fase</div>';
            return;
        }
        const s = m.startup, a = m.active, r = m.recovery;
        cont.innerHTML = '';
        const seg = (etiqueta, largo, fase, color) => {
            const d = document.createElement('div');
            d.className = 'spf-fr';
            d.style.flexGrow = String(largo);
            d.style.background = color;
            d.textContent = etiqueta + ' ' + largo;
            d.title = fase + ': frames ' + largo + ' a 60 Hz';
            d.addEventListener('click', () => {
                this.view.phase = fase;
                this.view.t = 0.5;
                this.refresh();
                this.apply();
            });
            cont.appendChild(d);
        };
        seg('AMAGO', s, 'STARTUP', '#7a8bb5');
        seg('ACTIVO', a, 'ACTIVE', '#f2de8c');
        seg('RECOGIDA', r, 'RECOVERY', '#5f7a5f');
    }

    /**
     * Los sliders se GENERAN recorriendo la tabla con `numericPaths`, no
     * escritos a mano. Motivo: escritos a mano se olvidan en cuanto se anade un
     * campo, y un campo sin slider es un campo que hay que ajustar editando el
     * fichero, que es justo lo que este inspector viene a evitar.
     */
    _renderSliders() {
        const cont = this.$('spf-sliders');
        cont.innerHTML = '';
        const f = filaDeLaVista(this.view);
        const nota = this.$('spf-nota');

        if (!f || !f.raiz) {
            nota.textContent = '';
            cont.innerHTML = '<div class="spf-vacio">esta vista no tiene numeros que ajustar ' +
                '(se edita en el fichero de origen)</div>';
            return;
        }
        nota.textContent = f.nota ? '· ' + f.nota : '';

        const rutas = Overrides.numericPaths(f.raiz);
        if (!rutas.length) {
            cont.innerHTML = '<div class="spf-vacio">esta fila no tiene numeros</div>';
            return;
        }

        for (const r of rutas) {
            const path = f.tabla + '.' + r;
            const rango = Overrides.rangeFor(r);
            const valor = Overrides.readPath(f.raiz, r);
            if (typeof valor !== 'number') continue;

            const fila = document.createElement('div');
            fila.className = 'spf-sl' + (Overrides.overrideAt(path) !== undefined ? ' mod' : '');

            const lab = document.createElement('div');
            lab.className = 'spf-sl-lab';
            lab.textContent = r;
            lab.title = path + (rango.soft ? '\n(rango de referencia: el valor puede salirse)' : '');

            const rng = document.createElement('input');
            rng.className = 'spf-rng';
            rng.type = 'range';
            rng.min = String(rango.min);
            rng.max = String(rango.max);
            rng.step = String(rango.step);
            rng.value = String(valor);

            const num = document.createElement('input');
            num.className = 'spf-sl-num';
            num.type = 'number';
            num.step = String(rango.step);
            num.value = String(valor);

            const uni = document.createElement('span');
            uni.className = 'spf-sl-uni';
            uni.textContent = rango.unit || '';

            const reset = document.createElement('button');
            reset.className = 'spf-sl-x';
            reset.textContent = '↺';
            reset.title = 'volver al valor del fichero';
            reset.addEventListener('click', () => {
                Overrides.clearOverride(path);
                this.refresh();
                this.apply();
            });

            const set = (val) => {
                const n = Number(val);
                if (!Number.isFinite(n)) return;
                Overrides.setOverride(path, n);
                num.value = String(n);
                rng.value = String(n);
                fila.classList.add('mod');
                this._renderCount();
                this.apply();   // en vivo: esto es lo que hace util al inspector
            };
            rng.addEventListener('input', (e) => set(e.target.value));
            num.addEventListener('change', (e) => set(e.target.value));

            fila.appendChild(lab);
            fila.appendChild(rng);
            fila.appendChild(num);
            fila.appendChild(uni);
            fila.appendChild(reset);
            cont.appendChild(fila);
        }
    }

    _renderLectura(d) {
        const cont = this.$('spf-read');
        if (!d) { cont.innerHTML = '<div class="spf-vacio">-</div>'; return; }
        const n = (x) => (typeof x === 'number' && isFinite(x)) ? x.toFixed(2) : '-';
        let html = '';
        const rd = (a, b) => { html += `<div class="spf-rd"><span>${a}</span><b>${b}</b></div>`; };
        rd('cadera', n(d.hipY) + ' m');
        rd('mano izq', n(d.handY) + ' m · ' + n(d.handZ) + ' m');
        rd('cabeza', n(d.headY) + ' m · ' + n(d.headZ) + ' m');
        rd('pie', n(d.footY) + ' m · ' + n(d.footZ) + ' m');
        if (d.groundY != null && typeof d.footY === 'number') {
            const dif = d.footY - d.groundY;
            const cls = Math.abs(dif) < 0.06 ? 'ok' : (Math.abs(dif) < 0.15 ? 'warn' : 'bad');
            const txt = Math.abs(dif) < 0.06 ? 'en el suelo'
                : (dif > 0 ? 'flotando ' : 'enterrado ') + Math.abs(dif).toFixed(2) + ' m';
            html += `<div class="spf-rd ${cls}"><span>suelo</span><b>${txt}</b></div>`;
        }
        cont.innerHTML = html;
    }

    /**
     * EL AVISO DE ALCANCE.
     *
     * Es el aviso mas importante del panel, y no porelpared decorative: sin el,
     * mover un slider de extension mas alla del alcance del brazo no cambia
     * NADA en pantalla y parece que el inspector esta roto. Con el, se ve por
     * que.
     */
    _renderAlcance(a) {
        const cont = this.$('spf-alcance');
        if (!cont) return;
        if (!a) { cont.innerHTML = ''; return; }
        if (a.faltan <= 0.01) {
            cont.innerHTML = '<div class="spf-rd ok"><span>alcance</span><b>alcanzable</b></div>';
            return;
        }
        cont.innerHTML =
            '<div class="spf-rd bad"><span>alcance</span><b>falta ' +
            a.faltan.toFixed(2) + ' m</b></div>' +
            '<div class="spf-alc-nota">El objetivo pide ' + a.pedido.toFixed(2) +
            ' m desde el hombro y el brazo mide ' + a.real.toFixed(2) +
            ' m. El IK recorta en silencio: baja el objetivo del slider o no se movera nada.</div>';
    }

    _renderCount() {
        const n = Overrides.overrideCount();
        this.$('spf-count').textContent = n
            ? n + ' ajuste' + (n === 1 ? '' : 's') + ' SIN volcar al codigo'
            : 'sin ajustes';
        this.$('spf-count').className = 'spf-insp-count' + (n ? ' on' : '');
    }

    _syncT() {
        this.$('spf-t').value = String(this.view.t);
        this.$('spf-tv').textContent = Math.round(this.view.t * 100) + '%';
    }

    _flash(msg) {
        const c = this.$('spf-count');
        c.textContent = msg;
        c.classList.add('flash');
        clearTimeout(this._flashT);
        this._flashT = setTimeout(() => {
            c.classList.remove('flash');
            this._renderCount();
        }, 1400);
    }
}

// ===========================================================================
// CSS
// ===========================================================================
const CSS = `
/* El panel va en el LATERAL IZQUIERDO, no a pantalla completa: la escena 3D
   tiene que quedarse a la vista, que es el motivo de que exista. El fondo es
   opaco solo en las columnas; el marco no lo es, para no cortar al luchador. */
.spf-insp{position:fixed;left:0;top:0;bottom:0;width:420px;z-index:130;
 display:flex;flex-direction:column;pointer-events:auto;
 background:rgba(9,11,17,.92);backdrop-filter:blur(2px);
 border-right:2px solid #4d8cff;
 color:#e8e8ee;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.spf-insp[hidden]{display:none}
.spf-insp-head{display:flex;align-items:center;gap:14px;padding:8px 12px;
 background:#141824;border-bottom:1px solid #262c3d;flex:0 0 auto}
.spf-insp-hint{padding:4px 12px;background:#0e121c;color:#6d7490;font-size:9px;
 border-bottom:1px solid #1d2333;flex:0 0 auto}
.spf-insp-title{font-weight:800;letter-spacing:3px;font-size:12px;color:#f2de8c}
.spf-insp-x{margin-left:auto;background:#232838;color:#e8e8ee;border:1px solid #3a4258;
 border-radius:4px;width:26px;height:26px;cursor:pointer;font:inherit}
.spf-insp-x:hover{background:#3a1f22;border-color:#a33}
.spf-insp-body{flex:1;display:flex;min-height:0}
.spf-insp-col{overflow-y:auto;padding:10px 12px;min-height:0}
.spf-insp-sel{flex:0 0 auto;border-bottom:1px solid #262c3d;max-height:47%}
.spf-insp-mid{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.spf-insp-sec{font-size:10px;letter-spacing:2px;color:#7d84a3;margin:8px 0 4px;
 text-transform:uppercase;border-bottom:1px solid #20263a;padding-bottom:2px}
.spf-nota{color:#5a617a;letter-spacing:0;text-transform:none;font-size:9px}
.spf-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.spf-tab{font:inherit;font-size:10px;letter-spacing:1px;padding:5px 8px;cursor:pointer;
 background:#1a1f2c;color:#9aa1bd;border:1px solid #2c3346;border-radius:4px}
.spf-tab.on{background:#f2de8c;color:#141824;font-weight:700;border-color:#8f7a2a}
.spf-tab:hover{border-color:#4d8cff}
.spf-fila{display:flex;align-items:flex-start;gap:6px;margin-bottom:6px}
.spf-lab{flex:0 0 56px;color:#8c93ad;font-size:10px;padding-top:4px;letter-spacing:1px}
.spf-group{display:flex;gap:3px;flex-wrap:wrap}
.spf-chip{font:inherit;font-size:10px;padding:3px 6px;cursor:pointer;background:#1a1f2c;
 color:#9aa1bd;border:1px solid #2c3346;border-radius:3px}
.spf-chip.on{background:#2a3550;color:#e8e8ee;border-color:#4d8cff}
.spf-nota-box{font-size:9px;color:#f2de8c;background:#1c1a12;border-left:3px solid #f2de8c;
 padding:6px 8px;margin:6px 0;line-height:1.5}
.spf-vacio{color:#5a617a;font-size:10px;padding:8px;font-style:italic}
.spf-transport{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.spf-transport button{background:#232838;color:#e8e8ee;border:1px solid #3a4258;
 border-radius:4px;width:32px;height:26px;cursor:pointer;font:inherit}
#spf-t{flex:1;accent-color:#4d8cff}
#spf-tv{color:#8c93ad;font-size:10px;width:38px;text-align:right}
.spf-frames{display:flex;gap:2px;height:22px;flex:0 0 auto}
.spf-fr{display:flex;align-items:center;justify-content:center;font-size:9px;
 border-radius:3px;cursor:pointer;color:#0f1219;font-weight:700;overflow:hidden;
 white-space:nowrap}
.spf-fr:hover{filter:brightness(1.25)}
.spf-read{flex:0 0 auto;display:flex;flex-direction:column;gap:2px}
.spf-rd{display:flex;justify-content:space-between;font-size:10px;padding:2px 6px;
 background:#141824;border-radius:3px;border-left:3px solid #2c3346;gap:8px}
.spf-rd span{color:#7d84a3}.spf-rd b{color:#dfe2ee;font-weight:500}
.spf-rd.ok{border-left-color:#4caf7d}.spf-rd.ok b{color:#7fe0a0}
.spf-rd.warn{border-left-color:#f2de8c}.spf-rd.warn b{color:#f2de8c}
.spf-rd.bad{border-left-color:#d0534f}.spf-rd.bad b{color:#ff8b85}
.spf-alc-nota{font-size:9px;line-height:1.5;color:#ff8b85;background:#1f1214;
 border-left:3px solid #d0534f;padding:6px 8px;margin:2px 0 6px}
.spf-sliders{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.spf-sl{display:grid;grid-template-columns:132px 1fr 58px 16px 20px;gap:5px;
 align-items:center;padding:3px 5px;background:#141824;border-radius:3px;
 border-left:3px solid transparent}
.spf-sl.mod{border-left-color:#f2de8c;background:#1c1a12}
.spf-sl-lab{color:#8c93ad;font-size:10px;overflow:hidden;text-overflow:ellipsis;
 white-space:nowrap}
.spf-rng{width:100%;accent-color:#4d8cff;height:16px}
.spf-sl-num{width:100%;background:#0f1219;color:#dfe2ee;border:1px solid #2c3346;
 border-radius:3px;padding:2px 4px;font:inherit;font-size:10px;text-align:right}
.spf-sl-uni{color:#5a617a;font-size:9px}
.spf-sl-x{background:none;border:none;color:#5a617a;cursor:pointer;font-size:11px;
 padding:0}
.spf-sl-x:hover{color:#f2de8c}
.spf-insp-foot{display:flex;gap:5px;align-items:center;padding:7px 10px;
 background:#141824;border-top:1px solid #262c3d;flex:0 0 auto;flex-wrap:wrap}
.spf-insp-count{color:#7d84a3;font-size:10px;flex:1 0 100%}
.spf-insp-btn{font:inherit;font-size:10px;letter-spacing:1px;padding:5px 10px;
 cursor:pointer;background:#232838;color:#e8e8ee;border:1px solid #3a4258;border-radius:4px}
.spf-insp-btn:hover{background:#2a3145;border-color:#4d8cff}
.spf-insp-btn.spf-insp-warn:hover{border-color:#d0534f;color:#ff8b85}
.spf-insp-count.on{color:#f2de8c;font-weight:700}
.spf-insp-count.flash{color:#7fe0a0}`;

export default AnimInspector;