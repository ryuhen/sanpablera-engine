import { load } from './tests/loader.mjs';
const SPF = (await load('src/core/fsm/Constants.js')).default;
const Cat = await load('src/core/fsm/StateCatalog.js');
await load('src/core/fsm/states/index.js');
const all = Cat.allStates();
console.log('total estados', all.length);
for (const s of all) {
  console.log([String(s.id).padStart(4), (s.name||'').padEnd(30), (s.tag||'').padEnd(12), (s.groups||[]).join(','), s.posture&&s.posture.limbs].join(' | '));
}
