/**
 * ============================================================================
 * SANPABLERA ENGINE · core/economy/economy.js
 * ----------------------------------------------------------------------------
 * DOBLE MONEDA, RENTAS E INACTIVIDAD (Biblia Apex Primal, seccion 6).
 *
 * QUE HAY AQUI
 * ----------------------------------------------------------------------------
 *   - Cobre: moneda virtual que se gana y se gasta DENTRO del juego.
 *   - Diamante: moneda de platino. Solo entra de fuera (compra real); el
 *     motor nunca la fabrica. Esa asimetria es a proposito: si el codigo
 *     pudiera crear Diamante, no habria economia.
 *   - Renta e impuestos: un cargo periodico en Cobre que alimenta un fondo
 *     de infraestructura. Es el papel del "servidor" sin tener un servidor.
 *   - Protocolo de inactividad: aviso -> archivo en frio -> desalojo, con
 *     recuperacion al reingresar. Los dias se miden con un reloj inyectado
 *     para que sea testeable en Node.
 *
 * QUE NO HAY (Y POR QUE)
 * ----------------------------------------------------------------------------
 *   No hay `fetch` a Supabase ni login de Google. Sin credenciales no se
 *   puede hablar con esos servicios, y fingirlo seria peor que no hacerlo.
 *   Lo que hay es la CAPA DE DATOS que un adapter real tendria que usar:
 *   `createVault(storage)` recibe un objeto con `getItem`/`setItem` y guarda
 *   texto compacto. Cambiar localStorage por Supabase es cambiar el adapter,
 *   no este modulo.
 * ============================================================================
 */

export const CURRENCY = Object.freeze({
    COBRE: 'COBRE',
    DIAMANTE: 'DIAMANTE'
});

export const CURRENCY_LIST = Object.freeze([CURRENCY.COBRE, CURRENCY.DIAMANTE]);

/** Estados del protocolo de inactividad, en orden de severidad. */
export const ACTIVITY = Object.freeze({
    ACTIVO: 'ACTIVO',
    AVISADO: 'AVISADO',
    ARCHIVADO: 'ARCHIVADO',
    DESALOJADO: 'DESALOJADO'
});

/** 24 h en milisegundos. Se declara para no repetir 86400000 por el archivo. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Plazos por defecto. El aviso llega ANTES del desalojo: es la parte que el
 * PDF exige explicitamente ("avisos por correo antes de desalojar").
 */
export const DEFAULT_INACTIVITY = Object.freeze({
    avisoDias: 30,
    archivoDias: 45,
    desalojoDias: 60
});

const MAX_DIAMANTE = 1_000_000;

/**
 * Monedero de un jugador. `lastSeen` es un numero de epoch-ms.
 * `property` es el nombre de la propiedad que se pierde en el desalojo.
 */
export function createWallet(opts = {}) {
    const now = opts.now || 0;
    return {
        id: opts.id || 'jugador',
        provider: opts.provider || 'LOCAL',   // LOCAL | GOOGLE (solo etiqueta)
        account: opts.account || null,        // id del proveedor, sin secreto
        email: opts.email || null,            // a donde iria el aviso real
        property: opts.property || 'Casa de Caribe',
        saldo: { COBRE: opts.cobre || 0, DIAMANTE: opts.diamante || 0 },
        lastSeen: now,
        avisos: [],
        fondo: 0,                             // Cobre recaudado para servidores
        estado: ACTIVITY.ACTIVO,
        archivo: null                         // texto en frio, si se archivo
    };
}

function assertCurrency(currency) {
    if (!CURRENCY_LIST.includes(currency)) {
        throw new Error('[economia] moneda desconocida: ' + currency);
    }
}

function assertAmount(amount) {
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('[economia] importe invalido: ' + amount);
    }
}

/** Ingresa moneda. El Diamante NUNCA se fabrica aqui: se declara al crear. */
export function credit(wallet, currency, amount, reason = '') {
    assertCurrency(currency);
    assertAmount(amount);
    if (currency === CURRENCY.DIAMANTE) {
        throw new Error('[economia] el Diamante no se genera dentro del motor');
    }
    wallet.saldo[currency] += amount;
    return wallet.saldo[currency];
}

/** Gasta moneda. Devuelve false si no hay suficiente; nunca deja saldo negativo. */
export function debit(wallet, currency, amount, reason = '') {
    assertCurrency(currency);
    assertAmount(amount);
    if (wallet.saldo[currency] < amount) return false;
    wallet.saldo[currency] -= amount;
    return true;
}

/**
 * Renta + impuestos. El cargo se hace en Cobre y va a `fondo`, que es la
 * contabilidad de la infraestructura. Si no alcanza, no se cobra nada a medias.
 */
export function settleFees(wallet, fees = {}) {
    const renta = fees.renta || 0;
    const impuestos = fees.impuestos || 0;
    const total = renta + impuestos;
    if (total === 0) return { ok: true, cobrado: 0 };
    if (!debit(wallet, CURRENCY.COBRE, total, 'renta e impuestos')) {
        return { ok: false, cobrado: 0, falta: total - wallet.saldo.COBRE };
    }
    wallet.fondo += total;
    return { ok: true, cobrado: total };
}

/** Registra actividad. Es lo que retrasa el reloj de inactividad. */
export function touch(wallet, now) {
    wallet.lastSeen = now;
    if (wallet.estado === ACTIVITY.AVISADO ||
        wallet.estado === ACTIVITY.ARCHIVADO ||
        wallet.estado === ACTIVITY.DESALOJADO) {
        wallet.estado = ACTIVITY.ACTIVO;
    }
    wallet.archivo = null;
    return wallet.estado;
}

/**
 * Calcula el estado que DEBERIA tener el monedero en `now` y lo aplica.
 * Devuelve la lista de transiciones ocurridas en esta llamada, para que la UI
 * pueda mostrar el aviso exacto una sola vez.
 */
export function advanceActivity(wallet, now, rules = DEFAULT_INACTIVITY) {
    const dias = Math.max(0, (now - wallet.lastSeen) / DAY_MS);
    const cambios = [];
    const poner = (estado) => {
        if (wallet.estado === estado) return;
        wallet.estado = estado;
        cambios.push(estado);
    };

    if (dias >= rules.desalojoDias) {
        poner(ACTIVITY.DESALOJADO);
        return cambios;
    }
    if (dias >= rules.archivoDias) {
        if (wallet.archivo === null) wallet.archivo = serialize(wallet);
        poner(ACTIVITY.ARCHIVADO);
        return cambios;
    }
    if (dias >= rules.avisoDias) {
        if (!wallet.avisos.includes('inactividad')) wallet.avisos.push('inactividad');
        poner(ACTIVITY.AVISADO);
        return cambios;
    }
    poner(ACTIVITY.ACTIVO);
    return cambios;
}

/**
 * Recupera una propiedad archivada al reingresar. El texto en frio se conserva
 * en `recuperado` para que se vea que la cuenta volvio de ese archivo.
 */
export function restore(wallet, now) {
    if (!wallet.archivo) return { ok: false, motivo: 'no hay archivo' };
    const recuperado = wallet.archivo;
    wallet.recuperado = recuperado;
    touch(wallet, now);
    return { ok: true, texto: recuperado };
}

/** Serializacion compacta: es lo que se guardaria en Supabase (kilobytes). */
export function serialize(wallet) {
    return JSON.stringify({
        v: 1,
        id: wallet.id,
        p: wallet.provider,
        a: wallet.account,
        e: wallet.email,
        pr: wallet.property,
        c: wallet.saldo.COBRE,
        d: wallet.saldo.DIAMANTE,
        t: wallet.lastSeen,
        f: wallet.fondo,
        s: wallet.estado,
        w: wallet.avisos
    });
}

/** Lee un texto serializado. Nunca confia en que el numero sea valido. */
export function deserialize(text) {
    const o = JSON.parse(text);
    if (!o || o.v !== 1) throw new Error('[economia] version de monedero desconocida');
    const w = createWallet({
        id: o.id, provider: o.p, account: o.a, email: o.e, property: o.pr,
        cobre: num(o.c), diamante: Math.min(MAX_DIAMANTE, num(o.d)), now: num(o.t)
    });
    w.fondo = num(o.f);
    w.estado = Object.values(ACTIVITY).includes(o.s) ? o.s : ACTIVITY.ACTIVO;
    w.avisos = Array.isArray(o.w) ? o.w.filter((x) => typeof x === 'string') : [];
    return w;
}

function num(x) {
    return Number.isFinite(x) && x >= 0 ? x : 0;
}

/**
 * Adapter de persistencia. `storage` puede ser localStorage o cualquier
 * objeto con getItem/setItem (un stub de Supabase en los tests).
 */
export function createVault(storage, key = 'sanpablera.economia.v1') {
    return {
        key,
        load() {
            const texto = storage.getItem(key);
            return texto ? deserialize(texto) : null;
        },
        save(wallet) {
            storage.setItem(key, serialize(wallet));
            return wallet;
        },
        clear() { storage.setItem(key, ''); }
    };
}

/** Vincula una cuenta externa. Solo guarda la ETIQUETA: no hay OAuth aqui. */
export function linkAccount(wallet, provider, accountId, email = null) {
    if (provider !== 'LOCAL' && provider !== 'GOOGLE') {
        throw new Error('[economia] proveedor desconocido: ' + provider);
    }
    wallet.provider = provider;
    wallet.account = accountId;
    wallet.email = email;
    return wallet;
}

export default {
    CURRENCY, CURRENCY_LIST, ACTIVITY, DAY_MS, DEFAULT_INACTIVITY,
    createWallet, credit, debit, settleFees, touch, advanceActivity,
    restore, serialize, deserialize, createVault, linkAccount
};
