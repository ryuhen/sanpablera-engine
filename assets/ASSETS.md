# Modelos de peleador

## Como cambiar de modelo

El motor lee el modelo desde `MODEL_URL` (`src/core/Engine.js`). Para probar
otro sin tocar el codigo, se pasa por la URL:

```
http://localhost:8080/?modelo=assets/characters/mannequin.glb
```

El valor es una ruta **relativa a la raiz del repo**, sin la barra inicial.

## Los que hay

### `mannequin.glb` · el de por defecto

Khronos "Rigged Figure", CC BY 4.0, 19 huesos, 1.867 vertices. Es el modelo con
el que esta construido y probado el motor: `tests/cine.smoke.mjs` lo verifica
contra el archivo real. **Funciona**: postura de combate,pies plantados, IK de
cadera y piernas, y se mueve con el teclado.

### `quaternius-superhero-male/` · CC0, 21 huesos, 13k triangulos

Estado actual: **carga y el rig mapea 21/21, pero la postura procedural todavia
NO se aplica bien.** El peleador sale hecho una bola.

Lo que ya esta resuelto para que llegue hasta aqui:

| Problema | Como se resolvio |
|---|---|
| Faltaban `SPINE`, `CHEST`, `NECK` | 4 alias nuevos en `BoneMap.js` (`spine_01`, `spine_03`, `neck_01`) |
| `PELVIS` mapeaba a `root` en vez de a `pelvis` | reordenados los alias: el especifico gana al generico |
| El personaje salia tumbado | `pickRootFix` prueba `Z_UP` y `Y_UP` y se queda con el que deja la cadena coherente |
| Media 2,19 m en vez de 1,80 m | la escala sale de la altura de la MALLA, no de la distancia entre huesos |
| Dos `.png` que faltan (404) | el `.gltf` de Quaternius apunta a nombres que no existen en el zip |

Lo que queda: el `stancePose` de `src/core/cine/Stances.js` clava los pies con
`placeFoot` y compensa la cadera, y da un resultado decente con la
proporcion del mannequin pero no con esta. El esqueleto es correcto (la cadena
va pelvis 0,94 -> cabeza 1,48, y sube), asi que el problema esta en las
longitudes de hueso que espera el IK, no en el mapeo.

Por eso el modelo **no** es el de por defecto. No se cambia hasta que la
postura se vea bien.

## Al meter un modelo nuevo, la lista de comprobacion

1. `npm test` en verde. `tests/cine.smoke.mjs` verifica el mannequin real; si
   tocas `BoneMap.js` o `Rig.js`, ese es el que te avisa.
2. Que `buildBoneMap` no reporte huesos en `missing`. Los 21 del CONTRATO
   tienen que estar.
3. Que la cadena salga coherente: cabeza por encima de la pelvis, y los pies por
   debajo. Si sale al reves, el archivo va en el otro eje.
4. Que la altura final sea `CFG.CHARACTER_HEIGHT` (1,80 m).
5. Mirarlo en el navegador. Los numeros pueden ir bien y aun asi verse mal.
