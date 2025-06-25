// This file implements the functionality for generating cross-sections of earthquake data.
// It includes functions to select data points, calculate distances, and visualize the cross-section on the map.

let crossSectionActive = false;
let crossSectionPoints = [];
let crossSectionLine = null;
let crossSectionRect = null;
let crossSectionWidth = 20; // km
let crossSectionMap = null;

// Define onMapClick globally so it can be removed
function onMapClick(e) {
    if (!crossSectionActive) return;
    crossSectionPoints.push([e.latlng.lat, e.latlng.lng]);
    if (crossSectionPoints.length === 2) {
        crossSectionMap.off('click', onMapClick);
        crossSectionMap.getContainer().style.cursor = '';
        if (crossSectionLine) crossSectionLine.remove();
        crossSectionLine = L.polyline(crossSectionPoints, {color: 'blue'}).addTo(crossSectionMap);
        drawCrossSectionRect(crossSectionMap, crossSectionMap.earthquakeData);
    }
}

function enableCrossSection(map, earthquakeData) {
    crossSectionActive = true;
    crossSectionPoints = [];
    if (crossSectionLine) { crossSectionLine.remove(); crossSectionLine = null; }
    if (crossSectionRect) { crossSectionRect.remove(); crossSectionRect = null; }
    map.getContainer().style.cursor = 'crosshair';

    // Store references for use in onMapClick
    crossSectionMap = map;
    map.earthquakeData = earthquakeData;

    // Remove any previous click listeners before adding a new one!
    map.off('click', onMapClick);
    map.on('click', onMapClick);
}

function drawCrossSectionRect(map, earthquakeData) {
    const [A, B] = crossSectionPoints;
    let width = crossSectionWidth;

    function getRectCorners(widthKm) {
        const widthDeg = widthKm / 111;
        const dx = B[1] - A[1], dy = B[0] - A[0];
        const len = Math.sqrt(dx*dx + dy*dy);
        const ux = -dy / len, uy = dx / len; // unit perpendicular
        const p1 = [A[0] + ux*widthDeg/2, A[1] + uy*widthDeg/2];
        const p2 = [A[0] - ux*widthDeg/2, A[1] - uy*widthDeg/2];
        const p3 = [B[0] - ux*widthDeg/2, B[1] - uy*widthDeg/2];
        const p4 = [B[0] + ux*widthDeg/2, B[1] + uy*widthDeg/2];
        return [p1, p2, p3, p4];
    }

    function redrawRect(newWidth) {
        if (crossSectionRect) crossSectionRect.remove();
        crossSectionRect = L.polygon(getRectCorners(newWidth), {color: 'purple', weight: 2, fillOpacity: 0.1}).addTo(map);
        crossSectionRect.on('click', onRectClick);
    }

    function onRectClick(e) {
        // Prevent map click
        L.DomEvent.stopPropagation(e);

        // Modal for width adjustment
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-black bg-opacity-0 z-50 pointer-events-none";
        modal.innerHTML = `
            <div style="position:absolute; bottom:24px; left:24px; z-index:1001; pointer-events:auto;"
                 class="bg-white rounded-lg p-6 shadow-lg max-w-xs w-full">
                <label class="block mb-2 font-bold">Cross-section width: <span id="width-value">${width}</span> km</label>
                <input id="width-slider" type="range" min="2" max="100" value="${width}" class="w-full mb-4">
                <div class="flex justify-between">
                    <button id="apply-width" class="bg-blue-600 text-white px-4 py-2 rounded">Apply</button>
                    <button id="plot-cross-section" class="bg-green-600 text-white px-4 py-2 rounded">Plot</button>
                    <button id="close-modal" class="bg-gray-400 text-white px-4 py-2 rounded">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const slider = modal.querySelector('#width-slider');
        const widthValue = modal.querySelector('#width-value');
        slider.oninput = function() {
            width = parseInt(this.value, 10);
            widthValue.textContent = width;
            redrawRect(width);
        };

        modal.querySelector('#apply-width').onclick = function() {
            redrawRect(width);
        };
        modal.querySelector('#plot-cross-section').onclick = function() {
            document.body.removeChild(modal);
            crossSectionWidth = width;

            // Filter events in the cross-section
            const [A, B] = crossSectionPoints;
            const lineVec = [B[0] - A[0], B[1] - A[1]];
            const lineLen = Math.sqrt(lineVec[0]**2 + lineVec[1]**2);
            const ux = lineVec[0] / lineLen, uy = lineVec[1] / lineLen;

            const filteredEvents = earthquakeData.filter(eq => {
                const dx = eq.lat - A[0], dy = eq.lng - A[1];
                const t = dx*ux + dy*uy;
                const proj = [A[0] + t*ux, A[1] + t*uy];
                const dist = Math.sqrt((eq.lat - proj[0])**2 + (eq.lng - proj[1])**2) * 111; // km
                return dist < crossSectionWidth/2 && t >= 0 && t <= lineLen;
            });

            // Determine which plot type is selected
            const plotType = document.querySelector('input[name="plot-type"]:checked')?.value;
            if (plotType === 'mag-time') {
                plotMagnitudeVsTime(filteredEvents);
            } else {
                showCrossSectionPlot(filteredEvents);
            }

            if (crossSectionRect) crossSectionRect.remove();
            if (crossSectionLine) crossSectionLine.remove();
            crossSectionActive = false;
        };
        modal.querySelector('#close-modal').onclick = function() {
            document.body.removeChild(modal);
        };
    }

    redrawRect(width);
    crossSectionRect.on('click', onRectClick);
}

function showCrossSectionPlot(earthquakeData) {
    const [A, B] = crossSectionPoints;
    const lineVec = [B[0] - A[0], B[1] - A[1]];
    const lineLen = Math.sqrt(lineVec[0]**2 + lineVec[1]**2);
    const ux = lineVec[0] / lineLen, uy = lineVec[1] / lineLen;

    let xs = [], zs = [], texts = [];
    earthquakeData.forEach(eq => {
        const dx = eq.lat - A[0], dy = eq.lng - A[1];
        const t = dx*ux + dy*uy;
        const proj = [A[0] + t*ux, A[1] + t*uy];
        const dist = Math.sqrt((eq.lat - proj[0])**2 + (eq.lng - proj[1])**2) * 111; // km
        if (dist < crossSectionWidth/2 && t >= 0 && t <= lineLen) {
            xs.push(t * 111); // km along line
            zs.push(eq.depth);

            // Compose hover text (customize as needed)
            let text = `<b>Magnitude:</b> ${eq.mag ?? "?"}<br>`;
            text += `<b>Status:</b> ${eq.status ?? "?"}<br>`;
            text += `<b>Time (UTC):</b> ${eq.time ? new Date(eq.time).toISOString().replace('T',' ').substring(0,19) : "?"}<br>`;
            text += `<b>Coordinates:</b> ${eq.lat?.toFixed(4)}, ${eq.lng?.toFixed(4)}<br>`;
            text += `<b>Location:</b> ${eq.place ?? "?"}<br>`;
            text += `<b>Event id:</b> ${eq.event_id ?? "?"}`;
            texts.push(text);
        }
    });

    console.log("Cross-section earthquakes:", earthquakeData);

    // Find max depth for axis
    const maxDepth = Math.max(...zs, 0)*1.1;

    // Modal
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-4 shadow-lg w-full max-w-md flex flex-col">
            <div id="cross-section-plot" style="width:100%;height:300px;min-width:200px;min-height:200px;"></div>
            <div class="flex justify-end gap-2 mt-4">
                <button id="open-cross-section-newwin" class="bg-green-600 text-white px-4 py-2 rounded">Open in New Window</button>
                <button id="close-cross-section-modal" class="bg-blue-600 text-white px-4 py-2 rounded">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    Plotly.newPlot('cross-section-plot', [{
        x: xs,
        y: zs,
        mode: 'markers',
        marker: {color: 'black', size: 10},
        name: 'Earthquakes',
        text: texts,
        hovertemplate: '%{text}<extra></extra>'
    }], {
        xaxis: {title: 'Distance along line (km)', automargin: true},
        yaxis: {
            title: 'Depth (km)',
            autorange: 'reversed', // <-- flip axis so 0 is at the top
            range: [0, maxDepth > 0 ? maxDepth : 10],
            automargin: true
        },
        title: 'Cross-Section',
        margin: {l: 60, r: 30, t: 50, b: 60},
        autosize: false,
        height: 300,
        width: 400
    }, {responsive: false});

    document.getElementById('close-cross-section-modal').onclick = () => modal.remove();

    document.getElementById('open-cross-section-newwin').onclick = () => {
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Cross-Section Plot</title>
                <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
                <style>
                    body { margin:0; padding:0; }
                </style>
            </head>
            <body>
                <div id="big-cross-section-plot" style="width:100vw;height:90vh;"></div>
            </body>
            </html>
        `);
        win.document.close();

        // Wait for both Plotly and the plot div to be available in the new window
        function tryPlot() {
            const plotDiv = win.document.getElementById('big-cross-section-plot');
            if (win.Plotly && plotDiv) {
                win.Plotly.newPlot(
                    plotDiv,
                    [{
                        x: xs,
                        y: zs,
                        mode: 'markers',
                        marker: {color: 'black', size: 12},
                        name: 'Earthquakes',
                        text: texts,
                        hovertemplate: '%{text}<extra></extra>'
                    }],
                    {
                        xaxis: {title: 'Distance along line (km)', automargin: true},
                        yaxis: {
                            title: 'Depth (km)',
                            autorange: 'reversed',
                            range: [0, maxDepth > 0 ? maxDepth : 10],
                            automargin: true
                        },
                        title: 'Cross-Section',
                        margin: {l: 60, r: 30, t: 50, b: 60},
                        autosize: true,
                        height: win.innerHeight * 0.9,
                        width: win.innerWidth * 0.95
                    },
                    {responsive: true}
                );
                // Force y-axis reversed after plot is drawn
                plotDiv.on('plotly_afterplot', function() {
                    win.Plotly.relayout(plotDiv, {
                        'yaxis.autorange': 'reversed',
                        'yaxis.range': [0, maxDepth > 0 ? maxDepth : 10]
                    });
                });
                // Also fallback after a short delay
                setTimeout(() => {
                    win.Plotly.relayout(plotDiv, {
                        'yaxis.autorange': 'reversed',
                        'yaxis.range': [0, maxDepth > 0 ? maxDepth : 10]
                    });
                }, 300);
            } else {
                setTimeout(tryPlot, 50);
            }
        }
        tryPlot();
    };
}

function plotMagnitudeVsTime(events) {
    if (!events || events.length === 0) {
        alert("No earthquakes in selected region.");
        return;
    }
    // Prepare data
    const times = events.map(eq => new Date(eq.time));
    const mags = events.map(eq => eq.mag);

    // Sort by time
    const sorted = times.map((time, i) => ({time, mag: mags[i]}))
        .sort((a, b) => a.time - b.time);

    const x = sorted.map(d => d.time);
    const y = sorted.map(d => d.mag);

    // Scatter plot only
    const scatter = {
        x: x,
        y: y,
        mode: 'markers',
        marker: {color: 'black', size: 10, symbol: 'circle'},
        name: 'Magnitude',
        type: 'scatter'
    };

    const layout = {
        title: 'Magnitude vs Time (Cross Section)',
        xaxis: {title: 'Time'},
        yaxis: {title: 'Magnitude'},
        margin: {l: 60, r: 30, t: 50, b: 60},
        height: 350,
        width: 600,
        autosize: false
    };

    // Modal
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-4 shadow-lg max-w-2xl w-full flex flex-col" style="width:90vw; height:70vh; min-width:320px; min-height:400px;">
            <div id="mag-time-plot-cross" style="width:600px;height:350px;min-width:300px;min-height:250px;margin:0 auto;"></div>
            <div class="flex justify-end gap-2 mt-4">
                <button id="open-magtime-cross-newwin" class="bg-green-600 text-white px-4 py-2 rounded">Open in New Window</button>
                <button id="close-magtime-cross-modal" class="bg-blue-600 text-white px-4 py-2 rounded">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    Plotly.newPlot('mag-time-plot-cross', [scatter], layout, {responsive: false});

    document.getElementById('close-magtime-cross-modal').onclick = () => modal.remove();

    document.getElementById('open-magtime-cross-newwin').onclick = () => {
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Magnitude vs Time (Cross Section)</title>
                <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
                <style>
                    body { margin:0; padding:0; }
                </style>
            </head>
            <body>
                <div id="big-mag-time-plot-cross" style="width:100vw;height:90vh;"></div>
            </body>
            </html>
        `);
        win.document.close();

        function tryPlot() {
            const plotDiv = win.document.getElementById('big-mag-time-plot-cross');
            if (win.Plotly && plotDiv) {
                win.Plotly.newPlot(
                    plotDiv,
                    [scatter],
                    {
                        title: 'Magnitude vs Time (Cross Section)',
                        xaxis: {title: 'Time'},
                        yaxis: {title: 'Magnitude'},
                        margin: {l: 60, r: 30, t: 50, b: 60},
                        autosize: true,
                        height: win.innerHeight * 0.9,
                        width: win.innerWidth * 0.95
                    },
                    {responsive: true}
                );
            } else {
                setTimeout(tryPlot, 50);
            }
        }
        tryPlot();
    };
}



window.startCrossSectionSelection = function() {
    if (!window.map || !window.allPlottedEarthquakes || window.allPlottedEarthquakes.length === 0) {
        alert("Map or earthquake data not loaded.");
        return;
    }
    // Only show the alert ONCE per selection
    alert("Click two points on the map to define your cross-section line, then click the purple rectangle to plot.");
    enableCrossSection(window.map, window.allPlottedEarthquakes);
};