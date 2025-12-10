let twinEfwCurves = null;  // from twin_growth_EFW.csv – for chart curves
let twinAcTable = {};      // from twin_growth_AC.csv – for AC percentiles
let growthChart = null;

const DISPLAYED_EFW_PERCENTILES = [3, 10, 50, 90, 97];

// ---------- Data loading ----------

async function loadData() {
    await Promise.all([
        loadTwinEfwCurves(),
        loadTwinAcTable()
    ]);

    createChart();
    attachInputHandlers();
    updateResults(); // initial blank update
}

async function loadTwinEfwCurves() {
    const text = await fetch('data/twin_growth_EFW.csv').then(r => r.text());
    const lines = text.trim().split('\n');
    const headerParts = lines[0].split(',');

    // Headers like: gestational day, q0.03, q0.1, q0.5, q0.9, q0.97
    const percentileHeaders = headerParts.slice(1);

    twinEfwCurves = {
        weeks: [],             // actually gestational age in weeks (float)
        percentiles: [],       // numeric, e.g., 3,10,50,90,97
        data: percentileHeaders.map(() => [])
    };

    twinEfwCurves.percentiles = percentileHeaders.map(h => parseFloat(h.replace('q', '')) * 100);

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

async function loadTwinAcTable() {
    const text = await fetch('data/twin_growth_AC.csv').then(r => r.text());
    const lines = text.trim().split('\n');
    const header = lines[0].split(',');

    // Headers: gestational day, q0.01, q0.02, ..., q0.99
    const percentileHeaders = header.slice(1);

    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(',');
        const ga = parseFloat(parts[0]);
        if (isNaN(ga)) return;

        const row = {};
        percentileHeaders.forEach((h, idx) => {
            const p = parseFloat(h.replace('q', '')) * 100; // 0.01 -> 1, 0.5 -> 50, etc.
            const val = parseFloat(parts[idx + 1]);
            row[p] = val;
        });

        twinAcTable[ga] = row;
    });
}

// ---------- Chart creation ----------

function createChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');

    const percentileDatasets = twinEfwCurves.percentiles.map((p, pIndex) => {
        const data = twinEfwCurves.weeks.map((ga, rowIndex) => ({
            x: ga,
            y: twinEfwCurves.data[pIndex][rowIndex]
        }));

        return {
            label: `${p.toFixed(0)}th percentile`,
            data,
            borderColor: getColor(pIndex),
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        };
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
                    display: false // markers dataset will override to display
                }
            }
        }
    });
}

function getColor(index) {
    const colors = ['#d32f2f', '#1976d2', '#388e3c', '#f57c00', '#7b1fa2'];
    return colors[index % colors.length];
}

// ---------- Inputs & calculations ----------

function attachInputHandlers() {
    const allInputs = document.querySelectorAll('#inputContainer input');

    allInputs.forEach(input => {

        // Validate only AFTER typing is finished
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

        // Update results while typing
        input.addEventListener('input', () => {
            updateResults();
        });
    });

    const recalcBtn = document.getElementById('recalcBtn');
    if (recalcBtn) {
        recalcBtn.addEventListener('click', updateResults);
    }
}


function enforceDaysLimit(event) {
    const input = event.target;
    let val = parseInt(input.value);

    if (isNaN(val)) return;        // allow empty typing
    if (val < 0) val = 0;
    if (val > 6) val = 6;

    input.value = val;
}

function enforceWeeksLimit(event) {
    const input = event.target;
    let val = parseInt(input.value);

    if (isNaN(val)) return;         // allow empty typing
    if (val < 14) val = 14;
    if (val > 42) val = 42;

    input.value = val;
}


function updateResults() {
    const rows = document.querySelectorAll('.input-row');

    rows.forEach(row => {
        const weeks = parseInt(row.querySelector('.gestationalAgeWeeks').value) || 0;
        const days = parseInt(row.querySelector('.gestationalAgeDays').value) || 0;
        const efw = parseFloat(row.querySelector('.efw').value) || 0;
        const ac = parseFloat(row.querySelector('.ac').value) || 0;

        const totalGA = weeks + days / 7;

        const efwResultEl = row.querySelector('.efw-result');
        const acResultEl = row.querySelector('.ac-result');

        if (efw > 0 && totalGA > 0) {
            const efwPct = calculateEFWPercentile(totalGA, efw);
            efwResultEl.value = `${efwPct.toFixed(1)}%`;
        } else {
            efwResultEl.value = '';
        }

        if (ac > 0 && totalGA > 0) {
            const acPct = calculateACPercentile(totalGA, ac);
            if (acPct == null || isNaN(acPct)) {
                acResultEl.value = '';
            } else {
                acResultEl.value = `${acPct.toFixed(1)}%`;
            }
        } else {
            acResultEl.value = '';
        }
    });

    updateChart();
}

// EFW percentile based on twin_growth_EFW.csv table
function calculateEFWPercentile(gestationalWeeks, efw) {
    if (!twinEfwCurves || !twinEfwCurves.weeks || twinEfwCurves.weeks.length === 0) {
        return NaN;
    }
    if (isNaN(efw) || efw <= 0 || isNaN(gestationalWeeks)) {
        return NaN;
    }

    const rowIndex = findNearestEfwWeekIndex(gestationalWeeks);
    if (rowIndex === -1) return NaN;

    // percentiles like [3, 10, 50, 90, 97, ...]
    const percentiles = twinEfwCurves.percentiles.slice();
    // EFW values for that GA for each percentile
    const values = twinEfwCurves.data.map(col => col[rowIndex]);

    // Build list of (percentile, value) pairs and filter out NaNs
    const pairs = [];
    for (let i = 0; i < percentiles.length; i++) {
        const v = values[i];
        if (!isNaN(v)) {
            pairs.push({ p: percentiles[i], v });
        }
    }
    if (pairs.length === 0) return NaN;

    // Sort by EFW ascending (just to be safe)
    pairs.sort((a, b) => a.v - b.v);

    // Below lowest curve → return lowest percentile
    if (efw <= pairs[0].v) {
        return pairs[0].p;
    }
    // Above highest curve → return highest percentile
    if (efw >= pairs[pairs.length - 1].v) {
        return pairs[pairs.length - 1].p;
    }

    // Interpolate between two bounding percentiles
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

// AC percentile using twin_growth_AC.csv
function calculateACPercentile(gestationalWeeks, ac) {
    if (!ac || isNaN(ac)) return NaN;

    const gaKey = findNearestGA(twinAcTable, gestationalWeeks);
    if (gaKey == null) return NaN;

    const row = twinAcTable[gaKey];
    const percentiles = Object.keys(row).map(p => parseFloat(p)).sort((a, b) => a - b);
    const values = percentiles.map(p => row[p]);

    if (ac <= values[0]) {
        return percentiles[0];
    }
    if (ac >= values[values.length - 1]) {
        return percentiles[percentiles.length - 1];
    }

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

// ---------- Chart update with two markers: 1 & 2 ----------

function createChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');

    // Map from percentile value → column index in twinEfwCurves.data
    const percentileToIndex = {};
    twinEfwCurves.percentiles.forEach((p, idx) => {
        // p is e.g. 3, 10, 50… (from q0.03, q0.10, q0.50…)
        percentileToIndex[Math.round(p)] = idx;
    });

    // Build datasets only for the desired percentiles
    const percentileDatasets = [];
    DISPLAYED_EFW_PERCENTILES.forEach((p, displayIdx) => {
        const colIndex = percentileToIndex[p];

        // Skip if this percentile is not present in the CSV
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
                    display: false
                }
            }
        }
    });
}



// ---------- DOM init ----------

document.addEventListener('DOMContentLoaded', () => {
    loadData().catch(err => console.error('Error loading data:', err));
});
