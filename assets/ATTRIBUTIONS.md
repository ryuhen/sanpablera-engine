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

## Modelos que NO se incluyen aqui y por que

- **Xbot / Soldier (three.js examples)**: son Mixamo. Adobe Mixamo deja usarlos
  en proyectos pero NO redistribuir el archivo, asi que meterlos en el
  repositorio seria una infraccion de licencia. Si quieres usarlos, bajalos
  tu a `assets/characters/` (esa carpeta ignora `*.glb.local`, ver
  `.gitignore`) y `BoneMap.js` ya trae los alias de Mixamo:
  `mixamorig:Hips` -> `PELVIS`, `mixamorig:LeftForeArm` -> `FOREARM_L`, etc.
- **Modelos de Quaternius o Kenney**: son CC0 y se podrian incluir sin
  problema, pero no hay ninguna descarga directa estable; cuando se metan,
  `BoneMap.js` tambien trae sus alias (`Hips`, `LeftUpLeg`, `LeftLeg`...).
