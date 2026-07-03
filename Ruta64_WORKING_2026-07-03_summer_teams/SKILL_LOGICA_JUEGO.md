---
name: ruta64-logica-juego
description: Reglas oficiales de puntuación, bonus de equipo y progresión del mapa para Ruta 64.
---

# 🕹️ Lógica Oficial - RUTA 64

### 1. Puntuación y Avance
- **1 Actividad = 1 Punto = 1 Parada.**
- El tiempo (minutos) y la intensidad (suave/fuerte) NO multiplican los puntos. Son datos estadísticos.

### 2. Límites Semanales
- **Máximo por persona:** 3 actividades/semana (Bloqueado por Supabase).
- **Aportación base:** Por defecto, solo se cuentan **2 puntos** por persona para el equipo.

### 3. Bonus de Equipo (El 3er Punto)
- Para que los integrantes sumen su **3ª actividad**, el equipo debe desbloquear el Bonus.
- **Condición:** TODOS los miembros del equipo deben tener al menos **2 actividades** en esa misma semana.
- Si uno solo falla, el límite del equipo vuelve a ser de 2 puntos por persona.

### 4. Dinámica del Mapa
- **Total Paradas:** 64.
- **Salida:** Equipos con 0 o 1 punto se mantienen en la Parada 1.
- **Progreso:** El marcador se mueve a la parada exacta según el total de puntos calculados por `getTeamProgress()`.

### 5. Evidencias
- **Subida:** Las fotos van directas al bucket `Evidencias` de Supabase.
- **Validación:** No requiere aprobación manual. El Admin audita y borra si es necesario.
