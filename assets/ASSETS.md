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

Estado actual: **carga, el rig mapea 21/21 y la postura sale correcta.**
Pendiente de confirmar a ojo en el navegador (ver abajo).

Lo que ya esta resuelto:

| Problema | Como se resolvio |
|---|---|
| Faltaban `SPINE`, `CHEST`, `NECK` | 4 alias nuevos en `BoneMap.js` (`spine_01`, `spine_03`, `neck_01`) |
| `PELVIS` mapeaba a `root` en vez de a `pelvis` | reordenados los alias: el especifico gana al generico |
| El personaje salia tumbado | `pickRootFix` prueba `Z_UP` y `Y_UP` y se queda con el que deja la cadena coherente |
| Media 2,19 m en vez de 1,80 m | la escala sale de la altura de la MALLA, no de la distancia entre huesos |
| Dos `.png` que faltan (404) | el `.gltf` de Quaternius apunta a nombres que no existen en el zip |
| **El peleador salia hecho una bola** | el `rootFix` se aplicaba dos veces (ver abajo) |

### La bola: el rootFix contado dos veces

No era `Stances.js`, ni las longitudes que espera el IK, ni el mapeo: el
esqueleto era correcto todo el rato. El fallo estaba en el PUENTE
(`render/CharacterModel.js`), y por eso solo se veía con este modelo.

El `.gltf` de Quaternius mete un nodo `root` por encima de la pelvis con un giro
de **90 grados sobre X**, que es exactamente el `rootFix 'Z_UP'` que el rig
aplica. `applyPose` escribia el local del hueso raiz con el `rootFix` ya dentro
(`Z_UP * localT`) y Babylon componia encima ese nodo `root`, asi que el giro se
sumaba dos veces: la pelvis acababa a **1,34 m** de donde el rig creia, tumbada
contra una malla de pie. De ahi el aspecto de bola.

`wrapperTransform()` mide ahora el envoltorio acumulado del archivo por encima
del hueso raiz y `applyPose` lo neutraliza con su inversa antes de escribir. Con
eso la pelvis cae donde el rig dice, con error 0,0000 m.

El mannequin de Khronos nunca lo noto porque su cadena (`Z_UP -> Armature`) es
identidad: el bug solo puede aparecer con un archivo que traiga su propia
correccion de eje. Es exactamente lo que fija el bloque
`Puente rig->Babylon` de `tests/cine.smoke.mjs`.

### Lo que falta

Mirarlo en el navegador. Los numeros ahora cuadran, pero un personaje puede
medir bien y verse mal. Hasta que no se vea de pie y con los pies en el suelo,
el mannequin sigue siendo el modelo por defecto.

## El maniqui de piezas (sin asset)

```
http://localhost:8080/?piezas=1
```

No es un asset: es un humanoide de capsulas, cajas y esferas colgadas de los
huesos DEL CONTRATO (`src/render/PartMannequin.js`), y se puede superponer al
`.glb` que se este probando. Sirve para dos cosas:

1. **Comprobar la animacion sin depender de una malla.** Como las piezas cuelgan
   del contrato y no de los nombres del archivo, la silueta es siempre la misma:
   lo que se ve es la animacion, no el modelo. Es la forma mas rapida de
   comprobar que el jab agachado llega mas abajo que el de pie, que en el aire
   los pies no se clavan, o que la capa cuelga bien.
2. **Tener dos peleadores distinguibles.** Las piezas se tiñen con el color del
   peleador y dejan manos y cabeza mas claras, que es lo que hace legible de
   quien es quien a tres metros. Un peleador mas corpulento es una tabla de
   medidas distinta, no un `.glb` distinto.

Las medidas viven en `PART_TABLE` (que pieza cuelga de que hueso) y
`PART_SIZES` (sus radios). Cambiar una es cambiar el maniqui entero.

## Al meter un modelo nuevo, la lista de comprobacion

1. `npm test` en verde. `tests/cine.smoke.mjs` verifica los dos modelos reales
   del repo; si tocas `BoneMap.js`, `Rig.js` o `CharacterModel.js`, ese es el
   que te avisa.
2. Que `buildBoneMap` no reporte huesos en `missing`. Los 21 del CONTRATO
   tienen que estar.
3. Que la cadena salga coherente: cabeza por encima de la pelvis, y los pies por
   debajo. Si sale al reves, el archivo va en el otro eje.
4. Que la altura final sea `CFG.CHARACTER_HEIGHT` (1,80 m).
5. **Que el envoltorio del archivo este contemplado.** Si por encima del
   hueso raiz hay nodos intermedios con giro (Armature, root, Z_UP...), el
   `rootFix` se cuenta dos veces. `wrapperTransform()` lo mide y `applyPose` lo
   neutraliza, pero conviene saber que ese nodo existe.
6. **Que las piezas (si se usan) sigan en su sitio.** Con `?piezas=1` las
   piezas se cuelgan de los huesos del CONTRATO. Si el modelo no trae alguno (el
   mannequin no tiene `TOE_L/R`), su fila se salta — y como antes se emparejaba
   por indice sobre la tabla de entrada, eso descuadraba todas las siguientes.
   `tests/render.smoke.mjs` lo comprueba con un esqueleto al que le faltan dos
   huesos.
7. Mirarlo en el navegador. Los numeros pueden ir bien y aun asi verse mal.
