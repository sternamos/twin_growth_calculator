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
    updateResults(); // initial blank update
}

// EFW reference for twins
async function loadTwinEfwCurves() {
    const text = await fetch('data/twin_growth_EFW.csv').then(r => r.text());
    const lines = text.trim().split('\n');
    const headerParts = lines[0].split(',');

    // First column: gestational age (weeks or days, but we assume "weeks" numeric)
    const percentileHeaders = headerParts.slice(1);

    twinEfwCurves = {
        weeks: [],               // GA values (float)
        percentiles: [],         // numeric percentiles, e.g. 1, 2, ..., 99
        data: percentileHeaders.map(() => [])
    };

    // Parse header names: accept "q0.03" (→3), "q0.1" (→10), or "3" (→3)
    twinEfwCurves.percentiles = percentileHeaders.map(h => {
        const trimmed = h.trim();
        if (trimmed.startsWith('q')) {
            const num = parseFloat(trimmed.slice(1)); // strip leading 'q'
            return isNaN(num) ? NaN : num * 100;      // q0.03 -> 3
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
            const num = parseFloat(v);
            twinEfwCurves.data[idx].push(num);
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
                p = isNaN(num) ? NaN : num * 100; // q0.5 -> 50
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

    // Map percentile value -> column index
    const percentileToIndex = {};
    twinEfwCurves.percentiles.forEach((p, idx) => {
        if (!isNaN(p)) {
            // Use rounded percentile as key (e.g. 3.0 -> 3)
            percentileToIndex[Math.round(p)] = idx;
        }
    });

    const percentileDatasets = [];
    DISPLAYED_EFW_PERCENTILES.forEach((p, displayIdx) => {
        const colIndex = percentileToIndex[p];
        if (colIndex === undefined) return;

        const data = twinEfwCurves.weeks.map((ga, rowIndex) => ({
            x: ga,
            y: twinEfwCurves.data[colIndex][rowIndex]
        }));

        percentileDatasets.push({
            label: `${p}th percentile`,
            data,
            borderColor: getColor(displayIdx),
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
    });

    Chart.register(ChartDataLabels);

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: percentileDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Gestational Age (weeks)'
                    },
                    min: 14,
                    max: 41,
                    ticks: {
                        stepSize: 1
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Estimated Fetal Weight (grams)'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.dataset.label || '';
                            if (context.raw && context.raw.y != null) {
                                return `${label}: ${Math.round(context.raw.y)} g`;
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    display: false // no labels on the curves
                }
            }
        }
    });
}

function getColor(index) {
    const colors = ['#d32f2f', '#1976d2', '#388e3c', '#f57c00', '#7b1fa2'];
    return colors[index % colors.length];
}

// =================== INPUTS & CALCULATIONS ===================

function attachInputHandlers() {
    const allInputs = document.querySelectorAll('#inputContainer input');

    allInputs.forEach(input => {
        // Validate GA only when user leaves the field
        input.addEventListener('change', (event) => {
            const el = event.target;

            if (el.classList.contains('gestationalAgeDays')) {
                enforceDaysLimit(event);
            }

            if (el.classList.contains('gestationalAgeWeeks')) {
                enforceWeeksLimit(event);
            }

            updateResults();
        });

        // Update results live while typing (without clamping)
        input.addEventListener('input', () => {
            updateResults();
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
    if (val > 42) val = 42;

    input.value = val;
}

function updateResults() {
    const rows = document.querySelectorAll('.input-row');

    let efwTwin1 = null;
    let efwTwin2 = null;

    rows.forEach(row => {
        const weeksVal = row.querySelector('.gestationalAgeWeeks').value;
        const daysVal = row.querySelector('.gestationalAgeDays').value;
        const efwVal = row.querySelector('.efw').value;
        const acVal = row.querySelector('.ac').value;

        const weeks = parseFloat(weeksVal || '0');
        const days = parseFloat(daysVal || '0');
        const efw = parseFloat(efwVal || '0');
        const ac = parseFloat(acVal || '0');

        const totalGA = weeks + days / 7;

        const efwResultEl = row.querySelector('.efw-result');
        const acResultEl = row.querySelector('.ac-result');

        // Store EFW per twin (for discordancy)
        const twinId = parseInt(row.dataset.twin);
        if (efw > 0) {
            if (twinId === 1) efwTwin1 = efw;
            if (twinId === 2) efwTwin2 = efw;
        }

        // EFW percentile (from table)
        if (efw > 0 && totalGA > 0) {
            const efwPct = calculateEFWPercentile(totalGA, efw);
            efwResultEl.value = isNaN(efwPct) ? '' : `${efwPct.toFixed(1)}%`;
        } else {
            efwResultEl.value = '';
        }

        // AC percentile (from table)
        if (ac > 0 && totalGA > 0) {
            const acPct = calculateACPercentile(totalGA, ac);
            acResultEl.value = isNaN(acPct) ? '' : `${acPct.toFixed(1)}%`;
        } else {
            acResultEl.value = '';
        }
    });

    // ---- Discordancy calculation ----
    const discordancyEl = document.getElementById('discordancyValue');
    if (discordancyEl) {
        if (efwTwin1 != null && efwTwin2 != null && efwTwin1 > 0 && efwTwin2 > 0) {
            const diff = Math.abs(efwTwin1 - efwTwin2);
            const maxEfw = Math.max(efwTwin1, efwTwin2);
            const discordancy = (diff / maxEfw) * 100;  // as %
            discordancyEl.value = `${discordancy.toFixed(1)}%`;
        } else {
            // One or both EFWs missing → show empty box
            discordancyEl.value = '';
        }
    }

    updateChart();
}

// ========= EFW PERCENTILE from twin_growth_EFW.csv (table-based) =========

function findNearestEfwWeekIndex(gestationalWeeks) {
    if (!twinEfwCurves || !twinEfwCurves.weeks || twinEfwCurves.weeks.length === 0) {
        return -1;
    }

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
    if (!twinEfwCurves || !twinEfwCurves.weeks || twinEfwCurves.weeks.length === 0) {
        return NaN;
    }
    if (isNaN(efw) || efw <= 0 || isNaN(gestationalWeeks)) {
        return NaN;
    }

    const rowIndex = findNearestEfwWeekIndex(gestationalWeeks);
    if (rowIndex === -1) return NaN;

    const percentiles = twinEfwCurves.percentiles.slice();
    const values = twinEfwCurves.data.map(col => col[rowIndex]);

    const pairs = [];
    for (let i = 0; i < percentiles.length; i++) {
        const p = percentiles[i];
        const v = values[i];
        if (!isNaN(p) && !isNaN(v)) {
            pairs.push({ p, v });
        }
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

// ========= AC PERCENTILE from twin_growth_AC.csv (table-based) =========

function calculateACPercentile(gestationalWeeks, ac) {
    if (!ac || isNaN(ac) || isNaN(gestationalWeeks)) return NaN;

    const gaKey = findNearestGA(twinAcTable, gestationalWeeks);
    if (gaKey == null) return NaN;

    const row = twinAcTable[gaKey];
    const percentiles = Object.keys(row).map(p => parseFloat(p)).sort((a, b) => a - b);
    const values = percentiles.map(p => row[p]);

    if (values.length === 0) return NaN;

    if (ac <= values[0]) return percentiles[0];
    if (ac >= values[values.length - 1]) return percentiles[percentiles.length - 1];

    for (let i = 0; i < percentiles.length - 1; i++) {
        const v1 = values[i];
        const v2 = values[i + 1];
        const p1 = percentiles[i];
        const p2 = percentiles[i + 1];

        if (ac === v1) return p1;
        if (ac > v1 && ac < v2) {
            const frac = (ac - v1) / (v2 - v1);
            return p1 + frac * (p2 - p1);
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
        const k = keys[i];
        const diff = Math.abs(k - ga);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = k;
        }
    }
    return best;
}

// =================== CHART UPDATE (TWINS MARKERS) ===================

function updateChart() {
    if (!growthChart) return;

    const measurements = [];
    const rows = document.querySelectorAll('.input-row');

    rows.forEach(row => {
        const twinId = parseInt(row.dataset.twin);

        const weeksVal = row.querySelector('.gestationalAgeWeeks').value;
        const daysVal = row.querySelector('.gestationalAgeDays').value;
        const efwVal = row.querySelector('.efw').value;

        if (!weeksVal || !efwVal) return; // twin not filled → skip

        const weeks = parseFloat(weeksVal);
        const days = parseFloat(daysVal || '0');
        const efw = parseFloat(efwVal);

        if (isNaN(weeks) || isNaN(days) || isNaN(efw) || efw <= 0) return;
        if (weeks < 14 || weeks > 42) return;

        const ga = weeks + days / 7;
        const efwPct = calculateEFWPercentile(ga, efw);

        measurements.push({
            twin: twinId,
            gestationalAge: ga,
            efw,
            efwPercentile: efwPct
        });
    });

    // Remove previous measurement dataset
    growthChart.data.datasets = growthChart.data.datasets.filter(
        ds => ds.label !== 'Twins measurements'
    );

    if (measurements.length === 0) {
        growthChart.update();
        return;
    }

    growthChart.data.datasets.push({
        type: 'scatter',
        label: 'Twins measurements',
        data: measurements.map(m => ({
            x: m.gestationalAge,
            y: m.efw,
            twin: m.twin,
            efwPercentile: m.efwPercentile
        })),
        pointRadius: 7,
        pointHoverRadius: 9,
        pointStyle: 'circle',
        pointBackgroundColor: measurements.map(m =>
            m.twin === 1 ? '#e53935' : '#43a047'
        ),
        pointBorderColor: '#000',
        pointBorderWidth: 1,
        showLine: false,
        datalabels: {
            display: false    // <-- just the colored circles, no "1"/"2"
        }
    });

    growthChart.update();
}

// =================== DOM INIT ===================

document.addEventListener('DOMContentLoaded', () => {
    loadData().catch(err => console.error('Error loading data:', err));
});
