/**
 * ============================================================================
 * SANPABLERA ENGINE · tests/economy.smoke.mjs
 * ----------------------------------------------------------------------------
 * Doble moneda, rentas y protocolo de inactividad (PDF seccion 6).
 * Modulo PURO: reloj y almacenamiento se inyectan, asi que no hay DOM, red
 * ni localStorage real. Es la unica forma de probar los 60 dias sin esperarlos.
 * ============================================================================
 */
import { load } from './loader.mjs';

let passed = 0;
const failed = [];
function check(name, cond, extra) {
    if (cond) { passed++; console.log('  ok   ' + name); return; }
    const msg = name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '');
    failed.push(msg);
    console.log('  FAIL ' + msg);
}
function section(t) { console.log('\n' + t); }

const E = await load('src/core/economy/economy.js');

section('1 · Las dos monedas no son intercambiables');
{
    const w = E.createWallet({ id: 'ana', now: 0 });
    check('arranca en cero', w.saldo.COBRE === 0 && w.saldo.DIAMANTE === 0, w.saldo);
    E.credit(w, E.CURRENCY.COBRE, 120, 'ganar pelea');
    check('el Cobre se gana jugando', w.saldo.COBRE === 120, w.saldo.COBRE);
    let lanzo = false;
    try { E.credit(w, E.CURRENCY.DIAMANTE, 10); } catch (_) { lanzo = true; }
    check('el motor NO fabrica Diamante', lanzo);
    check('el intento fallido no cambio el saldo', w.saldo.DIAMANTE === 0, w.saldo.DIAMANTE);
    const d = E.createWallet({ diamante: 5 });
    check('el Diamante solo entra al crear el monedero', d.saldo.DIAMANTE === 5, d.saldo.DIAMANTE);
    check('gastar de mas no deja saldo negativo', E.debit(w, E.CURRENCY.COBRE, 999) === false && w.saldo.COBRE === 120, w.saldo.COBRE);
    check('gastar justo si funciona', E.debit(w, E.CURRENCY.COBRE, 120) === true && w.saldo.COBRE === 0);
    let monedaMala = false;
    try { E.credit(w, 'BITCOIN', 1); } catch (_) { monedaMala = true; }
    check('una moneda inventada se rechaza', monedaMala);
}

section('2 · Renta e impuestos alimentan el fondo de servidores');
{
    const w = E.createWallet({ cobre: 100 });
    const r = E.settleFees(w, { renta: 20, impuestos: 5 });
    check('se cobra todo junto', r.ok && r.cobrado === 25, r);
    check('el jugador se queda con 75', w.saldo.COBRE === 75, w.saldo.COBRE);
    check('y el fondo recibe 25', w.fondo === 25, w.fondo);
    const pobre = E.createWallet({ cobre: 3 });
    const r2 = E.settleFees(pobre, { renta: 20, impuestos: 5 });
    check('sin dinero no se cobra a medias', r2.ok === false && pobre.saldo.COBRE === 3, pobre.saldo.COBRE);
    check('y avisa de lo que falta', r2.falta === 22, r2);
    check('el fondo no crece con un cobro fallido', pobre.fondo === 0, pobre.fondo);
}

section('3 · Inactividad: aviso, archivo en frio, desalojo');
{
    const d = E.DAY_MS;
    const w = E.createWallet({ id: 'juan', property: 'Casa de Caribe', now: 0 });

    check('al dia 29 sigue activo', E.advanceActivity(w, 29 * d).length === 0 && w.estado === E.ACTIVITY.ACTIVO, w.estado);

    const aviso = E.advanceActivity(w, 30 * d);
    check('al dia 30 se avisa', aviso.includes(E.ACTIVITY.AVISADO) && w.estado === E.ACTIVITY.AVISADO, aviso);
    check('y se registra el aviso una sola vez', w.avisos.filter((a) => a === 'inactividad').length === 1, w.avisos);
    E.advanceActivity(w, 31 * d);
    check('no se duplica el aviso al dia siguiente', w.avisos.filter((a) => a === 'inactividad').length === 1, w.avisos);

    const archivo = E.advanceActivity(w, 45 * d);
    check('al dia 45 se archiva', archivo.includes(E.ACTIVITY.ARCHIVADO), archivo);
    check('el archivo es texto y contiene la propiedad', typeof w.archivo === 'string' && w.archivo.includes('Casa de Caribe'), w.archivo);

    const desalojo = E.advanceActivity(w, 60 * d);
    check('al dia 60 se desaloja', desalojo.includes(E.ACTIVITY.DESALOJADO) && w.estado === E.ACTIVITY.DESALOJADO, desalojo);

    const r = E.restore(w, 61 * d);
    check('reingresar recupera el archivo', r.ok && typeof r.texto === 'string', r);
    check('y devuelve la cuenta a activa', w.estado === E.ACTIVITY.ACTIVO, w.estado);
}

section('4 · Tocar la cuenta reinicia el reloj');
{
    const d = E.DAY_MS;
    const w = E.createWallet({ now: 0 });
    E.advanceActivity(w, 50 * d);
    check('antes de tocar esta archivada', w.estado === E.ACTIVITY.ARCHIVADO, w.estado);
    E.touch(w, 50 * d);
    check('touch la devuelve a activa', w.estado === E.ACTIVITY.ACTIVO, w.estado);
    check('y borra el archivo en frio', w.archivo === null, w.archivo);
    check('con el reloj nuevo no hay aviso', E.advanceActivity(w, 51 * d).length === 0);
}

section('5 · Archivo de texto ultraligero y adapter de guardado');
{
    const w = E.createWallet({ id: 'maria', provider: 'GOOGLE', account: 'g-123', email: 'm@x.com', cobre: 777, diamante: 2, now: 1234 });
    const texto = E.serialize(w);
    check('el texto es compacto', texto.length < 300, texto.length);
    const copia = E.deserialize(texto);
    check('el id sobrevive', copia.id === 'maria', copia.id);
    check('el proveedor sobrevive', copia.provider === 'GOOGLE', copia.provider);
    check('el Cobre sobrevive', copia.saldo.COBRE === 777, copia.saldo.COBRE);
    check('el Diamante sobrevive', copia.saldo.DIAMANTE === 2, copia.saldo.DIAMANTE);
    check('epoch sobrevive', copia.lastSeen === 1234, copia.lastSeen);

    let versionMala = false;
    try { E.deserialize('{"v":99}'); } catch (_) { versionMala = true; }
    check('una version futura se rechaza', versionMala);

    const datos = Object.create(null);
    const storage = {
        getItem(k) { return datos[k] === undefined ? null : datos[k]; },
        setItem(k, v) { datos[k] = String(v); }
    };
    const vault = E.createVault(storage);
    check('el vault arranca vacio', vault.load() === null);
    vault.save(w);
    check('guarda bajo su clave', typeof datos['sanpablera.economia.v1'] === 'string');
    check('y vuelve a cargar el mismo monedero', vault.load().saldo.COBRE === 777);
    vault.clear();
    check('clear deja el guardado vacio', vault.load() === null);
}

section('6 · Vinculacion de cuenta (etiqueta, sin OAuth falso)');
{
    const w = E.createWallet();
    E.linkAccount(w, 'GOOGLE', 'g-999', 'ana@x.com');
    check('se marca el proveedor', w.provider === 'GOOGLE', w.provider);
    check('se guarda el correo para el aviso', w.email === 'ana@x.com', w.email);
    let malo = false;
    try { E.linkAccount(w, 'FACEBOOK', 'x'); } catch (_) { malo = true; }
    check('un proveedor inventado se rechaza', malo);
}

console.log('\n' + '='.repeat(64));
if (failed.length) {
    console.log('FALLOS (' + failed.length + '):');
    for (const f of failed) console.log('  - ' + f);
}
console.log('\n' + passed + ' comprobaciones, ' + failed.length + ' fallos');
process.exit(failed.length ? 1 : 0);
