// =================== GLOBALS ===================

let twinEfwCurves = null;   // from data/twin_growth_EFW.csv
let twinAcTable = {};       // from data/twin_growth_AC.csv
let growthChart = null;

// Percentiles to DISPLAY as curves (original look)
const DISPLAYED_EFW_PERCENTILES = [3, 10, 50, 90, 97];

// =================== DATA LOADING ===================

async function loadData() {
    await Promise.all([
        loadTwinEfwCurves(),
        loadTwinAcTable()
    ]);

    createChart();
    attachInputHandlers();
    updateResults(false); // initial blank update, no chart refresh
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
            if (!isNaN(p) && !isNaN(val)) {
                row[p] = val;
            }
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
                    // --- FIX START: Filter the legend ---
                    labels: {
                        filter: function(item, chart) {
                            // Only show items in legend if they contain "percentile"
                            // This hides "Twin 1" and "Twin 2" from the top box
                            return item.text.includes('percentile');
                        }
                    }
                    // --- FIX END ---
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

    // Save the count of background curves so updateChart knows where to slice
    growthChart._curveCount = percentileDatasets.length;
}

function getColor(index) {
    const colors = ['#d32f2f', '#1976d2', '#388e3c', '#f57c00', '#7b1fa2'];
    return colors[index % colors.length];
}

// =================== INPUT HANDLING (CHART UPDATE FIX) ===================

function attachInputHandlers() {
    const allInputs = document.querySelectorAll('#inputContainer input');

    allInputs.forEach(input => {

        input.addEventListener('input', () => {

            let shouldUpdateChart = false;

            if (
                input.classList.contains('efw') ||
                input.classList.contains('gestationalAgeWeeks') ||
                input.classList.contains('gestationalAgeDays')
            ) {
                shouldUpdateChart = true;
            }

            updateResults(shouldUpdateChart);
        });

        input.addEventListener('change', (event) => {
            const el = event.target;

            if (el.classList.contains('gestationalAgeDays')) enforceDaysLimit(event);
            if (el.classList.contains('gestationalAgeWeeks')) enforceWeeksLimit(event);

            let shouldUpdateChart = false;

            if (
                el.classList.contains('efw') ||
                el.classList.contains('gestationalAgeWeeks') ||
                el.classList.contains('gestationalAgeDays')
            ) {
                shouldUpdateChart = true;
            }

            updateResults(shouldUpdateChart);
        });
    });
}

function enforceDaysLimit(event) {
    const input = event.target;
    let val = parseInt(input.value);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > 6) val = 6;
    input.value = val;
}

function enforceWeeksLimit(event) {
    const input = event.target;
    let val = parseInt(input.value);
    if (isNaN(val)) return;
    if (val < 14) val = 14;
    if (val > 41) val = 41;
    input.value = val;
}

// =================== RESULTS + DISCORDANCY ===================

function updateResults(shouldUpdateChart = true) {
    const rows = document.querySelectorAll('.input-row');

    let efwTwin1 = null;
    let efwTwin2 = null;

    rows.forEach(row => {
        const weeks = parseFloat(row.querySelector('.gestationalAgeWeeks').value || '0');
        const days = parseFloat(row.querySelector('.gestationalAgeDays').value || '0');
        const efw = parseFloat(row.querySelector('.efw').value || '0');
        const ac  = parseFloat(row.querySelector('.ac').value || '0');

        const totalGA = weeks + days / 7;

        const efwResultEl = row.querySelector('.efw-result');
        const acResultEl  = row.querySelector('.ac-result');

        const twinId = parseInt(row.dataset.twin);
        if (efw > 0) {
            if (twinId === 1) efwTwin1 = efw;
            if (twinId === 2) efwTwin2 = efw;
        }

        // EFW percentile
        if (efw > 0 && totalGA > 0) {
            const efwPct = calculateEFWPercentile(totalGA, efw);
            efwResultEl.value = isNaN(efwPct) ? '' : `${efwPct.toFixed(1)}%`;
        } else {
            efwResultEl.value = '';
        }

        // AC percentile
        if (ac > 0 && totalGA > 0) {
            const acPct = calculateACPercentile(totalGA, ac);
            acResultEl.value = isNaN(acPct) ? '' : `${acPct.toFixed(1)}%`;
        } else {
            acResultEl.value = '';
        }
    });

    // ---- Discordancy ----
    const discordancyEl = document.getElementById('discordancyValue');
    if (discordancyEl) {
        if (efwTwin1 && efwTwin2) {
            const diff = Math.abs(efwTwin1 - efwTwin2);
            const maxEfw = Math.max(efwTwin1, efwTwin2);
            const discordancy = (diff / maxEfw) * 100;
            discordancyEl.value = `${discordancy.toFixed(1)}%`;
        } else {
            discordancyEl.value = '';
        }
    }

    // ---- Chart update ONLY when necessary ----
    if (shouldUpdateChart) {
        updateChart();
    }
}

// =================== PERCENTILE CALCULATIONS (unchanged) ===================

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
    if (ac >= values[values.length - 1]) return percentiles[percentiles.length - 1];

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

function updateChart() {
    if (!growthChart) return;

    const measurements = [];
    const rows = document.querySelectorAll('.input-row');

    // Build measurement list
    rows.forEach(row => {
        const twinId = parseInt(row.dataset.twin);

        const weeks = parseFloat(row.querySelector('.gestationalAgeWeeks').value);
        const days  = parseFloat(row.querySelector('.gestationalAgeDays').value);
        const efw   = parseFloat(row.querySelector('.efw').value);

        // Skip incomplete rows
        if (isNaN(weeks) || weeks < 14 || weeks > 41) return;
        if (isNaN(efw) || efw <= 0) return;

        const ga = weeks + (isNaN(days) ? 0 : days / 7);

        measurements.push({
            twin: twinId,
            gestationalAge: ga,
            efw
        });
    });

    // KEEP ONLY PERCENTILE CURVES (first N datasets)
    const N = growthChart._curveCount; 
    if (N && growthChart.data.datasets.length > N) {
       growthChart.data.datasets = growthChart.data.datasets.slice(0, N);
    }

    // Add Twin 1
    const twin1 = measurements.filter(m => m.twin === 1);
    if (twin1.length > 0) {
        growthChart.data.datasets.push({
            type: 'scatter',
            label: 'Twin 1',  // Updated: Set name for Tooltip
            data: twin1.map(m => ({
                x: m.gestationalAge,
                y: m.efw
            })),
            pointRadius: 6,
            pointBackgroundColor: '#e53935',
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            order: -1,
            showLine: false
        });
    }

    // Add Twin 2
    const twin2 = measurements.filter(m => m.twin === 2);
    if (twin2.length > 0) {
        growthChart.data.datasets.push({
            type: 'scatter',
            label: 'Twin 2',  // Updated: Set name for Tooltip
            data: twin2.map(m => ({
                x: m.gestationalAge,
                y: m.efw
            })),
            pointRadius: 6,
            pointBackgroundColor: '#43a047',
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            order: -1,
            showLine: false
        });
    }

    growthChart.update('none'); // no jitter, no reanimation
}

// =================== DOM INIT ===================

document.addEventListener('DOMContentLoaded', () => {
    loadData().catch(err => console.error('Error loading data:', err));
});