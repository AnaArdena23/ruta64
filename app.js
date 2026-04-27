// --- DATOS LOCALES ---
const USUARIOS_DEFAULT = [];

let EQUIPOS = [];

let usuarios = [];
let actividades = [];
let TEAM_IDS = {}; // Mapeo NombreEquipo -> UUID de Supabase

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🚀 Iniciando Ruta 64...');
        
        // 1. Cargar configuración básica y mapa local (Base para puntos)
        loadMapConfig();

        // 2. Intentar cargar datos de Supabase (Lectura y sobreescritura de imagen)
        const success = await initSupabaseData();
        
        if (!success) {
            console.warn('⚠️ No se pudo cargar de Supabase. Usando LocalStorage como fallback.');
            loadFromLocalStorage();
        }

        // 3. Inicializar componentes
        initNavigation();
        renderUsers();
        renderRanking();
        renderTeamSelect();
        initForm();
        initTeamFilter();
        initRankingFilters();
        populateMapSelectors(); 
        initMapFilters();       
        renderMap();
        initAdminMapLogic();
        
        console.log('Ruta 64: Inicialización completada con éxito.');
    } catch (error) {
        console.error('Error crítico durante la inicialización:', error);
    }
});

// --- ESTADO GLOBAL DEL MAPA ---
let mapConfig = {
    backgroundImage: 'Test map.png',
    puntos: [],
    legend: [] // Eliminada la antigua leyenda
};

// Control de carrusel para "Equipos en ruta"
let mapLegendPage = 0;
const MAP_LEGEND_VISIBLE = 3;
const UI_PALETTE = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB', '#E67E22', '#2ECC71', '#F1C40F'];

let mapConfigDraft = null; // Se inicializa en loadMapConfig
let mapHistory = [];
let mapRedoStack = [];
let selectedPointId = null;
let isDragging = false;

/**
 * Carga la configuración del mapa desde localStorage
 */
function loadMapConfig() {
    const savedConfig = localStorage.getItem('r64_map_config');
    const savedDraft = localStorage.getItem('r64_map_config_draft');
    
    if (savedConfig) {
        mapConfig = JSON.parse(savedConfig);
    }
    
    // Fallback: Si no hay imagen (ni de Supabase ni de localStorage), usar la por defecto
    if (!mapConfig.backgroundImage) {
        mapConfig.backgroundImage = 'Test map.png';
    }
    
    // Inicializar borrador
    try {
        mapConfigDraft = savedDraft ? JSON.parse(savedDraft) : JSON.parse(JSON.stringify(mapConfig));
        if (!mapConfigDraft) mapConfigDraft = JSON.parse(JSON.stringify(mapConfig));
    } catch (e) {
        mapConfigDraft = JSON.parse(JSON.stringify(mapConfig));
    }
    
    // Asegurar fallback en borrador
    if (mapConfigDraft && !mapConfigDraft.backgroundImage) {
        mapConfigDraft.backgroundImage = 'Test map.png';
    }

    // NORMALIZACIÓN: Asegurar IDs secuenciales y unificar label -> name
    normalizeMapPoints(mapConfig);
    normalizeMapPoints(mapConfigDraft);
}

/**
 * Normaliza los puntos del mapa: IDs secuenciales, label -> name, etc.
 */
function normalizeMapPoints(config) {
    if (!config || !config.puntos) return;
    
    config.puntos.forEach((p, index) => {
        // 1. Asegurar ID secuencial (1-based para coincidir con progreso)
        p.id = index + 1;
        
        // 2. Unificar label -> name (mantener compatibilidad)
        if (p.label && !p.name) {
            p.name = p.label;
        }
        
        // 3. Fallback para nombre vacío
        if (!p.name) {
            p.name = `Parada ${p.id}`;
        }
        
        // 4. Limpieza de basura (opcional)
        delete p.label;
    });
}

/**
 * Guarda el borrador en localStorage
 */
function saveMapConfig() {
    localStorage.setItem('r64_map_config_draft', JSON.stringify(mapConfigDraft));
}

/**
 * Publica el mapa (copia borrador a oficial)
 */
async function publishMap() {
    showCustomConfirm(
        'Publicar Mapa Oficial',
        '¿Estás seguro de que quieres subir estas coordenadas a la base de datos para todos los usuarios?',
        'Publicar en Supabase',
        async () => {
            try {
                // 1. Clonar y normalizar el borrador
                const tempConfig = JSON.parse(JSON.stringify(mapConfigDraft));
                normalizeMapPoints(tempConfig);
                const puntos = tempConfig.puntos;

                // 2. Validaciones obligatorias (Guardrails)
                if (!puntos || !Array.isArray(puntos)) {
                    throw new Error("El borrador no contiene un array de puntos.");
                }
                if (puntos.length !== 64) {
                    throw new Error(`Se requieren exactamente 64 paradas. Actualmente hay ${puntos.length}.`);
                }
                
                for (let i = 0; i < puntos.length; i++) {
                    const p = puntos[i];
                    if (p.id !== i + 1) throw new Error(`El punto índice ${i} tiene un ID incorrecto (${p.id}).`);
                    if (typeof p.x !== 'number' || typeof p.y !== 'number') throw new Error(`Las coordenadas de la parada ${p.id} no son numéricas.`);
                    if (!p.name || String(p.name).trim() === '') throw new Error(`La parada ${p.id} no tiene nombre.`);
                    if (!p.description || String(p.description).trim() === '') throw new Error(`La parada ${p.id} no tiene descripción.`);
                }

                // 3. Escribir en Supabase como única fuente de verdad
                const { error } = await window.supabase
                    .from('map_config')
                    .update({ points_json: puntos })
                    .eq('id', 'main');

                if (error) throw error;

                // 4. Éxito: Actualizar variables locales y caché secundaria
                console.log('✅ Coordenadas actualizadas en Supabase:', puntos.length);
                mapConfig = tempConfig;
                localStorage.setItem('r64_map_config', JSON.stringify(mapConfig)); // Solo caché pasiva
                
                // 5. Refrescar UI visualmente
                renderMap();
                showToast('🗺️ Mapa publicado con éxito en la nube');
                return true;

            } catch (err) {
                console.error('Error publicando el mapa:', err);
                showToast(`❌ No se pudo publicar: ${err.message}`);
                return false; // Mantiene el modal si falla por algún motivo
            }
        }
    );
}

// --- ESTADO DE VISTA ---
let rankingView = 'general'; // 'general' o 'semanal'
let selectedRankingWeek = null;

/**
 * Carga datos desde localStorage o usa los valores por defecto
 */
function loadFromLocalStorage() {
    const savedActividades = localStorage.getItem('r64_actividades');
    const savedUsuarios = localStorage.getItem('r64_usuarios');

    actividades = savedActividades ? JSON.parse(savedActividades) : [];
    usuarios = savedUsuarios ? JSON.parse(savedUsuarios) : USUARIOS_DEFAULT;
    
    // LIMPIEZA TOTAL PRE-SUPABASE: Purgar cualquier dato residual de equipos antiguos
    const oldTeams = ["Equipo Demo", "Escuadrón 64", "Los Pioneros", "Velocirraptores", "Ruta Nocturna"];
    
    const hasResiduals = usuarios.some(u => oldTeams.includes(u.equipo)) || 
                         actividades.some(a => oldTeams.includes(a.equipo));

    if (hasResiduals || usuarios.length > 0 || actividades.length > 0) {
        usuarios = [];
        actividades = [];
        localStorage.setItem('r64_usuarios', '[]');
        localStorage.setItem('r64_actividades', '[]');
        console.log("Tabula Rasa: localStorage purgado de datos demo y residuales.");
    }

    console.log('Datos cargados:', { actividades, usuarios });
}



/**
 * Guarda el estado actual en localStorage
 */
function saveToLocalStorage() {
    localStorage.setItem('r64_actividades', JSON.stringify(actividades));
    localStorage.setItem('r64_usuarios', JSON.stringify(usuarios));
}

/**
 * Limpia usuarios cuyo equipo ya no existe en la lista oficial
 */
function cleanupOldUsers() {
    // 1. Detectar usuarios antiguos
    const usuariosAntiguos = usuarios.filter(u => !EQUIPOS.includes(u.equipo));
    
    if (usuariosAntiguos.length === 0) {
        showToast('✅ No se han detectado usuarios antiguos');
        return;
    }

    const equiposDetectados = [...new Set(usuariosAntiguos.map(u => u.equipo))];
    
    showCustomConfirm(
        'Limpiar base de datos',
        `Se han detectado ${usuariosAntiguos.length} usuarios de equipos antiguos (${equiposDetectados.join(', ')}). ¿Quieres eliminarlos? No se borrarán sus actividades, pero ya no aparecerán en el Registro.`,
        'Sí, limpiar usuarios',
        () => {
            // 3. Borrar solo esos usuarios
            usuarios = usuarios.filter(u => EQUIPOS.includes(u.equipo));
            
            // 4. Persistir y notificar
            saveToLocalStorage();
            notifyDataChange();
            renderAdminTeams();
            renderUsers();
            
            showToast(`Base de datos limpia: ${usuariosAntiguos.length} usuarios eliminados`);
        }
    );
}

/**
 * Notifica a todos los módulos que los datos han cambiado
 * para que refresquen sus vistas.
 */
function notifyDataChange() {
    renderUsers();          // Actualiza selector de participantes en Registro
    renderRanking();        // Actualiza Ranking
    renderTeamSelect();     // Actualiza selector en sección Equipo
    renderMap();            // Actualiza Mapa y marcadores
    
    // Refrescar panel Admin si está visible
    const adminView = document.getElementById('view-admin-map');
    if (adminView && adminView.classList.contains('active')) {
        const activeSubview = adminView.querySelector('.admin-subview.active');
        if (activeSubview && activeSubview.id === 'admin-subview-admin-actividades') {
            if (typeof renderAdminActivities === 'function') renderAdminActivities();
        } else if (activeSubview && activeSubview.id === 'admin-subview-admin-equipos') {
            if (typeof renderAdminTeams === 'function') renderAdminTeams();
        }
    }
    
    // Refrescar Equipo si hay uno seleccionado
    const teamSel = document.getElementById('team-filter-select');
    const weekSel = document.getElementById('team-week-select');
    if (teamSel && teamSel.value) {
        renderTeamMembers(teamSel.value, weekSel ? weekSel.value : '1');
    }
}

/**
 * Muestra una notificación visual elegante
 */
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Eliminar el elemento del DOM después de que termine la animación de salida
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Configura la navegación entre secciones y modo Admin
 */
function initNavigation() {
    const tabs = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const settingsBtn = document.getElementById('settings-btn');
    const closeAdminBtn = document.getElementById('close-admin-btn');

    function switchView(viewId) {
        views.forEach(view => {
            view.classList.remove('active');
            if (view.id === `view-${viewId}`) {
                view.classList.add('active');
            }
        });
        
        // Actualizar pestañas si corresponde
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.view === viewId) {
                tab.classList.add('active');
            }
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchView(tab.dataset.view);
            if (tab.dataset.view === 'ranking') renderRanking();
            if (tab.dataset.view === 'registro') renderUsers();
        });
    });

    // Navegación especial para Admin
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Verificar si ya está logueado en esta sesión
            if (sessionStorage.getItem('r64_admin_logged') === 'true') {
                switchView('admin-map');
                showToast('🛠️ Entrando en Modo Editor');
                return;
            }

            // Usar modal custom en lugar de prompt nativo
            showAdminLoginModal(() => {
                sessionStorage.setItem('r64_admin_logged', 'true');
                switchView('admin-map');
                showToast('🛠️ Entrando en Modo Editor');
            });
        });
    }

    if (closeAdminBtn) {
        closeAdminBtn.addEventListener('click', () => {
            switchView('mapa'); // Volver al mapa público al cerrar
        });
    }
}

/**
 * Carga los usuarios en el selector del formulario
 */
function renderUsers() {
    const select = document.getElementById('user-select');
    if (!select) return;
    
    select.innerHTML = '<option value="" disabled selected>Elige un usuario...</option>';
    
    usuarios.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.nombre} (${user.equipo})`;
        select.appendChild(option);
    });
}

/**
 * Carga los equipos en el selector de la sección Equipo
 */
function renderTeamSelect() {
    const select = document.getElementById('team-filter-select');
    if (!select) return;
    
    select.innerHTML = '<option value="" selected>Seleccionar equipo...</option>';
    
    EQUIPOS.forEach(equipo => {
        const option = document.createElement('option');
        option.value = equipo;
        option.textContent = equipo;
        select.appendChild(option);
    });
}

/**
 * Inicia el escucha para el filtro de equipos
 */
/**
 * Inicia el escucha para el filtro de equipos y semana
 */
function initTeamFilter() {
    const teamSelect = document.getElementById('team-filter-select');
    const weekSelect = document.getElementById('team-week-select');
    
    if (!teamSelect || !weekSelect) return;

    const handleChange = () => {
        const teamName = teamSelect.value;
        const weekNum = weekSelect.value;
        if (teamName) {
            renderTeamMembers(teamName, weekNum);
        }
    };

    teamSelect.addEventListener('change', handleChange);
    weekSelect.addEventListener('change', handleChange);
}

function getTeamProgress(teamName, week = null) {
    if (!teamName) return 0;
    
    const miembros = usuarios.filter(u => u.equipo === teamName);
    if (miembros.length === 0) return 0;
    
    const idsMiembros = miembros.map(m => m.id);
    const actsEquipo = actividades.filter(a => idsMiembros.includes(a.userId));
    
    // Función auxiliar para calcular los puntos de una semana específica
    const calcularPuntosSemana = (semanaActs) => {
        const actosPorMiembro = {};
        idsMiembros.forEach(id => actosPorMiembro[id] = 0);
        
        semanaActs.forEach(act => {
            if (actosPorMiembro[act.userId] !== undefined) {
                actosPorMiembro[act.userId]++;
            }
        });
        
        // Verificar si TODOS tienen al menos 2
        const todosTienenMinimo = Object.values(actosPorMiembro).every(count => count >= 2);
        
        // Calcular puntos con el límite correspondiente
        const limite = todosTienenMinimo ? 3 : 2;
        
        let totalPuntos = 0;
        Object.values(actosPorMiembro).forEach(count => {
            totalPuntos += Math.min(count, limite);
        });
        
        return totalPuntos;
    };

    if (week && week !== 'general') {
        // Cálculo para una semana concreta
        const actsSemana = actsEquipo.filter(a => a.semana == week);
        return calcularPuntosSemana(actsSemana);
    } else {
        // Cálculo general: aplicar reglas semana por semana y sumar
        const semanasUnicas = [...new Set(actsEquipo.filter(a => a.semana).map(a => a.semana))];
        let totalGeneral = 0;
        
        semanasUnicas.forEach(sem => {
            const actsSemana = actsEquipo.filter(a => a.semana == sem);
            totalGeneral += calcularPuntosSemana(actsSemana);
        });
        
        return totalGeneral;
    }
}

/**
 * Renderiza los miembros del equipo seleccionado con estadísticas semanales reales
 */
function renderTeamMembers(teamName, weekNum = "1") {
    const grid = document.getElementById('team-members-grid');
    const displayTitle = document.getElementById('display-team-name');
    const bonusMessage = document.getElementById('team-bonus-message');
    const statsPanel = document.getElementById('team-stats-summary-panel');
    
    if (!grid) return;

    if (!teamName) {
        if (displayTitle) displayTitle.textContent = 'Selecciona un equipo';
        if (bonusMessage) bonusMessage.textContent = 'Progreso semanal de los integrantes';
        if (statsPanel) statsPanel.style.display = 'none';
        grid.innerHTML = `
            <div class="view-placeholder-simple">
                <p>Selecciona un equipo para comenzar el seguimiento</p>
            </div>
        `;
        return;
    }

    if (displayTitle) displayTitle.textContent = teamName;
    if (statsPanel) statsPanel.style.display = 'flex';

    const miembros = usuarios.filter(u => u.equipo === teamName);
    let miembrosQueCumplen = 0;
    let nombresFaltan = [];

    grid.innerHTML = '';
    
    miembros.forEach(user => {
        const actUsuarioSemana = actividades.filter(a => a.userId == user.id && a.semana == weekNum);
        const numAct = actUsuarioSemana.length;
        const puntos = numAct; // REGLA: 1 act = 1 pto
        const evidencias = actUsuarioSemana.filter(a => a.tieneEvidencia).length;

        let estadoLabel = 'No iniciado';
        let estadoClass = 'status-none';
        if (numAct >= 3) {
            estadoLabel = 'Maximo';
            estadoClass = 'status-max';
        } else if (numAct >= 2) {
            estadoLabel = 'Cumplido';
            estadoClass = 'status-ok';
        } else if (numAct > 0) {
            estadoLabel = 'En progreso';
            estadoClass = 'status-progress';
        }

        if (numAct >= 2) miembrosQueCumplen++;
        else nombresFaltan.push(user.nombre);

        const inicial = user.nombre ? user.nombre.charAt(0).toUpperCase() : '?';

        const card = document.createElement('div');
        card.className = 'member-card-v2';
        card.innerHTML = `
            <div class="card-top">
                <div class="avatar-circle">${inicial}</div>
                <div class="member-info-main">
                    <h3>${user.nombre || 'Usuario'}</h3>
                    <span class="status-pill ${estadoClass}">${estadoLabel}</span>
                </div>
                <div class="points-badge">${puntos} pts</div>
            </div>
            <div class="card-stats">
                <div class="stat-item">
                    <span class="stat-label">Progreso Semanal</span>
                    <span class="stat-val">${numAct}/3 Actividades</span>
                </div>
            </div>
            <div class="card-progress">
                <div class="progress-track">
                    <div class="progress-fill ${estadoClass}" style="width: ${(Math.min(numAct, 3) / 3) * 100}%"></div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Actualizar Resumen usando Helper Central
    const totalPuntosEquipo = getTeamProgress(teamName, weekNum);
    const ptsEl = document.getElementById('team-total-points');
    const actEl = document.getElementById('team-total-activities');
    if (ptsEl) ptsEl.textContent = totalPuntosEquipo;
    if (actEl) actEl.textContent = totalPuntosEquipo; // 1 act = 1 pto
    
    const bonusBadge = document.getElementById('team-bonus-badge');
    const bonusText = document.getElementById('team-bonus-text');
    
    if (miembrosQueCumplen === miembros.length && miembros.length > 0) {
        if (bonusBadge) bonusBadge.classList.add('unlocked');
        if (bonusText) bonusText.textContent = 'DESBLOQUEADO';
        if (bonusMessage) bonusMessage.textContent = 'Bonus desbloqueado';
    } else {
        if (bonusBadge) bonusBadge.classList.remove('unlocked');
        if (bonusText) bonusText.textContent = 'Bloqueado';
        
        const numFaltan = nombresFaltan.length;
        if (numFaltan > 0) {
            bonusMessage.textContent = `Faltan ${numFaltan} integrantes para el bonus`;
        } else {
            bonusMessage.textContent = 'Sin actividad esta semana';
        }
    }
}

let rankingMode = 'general';
let rankingWeek = '1';

function switchRankingMode(mode) {
    rankingMode = mode;
    const container = document.getElementById('ranking-week-select-container');
    const subtitle = document.querySelector('.ranking-title-area .subtitle');
    if (container) container.style.display = (mode === 'semanal') ? 'block' : 'none';
    if (subtitle) subtitle.textContent = (mode === 'semanal') ? `Clasificación de la Semana ${rankingWeek}` : 'Clasificación acumulada de paradas';
    const btns = document.querySelectorAll('.rank-tab-btn');
    btns.forEach(btn => {
        if (btn.textContent.toLowerCase() === mode) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    renderRanking();
}

function updateRankingWeek(week) {
    rankingWeek = week;
    const subtitle = document.querySelector('.ranking-title-area .subtitle');
    if (subtitle) subtitle.textContent = `Clasificación de la Semana ${week}`;
    renderRanking();
}

function renderRanking() {
    const container = document.getElementById('ranking-list-container');
    if (!container) return;

    const rankingData = EQUIPOS.map(teamName => {
        // Usar helper central
        const puntos = getTeamProgress(teamName, rankingMode === 'semanal' ? rankingWeek : 'general');
        
        // Bonus Semanal (Todos los miembros >= 2 actividades)
        let bonusUnlocking = false;
        const miembros = usuarios.filter(u => u.equipo === teamName);
        if (miembros.length > 0) {
            const weekToCheck = (rankingMode === 'semanal') ? rankingWeek : "1"; 
            const miembrosQueCumplen = miembros.filter(m => {
                const count = actividades.filter(a => a.userId == m.id && a.semana == weekToCheck).length;
                return count >= 2;
            }).length;
            bonusUnlocking = (miembrosQueCumplen === miembros.length);
        }
        return { nombre: teamName, puntos: puntos, bonus: bonusUnlocking };
    });

    rankingData.sort((a, b) => b.puntos - a.puntos);
    container.innerHTML = '';
    rankingData.forEach((item, index) => {
        const isLeader = index === 0 && item.puntos > 0;
        const card = document.createElement('div');
        card.className = `ranking-item-v2 ${isLeader ? 'leader-card' : ''}`;
        card.innerHTML = `
            <div class="rank-pos">#${index + 1}</div>
            <div class="rank-info">
                <div class="rank-team-name">
                    ${item.nombre}
                    ${isLeader ? '<span class="leader-tag">Líder</span>' : ''}
                    ${item.bonus ? '<span class="bonus-tag">Bonus OK</span>' : ''}
                </div>
                <div class="rank-progress-track">
                    <div class="rank-progress-fill" style="width: ${Math.min(item.puntos * 3, 100)}%"></div>
                </div>
            </div>
            <div class="rank-score">
                <span class="score-num">${item.puntos}</span>
                <span class="score-unit">paradas</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function initRankingFilters() {
    // Los eventos ahora se gestionan por onclick en el HTML para evitar duplicados
}

function initForm() {
    const form = document.getElementById('activity-form');
    const evidenceInput = document.getElementById('activity-evidence');
    const evidenceNameEl = document.getElementById('evidence-filename');
    if (!form) return;
    if (evidenceInput && evidenceNameEl) {
        evidenceInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            evidenceNameEl.textContent = file ? `Archivo: ${file.name}` : 'Sin archivo seleccionado';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const userId = document.getElementById('user-select').value;
        const weekNum = parseInt(document.getElementById('activity-week').value);
        const activityType = document.getElementById('activity-type').value;
        const timeValue = parseInt(document.getElementById('activity-time').value);
        const evidenceFile = evidenceInput ? evidenceInput.files[0] : null;

        if (!userId) { showToast('⚠️ Selecciona un usuario'); return; }
        if (isNaN(timeValue) || timeValue <= 0) { showToast('⚠️ Tiempo inválido'); return; }
        if (!evidenceFile) {
            showToast('⚠️ Debes subir una evidencia');
            return;
        }

        // Desactivar botón para evitar doble envío
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';
        }

        try {
            // 1. Subir archivo al bucket Evidencias
            const fileExt = evidenceFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            const { error: uploadError } = await window.supabase.storage
                .from('Evidencias')
                .upload(fileName, evidenceFile);

            if (uploadError) {
                console.error('Error subiendo evidencia:', uploadError);
                throw uploadError;
            }

            // 2. Obtener publicUrl
            const { data: { publicUrl } } = window.supabase.storage
                .from('Evidencias')
                .getPublicUrl(fileName);

            // Preparar objeto para Supabase
            const newActivity = {
                participant_id: userId,
                week: weekNum,
                type: activityType,
                time_minutes: timeValue,
                has_evidence: true,
                evidence_name: evidenceFile.name,
                evidence_url: publicUrl
            };

            // Insertar en la tabla activities de Supabase
            const { error } = await window.supabase
                .from('activities')
                .insert([newActivity]);

            if (error) {
                // Manejar error específico del trigger de máximo 3 actividades
                if (error.message.includes('máximo 3') || error.code === 'P0001') {
                    showToast('⚠️ Límite alcanzado: Máximo 3 actividades por semana.');
                } else {
                    console.error('Error Supabase:', error);
                    showToast('❌ Error al guardar en Supabase');
                }
                throw error;
            }

            // Éxito: Refrescar datos globales desde Supabase
            console.log('✅ Actividad guardada correctamente en Supabase');
            await initSupabaseData();
            
            // Actualizar todas las vistas con los datos frescos de Supabase
            notifyDataChange();
            
            showToast(`✅ Actividad registrada para la Semana ${weekNum}`);
            
            // Limpiar formulario
            form.reset();
            if (evidenceNameEl) evidenceNameEl.textContent = 'Sin archivo seleccionado';

        } catch (err) {
            console.error('Fallo en el proceso de registro:', err);
        } finally {
            // Reactivar botón
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Registrar Actividad';
            }
        }
    });
}



// --- COMPETICIÓN EN MAPA ---

// Colores por equipo (para marcador en el mapa)
let TEAM_COLORS = {};

/**
 * Rellena el selector de equipos propio del mapa.
 */
function populateMapSelectors() {
    const select = document.getElementById('map-team-select');
    if (!select) return;
    
    // Reset (mantener opción “Todos los equipos”)
    select.innerHTML = '<option value="" selected>Todos los equipos</option>';
    
    EQUIPOS.forEach(eq => {
        const opt = document.createElement('option');
        opt.value = eq;
        opt.textContent = eq;
        select.appendChild(opt);
    });
}

/**
 * Inicializa los listeners de los selectores del mapa.
 */
function initMapFilters() {
    const teamSel = document.getElementById('map-team-select');
    const periodSel = document.getElementById('map-period-select');
    
    if (teamSel) teamSel.addEventListener('change', () => renderMap());
    if (periodSel) periodSel.addEventListener('change', () => renderMap());
}

/**
 * Dibuja marcadores de equipos en el mapa según los selectores.
 * Si no hay equipo seleccionado muestra todos los equipos.
 * El equipo seleccionado se dibuja más destacado.
 */
function drawTeamMarkers() {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;

    // Eliminar marcadores anteriores
    const old = canvas.querySelectorAll('.team-marker');
    old.forEach(m => m.remove());

    const teamSelect = document.getElementById('map-team-select');
    const periodSelect = document.getElementById('map-period-select');
    
    const selectedTeam = teamSelect ? teamSelect.value : '';
    const selectedWeek = periodSelect ? periodSelect.value : '';
    
    const weekParam = (selectedWeek === '' || selectedWeek === 'general') ? null : selectedWeek;

    const teamsToDraw = EQUIPOS;

    // Diccionario para contar cuántos equipos hay en cada parada (para el offset)
    const teamsAtPoints = {};

    teamsToDraw.forEach((teamName, index) => {
        try {
            const progress = getTeamProgress(teamName, weekParam) || 0;
            let parada = null;
            let isStartLine = false;

            if (progress <= 1) {
                // Progreso 0 y 1 → parada 1 (inicio real de la ruta)
                parada = mapConfig.puntos.find(p => p.id == 1);
                isStartLine = true;
            } else {
                parada = mapConfig.puntos.find(p => p.id == progress);
            }

            // Si no hay puntos en el mapa, no podemos dibujar nada
            if (!parada) return;

            // Calcular offset para separar markers que comparten parada
            const pointKey = isStartLine ? 'start' : (parada.id || progress);
            const offsetCount = teamsAtPoints[pointKey] || 0;
            teamsAtPoints[pointKey] = offsetCount + 1;

            // Offset en cuadrícula compacta (cluster) para evitar líneas largas
            const cols = 3;
            const row = Math.floor(offsetCount / cols);
            const col = offsetCount % cols;
            const offsetX = (col * 14) - 14; 
            const offsetY = (row * 14) - 14;

            const marker = document.createElement('div');
            marker.className = 'team-marker';
            marker.innerHTML = ''; 
            
            if (isStartLine) marker.classList.add('start-line');
            if (selectedTeam && teamName === selectedTeam) {
                marker.classList.add('selected');
            }
            
            const statusLabel = isStartLine ? 'Sin iniciar' : `${progress} paradas`;
            marker.title = `${teamName}: ${statusLabel}`;
            
            // Posicionamiento
            marker.style.left = `calc(${parada.x}% + ${offsetX}px)`;
            marker.style.top = `calc(${parada.y}% + ${offsetY}px)`;
            
            const teamIndex = EQUIPOS.indexOf(teamName);
            marker.style.backgroundColor = getTeamColor(teamName, teamIndex);
            
            canvas.appendChild(marker);
        } catch (e) {
            console.error(`Error dibujando marcador para ${teamName}:`, e);
        }
    });

    // --- ACTUALIZAR PANEL LATERAL (Info de Parada y Leyenda) ---
    updateMapSidebarInfo(selectedTeam, weekParam);
    renderMapLegend();
}

/**
 * Actualiza la información de la parada y el bloque superior en el panel lateral del mapa.
 */
function updateMapSidebarInfo(teamName, week) {
    const topNameEl = document.getElementById('map-sidebar-team-name');
    const topPeriodEl = document.getElementById('map-sidebar-period');
    const progressBlock = document.getElementById('map-progress-block');
    const genericMsg = document.getElementById('map-generic-message');
    
    const ptsEl = document.getElementById('map-sidebar-points');
    const fillEl = document.getElementById('map-sidebar-progress-fill');
    const stopNumEl = document.getElementById('map-stop-number');
    const stopNameEl = document.getElementById('map-stop-name');
    const stopDescEl = document.getElementById('map-stop-desc');

    if (!ptsEl || !fillEl || !stopNumEl || !stopNameEl || !stopDescEl) return;

    // 1. Sincronizar bloque superior
    if (topNameEl) topNameEl.textContent = teamName || 'Todos los equipos';
    if (topPeriodEl) {
        topPeriodEl.textContent = (!week || week === 'general') ? 'Vista general' : `Semana ${week} en curso`;
    }

    // 2. Gestionar visibilidad según selección
    if (!teamName) {
        if (progressBlock) progressBlock.style.display = 'none';
        if (genericMsg) genericMsg.style.display = 'block';
        return;
    } else {
        if (progressBlock) progressBlock.style.display = 'block';
        if (genericMsg) genericMsg.style.display = 'none';
    }

    const progress = getTeamProgress(teamName, week);
    const meta = 64;
    const percent = Math.min((progress / meta) * 100, 100);

    ptsEl.textContent = progress;
    fillEl.style.width = `${percent}%`;

    // Buscar info de la parada
    const parada = mapConfig.puntos.find(p => p.id === progress);
    
    if (progress === 0) {
        stopNumEl.textContent = 'SIN INICIAR';
        stopNameEl.textContent = 'Todavía no hay actividad';
        stopDescEl.textContent = '¡Registra la primera actividad para empezar la ruta!';
    } else if (parada) {
        stopNumEl.textContent = `PARADA ${parada.id}`;
        stopNameEl.textContent = parada.name || `Parada ${parada.id}`;
        stopDescEl.textContent = parada.description || 'Sin descripción todavía';
    } else {
        stopNumEl.textContent = `PARADA ${progress}`;
        stopNameEl.textContent = `Parada ${progress}`;
        stopDescEl.textContent = 'Sin descripción todavía';
    }
}

/**
 * Renderiza la lista compacta de equipos con sus paradas actuales.
 */
function renderMapLegend() {
    const container = document.getElementById('map-teams-legend');
    if (!container) return;

    container.innerHTML = '';
    
    // Obtener equipo seleccionado actualmente en el selector del mapa
    const select = document.getElementById('map-team-select');
    const selectedTeamName = select ? select.value : null;

    // Paginación del carrusel
    const totalPages = Math.ceil(EQUIPOS.length / MAP_LEGEND_VISIBLE);
    if (mapLegendPage >= totalPages) mapLegendPage = 0;
    
    const start = mapLegendPage * MAP_LEGEND_VISIBLE;
    const visibleTeams = EQUIPOS.slice(start, start + MAP_LEGEND_VISIBLE);

    visibleTeams.forEach((teamName, index) => {
        const progress = getTeamProgress(teamName);
        const color = getTeamColor(teamName, start + index);
        const isSelected = teamName === selectedTeamName;

        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.padding = '8px 10px';
        item.style.marginBottom = '4px';
        item.style.borderRadius = '8px';
        item.style.fontSize = '0.85rem';
        item.style.fontWeight = isSelected ? '700' : '500';
        item.style.background = isSelected ? '#f1f5f9' : 'transparent';
        item.style.border = isSelected ? '1px solid #cbd5e1' : '1px solid transparent';
        item.style.cursor = 'pointer';
        
        const dot = `<span style="width:10px; height:10px; background:${color}; border-radius:50%; display:inline-block; margin-right:10px; flex-shrink:0;"></span>`;
        const nameText = `<span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${teamName}">${teamName}</span>`;
        const ptsText = `<span style="width:50px; text-align:right; font-weight:800; color:var(--accent-color);">${progress} pts</span>`;
        
        item.innerHTML = dot + nameText + ptsText;
        
        item.onclick = () => {
            if (select) {
                select.value = teamName;
                select.dispatchEvent(new Event('change'));
            }
        };
        
        container.appendChild(item);
    });

    // Controles de navegación
    if (EQUIPOS.length > MAP_LEGEND_VISIBLE) {
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.justifyContent = 'center';
        controls.style.alignItems = 'center';
        controls.style.gap = '15px';
        controls.style.marginTop = '10px';
        controls.style.paddingTop = '8px';
        controls.style.borderTop = '1px solid #e2e8f0';

        controls.innerHTML = `
            <button class="btn-icon-small" ${mapLegendPage === 0 ? 'disabled style="opacity:0.3"' : ''} onclick="changeMapLegendPage(-1)">◀</button>
            <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">${mapLegendPage + 1} / ${totalPages}</span>
            <button class="btn-icon-small" ${mapLegendPage >= totalPages - 1 ? 'disabled style="opacity:0.3"' : ''} onclick="changeMapLegendPage(1)">▶</button>
        `;
        container.appendChild(controls);
    }
}

function changeMapLegendPage(delta) {
    mapLegendPage += delta;
    renderMapLegend();
}

function getTeamColor(teamName, index) {
    const dbColor = TEAM_COLORS[teamName];
    // Usar paleta si el color es el azul por defecto de Supabase o no existe
    if (!dbColor || dbColor === '#6366f1') {
        return UI_PALETTE[index % UI_PALETTE.length];
    }
    return dbColor;
}


/**
 * Renderiza el visor de mapa (Solo lectura)
 */
function renderMap() {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;

    // Actualizar imagen de fondo si existe
    const mapImg = document.getElementById('map-image');
    if (mapImg && mapConfig.backgroundImage) {
        mapImg.src = mapConfig.backgroundImage;
    }

    // Limpiar puntos anteriores (sin borrar la imagen)
    const oldPoints = canvas.querySelectorAll('.map-point');
    oldPoints.forEach(p => p.remove());

    // Pintar los puntos de la configuración
    mapConfig.puntos.forEach(p => {
        const dot = document.createElement('div');
        dot.className = 'map-point';
        
        // Aplicar estado visual basado en ID (simulado para demo)
        if (p.id <= 5) dot.classList.add('completado');
        else if (p.id === 6) dot.classList.add('en-curso');
        else dot.classList.add('proximo');

        dot.style.left = `${p.x}%`;
        dot.style.top = `${p.y}%`;
        
        dot.onclick = () => {
            const stopNumEl = document.getElementById('map-stop-number');
            const stopNameEl = document.getElementById('map-stop-name');
            const stopDescEl = document.getElementById('map-stop-desc');
            const progressBlock = document.getElementById('map-progress-block');
            const genericMsg = document.getElementById('map-generic-message');
            
            if (progressBlock) progressBlock.style.display = 'block';
            if (genericMsg) genericMsg.style.display = 'none';
            
            if (stopNumEl) stopNumEl.textContent = `PARADA ${p.id}`;
            if (stopNameEl) stopNameEl.textContent = p.name || `Parada ${p.id}`;
            if (stopDescEl) stopDescEl.textContent = p.description || 'Sin descripción todavía';
        };

        canvas.appendChild(dot);
    });
    // Dibujar marcadores de equipos según selectores del mapa
    drawTeamMarkers();
}

/**
 * Renderiza el visor de mapa (Solo lectura)
 */
function renderMapOld() {
    const pointsLayer = document.getElementById('map-points-layer');
    const legendList = document.getElementById('map-legend-list');
    const infoBox = document.getElementById('point-detail-card');
    const imageLayer = document.querySelector('#view-mapa .map-image-layer');
    
    if (!pointsLayer || !legendList) return;

    // 0. Aplicar imagen base si existe
    if (mapConfig.backgroundImage && imageLayer) {
        imageLayer.style.backgroundImage = `url("${mapConfig.backgroundImage}")`;
        imageLayer.classList.add('has-image');
    }

    // 1. Renderizar Puntos
    pointsLayer.innerHTML = '';
    const puntosParaRenderizar = mapConfig.puntos;

    puntosParaRenderizar.forEach((punto, index) => {
        const pointEl = document.createElement('div');
        pointEl.className = `map-point ${punto.status}`;
        pointEl.style.left = `${punto.x}%`;
        pointEl.style.top = `${punto.y}%`;
        pointEl.innerHTML = `<span>${index + 1}</span>`;
        
        pointEl.addEventListener('click', () => {
            infoBox.innerHTML = `
                <h4 style="color:var(--accent-color); margin-bottom:5px;">${punto.label}</h4>
                <p class="small">${punto.description || 'Sin descripción disponible.'}</p>
            `;
        });
        
        pointsLayer.appendChild(pointEl);
    });

    // 2. Renderizar Leyenda Compacta
    legendList.innerHTML = '';
    mapConfig.legend.forEach(item => {
        const legendEl = document.createElement('div');
        legendEl.className = 'legend-item';
        legendEl.innerHTML = `
            <div class="dot" style="background-color: ${item.color};"></div>
            <span>${item.nombre}</span>
        `;
        legendList.appendChild(legendEl);
    });
}

/**
 * Inicia la lógica de carga de imagen y eventos del Admin
 */
function initAdminMapLogic() {
    const changeBtn = document.getElementById('change-map-image-btn');
    const fileInput = document.getElementById('map-image-input');
    const adminMapImage = document.getElementById('admin-map-image');

    // El botón de cambio de imagen queda como recordatorio visual en esta fase,
    // pero usamos Test map.png como base fija para evitar saturar localStorage con Base64.
    if (changeBtn && fileInput) {
        changeBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await adminChangeMapImage(file);
            }
        };
    }

    // Cargar imagen en Admin
    if (adminMapImage) {
        adminMapImage.src = mapConfigDraft.backgroundImage || 'Test map.png';
        const imageNameEl = document.getElementById('current-image-name');
        if (imageNameEl) {
            const fileName = mapConfigDraft.backgroundImage ? mapConfigDraft.backgroundImage.split('/').pop() : 'Test map.png';
            imageNameEl.textContent = `Imagen: ${fileName}`;
        }
    }

    // Lógica para añadir puntos al hacer clic
    const adminPointsLayer = document.getElementById('admin-points-layer');
    if (adminPointsLayer) {
        adminPointsLayer.style.pointerEvents = 'auto'; // Habilitar clics en esta capa para el editor
        adminPointsLayer.addEventListener('click', (e) => {
            // Evitar crear punto si clicamos en un punto existente o estamos terminando un drag
            if (e.target.classList.contains('map-point') || isDragging) return;

            const rect = adminPointsLayer.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            addPoint(x, y);
        });

        // Lógica Global de Drag
        window.addEventListener('mousemove', (e) => {
            if (!isDragging || !selectedPointId) return;

            const rect = adminPointsLayer.getBoundingClientRect();
            let x = ((e.clientX - rect.left) / rect.width) * 100;
            let y = ((e.clientY - rect.top) / rect.height) * 100;

            // Limitar dentro del mapa
            x = Math.max(0, Math.min(100, x));
            y = Math.max(0, Math.min(100, y));

            const punto = mapConfigDraft.puntos.find(p => p.id === selectedPointId);
            if (punto) {
                punto.x = Math.round(x * 100) / 100;
                punto.y = Math.round(y * 100) / 100;
                
                // Actualización visual rápida sin re-render completo para suavidad
                const el = document.querySelector(`.map-point[data-id="${punto.id}"]`);
                if (el) {
                    el.style.left = `${punto.x}%`;
                    el.style.top = `${punto.y}%`;
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                saveMapConfig();
                // renderMap(); // No renderizar vista pública al mover borrador
                updateUndoRedoButtons();
            }
        });
    }

    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.onclick = undoMap;
    if (redoBtn) redoBtn.onclick = redoMap;

    const saveDraftBtn = document.getElementById('save-draft-btn');
    const publishBtn = document.getElementById('publish-map-btn');
    const restoreBtn = document.getElementById('restore-map-btn');
    const clearAllBtn = document.getElementById('clear-all-points-btn');

    if (saveDraftBtn) saveDraftBtn.onclick = () => { saveMapConfig(); showToast('Borrador guardado'); };
    if (publishBtn) publishBtn.onclick = publishMap;
    if (restoreBtn) restoreBtn.onclick = () => {
        showCustomConfirm(
            '¿Restaurar borrador?',
            '¿Seguro que quieres descartar los cambios del borrador y restaurar la versión publicada?',
            'Sí, restaurar',
            () => {
                mapConfigDraft = JSON.parse(JSON.stringify(mapConfig));
                saveMapConfig();
                renderAdminPoints();
                showToast('Borrador restaurado');
            }
        );
    };
    if (clearAllBtn) clearAllBtn.onclick = clearAllPoints;

    // Sub-navegación Admin
    const adminNavItems = document.querySelectorAll('.admin-nav-item');
    adminNavItems.forEach(item => {
        item.onclick = () => {
            const subviewId = item.getAttribute('data-subview');
            switchAdminSubview(subviewId);
        };
    });

    renderAdminPoints();
    updateUndoRedoButtons();
    initAdminActivitiesLogic(); 
}

/**
 * Sube una nueva imagen de mapa a Supabase Storage y actualiza la config
 */
async function adminChangeMapImage(file) {
    if (!file || !window.supabase) return;

    try {
        showToast('⏳ Subiendo nueva imagen del mapa...');
        
        const fileExt = file.name.split('.').pop();
        const fileName = `map_${Date.now()}.${fileExt}`;
        
        // 1. Subir archivo a bucket 'maps'
        const { error: uploadError } = await window.supabase.storage
            .from('maps')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. Obtener URL pública
        const { data: { publicUrl } } = window.supabase.storage
            .from('maps')
            .getPublicUrl(fileName);

        // 3. Actualizar la tabla map_config en Supabase
        const { error: dbError } = await window.supabase
            .from('map_config')
            .update({ background_url: publicUrl })
            .eq('id', 'main');

        if (dbError) throw dbError;

        // 4. Actualizar estado local (solo imagen)
        mapConfig.backgroundImage = publicUrl;
        if (mapConfigDraft) {
            mapConfigDraft.backgroundImage = publicUrl;
        }

        // 5. Refrescar visualmente
        renderMap();
        initAdminMapLogic(); // Refrescar el preview del editor
        
        showToast('✅ Imagen del mapa actualizada');

    } catch (err) {
        console.error('Error al cambiar imagen del mapa:', err);
        showToast(`❌ Error: ${err?.message || 'Error desconocido'}`);
    }
}

// ESTADO ADMINISTRATIVO
let currentActivityPage = 1;
const activitiesPerPage = 12;
let editingActivityId = null;
let tempEvidenceName = null; // Estado temporal para el nombre
let tempEvidenceUrl = null;  // <--- NUEVO: Estado temporal para el preview visual (Blob URL)

let currentTeamPage = 1;
const teamsPerPage = 12;

// Datos mock de actividades
const mockActivities = [
    { id: 101, user: 'Juan Pérez', team: 'Alpha', type: 'fuerte', time: '45 min', date: '23/04/2026', evidence: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400' },
    { id: 102, user: 'María García', team: 'Beta', type: 'suave', time: '20 min', date: '22/04/2026', evidence: null },
    { id: 103, user: 'Carlos Ruiz', team: 'Alpha', type: 'fuerte', time: '60 min', date: '21/04/2026', evidence: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400' }
];

// Datos mock de equipos
const mockTeams = [
    { id: 1, name: 'Alpha', members: ['Juan Pérez', 'Ana García', 'Marcos Ruiz', 'Lucía Sanz'], activities: 124, bonus: true },
    { id: 2, name: 'Beta', members: ['Pedro Gómez', 'María López', 'Elena Valls'], activities: 89, bonus: false },
    { id: 3, name: 'Gamma', members: ['Roberto Soler'], activities: 12, bonus: false },
    { id: 4, name: 'Delta', members: [], activities: 0, bonus: false },
    { id: 5, name: 'Epsilon', members: ['Sara M.', 'David L.', 'Toni F.'], activities: 45, bonus: true }
];

function switchAdminSubview(subviewId) {
    const subviews = document.querySelectorAll('.admin-subview');
    const navItems = document.querySelectorAll('.admin-nav-item');

    subviews.forEach(sv => {
        sv.classList.remove('active');
        if (sv.id === `admin-subview-${subviewId}`) {
            sv.classList.add('active');
        }
    });

    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-subview') === subviewId) {
            item.classList.add('active');
        }
    });

    if (subviewId === 'admin-equipos') renderAdminTeams();
    if (subviewId === 'admin-actividades') renderAdminActivities();
}

function renderAdminActivities() {
    const tbody = document.getElementById('admin-activities-table-body');
    if (!tbody) return;

    // Sincronizar opciones de filtros (Semanas y Equipos reales)
    syncAdminFilterOptions();

    // Obtener valores actuales de filtros
    const fTeam = document.getElementById('admin-filter-team')?.value || "";
    const fWeek = document.getElementById('admin-filter-week')?.value || "";
    const fType = document.getElementById('admin-filter-type')?.value || "";

    tbody.innerHTML = '';
    
    // Filtrar sobre una copia para no alterar el array global
    let filtered = [...actividades];

    if (fTeam) {
        filtered = filtered.filter(act => {
            const user = usuarios.find(u => u.id == act.userId);
            return user && user.equipo === fTeam;
        });
    }
    if (fWeek) {
        filtered = filtered.filter(act => String(act.semana) === fWeek);
    }
    if (fType) {
        filtered = filtered.filter(act => (act.tipo || act.type) === fType);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#94a3b8;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔍</div>
            No se encontraron actividades con los filtros seleccionados
        </td></tr>`;
        return;
    }

    // Ordenar por fecha (más reciente primero)
    const sortedActs = filtered.sort((a, b) => {
        const dateA = new Date(a.fecha || a.createdAt || a.id);
        const dateB = new Date(b.fecha || b.createdAt || b.id);
        return dateB - dateA;
    });

    sortedActs.forEach(act => {
        const user = usuarios.find(u => u.id == act.userId) || { nombre: act.userName || 'Desconocido', equipo: act.equipo || 'N/A' };
        
        // Formateo seguro de fecha
        const rawDate = act.fecha || act.createdAt || act.id;
        const dateObj = new Date(rawDate);
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('es-ES') : '—';
        
        const typeValue = act.tipo || act.type || 'suave';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${user.nombre}</strong></td>
            <td>${user.equipo}</td>
            <td>Semana ${act.semana || 1}</td>
            <td><span class="tag-${typeValue}">${typeValue.charAt(0).toUpperCase() + typeValue.slice(1)}</span></td>
            <td>${act.tiempo || 0} min</td>
            <td>${dateStr}</td>
            <td>
                <button type="button" class="btn-icon-small" title="Editar" data-action="edit" data-id="${act.id}">✏️</button>
                <button type="button" class="btn-icon-small text-danger" title="Eliminar" data-action="delete" data-id="${act.id}">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Inicializar delegación de eventos una sola vez
    initAdminActivitiesEvents();
}

/**
 * Rellena dinámicamente los selectores de filtro basándose en los datos actuales
 */
function syncAdminFilterOptions() {
    const teamSel = document.getElementById('admin-filter-team');
    const weekSel = document.getElementById('admin-filter-week');
    
    if (!teamSel || !weekSel) return;

    // 1. Equipos: Usamos la lista global EQUIPOS
    if (teamSel.options.length <= 1) {
        EQUIPOS.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team;
            opt.textContent = team;
            teamSel.appendChild(opt);
        });
    }

    // 2. Semanas: Extraemos solo las semanas que tengan actividad real
    const currentWeekVal = weekSel.value;
    const uniqueWeeks = [...new Set(actividades.map(a => a.semana))].filter(Boolean).sort((a, b) => a - b);
    
    // Refrescamos solo si es necesario para evitar perder el foco si hay muchos cambios
    weekSel.innerHTML = '<option value="">Todas las semanas</option>';
    uniqueWeeks.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = `Semana ${w}`;
        weekSel.appendChild(opt);
    });
    weekSel.value = currentWeekVal;
}

/**
 * Funciones para añadir nueva actividad desde Admin
 */
function openAddActivityPanel() {
    const panel = document.getElementById('activity-add-panel');
    const userSel = document.getElementById('add-act-user');
    if (!panel || !userSel) return;

    // Poblar selector de usuarios si está vacío
    if (userSel.options.length <= 1) {
        // Ordenamos usuarios por nombre
        const sortedUsers = [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));
        sortedUsers.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.nombre;
            userSel.appendChild(opt);
        });
    }

    // Resetear campos
    userSel.value = "";
    document.getElementById('add-act-team').textContent = "--";
    document.getElementById('add-act-week').value = "1";
    document.getElementById('add-act-type').value = "suave";
    document.getElementById('add-act-time').value = "";

    panel.classList.add('active');
}

function closeAddActivityPanel() {
    const panel = document.getElementById('activity-add-panel');
    if (panel) panel.classList.remove('active');
}

function updateAddActivityTeam() {
    const userId = document.getElementById('add-act-user').value;
    const teamLabel = document.getElementById('add-act-team');
    if (!userId) {
        teamLabel.textContent = "--";
        return;
    }
    const user = usuarios.find(u => u.id == userId);
    teamLabel.textContent = user ? user.equipo : "--";
}

async function addAdminActivity() {
    const userId = document.getElementById('add-act-user').value;
    const semana = parseInt(document.getElementById('add-act-week').value);
    const tipo = document.getElementById('add-act-type').value;
    const tiempo = parseInt(document.getElementById('add-act-time').value);

    if (!userId) {
        showToast('⚠️ Selecciona un usuario');
        return;
    }
    if (isNaN(tiempo) || tiempo <= 0) {
        showToast('⚠️ Introduce un tiempo válido');
        return;
    }

    try {
        const { error } = await window.supabase
            .from('activities')
            .insert([{
                participant_id: userId,
                week: semana,
                type: tipo,
                time_minutes: tiempo,
                has_evidence: false,
                evidence_name: null
            }]);

        if (error) throw error;

        // Éxito: Refrescar y cerrar
        await initSupabaseData();
        notifyDataChange();
        renderAdminActivities();
        closeAddActivityPanel();
        showToast('✅ Actividad creada correctamente');

    } catch (err) {
        console.error('Error al crear actividad desde Admin:', err);
        showToast(`❌ Error: ${err?.message || 'Error desconocido'}`);
    }
}

/**
 * Inicializa la delegación de eventos para la tabla de actividades (Centralizado)
 */
function initAdminActivitiesEvents() {
    const tbody = document.getElementById('admin-activities-table-body');
    if (!tbody || tbody.dataset.eventsInitialized) return;

    tbody.addEventListener('click', (e) => {
        // Encontrar el botón pulsado (o si se pulsó el emoji dentro del botón)
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'edit') {
            openActivityEditor(id);
        } else if (action === 'delete') {
            adminDeleteActivity(id);
        }
    });

    tbody.dataset.eventsInitialized = 'true';
}

/**
 * Inicializa los listeners para los controles del panel de edición de actividades
 */
function initAdminActivitiesLogic() {
    const editEvidenceInput = document.getElementById('edit-act-evidence');
    const removeBtn = document.getElementById('remove-evidence-btn');

    if (editEvidenceInput) {
        editEvidenceInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Revocar URL anterior si existía para evitar fugas de memoria
                if (tempEvidenceUrl) URL.revokeObjectURL(tempEvidenceUrl);
                
                tempEvidenceName = file.name;
                tempEvidenceUrl = URL.createObjectURL(file);
                updateEvidencePreview(tempEvidenceUrl, tempEvidenceName);
            }
        });
    }

    if (removeBtn) {
        removeBtn.onclick = () => {
            if (tempEvidenceUrl) URL.revokeObjectURL(tempEvidenceUrl);
            tempEvidenceName = "";
            tempEvidenceUrl = null;
            updateEvidencePreview(null, null);
        };
    }
}

/**
 * Actualiza la previsualización de evidencia en el panel lateral (solo texto para admin)
 */
function updateEvidencePreview(url, name) {
    const previewContainer = document.getElementById('evidence-preview-container');
    const removeBtn = document.getElementById('remove-evidence-btn');
    if (!previewContainer) return;

    // Caso A: Tenemos URL (preview temporal o URL real de Supabase si existiera)
    if (url) {
        previewContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:10px; width:100%;">
                <div class="mini-preview-container" style="cursor:pointer; width:100%; max-height:150px; overflow:hidden; border-radius:8px; border:1px solid #e2e8f0;" onclick="window.open('${url}', '_blank')" title="Ver imagen completa">
                    <img src="${url}" style="width:100%; height:auto; object-fit:cover; display:block;">
                </div>
                ${name ? `<p class="small" style="word-break:break-all; font-weight:600; text-align:center;">${name}</p>` : ''}
                <p class="tiny-text" style="color:var(--accent-color); font-weight:700;">Vista previa temporal</p>
            </div>
        `;
        if (removeBtn) removeBtn.style.display = 'block';
    } 
    // Caso B: Solo tenemos el nombre (Post-F5 o metadatos puros)
    else if (name) {
        previewContainer.innerHTML = `
            <div class="evidence-file-info" style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
                <div style="font-size: 28px; margin-bottom: 8px;">📄</div>
                <p class="small" style="word-break: break-all; color: var(--text-main); font-weight: 600;">${name}</p>
                <p class="tiny-text" style="color: var(--text-secondary); margin-top: 4px;">Archivo guardado como metadato. No hay preview disponible.</p>
            </div>
        `;
        if (removeBtn) removeBtn.style.display = 'block';
    } 
    // Caso C: Nada
    else {
        previewContainer.innerHTML = `
            <div class="no-evidence" style="text-align: center; padding: 20px; color: #94a3b8;">
                <span style="font-size: 24px; display: block; margin-bottom: 8px;">📷</span>
                <span>Sin evidencia</span>
            </div>
        `;
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function adminDeleteActivity(id) {
    const act = actividades.find(a => a.id == id);
    if (!act) return;

    const user = usuarios.find(u => u.id == act.userId) || { nombre: 'Desconocido' };
    const typeLabel = (act.tipo || act.type || 'suave').charAt(0).toUpperCase() + (act.tipo || act.type || 'suave').slice(1);

    showCustomConfirm(
        'Eliminar Actividad',
        `¿Seguro que quieres eliminar esta actividad de ${user.nombre}? (Semana ${act.semana}, ${typeLabel}, ${act.tiempo} min)`,
        'Sí, eliminar',
        async () => {
            try {
                const { error } = await window.supabase
                    .from('activities')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                // Éxito: Refrescar
                await initSupabaseData();
                notifyDataChange();
                renderAdminActivities();
                showToast('✅ Actividad eliminada correctamente');

            } catch (err) {
                console.error('Error al eliminar actividad:', err);
                showToast(`❌ Error: ${err?.message || 'Error desconocido'}`);
            }
        }
    );
}

/**
 * Elimina todas las actividades de la base de datos local con doble confirmación
 */
function deleteAllActivitiesAdmin() {
    showCustomConfirm(
        '¿Eliminar TODAS las actividades?',
        'Esta acción borrará los registros de todos los equipos permanentemente en Supabase. ¿Estás seguro?',
        'Sí, continuar',
        () => {
            // Segunda confirmación con validación de texto
            showCustomPrompt(
                'Confirmación Final',
                'Para confirmar el borrado total, escribe exactamente la palabra ELIMINAR en el cuadro de abajo:',
                'Escribe ELIMINAR aquí...',
                'Borrar todo definitivamente',
                async (inputValue) => {
                    if (inputValue === 'ELIMINAR') {
                        try {
                            // Ejecutar DELETE masivo en Supabase
                            // Supabase requiere un filtro para DELETE; neq con UUID inexistente borra todo
                            const { error } = await window.supabase
                                .from('activities')
                                .delete()
                                .neq('id', '00000000-0000-0000-0000-000000000000');

                            if (error) throw error;

                            // Éxito: Refrescar datos globales desde el servidor
                            console.log('💥 Todas las actividades han sido eliminadas de Supabase');
                            await initSupabaseData();
                            
                            notifyDataChange();
                            renderAdminActivities();
                            
                            showToast('💥 Todas las actividades han sido eliminadas');

                        } catch (err) {
                            console.error('Error al realizar borrado masivo:', err);
                            showToast(`❌ Error: ${err?.message || 'Error desconocido'}`);
                        }
                    } else {
                        showToast('❌ Texto incorrecto. Operación cancelada.');
                    }
                }
            );
        }
    );
}

function openActivityEditor(id) {
    const panel = document.getElementById('activity-edit-panel');
    const act = actividades.find(a => a.id == id);
    if (!panel || !act) return;

    editingActivityId = id;

    // Resetear estados temporales
    if (tempEvidenceUrl) URL.revokeObjectURL(tempEvidenceUrl);
    tempEvidenceName = null;
    tempEvidenceUrl = null;

    const user = usuarios.find(u => u.id == act.userId) || { nombre: act.userName || 'Desconocido', equipo: act.equipo || 'N/A' };

    document.getElementById('edit-act-user').textContent = user.nombre;
    document.getElementById('edit-act-team').textContent = user.equipo;
    
    // Poblar inputs editables
    document.getElementById('edit-act-week').value = act.semana || "1";
    document.getElementById('edit-act-type').value = act.tipo || act.type || "suave";
    document.getElementById('edit-act-time').value = act.tiempo || 0;

    // Mostrar evidencia existente
    updateEvidencePreview(act.evidence || act.evidenciaUrl, act.evidenciaNombre);

    panel.classList.add('active');
}

async function saveActivityChanges() {
    if (!editingActivityId) return;
    const act = actividades.find(a => a.id == editingActivityId);
    if (!act) return;

    const saveBtn = document.querySelector('#activity-edit-panel .btn-primary');
    const week = parseInt(document.getElementById('edit-act-week').value);
    const type = document.getElementById('edit-act-type').value;
    const time = parseInt(document.getElementById('edit-act-time').value) || 0;

    if (time <= 0) {
        showToast('⚠️ El tiempo debe ser mayor a 0');
        return;
    }

    // Desactivar botón para evitar doble submit
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
    }

    try {
        // Preparar objeto de actualización para Supabase
        const updateData = {
            week: week,
            type: type,
            time_minutes: time
        };

        // Si la evidencia cambió en el estado temporal del panel
        if (tempEvidenceName !== null) {
            updateData.has_evidence = tempEvidenceName !== "";
            updateData.evidence_name = tempEvidenceName === "" ? null : tempEvidenceName;
        }

        // Ejecutar UPDATE en Supabase
        const { error } = await window.supabase
            .from('activities')
            .update(updateData)
            .eq('id', editingActivityId);

        if (error) throw error;

        // Éxito: Refrescar datos globales y cerrar panel
        console.log('✅ Actividad actualizada en Supabase');
        await initSupabaseData();
        
        notifyDataChange();
        renderAdminActivities();
        closeActivityEditor();
        
        showToast('✅ Cambios guardados correctamente');

    } catch (err) {
        console.error('Error al actualizar actividad:', err);
        showToast(`❌ Error: ${err?.message || 'Error desconocido'}`);
    } finally {
        // Reactivar botón
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar Cambios';
        }
    }
}

function deleteActivityFromPanel() {
    if (!editingActivityId) return;
    
    // Reutilizamos la lógica de borrado que ya tiene modal
    adminDeleteActivity(editingActivityId);
    
    // Cerramos el panel después de la acción (el modal ya se encarga del borrado)
    closeActivityEditor();
}

/**
 * Exporta todas las actividades a un archivo CSV
 */
function exportCSV() {
    if (!actividades || actividades.length === 0) {
        showToast('⚠️ No hay actividades para exportar');
        return;
    }

    // Encabezados
    let csvContent = "Usuario,Equipo,Semana,Tipo,Tiempo,Fecha,Evidencia\n";

    // Filas (usamos el array global actividades que es la fuente de verdad)
    actividades.forEach(act => {
        const user = usuarios.find(u => u.id == act.userId) || { nombre: act.userName || 'Desconocido', equipo: act.equipo || 'N/A' };
        const dateStr = new Date(act.id).toLocaleDateString('es-ES');
        const typeSafe = act.tipo || act.type || 'suave';
        const labelType = typeSafe.charAt(0).toUpperCase() + typeSafe.slice(1);
        
        // Evidencia: Nombre del archivo o estado
        const evidenceLabel = act.evidenciaNombre || (act.evidence ? 'Imagen' : 'Sin evidencia');

        const row = [
            `"${user.nombre.replace(/"/g, '""')}"`,
            `"${user.equipo.replace(/"/g, '""')}"`,
            `"Semana ${act.semana || 1}"`,
            `"${labelType}"`,
            act.tiempo || 0,
            `"${dateStr}"`,
            `"${evidenceLabel}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    // Crear Blob con BOM (\uFEFF) para que Excel reconozca UTF-8 automáticamente
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", "ruta64_actividades.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('📥 Descargando archivo CSV...');
}

function closeActivityEditor() {
    const panel = document.getElementById('activity-edit-panel');
    if (panel) panel.classList.remove('active');
    
    // Limpieza de recursos temporales
    if (tempEvidenceUrl) {
        URL.revokeObjectURL(tempEvidenceUrl);
        tempEvidenceUrl = null;
    }
    tempEvidenceName = null;
    editingActivityId = null;
}

function getTeamStatus(count) {
    if (count === 0) return { label: 'Sin actividad', class: 'sin-actividad' };
    if (count <= 2) return { label: 'En progreso', class: 'en-progreso' };
    if (count === 3) return { label: 'Falta 1 miembro', class: 'falta-uno' };
    return { label: 'Equipo completo', class: 'completo' };
}

function renderAdminTeams() {
    const grid = document.getElementById('admin-teams-grid');
    if (!grid) return;

    grid.innerHTML = '';
    EQUIPOS.forEach((teamName, index) => {
        // Encontrar miembros reales
        const teamMembers = usuarios.filter(u => u.equipo === teamName);
        
        // Contar actividades reales de esos miembros
        const memberIds = teamMembers.map(m => m.id);
        const teamActivitiesCount = actividades.filter(a => memberIds.includes(a.userId)).length;

        const status = getTeamStatus(teamMembers.length);
        const card = document.createElement('div');
        card.className = 'team-admin-card clickable';
        card.onclick = () => openTeamEditor(teamName); // Aún usa mock temporalmente
        
        let membersText = `<strong>${teamMembers.length}</strong> Miembros`;
        if (teamMembers.length === 0) {
            membersText = `<span class="small text-secondary">Sin integrantes todavía</span>`;
        }

        card.innerHTML = `
            <div class="team-card-header">
                <div>
                    <h3>${teamName}</h3>
                    <span class="status-badge ${status.class}">${status.label}</span>
                </div>
            </div>
            <div class="team-card-body">
                <p>${membersText}</p>
                <p><strong>${teamActivitiesCount}</strong> Actividades totales</p>
            </div>
            <div class="team-card-footer">
                <span class="text-link">Ver detalles →</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openTeamEditor(teamName = null) {
    const panel = document.getElementById('team-edit-panel');
    const panelTitle = panel.querySelector('.panel-header h3');
    const nameInput = document.getElementById('edit-team-name');
    const membersEl = document.getElementById('edit-team-members');
    const activitiesEl = document.getElementById('edit-team-activities');
    const bonusCheck = document.getElementById('edit-team-bonus');
    const membersList = document.getElementById('edit-team-members-list');
    const statusBadgeContainer = document.getElementById('edit-team-status-badge');

    if (!panel) return;

    if (teamName) {
        // Encontrar miembros reales
        const teamMembers = usuarios.filter(u => u.equipo === teamName);
        const memberIds = teamMembers.map(m => m.id);
        const teamActivitiesCount = actividades.filter(a => memberIds.includes(a.userId)).length;

        panelTitle.textContent = "Detalles del Equipo";
        nameInput.value = teamName;
        nameInput.disabled = false; // Habilitar edición del nombre
        nameInput.dataset.originalName = teamName; // Referencia para buscar el ID
        membersEl.textContent = teamMembers.length;
        activitiesEl.textContent = teamActivitiesCount;
        // Calcular bonus real para la semana más reciente con actividad
        const semanasEquipo = [...new Set(
            actividades.filter(a => memberIds.includes(a.userId) && a.semana)
            .map(a => a.semana)
        )].sort((a, b) => b - a);

        const semanaMasRecienteConActividad = semanasEquipo[0] || null;
        let bonusActivo = false;
        if (teamMembers.length > 0 && semanaMasRecienteConActividad) {
            const miembrosQueCumplen = teamMembers.filter(m => {
                return actividades.filter(a => a.userId === m.id && a.semana == semanaMasRecienteConActividad).length >= 2;
            }).length;
            bonusActivo = (miembrosQueCumplen === teamMembers.length);
        }
        bonusCheck.checked = bonusActivo;
        bonusCheck.disabled = true; // Siempre solo lectura

        // Configurar botón guardar cambios
        const saveBtn = panel.querySelector('.admin-actions-vertical .btn-primary');
        if (saveBtn) {
            saveBtn.onclick = () => saveTeamChanges();
        }

        // Configurar botón eliminar equipo
        const deleteBtn = panel.querySelector('.admin-actions-vertical .btn-secondary.text-danger');
        if (deleteBtn) {
            deleteBtn.onclick = () => adminRemoveTeam(teamName);
            deleteBtn.style.display = 'block';
        }

        // Badge de estado
        const status = getTeamStatus(teamMembers.length);
        statusBadgeContainer.innerHTML = `<span class="status-badge ${status.class}">${status.label}</span>`;

        // Lista de integrantes
        if (teamMembers.length === 0) {
            membersList.innerHTML = '<li class="small text-secondary" style="padding: 10px;">Sin integrantes todavía</li>';
        } else {
            membersList.innerHTML = teamMembers.map((m) => {
                const userActsCount = actividades.filter(a => a.userId === m.id).length;
                return `
                <li class="member-item">
                    <div class="member-info">
                        <div class="member-avatar">${m.nombre.substring(0, 1).toUpperCase()}</div>
                        <div style="display:flex; flex-direction:column; width:100%;">
                            <input type="text" class="member-name-input" value="${m.nombre}" disabled>
                            <span class="small text-secondary" style="margin-left:8px; font-size: 0.75rem;">${userActsCount} actividades</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn-icon-small" title="Editar nombre" onclick="adminEditMember('${m.id}', '${teamName}')">✏️</button>
                        <button class="btn-icon-small text-danger" title="Eliminar integrante" onclick="adminRemoveMember('${m.id}', '${teamName}')">🗑️</button>
                    </div>
                </li>
                `;
            }).join('');
        }

        // Configurar botón añadir
        const addMemberBtn = document.querySelector('.admin-members-section .btn-text-only');
        if (addMemberBtn) {
            addMemberBtn.onclick = () => adminAddMember(teamName);
            addMemberBtn.style.display = 'inline-block';
        }
    } else {
        // Nuevo equipo
        panelTitle.textContent = "Nuevo Equipo";
        nameInput.value = "";
        nameInput.disabled = false;
        membersEl.textContent = "0";
        activitiesEl.textContent = "0";
        bonusCheck.checked = false;
        membersList.innerHTML = '<li class="small text-secondary" style="padding: 10px;">Guarda el equipo primero para poder añadir integrantes.</li>';
        statusBadgeContainer.innerHTML = `<span class="status-badge sin-actividad">Sin actividad</span>`;
        
        // Ocultar botón de añadir integrantes hasta que exista el equipo
        const addMemberBtn = document.querySelector('.admin-members-section .btn-text-only');
        if (addMemberBtn) {
            addMemberBtn.style.display = 'none';
        }

        // Configurar botón guardar para equipo nuevo
        const saveBtn = panel.querySelector('.admin-actions-vertical .btn-primary');
        if (saveBtn) {
            saveBtn.onclick = () => saveTeamChanges();
        }

        // Ocultar botón de eliminar equipo para equipos nuevos
        const deleteBtn = panel.querySelector('.admin-actions-vertical .btn-secondary.text-danger');
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }

        setTimeout(() => nameInput.focus(), 100);
    }

    panel.classList.add('active');
}

function adminAddMember(teamName) {
    const team_id = TEAM_IDS[teamName];
    
    if (!team_id) {
        showToast('❌ Error: No se encontró el ID del equipo en el sistema.');
        return;
    }

    showCustomPrompt(
        'Añadir integrante',
        `Equipo: ${teamName}`,
        'Nombre del integrante',
        'Añadir',
        async (nombre) => {
            if (!nombre || nombre.trim() === '') {
                showToast('⚠️ El nombre no puede estar vacío');
                return false;
            }

            try {
                // Insertar en Supabase
                const { error } = await window.supabase
                    .from('participants')
                    .insert([{
                        name: nombre.trim(),
                        team_id: team_id,
                        active: true
                    }]);

                if (error) throw error;

                // Éxito: Sincronizar y refrescar vistas
                console.log(`✅ Integrante ${nombre} añadido a Supabase`);
                await initSupabaseData();
                
                notifyDataChange();
                openTeamEditor(teamName);
                renderAdminTeams();
                
                showToast(`✅ Integrante ${nombre.trim()} añadido correctamente`);
                return true; // Éxito, cerrar modal

            } catch (err) {
                console.error('Error al añadir integrante:', err);
                showToast(`❌ Error: ${err?.message || 'Fallo de conexión'}`);
                return false; // Error, mantener modal abierto para reintentar
            }
        }
    );
}

function adminEditMember(userId, teamName) {
    const user = usuarios.find(u => u.id === userId);
    if (!user) return;

    showCustomPrompt(
        'Editar integrante',
        `Equipo: ${teamName}`,
        'Nuevo nombre',
        'Guardar',
        async (nuevoNombre) => {
            if (!nuevoNombre || nuevoNombre.trim() === '') {
                showToast('⚠️ El nombre no puede estar vacío');
                return false;
            }

            try {
                // Actualizar en Supabase la tabla participants
                const { error } = await window.supabase
                    .from('participants')
                    .update({ name: nuevoNombre.trim() })
                    .eq('id', userId);

                if (error) throw error;

                // Éxito: Refrescar datos globales
                console.log(`✅ Nombre de integrante ${userId} actualizado en Supabase`);
                await initSupabaseData();
                
                notifyDataChange();
                openTeamEditor(teamName);
                renderAdminTeams();
                
                showToast(`✅ Nombre actualizado correctamente`);
                return true; // Éxito, cerrar modal

            } catch (err) {
                console.error('Error al actualizar nombre de integrante:', err);
                showToast('❌ Error al conectar con Supabase');
                return false; // Error, mantener modal abierto para reintentar
            }
        },
        user.nombre // Valor inicial
    );
}

function adminRemoveMember(userId, teamName) {
    const user = usuarios.find(u => u.id === userId);
    if (!user) return;

    showCustomConfirm(
        'Eliminar integrante',
        `¿Seguro que quieres eliminar a ${user.nombre} del equipo ${teamName}? Sus actividades se conservarán pero el usuario ya no aparecerá en las listas activas.`,
        'Eliminar',
        async () => {
            try {
                // Borrado lógico en Supabase: desactivamos al participante
                const { error } = await window.supabase
                    .from('participants')
                    .update({ active: false })
                    .eq('id', userId);

                if (error) throw error;

                // Éxito: Sincronizar datos globales y refrescar vistas
                console.log(`✅ Integrante ${userId} desactivado en Supabase`);
                await initSupabaseData();
                
                notifyDataChange();
                openTeamEditor(teamName);
                renderAdminTeams();
                
                showToast(`✅ Integrante eliminado correctamente`);

            } catch (err) {
                console.error('Error al desactivar integrante:', err);
                showToast(`❌ Error: ${err?.message || 'Fallo de conexión'}`);
            }
        }
    );
}

function adminRemoveTeam(teamName) {
    const teamId = TEAM_IDS[teamName];
    if (!teamId) {
        showToast('❌ Error: No se encontró el ID del equipo en el sistema.');
        return;
    }

    showCustomConfirm(
        'Eliminar equipo',
        `¿Seguro que quieres eliminar el equipo "${teamName}"? Los integrantes y sus actividades se conservarán, pero el equipo dejará de aparecer en la plataforma.`,
        'Eliminar',
        async () => {
            try {
                // Borrado lógico en Supabase: desactivamos el equipo
                const { error } = await window.supabase
                    .from('teams')
                    .update({ active: false })
                    .eq('id', teamId);

                if (error) throw error;

                // Éxito: Sincronizar datos globales y refrescar vistas
                console.log(`✅ Equipo ${teamId} desactivado en Supabase`);
                await initSupabaseData();
                
                notifyDataChange();
                closeTeamEditor();
                renderAdminTeams();
                
                showToast(`✅ Equipo eliminado correctamente`);

            } catch (err) {
                console.error('Error al desactivar equipo:', err);
                showToast(`❌ Error: ${err?.message || 'Fallo de conexión'}`);
            }
        }
    );
}

function closeTeamEditor() {
    const panel = document.getElementById('team-edit-panel');
    if (panel) panel.classList.remove('active');
}

/**
 * Guarda los cambios del equipo (Nombre) en Supabase
 */
async function saveTeamChanges() {
    const nameInput = document.getElementById('edit-team-name');
    if (!nameInput) return;

    const nuevoNombre = nameInput.value.trim();
    const originalName = nameInput.dataset.originalName;
    const teamId = originalName ? TEAM_IDS[originalName] : null;

    if (!nuevoNombre) {
        showToast('⚠️ El nombre del equipo no puede estar vacío');
        return;
    }

    const saveBtn = document.querySelector('#team-edit-panel .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
    }

    try {
        if (teamId) {
            // Ejecutar UPDATE en Supabase
            const { error } = await window.supabase
                .from('teams')
                .update({ name: nuevoNombre })
                .eq('id', teamId);

            if (error) throw error;
            console.log(`✅ Equipo ${teamId} actualizado a "${nuevoNombre}"`);
            showToast('✅ Nombre de equipo actualizado');
        } else {
            // Ejecutar INSERT en Supabase
            const { error } = await window.supabase
                .from('teams')
                .insert([{ name: nuevoNombre }]);

            if (error) throw error;
            console.log(`✅ Equipo "${nuevoNombre}" creado en Supabase`);
            showToast('✅ Equipo creado correctamente');
        }

        // Éxito: Sincronizar todo el estado global (Ranking, Mapa, etc.)
        await initSupabaseData();
        
        notifyDataChange();
        renderAdminTeams();
        closeTeamEditor();

    } catch (err) {
        console.error('Error al guardar equipo:', err);
        showToast(`❌ Error: ${err?.message || 'Fallo de conexión'}`);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar cambios';
        }
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = mapHistory.length === 0;
    if (redoBtn) redoBtn.disabled = mapRedoStack.length === 0;
}

function undoMap() {
    if (mapHistory.length === 0) return;
    mapRedoStack.push(JSON.parse(JSON.stringify(mapConfigDraft)));
    mapConfigDraft = mapHistory.pop();
    renderAdminPoints();
    // renderMap(); 
    saveMapConfig();
    updateUndoRedoButtons();
}

function redoMap() {
    if (mapRedoStack.length === 0) return;
    mapHistory.push(JSON.parse(JSON.stringify(mapConfigDraft)));
    mapConfigDraft = mapRedoStack.pop();
    renderAdminPoints();
    // renderMap();
    saveMapConfig();
    updateUndoRedoButtons();
}

function addPoint(x, y) {
    const newId = mapConfigDraft.puntos.length + 1;
    const newPoint = {
        id: newId,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        name: `Nueva Parada ${newId}`,
        description: "Descripción de la parada...",
        status: "current"
    };

    saveMapState();
    mapConfigDraft.puntos.push(newPoint);
    selectedPointId = newPoint.id;
    renderAdminPoints();
    // renderMap();
    saveMapConfig();
}

function renderAdminPoints() {
    const pointsLayer = document.getElementById('admin-points-layer');
    const sidebarList = document.querySelector('.admin-points-list');
    if (!pointsLayer) return;

    pointsLayer.innerHTML = '';
    mapConfigDraft.puntos.forEach((punto, index) => {
        const pointEl = document.createElement('div');
        pointEl.className = `map-point ${punto.status} ${selectedPointId === punto.id ? 'selected' : ''}`;
        pointEl.style.left = `${punto.x}%`;
        pointEl.style.top = `${punto.y}%`;
        pointEl.dataset.id = punto.id;
        pointEl.innerHTML = `<span>${index + 1}</span>`;
        
        pointEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selectedPointId = punto.id;
            isDragging = true;
            saveMapState(); // Guardar estado ANTES de empezar a mover para Undo
            renderAdminPoints();
        });

        pointEl.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que el canvas crea otro punto
        });
        
        pointsLayer.appendChild(pointEl);
    });

    // Renderizar editor en el panel lateral
    if (sidebarList) {
        if (!selectedPointId) {
            sidebarList.innerHTML = '<p class="small text-secondary">Selecciona un punto para editar sus detalles.</p>';
            return;
        }

        const punto = mapConfigDraft.puntos.find(p => p.id === selectedPointId);
        if (!punto) {
            selectedPointId = null;
            renderAdminPoints();
            return;
        }

        sidebarList.innerHTML = `
            <div class="point-editor-card">
                <div class="form-group">
                    <label>Nombre de Parada</label>
                    <input type="text" id="edit-point-name" class="clean-input" value="${punto.name || punto.label || ''}">
                </div>
                <div class="form-group">
                    <label>Leyenda / Descripción</label>
                    <textarea id="edit-point-desc" class="clean-input" rows="5" placeholder="Instrucciones para el usuario...">${punto.description || ''}</textarea>
                </div>
                <div class="admin-actions-vertical" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                    <button class="btn-primary small full-width" onclick="savePointDetails(${punto.id})">Guardar cambios en parada</button>
                    <button class="btn-secondary small full-width text-danger" onclick="deletePoint(${punto.id})">Eliminar Parada</button>
                </div>
            </div>
        `;
    }
}

function savePointDetails(id) {
    const punto = mapConfigDraft.puntos.find(p => p.id === id);
    if (!punto) return;

    const newName = document.getElementById('edit-point-name').value;
    const newDesc = document.getElementById('edit-point-desc').value;

    punto.name = newName;
    punto.description = newDesc;

    saveMapConfig();
    renderAdminPoints();
    showToast('Cambios en parada guardados');
}


function deletePoint(id) {
    showCustomConfirm(
        '¿Eliminar parada?',
        '¿Seguro que quieres eliminar esta parada permanentemente?',
        'Sí, eliminar',
        () => {
            saveMapState();
            mapConfigDraft.puntos = mapConfigDraft.puntos.filter(p => p.id !== id);
            normalizeMapPoints(mapConfigDraft); // Re-indexar tras eliminar
            if (selectedPointId === id) selectedPointId = null;
            renderAdminPoints();
            saveMapConfig();
            showToast('Parada eliminada');
        }
    );
}

function clearAllPoints() {
    showCustomConfirm(
        '¿Eliminar todas las paradas?',
        '¿Seguro que quieres eliminar todas las paradas? Esta acción no se puede deshacer.',
        'Sí, eliminar todas',
        () => {
            saveMapState(); // Guardar en historial para Undo
            mapConfigDraft.puntos = [];
            selectedPointId = null;
            saveMapConfig();
            renderAdminPoints();
            renderMap();
            showToast('Todas las paradas eliminadas');
        }
    );
}

/**
 * Muestra un modal de alerta simple (solo información)
 */
function showCustomAlert(title, message) {
    const modalContainer = document.getElementById('custom-modal-container');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const inputContainer = document.getElementById('modal-input-container');
    const inputEl = document.getElementById('modal-input');

    if (!modalContainer || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

    // Resetear estado y eventos
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    if (inputEl) inputEl.onkeydown = null;
    confirmBtn.disabled = false;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = 'Entendido';
    cancelBtn.style.display = 'none'; 
    if (inputContainer) inputContainer.style.display = 'none';

    modalContainer.style.display = 'flex';

    const close = () => {
        modalContainer.style.display = 'none';
        confirmBtn.onclick = null;
    };

    confirmBtn.onclick = (e) => {
        e.stopPropagation();
        close();
    };
    
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) close();
    };
}

/**
 * Muestra un modal de confirmación personalizado
 */
function showCustomConfirm(title, message, confirmText, onConfirm) {
    const modalContainer = document.getElementById('custom-modal-container');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const inputContainer = document.getElementById('modal-input-container');
    const inputEl = document.getElementById('modal-input');

    if (!modalContainer || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

    // Resetear estado y eventos
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    if (inputEl) inputEl.onkeydown = null;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.style.display = 'block'; 
    if (inputContainer) inputContainer.style.display = 'none';

    modalContainer.style.display = 'flex';

    const close = () => {
        modalContainer.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        if (inputEl) inputEl.onkeydown = null;
    };

    confirmBtn.onclick = (e) => {
        e.stopPropagation();
        close();
        onConfirm();
    };

    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        close();
    };
    
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) close();
    };
}

/**
 * Muestra un modal con input (prompt) personalizado
 */
function showCustomPrompt(title, message, placeholder, confirmText, onConfirm, defaultValue = '') {
    const modalContainer = document.getElementById('custom-modal-container');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const inputContainer = document.getElementById('modal-input-container');
    const inputEl = document.getElementById('modal-input');

    if (!modalContainer || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !inputContainer || !inputEl) return;

    // Resetear estado y eventos
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    inputEl.onkeydown = null;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    inputEl.placeholder = placeholder;
    inputEl.value = defaultValue;
    
    cancelBtn.style.display = 'block';
    inputContainer.style.display = 'block';

    modalContainer.style.display = 'flex';
    setTimeout(() => inputEl.focus(), 100);

    const close = () => {
        modalContainer.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        inputEl.onkeydown = null;
    };

    confirmBtn.onclick = async (e) => {
        e.stopPropagation();
        // Si el callback devuelve false explícitamente, no cerramos el modal (ej. error de validación/red)
        const result = await onConfirm(inputEl.value);
        if (result !== false) close();
    };

    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        close();
    };
    
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) close();
    };

    // Soporte para Enter
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
        }
    };
}

function saveMapState() {
    mapHistory.push(JSON.parse(JSON.stringify(mapConfigDraft)));
    if (mapHistory.length > 30) mapHistory.shift(); // Aumentar historial a 30
    mapRedoStack = []; // Limpiar redo al realizar nueva acción
    updateUndoRedoButtons();
}
function updateWeekSelector() {
    const select = document.getElementById('ranking-week-select');
    if (!select) return;

    // Obtener semanas únicas que tengan actividades
    const semanas = [...new Set(actividades.filter(a => a.semana).map(a => a.semana))].sort((a, b) => b - a);
    
    // Si no hay cambios en las semanas, no reconstruir todo para no perder la selección visual
    const currentOptions = Array.from(select.options).map(o => o.value);
    if (JSON.stringify(semanas) === JSON.stringify(currentOptions.filter(v => v !== ""))) return;

    select.innerHTML = '';
    if (semanas.length === 0) {
        select.innerHTML = '<option value="">Sin semanas</option>';
        return;
    }

    semanas.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = `Semana ${s}`;
        if (s == selectedRankingWeek) option.selected = true;
        select.appendChild(option);
    });
}

// Exponer funciones necesarias al scope global
window.adminDeleteActivity = adminDeleteActivity;
window.openActivityEditor = openActivityEditor;
window.saveActivityChanges = saveActivityChanges;
window.deleteActivityFromPanel = deleteActivityFromPanel;
window.exportCSV = exportCSV;
window.openAddActivityPanel = openAddActivityPanel;
window.closeAddActivityPanel = closeAddActivityPanel;
window.updateAddActivityTeam = updateAddActivityTeam;
window.addAdminActivity = addAdminActivity;
window.deleteAllActivitiesAdmin = deleteAllActivitiesAdmin;
window.showAdminLoginModal = showAdminLoginModal;
window.adminAddMember = adminAddMember;
window.adminEditMember = adminEditMember;
window.adminRemoveMember = adminRemoveMember;
window.closeTeamEditor = closeTeamEditor;
window.openTeamEditor = openTeamEditor;
window.saveTeamChanges = saveTeamChanges;
window.updateAddActivityTeam = updateAddActivityTeam;
window.adminChangeMapImage = adminChangeMapImage;

/**
 * Muestra el modal de login para el panel Admin
 */
function showAdminLoginModal(onSuccess) {
    const modalContainer = document.getElementById('custom-modal-container');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const inputContainer = document.getElementById('modal-input-container');
    
    if (!modalContainer || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !inputContainer) return;

    // Guardar estructura original para restaurar después (para no romper showCustomPrompt)
    const originalContent = inputContainer.innerHTML;

    // Resetear estado y eventos
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    confirmBtn.disabled = false;

    titleEl.textContent = 'Acceso Admin';
    messageEl.textContent = 'Introduce tus credenciales para continuar';
    confirmBtn.textContent = 'Entrar';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.display = 'block';

    // Inyectar inputs específicos de login
    inputContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
            <input type="text" id="admin-user" class="clean-input" placeholder="Usuario" style="width: 100%;">
            <input type="password" id="admin-pass" class="clean-input" placeholder="Contraseña" style="width: 100%;">
        </div>
    `;
    inputContainer.style.display = 'block';
    modalContainer.style.display = 'flex';

    const userIn = document.getElementById('admin-user');
    const passIn = document.getElementById('admin-pass');
    
    // Auto-focus en el primer campo
    setTimeout(() => userIn.focus(), 100);

    const close = () => {
        modalContainer.style.display = 'none';
        // Restaurar el contenido original del contenedor de inputs
        inputContainer.innerHTML = originalContent;
    };

    confirmBtn.onclick = (e) => {
        e.stopPropagation();
        const u = userIn.value.trim().toLowerCase();
        const p = passIn.value.trim();

        if (u === "admin" && p === "Ruta64Admin2026!") {
            close();
            onSuccess();
        } else {
            showToast("⚠️ Credenciales incorrectas");
            // No cerramos el modal para permitir reintentar
        }
    };

    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        close();
    };
    
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer) close();
    };

    // Permitir login con la tecla Enter
    const handleEnter = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
    };
    userIn.onkeydown = handleEnter;
    passIn.onkeydown = handleEnter;
}

/**
 * --- 🔄 INTEGRACIÓN SUPABASE (LECTURA) ---
 */

async function initSupabaseData() {
    try {
        const sbData = await fetchSupabaseData();
        if (sbData && sbData.teams && sbData.participants) {
            const mapped = mapSupabaseToLocal(sbData);
            
            // Inyectar en variables globales
            EQUIPOS = mapped.equipos;
            TEAM_COLORS = mapped.teamColors;
            TEAM_IDS = mapped.teamIds;
            usuarios = mapped.usuarios;
            actividades = mapped.actividades;

            // Sincronizar imagen del mapa desde Supabase
            if (mapped.mapBackground) {
                mapConfig.backgroundImage = mapped.mapBackground;
                if (mapConfigDraft) mapConfigDraft.backgroundImage = mapped.mapBackground;
                console.log("🗺️ Imagen del mapa cargada desde Supabase:", mapped.mapBackground);
            }

            // Sincronizar puntos desde Supabase
            if (mapped.mapPoints && Array.isArray(mapped.mapPoints) && mapped.mapPoints.length > 0) {
                mapConfig.puntos = mapped.mapPoints;
                if (mapConfigDraft) mapConfigDraft.puntos = JSON.parse(JSON.stringify(mapped.mapPoints));
                console.log(`📍 Puntos del mapa cargados desde Supabase: ${mapped.mapPoints.length} paradas.`);
            } else {
                console.warn("⚠️ No se encontraron puntos válidos en Supabase, usando fallback local.");
            }
            
            return true;
        }
        return false;
    } catch (err) {
        console.error('Error en initSupabaseData:', err);
        return false;
    }
}

async function fetchSupabaseData() {
    if (!window.supabase) return null;
    try {
        const [teamsRes, participantsRes, activitiesRes, mapRes] = await Promise.all([
            window.supabase.from('teams').select('*').eq('active', true),
            window.supabase.from('participants').select('*, teams(name)').eq('active', true),
            window.supabase.from('activities').select('*, participants(name, teams(name))'),
            window.supabase.from('map_config').select('*').eq('id', 'main').single()
        ]);

        if (teamsRes.error) throw teamsRes.error;
        if (participantsRes.error) throw participantsRes.error;
        if (activitiesRes.error) throw activitiesRes.error;
        // mapRes puede fallar si no hay fila, lo manejamos en el mapeo

        return {
            teams: teamsRes.data,
            participants: participantsRes.data,
            activities: activitiesRes.data,
            map: mapRes.data
        };
    } catch (err) {
        console.error('Error al traer datos de Supabase:', err);
        return null;
    }
}

function mapSupabaseToLocal(sbData) {
    const { teams, participants, activities, map } = sbData;
    
    let parsedPoints = null;
    if (map && map.points_json) {
        try {
            parsedPoints = typeof map.points_json === 'string' ? JSON.parse(map.points_json) : map.points_json;
        } catch (e) {
            console.error("Error parseando points_json de Supabase", e);
        }
    }

    const result = {
        equipos: [],
        teamColors: {},
        teamIds: {},
        usuarios: [],
        actividades: [],
        mapBackground: map ? map.background_url : null,
        mapPoints: parsedPoints
    };

    if (teams) {
        // Extraer nombres, colores e IDs
        result.equipos = teams.map(t => t.name).sort();
        teams.forEach(t => {
            result.teamColors[t.name] = t.color || '#6366f1';
            result.teamIds[t.name] = t.id;
        });
    }

    if (participants) {
        result.usuarios = participants.map(p => ({
            id: p.id,
            nombre: p.name,
            equipo: p.teams ? p.teams.name : 'Sin equipo'
        }));
    }

    if (activities) {
        result.actividades = activities.map(a => ({
            id: a.id,
            userId: a.participant_id,
            userName: a.participants ? a.participants.name : 'N/A',
            equipo: (a.participants && a.participants.teams) ? a.participants.teams.name : 'N/A',
            semana: String(a.week),
            tipo: a.type,
            tiempo: a.time_minutes,
            tieneEvidencia: a.has_evidence,
            evidenciaNombre: a.evidence_name,
            evidenciaUrl: a.evidence_url,
            fecha: a.created_at,
            createdAt: a.created_at
        }));
    }

    return result;
}

async function runSupabaseDiagnostic() {
    // Función mantenida para debugging manual si se necesita llamar desde consola
    const data = await fetchSupabaseData();
    console.log('--- 🧪 DIAGNÓSTICO MANUAL ---', data);
}
