// =================== GLOBALS ===================

let twinEfwCurves = null;   // from data/twin_growth_EFW.csv
let twinAcTable = {};       // from data/twin_growth_AC.csv
let growthChart = null;

// Percentiles to DISPLAY as curves
const DISPLAYED_EFW_PERCENTILES = [3, 10, 50, 90, 97];

// =================== DATA LOADING ===================

async function loadData() {
    await Promise.all([
        loadTwinEfwCurves(),
        loadTwinAcTable()
    ]);

    createChart();
    
    // Initialize the first block
    addMeasurementBlock();

    // Attach global event listeners (delegation)
    attachGlobalHandlers();
    
    updateResults(false);
}

// EFW reference for twins
async function loadTwinEfwCurves() {
    const text = await fetch('data/twin_growth_EFW.csv').then(r => r.text());
    const lines = text.trim().split('\n');
    const headerParts = lines[0].split(',');
    const percentileHeaders = headerParts.slice(1);

    twinEfwCurves = {
        weeks: [],
        percentiles: [],
        data: percentileHeaders.map(() => [])
    };

    twinEfwCurves.percentiles = percentileHeaders.map(h => {
        const trimmed = h.trim();
        if (trimmed.startsWith('q')) {
            const num = parseFloat(trimmed.slice(1));
            return isNaN(num) ? NaN : num * 100;
        } else {
            return parseFloat(trimmed);
        }
    });

    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(',');
        const ga = parseFloat(parts[0]);
        if (isNaN(ga)) return;

        twinEfwCurves.weeks.push(ga);
        parts.slice(1).forEach((v, idx) => {
            twinEfwCurves.data[idx].push(parseFloat(v));
        });
    });
}

// AC reference for twins
async function loadTwinAcTable() {
    const text = await fetch('data/twin_growth_AC.csv').then(r => r.text());
    const lines = text.trim().split('\n');
    const header = lines[0].split(',');
    const percentileHeaders = header.slice(1);

    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(',');
        const ga = parseFloat(parts[0]);
        if (isNaN(ga)) return;

        const row = {};
        percentileHeaders.forEach((h, idx) => {
            const trimmed = h.trim();
            let p;
            if (trimmed.startsWith('q')) {
                const num = parseFloat(trimmed.slice(1));
                p = isNaN(num) ? NaN : num * 100;
            } else {
                p = parseFloat(trimmed);
            }
            const val = parseFloat(parts[idx + 1]);
            if (!isNaN(p) && !isNaN(val)) row[p] = val;
        });
        twinAcTable[ga] = row;
    });
}

// =================== CHART CREATION ===================

function createChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');

    const percentileToIndex = {};
    twinEfwCurves.percentiles.forEach((p, idx) => {
        if (!isNaN(p)) percentileToIndex[Math.round(p)] = idx;
    });

    const percentileDatasets = [];

    DISPLAYED_EFW_PERCENTILES.forEach((p, displayIdx) => {
        const colIndex = percentileToIndex[p];
        if (colIndex === undefined) return;

        const data = twinEfwCurves.weeks.map((ga, rowIdx) => ({
            x: ga,
            y: twinEfwCurves.data[colIndex][rowIdx]
        }));

        percentileDatasets.push({
            label: `${p}th percentile`,
            data,
            borderColor: getColor(displayIdx),
            backgroundColor: getColor(displayIdx),
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 1
        });
    });

    Chart.register(ChartDataLabels);

    growthChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: percentileDatasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    min: 14,
                    max: 41,
                    title: { display: true, text: 'Gestational Age (weeks)' },
                    ticks: { stepSize: 1 }
                },
                y: {
                    title: { display: true, text: 'Estimated Fetal Weight (grams)' }
                }
            },
            plugins: {
                legend: { 
                    position: 'top',
                    labels: {
                        filter: item => item.text.includes('percentile')
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.raw?.y != null) {
                                return `${context.dataset.label}: ${Math.round(context.raw.y)} g`;
                            }
                            return context.dataset.label;
                        }
                    }
                },
                datalabels: { display: false }
            }
        }
    });

    growthChart._curveCount = percentileDatasets.length;
}

function getColor(index) {
    const colors = ['#1976d2', '#fb8c00', '#8e24aa', '#00acc1', '#546e7a'];
    return colors[index % colors.length];
}

// =================== DYNAMIC UI HANDLING ===================

function addMeasurementBlock() {
    const template = document.getElementById('measurementBlockTemplate');
    const clone = template.content.cloneNode(true);
    const list = document.getElementById('measurementsList');
    
    list.appendChild(clone);
    
    checkRemoveButtons();
}

function removeMeasurementBlock(button) {
    const block = button.closest('.measurement-block');
    if (block) {
        block.remove();
        updateResults(true);
        checkRemoveButtons();
    }
}

function checkRemoveButtons() {
    const blocks = document.querySelectorAll('.measurement-block');
    const buttons = document.querySelectorAll('.btn-remove');
    
    if (blocks.length <= 1) {
        buttons.forEach(btn => btn.style.display = 'none');
    } else {
        buttons.forEach(btn => btn.style.display = 'block');
    }
}

// =================== INPUT HANDLING ===================

function attachGlobalHandlers() {
    const container = document.getElementById('twinForm');
    const addBtn = document.getElementById('addMeasurementBtn');

    // Listener for "Add Measurement" button
    addBtn.addEventListener('click', () => {
        addMeasurementBlock();
    });

    // Event Delegation: Listen for interactions inside the form container
    container.addEventListener('click', (e) => {
        // Handle Remove Button
        if (e.target.classList.contains('btn-remove') || e.target.closest('.btn-remove')) {
            const btn = e.target.classList.contains('btn-remove') ? e.target : e.target.closest('.btn-remove');
            removeMeasurementBlock(btn);
        }
    });

    // --- INPUT event (Real-time calculation) ---
    container.addEventListener('input', (e) => {
        // Check what type of input triggered the event
        const isEfw = e.target.classList.contains('efw');
        const isAc = e.target.classList.contains('ac');
        const isGa = e.target.classList.contains('ga-weeks') || e.target.classList.contains('ga-days');
        
        // If any of these changed, we update the numbers.
        if (isEfw || isAc || isGa) {
            // Only update the Chart if EFW or GA changed (AC doesn't affect the EFW chart)
            updateResults(isEfw || isGa);
        }
    });

    // --- CHANGE event (Validation / Enforcement) ---
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('ga-weeks')) {
            enforceWeeksLimit(e);
            updateResults(true);
        }
        if (e.target.classList.contains('ga-days')) {
            enforceDaysLimit(e);
            updateResults(true);
        }
        // Also trigger update on change for other inputs to be safe
        if (e.target.classList.contains('efw')) updateResults(true);
        if (e.target.classList.contains('ac')) updateResults(false);
    });
}

function enforceDaysLimit(event) {
    let val = parseInt(event.target.value);
    if (isNaN(val)) return;
    event.target.value = Math.max(0, Math.min(6, val));
}

function enforceWeeksLimit(event) {
    let val = parseInt(event.target.value);
    if (isNaN(val)) return;
    event.target.value = Math.max(14, Math.min(41, val));
}

// =================== RESULTS + DISCORDANCY ===================

function updateResults(shouldUpdateChart = true) {
    const blocks = document.querySelectorAll('.measurement-block');
    const allMeasurements = [];

    blocks.forEach((block) => {
        // 1. Get Gestational Age for this block
        const weeksInput = block.querySelector('.ga-weeks');
        const daysInput = block.querySelector('.ga-days');
        
        const weeks = parseFloat(weeksInput.value || '0');
        const days  = parseFloat(daysInput.value  || '0');
        const totalGA = weeks + days / 7;

        let efwTwin1 = null;
        let efwTwin2 = null;

        // 2. Process twins in this block
        const twinCards = block.querySelectorAll('.twin-card');
        
        twinCards.forEach(row => {
            const efwInput = row.querySelector('.efw');
            const acInput = row.querySelector('.ac');
            const efwResultEl = row.querySelector('.efw-result');
            const acResultEl  = row.querySelector('.ac-result');

            const efw = efwInput && efwInput.value ? parseFloat(efwInput.value) : 0;
            const ac  = acInput && acInput.value ? parseFloat(acInput.value) : 0;
            const twinId = parseInt(row.dataset.twin);

            // Store for discordancy
            if (efw > 0) {
                if (twinId === 1) efwTwin1 = efw;
                if (twinId === 2) efwTwin2 = efw;
            }

            // Calculate EFW Percentiles
            if (efwResultEl) {
                if (efw > 0 && totalGA >= 14) {
                    const efwPct = calculateEFWPercentile(totalGA, efw);
                    efwResultEl.value = isNaN(efwPct) ? '' : `${efwPct.toFixed(1)}%`;
                } else {
                    efwResultEl.value = '';
                }
            }

            // Calculate AC Percentiles
            if (acResultEl) {
                if (ac > 0 && totalGA >= 14) {
                    const acPct = calculateACPercentile(totalGA, ac);
                    acResultEl.value = isNaN(acPct) ? '' : `${acPct.toFixed(1)}%`;
                } else {
                    acResultEl.value = '';
                }
            }
        });

        // 3. Discordancy for this block
        const discordancyEl = block.querySelector('.discordancy-value');
        if (discordancyEl) {
            if (efwTwin1 > 0 && efwTwin2 > 0) {
                const diff = Math.abs(efwTwin1 - efwTwin2);
                const maxEfw = Math.max(efwTwin1, efwTwin2);
                discordancyEl.value = ((diff / maxEfw) * 100).toFixed(1) + '%';
            } else {
                discordancyEl.value = '';
            }
        }

        // 4. Collect data for the chart from this block
        if (totalGA >= 14 && totalGA <= 41) {
            if (efwTwin1) allMeasurements.push({ twin: 1, gestationalAge: totalGA, efw: efwTwin1 });
            if (efwTwin2) allMeasurements.push({ twin: 2, gestationalAge: totalGA, efw: efwTwin2 });
        }
    });

    if (shouldUpdateChart) updateChart(allMeasurements);
}

// =================== PERCENTILE CALCULATION HELPERS ===================

function findNearestEfwWeekIndex(gestationalWeeks) {
    if (!twinEfwCurves) return -1;
    const weeks = twinEfwCurves.weeks;
    let bestIdx = 0;
    let bestDiff = Math.abs(weeks[0] - gestationalWeeks);
    for (let i = 1; i < weeks.length; i++) {
        const diff = Math.abs(weeks[i] - gestationalWeeks);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function calculateEFWPercentile(gestationalWeeks, efw) {
    if (!twinEfwCurves || isNaN(efw) || efw <= 0) return NaN;
    const rowIndex = findNearestEfwWeekIndex(gestationalWeeks);
    if (rowIndex === -1) return NaN;
    const percentiles = twinEfwCurves.percentiles.slice();
    const values = twinEfwCurves.data.map(col => col[rowIndex]);
    const pairs = [];
    for (let i = 0; i < percentiles.length; i++) {
        const p = percentiles[i];
        const v = values[i];
        if (!isNaN(p) && !isNaN(v)) pairs.push({ p, v });
    }
    if (pairs.length === 0) return NaN;
    pairs.sort((a, b) => a.v - b.v);
    if (efw <= pairs[0].v) return pairs[0].p;
    if (efw >= pairs[pairs.length - 1].v) return pairs[pairs.length - 1].p;
    for (let i = 0; i < pairs.length - 1; i++) {
        const a = pairs[i];
        const b = pairs[i + 1];
        if (efw === a.v) return a.p;
        if (efw > a.v && efw < b.v) {
            const frac = (efw - a.v) / (b.v - a.v);
            return a.p + frac * (b.p - a.p);
        }
    }
    return NaN;
}

function calculateACPercentile(gestationalWeeks, ac) {
    if (!ac || isNaN(ac)) return NaN;
    const gaKey = findNearestGA(twinAcTable, gestationalWeeks);
    if (gaKey == null) return NaN;
    const row = twinAcTable[gaKey];
    const percentiles = Object.keys(row).map(parseFloat).sort((a, b) => a - b);
    const values = percentiles.map(p => row[p]);
    if (ac <= values[0]) return percentiles[0];
    if (ac >= values[values.length - 1]) return percentiles[values.length - 1];
    for (let i = 0; i < percentiles.length - 1; i++) {
        const v1 = values[i];
        const v2 = values[i + 1];
        if (ac === v1) return percentiles[i];
        if (ac > v1 && ac < v2) {
            const frac = (ac - v1) / (v2 - v1);
            return percentiles[i] + frac * (percentiles[i + 1] - percentiles[i]);
        }
    }
    return NaN;
}

function findNearestGA(table, ga) {
    const keys = Object.keys(table).map(parseFloat);
    if (keys.length === 0) return null;
    let best = keys[0];
    let bestDiff = Math.abs(keys[0] - ga);
    for (let i = 1; i < keys.length; i++) {
        const diff = Math.abs(keys[i] - ga);
        if (diff < bestDiff) {
            best = keys[i];
            bestDiff = diff;
        }
    }
    return best;
}

// =================== CHART UPDATE ===================

function updateChart(allMeasurements) {
    if (!growthChart) return;

    // Reset datasets to just the base curves
    const N = growthChart._curveCount;
    growthChart.data.datasets = growthChart.data.datasets.slice(0, N);

    // Filter measurements for Twin 1 and Twin 2
    const twin1Data = allMeasurements
        .filter(m => m.twin === 1)
        .map(m => ({ x: m.gestationalAge, y: m.efw }))
        .sort((a, b) => a.x - b.x); // Sort by date/GA

    const twin2Data = allMeasurements
        .filter(m => m.twin === 2)
        .map(m => ({ x: m.gestationalAge, y: m.efw }))
        .sort((a, b) => a.x - b.x);

    // Add Twin 1 Line
    if (twin1Data.length > 0) {
        growthChart.data.datasets.push({
            type: 'line',
            label: 'Twin 1',
            data: twin1Data,
            borderColor: '#e53935',
            backgroundColor: '#e53935',
            pointRadius: 6,
            pointBackgroundColor: '#e53935',
            pointBorderColor: '#fff',
            fill: false,
            tension: 0.1,
            order: -1
        });
    }

    // Add Twin 2 Line
    if (twin2Data.length > 0) {
        growthChart.data.datasets.push({
            type: 'line',
            label: 'Twin 2',
            data: twin2Data,
            borderColor: '#43a047',
            backgroundColor: '#43a047',
            pointRadius: 6,
            pointBackgroundColor: '#43a047',
            pointBorderColor: '#fff',
            fill: false,
            tension: 0.1,
            order: -1
        });
    }

    growthChart.update('none');
}

// =================== DOM INIT ===================

document.addEventListener('DOMContentLoaded', () => {
    loadData().catch(err => console.error('Error loading data:', err));
});