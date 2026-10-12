import { load } from './tests/loader.mjs';
const Cat = await load('src/core/fsm/StateCatalog.js');
await load('src/core/fsm/states/index.js');
const B = await load('src/core/anim/ClipBoard.js');
const L = await load('src/core/anim/ClipLibrary.js');
const bib = L.crearBiblioteca({ locoPose:()=>({rot:{},pos:{}}), attackPose:()=>({rot:{},pos:{}}), stancePoseFn:()=>({rot:{},pos:{}}) });
const usados = new Set();
for (const s of Cat.allStates())
  usados.add(B.resolver({ id: s.id, groups: s.groups, posture: s.posture, loco: 'IDLE', move: 'ATAQUE_LIGERO' }).clip);
for (const l of Object.keys(B.CLIP_DE_LOCO)) usados.add(B.CLIP_DE_LOCO[l]);
for (const g of ['ATAQUE_LIGERO','ATAQUE_PESADO','ATAQUE_ESPECIAL','ATAQUE_AEREO','ATAQUE_AGACHADO','ATAQUE_BARRIDO','GANCHO','GOLPE_CODO','UPPERCUT','EMBESTIDA','DERIBO'])
  usados.add(B.clipDeGolpe(g));
const faltan = [...usados].filter(n => !L.tieneClip(bib, n)).sort();
console.log('el tablero pide', usados.size, 'clips; la biblioteca tiene', L.nombres(bib).length);
console.log('FALTAN', faltan.length, ':');
console.log(faltan.join(' '));
