# Creditos de los assets de terceros

## characters/mannequin.glb

| Campo | Valor |
|---|---|
| Archivo | `assets/characters/mannequin.glb` |
| Origen | Khronos glTF Sample Assets · modelo "Rigged Figure" (antes CesiumMan) |
| Descarga | `https://github.com/KhronosGroup/glTF-Sample-Assets` → `Models/RiggedFigure/glTF-Binary/RiggedFigure.glb` |
| Autoria | Copyright 2017 Cesium / Analytical Graphics, Inc. |
| Licencia | **CC BY 4.0** (Creative Commons Attribution 4.0 International) |
| Uso | Se puede usar y modificar, incluso comercialmente. Obliga a dar credito. |

Que cambia este proyecto respecto al original:

- Se carga por `src/render/CharacterModel.js` con una rotacion de raiz de
  -90 grados en X, porque el archivo esta en Z-up (verificado: sin esa
  rotacion el personaje esta tumbado).
- Se normaliza la escala para que mida `CFG.CHARACTER_HEIGHT` (1,80 m).
- Se mapean sus huesos al CONTRATO del rig del proyecto (PELVIS, CHEST,
  HEAD, UPPERARM_L...) en `src/render/BoneMap.js`. Los nombres originales
  (`torso_joint_1`, `leg_joint_L_2`...) no se tocan en el archivo.

Atribucion requerida por CC BY 4.0:

> "Rigged Figure" (antes CesiumMan) - Copyright 2017 Cesium - CC BY 4.0 -
> https://github.com/KhronosGroup/glTF-Sample-Assets

---

## characters/quaternius-superhero-male/

| Campo | Valor |
|---|---|
| Carpeta | `assets/characters/quaternius-superhero-male/` |
| Origen | Quaternius · pack "Universal Base Characters" (edicion Standard) |
| Descarga | `https://quaternius.itch.io/universal-base-characters` (gratis, sin cuenta) |
| Autoria | Quaternius (c) laulhet@gmail.com |
| Licencia | **CC0 1.0** (dominio publico) |
| Uso | Libre en proyectos personales, educativos y comerciales. Sin atribucion obligatoria. |

Ficheros: `Superhero_Male_FullBody.gltf` + `.bin` + 7 texturas PNG. 13k triangulos.

Se corrigieron dos URIs dentro del `.gltf`: el export de Quaternius apunta a
`T_Hair_1_Normal_png.png` y `T_Eye_Normal_png.png`, ficheros que no vienen en
el zip (se llaman sin el sufijo `_png`). Sin ese arreglo faltan dos texturas y
el navegador pide dos 404.

---

## Modelos que NO se incluyen aqui y por que

- **Xbot / Soldier (three.js examples)**: son Mixamo. Adobe Mixamo deja usarlos
  en proyectos pero NO redistribuir el archivo, asi que meterlos en el
  repositorio seria una infraccion de licencia. Si quieres usarlos, bajalos
  tu a `assets/characters/` (esa carpeta ignora `*.glb.local`, ver
  `.gitignore`) y `BoneMap.js` ya trae los alias de Mixamo:
  `mixamorig:Hips` -> `PELVIS`, `mixamorig:LeftForeArm` -> `FOREARM_L`, etc.
- **Kenney y otros CC0**: `BoneMap.js` ya trae sus alias (`Hips`, `LeftUpLeg`,
  `LeftLeg`...). Cuando se metan, anadir el bloque de creditos aqui arriba.
