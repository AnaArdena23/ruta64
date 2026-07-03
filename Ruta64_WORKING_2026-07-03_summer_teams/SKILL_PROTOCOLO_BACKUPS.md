---
name: ruta64-backup-working-copy
description: imponer un flujo seguro de backup intocable y copia de trabajo para ruta 64. usar cuando se necesite guardar una versión estable, evitar que antigravity modifique backups, restaurar desde una base limpia, trabajar en carpetas separadas, proteger assets como el mapa, o diagnosticar problemas antes de tocar código. activa especialmente cuando una versión estable se ha roto, el mapa desaparece, las versiones guardadas no restauran bien, o hay riesgo de que el agente modifique archivos fuera de scope.
---

# RUTA 64 — Backup intocable y copia de trabajo

Este skill define el flujo seguro para trabajar en RUTA 64 sin volver a destruir versiones estables.

La regla principal es:

**Nunca trabajar directamente sobre la versión estable.**

---

# 1. Estructura obligatoria

Debe existir una carpeta de backup estable:

`Ruta64_BACKUP_NO_TOCAR`

Esta carpeta es solo lectura a nivel de proceso.  
No se edita nunca.

Para trabajar, se crea una copia nueva:

`Ruta64_WORKING_[fecha]_[tarea]`

Ejemplo:

`Ruta64_WORKING_2026-04-24_admin_actividades`

---

# 2. Reglas del backup

## Prohibido
Nunca modificar dentro de:

`Ruta64_BACKUP_NO_TOCAR`

No se puede:
- editar archivos
- guardar pruebas
- ejecutar resets
- cambiar assets
- cambiar localStorage desde esa versión
- abrirla como workspace activo para desarrollo

## Permitido
Solo se puede:
- leer
- comparar
- copiar desde backup hacia una carpeta working

---

# 3. Reglas de la carpeta working

Todo cambio se hace en la carpeta working.

Antes de tocar nada, confirmar:

1. carpeta backup detectada
2. carpeta working creada
3. ruta exacta del backup
4. ruta exacta de working
5. confirmación de que NO se tocará el backup

---

# 4. Restauración

Si algo se rompe:

1. parar
2. no seguir parcheando sobre una versión rota
3. no modificar backup
4. crear una working nueva desde backup
5. repetir el cambio mínimo

Nunca encadenar parches sobre una working rota.

---

# 5. Assets críticos

Los assets del mapa son críticos.

Deben estar dentro del backup:
- imagen del mapa
- `Test map.png` o imagen base real
- cualquier asset necesario para que el mapa cargue

Si la imagen del mapa no aparece:
- no asumir que el código está mal
- revisar primero ruta, nombre, tamaño y carga real del asset

---

# 6. LocalStorage no es backup

No considerar `localStorage` como parte fiable de una versión.

Una versión estable debe poder arrancar con:
- código
- assets
- fallback mínimo

No debe depender exclusivamente de datos previos del navegador.

Prohibido:
- `localStorage.clear()`

Solo se pueden tocar claves concretas, indicando cuáles.

---

# 7. Diagnóstico antes de tocar

Si algo falla, primero diagnosticar.

Antes de cambiar código, responder:

1. qué se ve en pantalla
2. qué debería verse
3. qué archivo o asset está implicado
4. qué hipótesis hay
5. qué pruebas se harán sin modificar nada

No aplicar cambios hasta identificar la causa probable.

---

# 8. Cuando una imagen no carga

Si el usuario sube o selecciona una imagen y no aparece:

No tocar código todavía.

Primero comprobar:

1. nombre exacto del archivo
2. ruta exacta
3. tamaño del archivo
4. si el navegador devuelve 404
5. si el input realmente recibe el archivo
6. si el FileReader se ejecuta
7. si se guarda como base64, blob o ruta
8. si se aplica al contenedor correcto
9. si CSS oculta el fondo
10. si otra capa tapa la imagen

Responder con diagnóstico antes de modificar.

---

# 9. Formato obligatorio antes de cambiar

Antes de cambiar nada:

1. **Archivo o asset afectado**
2. **Bloque exacto implicado**
3. **Qué parece estar pasando**
4. **Qué prueba vas a hacer**
5. **Qué NO vas a tocar**

---

# 10. Formato obligatorio después

Antes de decir que está hecho:

1. **Archivos modificados**
2. **Bloque exacto cambiado**
3. **Qué debo ver en pantalla**

Estado:
- Backup intacto: sí/no
- Working usada: sí/no
- Mapa visible: sí/no
- App clicable: sí/no
- Funcional de verdad: sí/no
- Solo preparado: sí/no

---

# 11. Regla final

Si no puedes garantizar que el backup no se ha tocado, no sigas.

Si el cambio requiere tocar la base estable, parar y pedir confirmación.

Si no sabes por qué falla una imagen, no borres nada, no resetees nada y no reconstruyas nada.
