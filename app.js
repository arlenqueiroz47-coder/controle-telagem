// ===== App State =====
const STORAGE_KEY = 'telagem_data';
const STORAGE_TIMESTAMP_KEY = 'telagem_last_saved';
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

let currentYear, currentMonth;
let selectedDate = null;

// ===== Initialize =====
function init() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

    bindEvents();
    render();
    updateSaveIndicator();

    // Auto-save reminder when leaving the page
    window.addEventListener('beforeunload', () => {
        updateSaveTimestamp();
    });
}

// ===== Data Persistence (localStorage + IndexedDB fallback) =====
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Erro ao carregar localStorage:', e);
    }

    // Fallback: try IndexedDB
    return loadFromIndexedDB().then(data => data || {}).catch(() => ({}));
}

function loadDataSync() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveData(data) {
    // Save to localStorage
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar em localStorage:', e);
    }

    // Also save to IndexedDB as backup
    saveToIndexedDB(data);

    // Update timestamp
    updateSaveTimestamp();

    // Show save indicator animation
    flashSaveIndicator();
}

function updateSaveTimestamp() {
    const now = new Date().toISOString();
    try {
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (e) {
        // ignore
    }
}

// ===== IndexedDB Backup Layer =====
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TelagemBackupDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('data')) {
                db.createObjectStore('data');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveToIndexedDB(data) {
    openDB().then(db => {
        const tx = db.transaction('data', 'readwrite');
        const store = tx.objectStore('data');
        store.put(data, 'telagem_data');
        store.put(new Date().toISOString(), 'last_saved');
    }).catch(e => console.warn('IndexedDB save error:', e));
}

function loadFromIndexedDB() {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('data', 'readonly');
            const store = tx.objectStore('data');
            const request = store.get('telagem_data');
            request.onsuccess = () => resolve(request.result || {});
            request.onerror = () => reject(request.error);
        });
    });
}

// Try to recover from IndexedDB if localStorage is empty
async function recoverData() {
    const localData = loadDataSync();
    if (Object.keys(localData).length === 0) {
        try {
            const idbData = await loadFromIndexedDB();
            if (idbData && Object.keys(idbData).length > 0) {
                // Recover from IndexedDB
                localStorage.setItem(STORAGE_KEY, JSON.stringify(idbData));
                render();
                showToast('🔄 Dados recuperados do backup automático!');
            }
        } catch (e) {
            // IndexedDB not available, no recovery possible
        }
    }
}

// ===== Save Indicator =====
function flashSaveIndicator() {
    const indicator = document.getElementById('save-indicator');
    const text = document.getElementById('save-status-text');

    indicator.classList.add('saving');
    text.textContent = 'Salvando...';

    setTimeout(() => {
        indicator.classList.remove('saving');
        updateSaveIndicator();
    }, 600);
}

function updateSaveIndicator() {
    const text = document.getElementById('save-status-text');
    const lastSaved = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

    if (lastSaved) {
        const date = new Date(lastSaved);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let timeText;
        if (diffMins < 1) {
            timeText = 'Agora mesmo';
        } else if (diffMins < 60) {
            timeText = `${diffMins}min atrás`;
        } else if (diffHours < 24) {
            timeText = `${diffHours}h atrás`;
        } else {
            timeText = `${diffDays}d atrás`;
        }
        text.textContent = `Salvo · ${timeText}`;
    } else {
        text.textContent = 'Dados salvos';
    }
}

// ===== Key helpers =====
function getKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getValue(year, month, day) {
    const data = loadDataSync();
    return data[getKey(year, month, day)] || 0;
}

function setValue(year, month, day, value) {
    const data = loadDataSync();
    const key = getKey(year, month, day);
    if (value > 0) {
        data[key] = value;
    } else {
        delete data[key];
    }
    saveData(data);
}

// ===== Event Binding =====
function bindEvents() {
    document.getElementById('btn-prev-month').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        render();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        render();
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('btn-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('btn-save').addEventListener('click', saveModal);

    document.getElementById('input-telagem').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveModal();
        if (e.key === 'Escape') closeModal();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm(`Tem certeza que deseja limpar todos os dados de ${MONTHS_PT[currentMonth]} ${currentYear}?`)) {
            clearMonth();
        }
    });

    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-backup').addEventListener('click', backupData);
    document.getElementById('btn-restore').addEventListener('click', () => {
        document.getElementById('file-restore').click();
    });
    document.getElementById('file-restore').addEventListener('change', restoreData);

    // Update save indicator every minute
    setInterval(updateSaveIndicator, 60000);

    // Try to recover data from IndexedDB if localStorage is empty
    recoverData();
}

// ===== Render =====
function render() {
    renderMonthDisplay();
    renderCalendar();
    renderStats();
    renderWeeklySummary();
}

function renderMonthDisplay() {
    document.getElementById('current-month').textContent = MONTHS_PT[currentMonth];
    document.getElementById('current-year').textContent = currentYear;
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Day headers (Mon to Sun — Brazilian convention starts Monday)
    const headerOrder = [1, 2, 3, 4, 5, 6, 0]; // Seg, Ter, ..., Sáb, Dom
    headerOrder.forEach(d => {
        const header = document.createElement('div');
        header.className = 'day-header' + (d === 0 || d === 6 ? ' weekend' : '');
        header.textContent = DAYS_PT[d];
        grid.appendChild(header);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();

    // Offset: convert Sunday=0 to Monday-based (Mon=0, Sun=6)
    const offset = (firstDay === 0) ? 6 : firstDay - 1;

    // Empty cells before first day
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        const date = new Date(currentYear, currentMonth, day);
        const dow = date.getDay();
        const val = getValue(currentYear, currentMonth, day);
        const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;

        let classes = 'day-cell';
        if (isToday) classes += ' today';
        if (val > 0) classes += ' has-value';
        if (dow === 0 || dow === 6) classes += ' weekend-cell';

        cell.className = classes;
        cell.style.animationDelay = `${(day * 0.015)}s`;

        cell.innerHTML = `
            <span class="day-number">${day}</span>
            ${val > 0 ? `<span class="day-value">${val.toLocaleString('pt-BR')}</span>` : ''}
            <span class="day-add-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            </span>
        `;

        cell.addEventListener('click', () => openModal(day));
        grid.appendChild(cell);
    }

    // Fill remaining cells in last row
    const totalCells = offset + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remaining; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }
}

function renderStats() {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let total = 0;
    let best = 0;
    let filledDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const val = getValue(currentYear, currentMonth, d);
        if (val > 0) {
            total += val;
            filledDays++;
            if (val > best) best = val;
        }
    }

    const avg = filledDays > 0 ? Math.round(total / filledDays) : 0;

    animateCounter('stat-total-mes', total);
    animateCounter('stat-media-dia', avg);
    animateCounter('stat-melhor-dia', best);
    animateCounter('stat-dias-preenchidos', filledDays);
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    const current = parseInt(el.textContent.replace(/\./g, '')) || 0;
    if (current === target) return;

    const duration = 500;
    const steps = 30;
    const stepTime = duration / steps;
    const diff = target - current;
    let step = 0;

    const timer = setInterval(() => {
        step++;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(current + diff * eased);
        el.textContent = value.toLocaleString('pt-BR');
        if (step >= steps) {
            clearInterval(timer);
            el.textContent = target.toLocaleString('pt-BR');
        }
    }, stepTime);
}

function renderWeeklySummary() {
    const container = document.getElementById('weekly-bars');
    container.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const offset = (firstDay === 0) ? 6 : firstDay - 1;

    // Calculate weeks
    const weeks = [];
    let weekNum = 0;
    let weekTotal = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        weekTotal += getValue(currentYear, currentMonth, d);
        const date = new Date(currentYear, currentMonth, d);
        const dow = date.getDay();
        // End of week on Sunday or last day of month
        if (dow === 0 || d === daysInMonth) {
            weeks.push({ label: `Semana ${weekNum + 1}`, total: weekTotal });
            weekNum++;
            weekTotal = 0;
        }
    }

    const maxTotal = Math.max(...weeks.map(w => w.total), 1);

    weeks.forEach((week, i) => {
        const row = document.createElement('div');
        row.className = 'week-row';
        row.style.animationDelay = `${i * 0.08}s`;

        const pct = (week.total / maxTotal) * 100;

        row.innerHTML = `
            <span class="week-label">${week.label}</span>
            <div class="week-bar-container">
                <div class="week-bar" style="width: 0%"></div>
            </div>
            <span class="week-total">${week.total.toLocaleString('pt-BR')}</span>
        `;

        container.appendChild(row);

        // Animate bar
        requestAnimationFrame(() => {
            setTimeout(() => {
                row.querySelector('.week-bar').style.width = pct + '%';
            }, 100 + i * 80);
        });
    });
}

// ===== Modal =====
function openModal(day) {
    selectedDate = day;
    const val = getValue(currentYear, currentMonth, day);
    const date = new Date(currentYear, currentMonth, day);
    const dayName = DAYS_FULL[date.getDay()];

    document.getElementById('modal-title').textContent = `${dayName}, ${day} de ${MONTHS_PT[currentMonth]}`;
    const input = document.getElementById('input-telagem');
    input.value = val > 0 ? val : '';

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('active');

    setTimeout(() => input.focus(), 100);
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    selectedDate = null;
}

function saveModal() {
    if (selectedDate === null) return;

    const input = document.getElementById('input-telagem');
    const value = parseInt(input.value) || 0;

    setValue(currentYear, currentMonth, selectedDate, value);
    closeModal();
    render();
    showToast(value > 0 ? `✅ Telagem salva: ${value.toLocaleString('pt-BR')}` : '🗑️ Valor removido');
}

// ===== Actions =====
function clearMonth() {
    const data = loadDataSync();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
        const key = getKey(currentYear, currentMonth, d);
        delete data[key];
    }

    saveData(data);
    render();
    showToast(`🗑️ Dados de ${MONTHS_PT[currentMonth]} limpos`);
}

function exportData() {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let csv = 'Data,Dia da Semana,Telagem\n';
    let total = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const val = getValue(currentYear, currentMonth, d);
        const date = new Date(currentYear, currentMonth, d);
        const dayName = DAYS_FULL[date.getDay()];
        const dateStr = `${String(d).padStart(2, '0')}/${String(currentMonth + 1).padStart(2, '0')}/${currentYear}`;
        csv += `${dateStr},${dayName},${val}\n`;
        total += val;
    }

    csv += `\nTOTAL DO MÊS,,${total}\n`;

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telagem_${MONTHS_PT[currentMonth].toLowerCase()}_${currentYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('📥 Planilha CSV exportada com sucesso!');
}

// ===== Backup & Restore (JSON file) =====
function backupData() {
    const data = loadDataSync();
    const backup = {
        app: 'Controle de Telagem',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        totalEntries: Object.keys(data).length,
        data: data
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `telagem_backup_${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('💾 Backup completo salvo! Guarde este arquivo em segurança.');
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            // Validate backup structure
            if (!backup.data || typeof backup.data !== 'object') {
                showToast('❌ Arquivo de backup inválido!');
                return;
            }

            const entryCount = Object.keys(backup.data).length;

            if (confirm(`Restaurar backup com ${entryCount} registros?\n\nData do backup: ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('pt-BR') : 'Desconhecida'}\n\n⚠️ Isto irá substituir TODOS os dados atuais!`)) {
                // Merge or replace data
                saveData(backup.data);
                render();
                showToast(`✅ Backup restaurado! ${entryCount} registros carregados.`);
            }
        } catch (err) {
            showToast('❌ Erro ao ler arquivo. Verifique se é um backup válido.');
            console.error('Restore error:', err);
        }
    };

    reader.readAsText(file);
    // Reset file input so the same file can be selected again
    event.target.value = '';
}

// ===== Toast =====
function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
