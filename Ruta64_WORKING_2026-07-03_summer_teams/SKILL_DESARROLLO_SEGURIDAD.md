---
name: ruta64-antigravity-guardrails
description: generar prompts y reglas de trabajo para mantener cambios seguros y acotados en la app ruta 64. usar cuando se trabaje con antigravity sobre este proyecto html css js con localstorage, especialmente para corregir bugs, implementar una fase concreta, evitar tocar módulos fuera de scope, proteger el mapa, recuperar una versión estable y forzar respuestas con trazabilidad real. activar también cuando la app quede bloqueada, no se pueda hacer click, haya errores js, o cuando sea necesario volver a la versión 9 como última base estable.
---

# RUTA 64 — Guardrails para Antigravity

Trabaja siempre sobre **RUTA 64**, una app en **HTML + CSS + JS** con datos temporales en **localStorage**.  
La regla principal es: **trabajar por secciones y por fases**, sin tocar nada fuera del scope pedido.

## Comportamiento obligatorio

### 1. No tocar fuera de scope
Si el usuario pide una corrección o mejora en una sección concreta, trabaja **solo** en esa sección.

Ejemplos:
- Si el usuario pide **Registro**, no tocar **Mapa**, **Equipo** o **Ranking**
- Si el usuario pide **Equipos**, no tocar **Mapa**
- Si el usuario pide **Admin**, no tocar lógica global no relacionada

Si existe una dependencia real con otra sección, debes decirlo **antes de tocar nada** con este formato:

- `Voy a tocar también [zona]`
- `Motivo: [dependencia real]`
- `Archivo(s): [archivo1, archivo2]`
- `Riesgo: [qué se puede romper]`

No sigas hasta dejar esto claro.

---

### 2. El mapa es zona sensible
El **Mapa** está considerado módulo de alto riesgo.

#### Regla:
No tocar el mapa salvo que el usuario lo pida explícitamente.

Si necesitas tocar el mapa, debes decir antes:
- qué archivo vas a tocar
- qué bloque exacto
- por qué hace falta
- qué riesgo existe

Si el mapa deja de verse, se vacía, pierde imagen base, pierde puntos o deja de cargar:
- detener cambios nuevos
- comparar con la **versión 9**
- restaurar el comportamiento del mapa desde esa versión estable

No inventes una solución nueva si existe una versión guardada donde el mapa funcionaba bien.

---

### 3. Volver a la última versión estable
Si después de varios cambios:
- la app queda bloqueada
- deja de ser clicable
- se rompen módulos no pedidos
- se ha tocado demasiado sin control

entonces:
- parar
- proponer volver a la **v9** como última versión estable
- usar esa versión como base de recuperación

No encadenes parches sobre una versión ya rota.

---

### 4. Problema crítico conocido: app congelada
Este proyecto ya ha tenido varias veces el mismo fallo:

- error en JavaScript
- error en inicialización
- `ReferenceError`
- `undefined`
- una función que rompe al cargar
- resultado: **no se puede hacer click en nada**

Si ocurre este patrón:
1. revisar consola
2. identificar el error exacto
3. indicar archivo, función y línea
4. arreglar solo eso primero
5. confirmar que la app vuelve a ser clicable antes de seguir con cualquier otra tarea

Nunca sigas implementando nuevas cosas mientras la app esté congelada.

---

### 5. No limpiar almacenamiento global
No usar:
- `localStorage.clear()`

Nunca hagas limpieza global si el objetivo es solo resetear equipos, actividades o demos.

Solo puedes tocar claves concretas.  
Debes preservar:
- mapa
- borrador del mapa
- configuración del mapa
- imagen base
- editor del mapa
- otras claves no relacionadas con la tarea actual

Si propones limpiar datos, indica exactamente qué claves vas a borrar.

---

### 6. Antes de cambiar nada
Antes de aplicar cambios, responde siempre con este bloque:

1. **Archivos afectados**
2. **Función exacta o bloque exacto**
3. **Problema detectado**
4. **Qué vas a cambiar**
5. **Qué no vas a tocar**

Si vas a tocar otra zona sensible, dilo explícitamente antes.

---

### 7. Antes de decir que está hecho
Nunca cierres una tarea con un resumen genérico.

Debes devolver siempre:

1. **Archivos modificados**
2. **Bloque exacto cambiado**
3. **Qué debo ver en pantalla**

Y además este estado final:

- **Visible en interfaz:** sí/no
- **Funcional de verdad:** sí/no
- **Solo preparado:** sí/no

Si algo no está realmente funcional, dilo claramente.

---

## Forma de trabajar

### A. Cambios por fase
No mezclar fases.

Ejemplos de fases válidas:
- fase 1: lógica semanal individual
- fase 2: lógica de equipo
- fase 3: progreso
- fase 4: ranking y visual competitivo
- fase 5: UX y ajustes

Si la petición es de una fase concreta, no adelantes lógica de fases futuras.

---

### B. Cambios por módulo
Trabajar por módulos:
- Registro
- Equipo
- Ranking
- Mapa
- Admin

No cruzar módulos sin necesidad real.

---

### C. Debug real, no visual fake
No dar por hecho que algo funciona por verse en pantalla.

Cada flujo debe comprobar:
- evento conectado
- función ejecutándose
- cambio real de estado
- persistencia en localStorage si aplica
- re-render de UI si aplica
- feedback visual si aplica

---

## Patrones de respuesta para Antigravity

### Cuando el usuario pide una corrección
Responde en este orden:
1. qué archivo vas a tocar
2. qué función o bloque exacto
3. dónde se rompe el flujo
4. qué vas a cambiar
5. qué no vas a tocar

### Cuando hay un bug crítico
Prioriza:
1. consola
2. error exacto
3. archivo y línea
4. recuperar clicabilidad
5. solo después continuar

### Cuando el mapa se rompe
Haz esto:
1. reconocer que el mapa sigue roto
2. ir a la **v9**
3. comparar código del mapa entre versión buena y actual
4. restaurar bloque perdido o roto
5. confirmar qué debe verse

### Cuando una petición amenaza otras zonas
Debes preguntar antes de tocar:

- `Voy a tocar también [zona]. ¿Lo confirmas?`
- `Necesito tocar [archivo] porque depende de [motivo]. ¿Sigo?`

Usa esta pregunta especialmente para:
- mapa
- inicialización global
- localStorage
- renders compartidos

---

## Ejemplo de salida mínima correcta

### Antes del cambio
- Archivos afectados: `app.js`
- Función exacta: `saveTeamChanges()`
- Problema detectado: el equipo nuevo no se inserta en el array real y no se persiste
- Qué voy a cambiar: inserción real + localStorage + re-render
- Qué no voy a tocar: mapa, ranking, registro

### Después del cambio
- Archivos modificados: `app.js`
- Bloque exacto cambiado: `saveTeamChanges`, `renderTeamSelect`, `saveToLocalStorage`
- Qué debo ver en pantalla: el equipo nuevo aparece en la lista y en los selectores al guardar

Estado:
- Visible en interfaz: sí
- Funcional de verdad: sí
- Solo preparado: no

---

## Regla final
Si:
- la app sigue bloqueada
- el mapa sigue sin aparecer
- el cambio afecta zonas no pedidas
- no se puede demostrar qué archivo y bloque cambió
- o el flujo sigue siendo visual fake

entonces la tarea **no está hecha**.

En ese caso:
- detener
- explicar qué sigue roto
- y, si hace falta, proponer volver a la **v9**.
