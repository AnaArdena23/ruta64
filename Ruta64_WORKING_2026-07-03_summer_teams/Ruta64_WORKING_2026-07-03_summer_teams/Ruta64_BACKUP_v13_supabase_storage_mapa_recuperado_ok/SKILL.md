---
name: ruta64-antigravity-guardrails
description: generar prompts, límites y reglas de trabajo para mantener cambios seguros y acotados en la app ruta 64. usar cuando se trabaje con antigravity sobre este proyecto html css js con localstorage, especialmente para corregir bugs, implementar una fase concreta, mantener la lógica del juego por semanas, proteger el mapa, recuperar una versión estable y forzar respuestas con trazabilidad real. activar también cuando la app quede bloqueada, no se pueda hacer click, haya errores js, o cuando sea necesario volver a la versión 9 como última base estable.
---

# RUTA 64 — Guardrails + lógica del proyecto para Antigravity

Trabaja siempre sobre **RUTA 64**, una app en **HTML + CSS + JS** con persistencia temporal en **localStorage**.  
La regla principal es:

- trabajar **por secciones**
- trabajar **por fases**
- no tocar nada fuera del scope pedido
- no dar nada por hecho sin confirmar flujo real

# 1. Contexto del proyecto

## Qué es RUTA 64
RUTA 64 es una app gamificada donde:

- los usuarios registran actividades
- cada actividad suma puntos
- los puntos hacen avanzar a su equipo
- el avance se representa como paradas en un recorrido
- existe competencia entre equipos
- hay paneles de usuario y de administración

## Áreas principales
- Mapa
- Equipo
- Registro
- Ranking

## Panel Admin
- Actividades
- Equipos
- Usuarios

# 2. Lógica del juego (base que debes respetar)

## Modelo temporal
El juego se organiza por semanas, no por fechas reales en esta fase.

Usar solo:
- Semana 1
- Semana 2
- Semana 3
- Semana 4
- Semana 5
- Semana 6
- Semana 7
- Semana 8

No usar:
- esta semana
- semana pasada
- últimas 2 semanas
- fechas como lógica principal del reto

La fecha puede existir como dato auxiliar, pero la lógica del juego va por semanas.

## Regla oficial de puntuación Ruta 64
- 1 actividad = 1 punto = 1 parada
- minutos NO multiplican puntos
- intensidad NO multiplica puntos
- tipo fuerte/suave solo clasifica la actividad
- mínimo objetivo por persona: 2 actividades/semana
- máximo computable sin bonus: 2 actividades/persona/semana
- bonus desbloqueado solo si todos los miembros del equipo tienen al menos 2 actividades esa semana
- máximo computable con bonus: 3 actividades/persona/semana
- actividades por encima de 3 nunca suman
- el cálculo general debe hacerse semana por semana, no sobre el total acumulado
- Ranking, Equipo y Mapa deben usar getTeamProgress()
- no crear puntos manuales
- no guardar posición del equipo manualmente
- r64_actividades es la fuente real de puntos

⚠️ **ADVERTENCIA CRÍTICA**:
Antes de modificar Ranking, Equipo, Mapa, Registro o Admin Actividades, comprobar que no se rompe esta regla.

## Reglas de equipo
Cada equipo tiene 4 personas.

Si los 4 miembros completan sus 2 actividades mínimas semanales:
- queda habilitada una actividad extra por persona esa semana

Esto significa:
- base normal por persona: hasta 2 obligatorias
- extra permitida si todo el equipo cumple
- máximo final por persona: 3

## Resultado del reto
Si cada miembro cumple 2 actividades por semana:
- 4 miembros x 2 actividades = 8 puntos por semana
- 8 semanas x 8 puntos = 64 paradas

## Categorías futuras
Mantener previstas pero no adelantar si no se piden:
- Verde = cumple 7/8 semanas
- Azul = cumple 8/8 semanas
- Azul Máster = 8 semanas + actividad extra

# 3. Estado técnico que debes asumir

La app:
- tiene UI avanzada
- usa HTML + CSS + JS
- usa arrays/mock + localStorage
- aún no tiene backend real
- está en fase de convertir UI bonita en funcionalidad real

No hablar como si hubiera backend si no existe.  
No responder con “preparado para backend” si el usuario pide flujo funcional ahora.

# 4. Forma de trabajo obligatoria

## Regla central
Trabajar por:
- una fase cada vez
- una sección cada vez

## Nunca mezclar sin avisar
Si el usuario pide un cambio en una sección concreta, no tocar otras.

Ejemplos:
- si pide Registro, no tocar Mapa
- si pide Equipos, no tocar Ranking
- si pide Admin, no tocar lógica global salvo dependencia real

Si existe una dependencia real con otra zona, decirlo antes de tocar nada con este formato:

- Voy a tocar también: [zona]
- Motivo: [dependencia real]
- Archivo(s): [archivo1, archivo2]
- Riesgo: [qué podría romperse]

Si no está claro, preguntar antes de tocar.

# 5. Zonas sensibles y límites

## El mapa es zona sensible
El Mapa es un módulo delicado.

### Regla
No tocar el mapa salvo que el usuario lo pida explícitamente.

Si necesitas tocarlo, debes decir antes:
- qué archivo
- qué bloque exacto
- por qué hace falta
- qué riesgo existe

Si el mapa deja de verse, se vacía, pierde imagen base, pierde puntos o deja de cargar:
- detener cambios nuevos
- buscar en versiones guardadas la última donde el mapa estaba bien
- usar la **v9** como referencia principal
- comparar el código del mapa entre la versión buena y la actual
- restaurar desde ahí

No inventar un mapa nuevo si hay una versión estable donde funcionaba.

## Versión estable de seguridad
La **v9** debe considerarse la última base estable conocida, especialmente para el mapa.

Si:
- se ha tocado demasiado
- la app empieza a romper módulos no pedidos
- hay demasiados parches encadenados
- el mapa se pierde
- la app deja de ser fiable

entonces:
- parar
- proponer volver a la **v9**
- usarla como base de recuperación

# 6. Problema crítico conocido: app congelada

Este proyecto ya ha tenido varias veces el mismo patrón:

- error JS
- fallo en inicialización
- ReferenceError
- undefined
- una función rompe al cargar
- resultado: no se puede hacer click en nada

Si pasa esto:
1. revisar consola
2. identificar error exacto
3. indicar archivo, función y línea
4. arreglar solo eso primero
5. confirmar que la app vuelve a ser clicable antes de seguir

Nunca sigas implementando nuevas cosas si:
- hay error en consola
- la app no responde
- no se puede hacer click

# 7. Persistencia y localStorage

## Prohibición
No usar:
- `localStorage.clear()`

## Regla
Solo borrar o modificar claves concretas.

Nunca romper por accidente:
- mapa
- borrador del mapa
- configuración del mapa
- editor del mapa
- imagen base
- otros módulos no relacionados

Si necesitas limpiar datos demo, decir exactamente:
- qué claves vas a borrar
- por qué
- qué no se tocará

# 8. Qué significa “funcional de verdad”

No vale con que algo se vea bonito.

Un flujo funcional real exige:
- botón con eventListener conectado
- función ejecutándose
- datos cambiando en el array/estado real
- persistencia si aplica
- re-render si aplica
- feedback visual si aplica

No des por hecho que algo funciona porque lo ves en pantalla.

# 9. Reglas por módulo

## Registro
Cuando se trabaja en Registro:
- la actividad debe guardarse de verdad
- debe asociarse a usuario
- debe asociarse a equipo si aplica
- debe asociarse a semana
- debe llevar puntos
- debe respetar límites semanales
- debe mostrar feedback visual correcto
- El Registro público debe bloquear una 4ª actividad del mismo usuario en la misma semana.
- La validación debe hacerse antes de guardar en r64_actividades.
- Si ya existen 3 actividades para ese userId + semana, mostrar aviso y no guardar.
- No llamar notifyDataChange() si se bloquea.
- Admin Actividades puede seguir creando actividades manuales como excepción, pero getTeamProgress() nunca contará más de 3 por persona/semana.

La UI debe mostrar la semana además de la fecha, si existe fecha.

## Equipos
Cuando se trabaja en Equipos:
- crear equipo debe guardar de verdad
- editar equipo debe guardar de verdad
- se deben actualizar listas y selectores
- debe poder verse seguimiento semanal por integrante
- deben verse actividades semanales, puntos y estado del miembro
- si el usuario lo pide, deben poder editarse puntos manualmente

Si el usuario no quiere “paradas” en esa vista, eliminarlas.

## Ranking
Cuando se trabaja en Ranking:
- debe usar semanas explícitas
- no mezclar textos como “esta semana” con el modelo Semana 1–8
- el selector, título y cálculo deben estar alineados
- no limitarse a cambiar el texto: revisar cálculo real

## Admin
Admin también debe reflejar el modelo de semanas.

Al editar una actividad en Admin, debe poder editarse todo lo importante:
- usuario
- equipo si aplica
- semana
- tipo de actividad
- minutos
- evidencia
- cualquier otro campo real guardado

Admin > Equipos debe permitir vista por semana:
- actividades
- puntos
- estado semanal por integrante

# 10. Antes de tocar nada

Antes de aplicar cambios, responder siempre con este bloque:

1. **Archivos afectados**
2. **Función exacta o bloque exacto**
3. **Problema detectado**
4. **Qué vas a cambiar**
5. **Qué no vas a tocar**

Si vas a tocar otra zona sensible, dilo explícitamente antes.

# 11. Antes de decir que está hecho

Nunca cerrar con un resumen genérico.

Debes devolver siempre:

1. **Archivos modificados**
2. **Bloque exacto cambiado**
3. **Qué debo ver en pantalla**

Y este estado final:

- **Visible en interfaz:** sí/no
- **Funcional de verdad:** sí/no
- **Solo preparado:** sí/no

Si algo sigue a medias, decirlo claramente.

# 12. Cuándo preguntar antes de tocar

Debes preguntar antes de tocar si:
- necesitas tocar el mapa
- necesitas tocar inicialización global
- necesitas tocar localStorage en algo sensible
- necesitas modificar otra sección fuera de la pedida
- no está claro si una dependencia compensa el riesgo

Usar este formato:

- `Voy a tocar también [zona]. ¿Lo confirmas?`
- `Necesito tocar [archivo] porque depende de [motivo]. ¿Sigo?`

# 13. Patrones de respuesta esperados

## Cuando el usuario pide una corrección
Responder en este orden:
1. qué archivo vas a tocar
2. qué función o bloque exacto
3. dónde se rompe el flujo
4. qué vas a cambiar
5. qué no vas a tocar

## Cuando hay un bug crítico
Priorizar:
1. consola
2. error exacto
3. archivo y línea
4. recuperar clicabilidad
5. solo después continuar

## Cuando el mapa se rompe
Hacer esto:
1. reconocer que sigue roto
2. buscar versión buena
3. usar v9 como referencia principal
4. comparar código del mapa
5. restaurar bloque perdido o roto
6. confirmar qué debe verse

# 14. Regla final de cierre

Si después de los cambios:
- la app sigue congelada
- el mapa sigue sin aparecer
- el cambio afecta zonas no pedidas
- el ranking sigue incoherente con semanas
- no se puede editar y guardar lo pedido
- no se puede demostrar qué archivo y bloque cambió
- o el flujo sigue siendo visual fake

entonces la tarea **no está hecha**.

En ese caso:
- detener
- explicar qué sigue roto
- y, si hace falta, proponer volver a la **v9**.
