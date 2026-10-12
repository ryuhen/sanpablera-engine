import { load } from './tests/loader.mjs';
const SPF = (await load('src/core/fsm/Constants.js')).default;
const Cat = await load('src/core/fsm/StateCatalog.js');
await load('src/core/fsm/states/index.js');
const B = await load('src/core/anim/ClipBoard.js');
const all = Cat.allStates();
const usados = new Set(); const huerfanos = [];
for (const s of all) {
  const r = B.resolver({ id: s.id, groups: s.groups, posture: s.posture, loco: 'IDLE', move: 'ATAQUE_LIGERO' });
  usados.add(r.clip);
  if (r.origen === 'REPOSO' && r.clip === 'idle' && s.tag !== 'BASE') huerfanos.push(s.name + ' -> ' + r.clip + ' (' + r.origen + ')');
}
console.log('estados', all.length);
console.log('clips distintos que salen del tablero:', usados.size);
console.log('estados que caen al idle por no tener fila:', huerfanos.length ? huerfanos : '(ninguno)');
console.log('\nsample:');
for (const s of [all.find(x=>x.name==='GOLPEADO'), all.find(x=>x.name==='ATAQUE_LIGERO'), all.find(x=>x.name==='NORMAL_A'), all.find(x=>x.name==='AGARRE_TORI_PIE'), all.find(x=>x.name==='PECHO_TIERRA')]) {
  const r = B.resolver({ id: s.id, groups: s.groups, posture: s.posture, loco: 'WALK', move: 'GANCHO' });
  console.log('  ' + s.name.padEnd(24) + ' -> ' + r.clip.padEnd(18) + r.origen);
}
console.log('\nclipPorGolpe:');
for (const g of ['ATAQUE_LIGERO','ATAQUE_PESADO','GANCHO','PATADA_SPIN_IZQ','BARRIDO_DER','PUNO_AEREO_ADELANTE_DER','PATADA_BAJA_ALTA_IZQ','UPPERCUT','EMBESTIDA','NOPE'])
  console.log('  ' + g.padEnd(24) + ' -> ' + B.clipDeGolpe(g) + '  [' + B.familiaDe(g) + ']');
