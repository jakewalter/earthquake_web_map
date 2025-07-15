// --- CONFIGURATION ---
const USGS_API_BASE_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const LOCAL_API_URL = "http://127.0.0.1:5000/api/earthquakes";

// --- GLOBAL MAP VARIABLES ---
let map;
let layerGroups = {};
let polygonLayer;
let usgsEarthquakeData = null; // Add global variable for USGS data
let ogsEventData = null; // Add global variable for OGS data

// The polygon defining the primary area of interest ([lat, lng])
const oklahomaPolygonLatLng = [
    [37.0001, -103.0027], [36.9989, -94.6180], [36.4994, -94.6179], [35.3925, -94.4307],
    [33.6379, -94.4858], [33.8399, -94.9510], [33.9053, -95.1830], [33.9231, -95.4328],
    [33.8756, -95.8433], [33.8220, -96.3668], [33.8161, -96.8902], [33.8756, -97.5327],
    [33.9648, -97.9669], [34.1076, -98.4666], [34.2801, -99.1507], [34.4109, -99.5433],
    [34.5606, -100.0008], [36.4997, -100.0008], [36.5004, -103.0029], [37.0001, -103.0027]
];
// A version for point-in-polygon checks ([lng, lat])
const oklahomaPolygonLngLat = oklahomaPolygonLatLng.map(([lat, lng]) => [lng, lat]);


// --- TIME HELPERS ---
const isDst = (utcDate) => {
    const year = utcDate.getUTCFullYear();
    const dstBeginnings = {
        2024: new Date('2024-03-10T08:00:00Z'), 2025: new Date('2025-03-09T08:00:00Z')
    };
    const dstEnds = {
        2024: new Date('2024-11-03T07:00:00Z'), 2025: new Date('2025-11-02T07:00:00Z')
    };
    if (dstBeginnings[year] && dstEnds[year]) {
        return utcDate >= dstBeginnings[year] && utcDate < dstEnds[year];
    }
    return false;
};

const getLocalTime = (utcDate) => {
    const offsetHours = isDst(utcDate) ? 5 : 6;
    return new Date(utcDate.getTime() - offsetHours * 60 * 60 * 1000);
};

const pointInPolygon = (lng, lat, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

// --- UI AND DIALOGS ---
const showLoadingDialog = (show) => {
    const dialog = document.getElementById('loading-dialog');
    if (dialog) dialog.style.display = show ? 'block' : 'none';
};

const setInitialDates = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('end-date').value = today.toISOString().split('T')[0];
    document.getElementById('start-date').value = thirtyDaysAgo.toISOString().split('T')[0];
};

// --- PLOTTING LOGIC ---

function plotEarthquakes(earthquakeFeatures) {
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const plottedIds = new Set();

    earthquakeFeatures.forEach(feature => {
        if (!feature.id || plottedIds.has(feature.id)) return;

        const props = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;

        // Only plot USGS events OUTSIDE the polygon
        if (pointInPolygon(lng, lat, oklahomaPolygonLngLat)) {
            return; // Skip USGS events inside the polygon
        }

        const mag = props.mag;
        const eventTime = new Date(props.time);
        const timeDiff = now - eventTime.getTime();

        let color, layerGroup;
        if (timeDiff < oneDay) {
            color = 'red'; layerGroup = layerGroups.past24Hours;
        } else if (timeDiff < sevenDays) {
            color = 'orange'; layerGroup = layerGroups.past7Days;
        } else {
            color = 'yellow'; layerGroup = layerGroups.past30Days;
        }

        const radius = 1.75 * (mag + 1.01) ** 1.6;

        let marker = L.marker([lat, lng], {
            icon: L.divIcon({ className: '', html: `<div style="width:${radius * 2}px;height:${radius * 2}px;background:${color};border:1px solid black;opacity:0.7;"></div>`, iconSize: [radius * 2, radius * 2], iconAnchor: [radius, radius] })
        });

        marker.featureId = feature.id;

        const utcTimeStr = eventTime.toISOString().replace('T', ' ').substring(0, 19);
        const localTimeStr = getLocalTime(eventTime).toISOString().replace('T', ' ').substring(0, 19);
        const popupContent = `<div style="width:340px; text-align: left; font-family:helvetica; font-size: 13px;"><strong>Magnitude:</strong> ${mag ? mag.toFixed(1) : "?"}<br><strong>Status:</strong> ${props.status || "N/A"}<br><strong>Time (UTC):</strong> ${utcTimeStr}<br><strong>Time (Local):</strong> ${localTimeStr}<br><strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}<br><strong>Location:</strong> ${props.place}<br><a href="https://earthquake.usgs.gov/earthquakes/eventpage/${feature.id}/tellus" target="_blank" rel="noopener noreferrer">Did you feel this earthquake?</a></div>`;
        marker.bindPopup(popupContent);
        marker.addTo(layerGroup);
        plottedIds.add(feature.id);
    });

    return plottedIds;
}

// --- NEW --- Function to render the event list in the sidebar
function renderEventList(ogsEvents) {
    const listDiv = document.getElementById('ogs-events-list');
    if (!listDiv) return;

    // Sort by origintime descending
    const sortedEvents = [...ogsEvents].sort((a, b) => new Date(b.origintime) - new Date(a.origintime));

    if (sortedEvents.length === 0) {
        listDiv.innerHTML = "<em>No OGS events found for the selected time range.</em>";
        return;
    }

    listDiv.innerHTML = sortedEvents.map(event => {
        const mag = Number(event.prefmag);
        const eventTime = new Date(event.origintime);
        const timeStr = eventTime.toISOString().replace('T', ' ').substring(0, 19);

        // Get the raw event ID, preferring event_id over objectid
        const rawEventId = event.event_id || event.objectid;

        // --- NEW: Modify event_id if it starts with 'ogs' ---
        const displayEventId = rawEventId && typeof rawEventId === 'string' && rawEventId.startsWith('ogs')
            ? 'ok' + rawEventId.substring(3) // Replace 'ogs' with 'ok'
            : rawEventId; // Use the original ID if it doesn't start with 'ogs' or is not a string
        // --- END NEW ---

        // Label event type: "Earthquake" or "Quarry" (robust to string/number/undefined)
        let eventTypeLabel = 'Earthquake';
        if (typeof event.isQuarry !== 'undefined') {
            eventTypeLabel = event.isQuarry ? 'Quarry' : 'Earthquake';
        } else if (typeof event.depth !== 'undefined' && !isNaN(Number(event.depth))) {
            eventTypeLabel = (Number(event.depth) < 0.05) ? 'Quarry' : 'Earthquake';
        }

        return `
            <div class="event-list-item" data-event-id="${displayEventId}" style="cursor:pointer;padding:4px 0;border-bottom:1px solid #eee;">
                <strong>M ${!isNaN(mag) ? mag.toFixed(1) : "?"}</strong> &mdash; ${timeStr} (UTC)<br>
                <span style="font-size:12px;color:#555;">${event.county || event.state || ""} <span style="color:#888;">[${eventTypeLabel}]</span></span>
            </div>
        `;
    }).join('');
}

// --- NEW --- Function to find a marker by its ID and interact with it
function findAndOpenMarker(eventId) {
    if (!eventId) return;

    let foundMarker = null;
    const layersToSearch = [layerGroups.past24Hours, layerGroups.past7Days, layerGroups.past30Days];

    for (const group of layersToSearch) {
        group.eachLayer(marker => {
            if (marker.featureId === eventId) {
                foundMarker = marker;
            }
        });
        if (foundMarker) break;
    }

    if (foundMarker) {
        const zoomLevel = Math.max(map.getZoom() || 0, 10); // Pan in to at least zoom level 10
        map.setView(foundMarker.getLatLng(), zoomLevel);
        foundMarker.openPopup();
    } else {
        // If not found in marker layers, try to find the event in ogsEventData and pan to its coordinates
        if (window.ogsEventData && Array.isArray(window.ogsEventData)) {
            const event = window.ogsEventData.find(e => {
                const rawEventId = e.event_id || e.objectid;
                const markerFeatureId = rawEventId && typeof rawEventId === 'string' && rawEventId.startsWith('ogs')
                    ? 'ok' + rawEventId.substring(3)
                    : rawEventId;
                return markerFeatureId == eventId;
            });
            if (event && !isNaN(event.latitude) && !isNaN(event.longitude)) {
                const lat = Number(event.latitude);
                const lng = Number(event.longitude);
                const zoomLevel = Math.max(map.getZoom() || 0, 10);
                map.setView([lat, lng], zoomLevel);
            }
        }
    }
}

// --- MAIN DATA CONTROLLER ---
async function updateMap(showLoading = true) {
    if (showLoading) showLoadingDialog(true);

    layerGroups.past24Hours.clearLayers();
    layerGroups.past7Days.clearLayers();
    layerGroups.past30Days.clearLayers();

    const startInput = document.getElementById('start-date').value;
    const endInput = document.getElementById('end-date').value;
    const minMag = document.getElementById('min-mag').value;
    const startDate = new Date(startInput);
    const endDate = new Date(endInput);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 0);
    const pad = n => n.toString().padStart(2, '0');
    const toApiDateString = date => {
        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate()) + 'T' +
            pad(date.getHours()) + ':' +
            pad(date.getMinutes()) + ':' +
            pad(date.getSeconds());
    }

    const startStr = toApiDateString(startDate);
    const endStr = toApiDateString(endDate);

    let usgsEarthquakeData = null;
    try {
        // Fetch USGS data (for map plotting outside Oklahoma)
        const minLat = 25.0, maxLat = 45.0, minLng = -108.0, maxLng = -90.0;
        const usgsUrl = `${USGS_API_BASE_URL}?format=geojson&starttime=${startStr}&endtime=${endStr}&minlatitude=${minLat}&maxlatitude=${maxLat}&minlongitude=${minLng}&maxlongitude=${maxLng}&minmagnitude=${minMag}`;
        const usgsResponse = await fetch(usgsUrl);
        if (!usgsResponse.ok) {
            if (usgsResponse.status === 400) {
                showUsgsApiErrorModal();
                // Continue without USGS data
            } else {
                throw new Error(`USGS API responded with status: ${usgsResponse.status}`);
            }
        } else {
            usgsEarthquakeData = await usgsResponse.json();
            plotEarthquakes(usgsEarthquakeData.features);
        }
    } catch (error) {
        // Only show a full error for non-400 errors
        if (error.message && error.message.includes('USGS API responded with status: 400')) {
            // Already handled above, do nothing
        } else {
            console.error("Error fetching or plotting earthquake data:", error);
            alert("Failed to load earthquake data. Please check the console for details.");
            // Do NOT return here! Allow OGS/local to proceed
        }
    }

    // --- Always continue with OGS/local data regardless of USGS status ---
    let ogsApiFailed = false;
    try {
        const ogsUrl = `${LOCAL_API_URL}?start=${startStr}&end=${endStr}&minmag=${minMag}`;
        console.log('[OGS LOCAL API] Fetching:', ogsUrl);
        const ogsResponse = await fetch(ogsUrl);
        if (!ogsResponse.ok) throw new Error(`OGS API responded with status: ${ogsResponse.status}`);
        ogsEventData = await ogsResponse.json();
    } catch (error) {
        // If local API fails, fallback to OGS public API
        ogsApiFailed = true;
        try {
            function toOgsApiDateString(date) {
                return date.getFullYear().toString() +
                    (date.getMonth() + 1).toString().padStart(2, '0') +
                    date.getDate().toString().padStart(2, '0') +
                    date.getHours().toString().padStart(2, '0') +
                    date.getMinutes().toString().padStart(2, '0');
            }
            const startDateObj = new Date(startStr);
            const endDateObj = new Date(endStr);
            const ogsStart = toOgsApiDateString(startDateObj);
            const ogsEnd = toOgsApiDateString(endDateObj);
            const ogsWebUrl = `https://ogsweb.ou.edu/api/earthquake?start=${ogsStart}&end=${ogsEnd}&mag=${minMag}&format=geojson`;
            console.log('[OGS PUBLIC API] Fetching:', ogsWebUrl);
            let ogsWebResponse, geojson;
            try {
                ogsWebResponse = await fetch(ogsWebUrl);
                if (!ogsWebResponse.ok) throw new Error(`OGS Web API responded with status: ${ogsWebResponse.status}`);
                geojson = await ogsWebResponse.json();
            } catch (fetchErr) {
                // CORS, network, or other fetch error
                console.error("Error fetching OGS public API:", fetchErr);
                alert("Failed to load OGS earthquake data from both the local API and the public OGS API. This may be due to network issues, CORS restrictions, or the OGS server being unavailable. Please try again later or contact support if the problem persists.\n\nError: " + fetchErr);
                renderEventList([]);
                ogsEventData = null;
                if (showLoading) showLoadingDialog(false);
                return;
            }
            ogsEventData = geojson.features
                .filter(f => {
                    const g = f.geometry;
                    return g && g.coordinates;
                })
                .map(f => {
                    const p = f.properties;
                    const g = f.geometry;
                    let eventTime = p.origintime || p.time || null;
                    if (eventTime) {
                        const eventDate = new Date(eventTime);
                        const startDateObj = new Date(startStr);
                        const endDateObj = new Date(endStr);
                        if (eventDate < startDateObj || eventDate > endDateObj) {
                            return null;
                        }
                    }
                    let depthVal = null;
                    if (typeof p.depth !== 'undefined' && p.depth !== null && !isNaN(parseFloat(p.depth))) {
                        depthVal = parseFloat(p.depth);
                    } else if (g && Array.isArray(g.coordinates) && g.coordinates.length > 2) {
                        depthVal = parseFloat(g.coordinates[2]);
                        if (isNaN(depthVal)) depthVal = null;
                    }
                    let isQuarry = false;
                    if (typeof depthVal === 'number' && !isNaN(depthVal)) {
                        isQuarry = (depthVal < 0.05);
                    }
                    return {
                        objectid: p.objectid || null,
                        origintime: p.origintime || p.time || null,
                        prefmag: p.prefmag || p.mag || null,
                        pmag_src: p.pmag_src || null,
                        max_mmi: p.max_mmi || null,
                        latitude: g && g.coordinates ? g.coordinates[1] : null,
                        longitude: g && g.coordinates ? g.coordinates[0] : null,
                        depth: depthVal,
                        isQuarry: isQuarry,
                        err_lon: p.err_lon || null,
                        err_lat: p.err_lat || null,
                        err_depth: p.err_depth || null,
                        err_origintime: p.err_origintime || null,
                        state: p.state || null,
                        county: p.county || null,
                        status: p.status || null,
                        event_id: p.event_id || p.id || null
                    };
                })
                .filter(e => e !== null);
        } catch (webErr) {
            console.error("Error fetching OGS data from both local API and ogsweb.ou.edu:", webErr);
            alert("Failed to load OGS earthquake data from both local and public OGS APIs. This may be due to network issues, CORS restrictions, or the OGS server being unavailable. Please try again later or contact support if the problem persists.\n\nError: " + webErr);
            renderEventList([]);
            ogsEventData = null;
            if (showLoading) showLoadingDialog(false);
            return;
        }
    }

    // --- Sort by origintime ASCENDING so newest are plotted last ---
    const sortedOgsEvents = [...ogsEventData].sort((a, b) => new Date(a.origintime) - new Date(b.origintime));

    sortedOgsEvents.forEach(event => {
        const rawEventId = event.event_id || event.objectid;
        const markerFeatureId = rawEventId && typeof rawEventId === 'string' && rawEventId.startsWith('ogs')
            ? 'ok' + rawEventId.substring(3)
            : rawEventId;

        const lat = Number(event.latitude);
        const lng = Number(event.longitude);
        const mag = Number(event.prefmag);
        const depth = Number(event.depth);
        if (isNaN(lat) || isNaN(lng)) return;

        // Only plot OGS events INSIDE the polygon
        //if (!pointInPolygon(lng, lat, oklahomaPolygonLngLat)) return;

        // --- Categorize by event age ---
        const eventTime = new Date(event.origintime);
        const now = Date.now();
        const timeDiff = now - eventTime.getTime();
        const oneDay = 24 * 60 * 60 * 1000;
        const sevenDays = 7 * oneDay;

        let layerGroup, color;
        if (timeDiff < oneDay) {
            layerGroup = layerGroups.past24Hours;
            color = 'red';
        } else if (timeDiff < sevenDays) {
            layerGroup = layerGroups.past7Days;
            color = 'orange';
        } else {
            layerGroup = layerGroups.past30Days;
            color = 'yellow';
        }

        const radius = 1.75 * (mag + 1.01) ** 1.6;

        let marker;
        let isQuarry = !isNaN(depth) && depth < 0.05;
        if (isQuarry) {
            // Diamond shape using SVG in a divIcon
            marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: '',
                    html: `<svg width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}">
                        <polygon points="${radius},0 ${radius*2},${radius} ${radius},${radius*2} 0,${radius}" 
                            style="fill:${color};stroke:black;stroke-width:1;opacity:0.7;" />
                    </svg>`,
                    iconSize: [radius*2, radius*2],
                    iconAnchor: [radius, radius]
                })
            });
        } else {
            marker = L.circleMarker([lat, lng], {
                radius: Math.max(radius, 6),
                color: 'black',
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1
            });
        }

        marker.featureId = markerFeatureId;

        const utcTimeStr = eventTime.toISOString().replace('T', ' ').substring(0, 19);
        const localTimeStr = getLocalTime(eventTime).toISOString().replace('T', ' ').substring(0, 19);
        const usgsEventId = event.event_id || event.objectid;
        const ogsdepth = !isNaN(depth) ? depth : "N/A";
        const quarryLabel = isQuarry ? `<strong>Type:</strong> Quarry Event<br>` : '';

        const popupContent = `<div style="width:300px; text-align: left; font-family:helvetica; font-size: 13px;">
            <strong>Source:</strong> OGS<br>
            <strong>Magnitude:</strong> ${!isNaN(mag) ? mag.toFixed(1) : "?"}<br>
            <strong>Time (UTC):</strong> ${utcTimeStr}<br>
            <strong>Time (Local):</strong> ${localTimeStr}<br>
            <strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}<br>
            <strong>Location:</strong> ${event.county || event.state || ""}<br>
            ${!isNaN(depth) ? `<strong>Depth:</strong> ${depth.toFixed(2)} km<br>` : ''}
            ${quarryLabel}
            <a href="https://earthquake.usgs.gov/earthquakes/eventpage/${markerFeatureId}/tellus" target="_blank" rel="noopener noreferrer">Did you feel this earthquake?</a>
        </div>`;
        marker.bindPopup(popupContent);

        marker.addTo(layerGroup);
    });
    // --- END NEW ---

    renderEventList(ogsEventData); // Render the list using global variable
    window.ogsEventData = ogsEventData;
    if (window.updateDownloadLinkVisibility) window.updateDownloadLinkVisibility();

    if (showLoading) showLoadingDialog(false);

    // --- NEW --- Global variable to store all plotted earthquakes
    window.allPlottedEarthquakes = [];

    // --- Plot USGS events and collect for box select ---
    if (usgsEarthquakeData && usgsEarthquakeData.features) {
        usgsEarthquakeData.features.forEach(f => {
            const props = f.properties;
            const coords = f.geometry.coordinates;
            // Only include USGS events OUTSIDE the polygon (i.e., those that are plotted)
            if (!pointInPolygon(coords[0], coords[1], oklahomaPolygonLngLat)) {
                // Plot marker here if needed...
                window.allPlottedEarthquakes.push({
                    lat: coords[1],
                    lng: coords[0],
                    depth: props.depth,
                    mag: props.mag,
                    status: props.status,
                    time: props.time,
                    place: props.place,
                    event_id: f.id,
                    objectid: f.id,
                    source: 'USGS'
                });
            }
        });
    }

    // --- Plot OGS events and collect for box select ---
    if (ogsEventData) {
        ogsEventData.forEach(e => {
            const lat = Number(e.latitude);
            const lng = Number(e.longitude);
            window.allPlottedEarthquakes.push({
                lat,
                lng,
                depth: Number(e.depth),
                mag: Number(e.prefmag),
                status: e.status,
                time: e.origintime,
                place: e.county || e.state || "",
                event_id: e.event_id || e.objectid || "?",
                objectid: e.objectid,
                source: 'OGS'
            });
        });
    }

    // --- Always force stations to back after plotting events ---
    if (layerGroups.stations) {
        layerGroups.stations.bringToBack();
    }
}

// --- NEW --- Function to compute a unique hash for OGS events
function computeOgsEventHash(events) {
    // Use event_id/objectid and origintime for uniqueness
    return events.map(e =>
        (e.event_id || e.objectid || '') + (e.origintime || '')
    ).join('|');
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map', { center: [35.5, -97.5], zoom: 7, zoomControl: false });
    window.map = map; // <-- ADD THIS LINE

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    layerGroups = {
        stations: L.featureGroup().addTo(map),        // <-- Add stations FIRST
        past24Hours: L.featureGroup().addTo(map),
        past7Days: L.featureGroup().addTo(map),
        past30Days: L.featureGroup().addTo(map),
    };

    // --- MOVE THIS BLOCK UP ---
    polygonLayer = L.polygon(oklahomaPolygonLatLng, { color: 'black', weight: 1, fillOpacity: 0, interactive: false }).addTo(map);
    // --- END MOVE ---

    const overlayMaps = {
        "<span style='color: red;'>Past 24 Hours</span>": layerGroups.past24Hours,
        "<span style='color: orange;'>Past 7 Days</span>": layerGroups.past7Days,
        "<span style='color: yellow;'>Past 30 Days</span>": layerGroups.past30Days,
        "OGS seismic stations": layerGroups.stations,
        "ANSS-authorized polygon": polygonLayer
    };
    L.control.layers(null, overlayMaps, { position: 'bottomright', collapsed: false }).addTo(map);

    // --- REMOVE THE OLD LINE HERE ---
    // polygonLayer = L.polygon(oklahomaPolygonLatLng, { color: 'black', weight: 1, fillOpacity: 0, interactive: false }).addTo(map);
    // --- END REMOVE ---


    // --- NEW --- Fetch and plot stations from the local API ---
    async function fetchAndPlotStations() {
        console.log("fetchAndPlotStations called");
        const lat = 35.5, lon = -97.5, maxradius = 5;
        const url = `http://127.0.0.1:5000/api/stations?lat=${lat}&lon=${lon}&maxradius=${maxradius}`;
        try {
            const response = await fetch(url);
            const stations = await response.json();
            stations.forEach(sta => {
                const icon = L.divIcon({
                    className: 'station-icon',
                    html: '<svg height="15" width="15"><polygon points="7.5,0 15,15 0,15" style="fill:black;stroke:white;stroke-width:1" /></svg>',
                    iconSize: [15, 15],
                    iconAnchor: [7.5, 7.5]
                });
                L.marker([sta.latitude, sta.longitude], { icon })
                    .addTo(layerGroups.stations)
                    .bindPopup(`<b>${sta.Station}</b><br><a href="${sta.html}" target="_blank">Heliplot</a>`);
            });
        } catch (e) {
            console.error("Failed to fetch stations:", e);
        }
    }

    fetchAndPlotStations();
    layerGroups.stations.bringToBack();

    setInitialDates();
    document.getElementById('update-map-btn').addEventListener('click', updateMap);

    // --- NEW --- Add event listener for the list container.
    // This uses event delegation, which is more efficient than adding a listener to every single item.
    const listContainer = document.getElementById('ogs-events-list');
    if (listContainer) {
        listContainer.addEventListener('click', function(e) {
            // Find the parent list item element that was clicked
            const item = e.target.closest('.event-list-item');
            if (item) {
                const eventId = item.getAttribute('data-event-id');
                findAndOpenMarker(eventId);
            }
        });
    }

    // --- NEW --- Restore tab switching UI logic from your original code
    const tabEventList = document.getElementById('tab-event-list');
    const tabTools = document.getElementById('tab-tools');
    const contentEventList = document.getElementById('tab-content-event-list');
    const contentTools = document.getElementById('tab-content-tools');

    if (tabEventList && tabTools && contentEventList && contentTools) {
        tabEventList.onclick = function() {
            tabEventList.classList.add('active');
            tabTools.classList.remove('active');
            contentEventList.style.display = 'block';
            contentTools.style.display = 'none';
        };
        tabTools.onclick = function() {
            tabTools.classList.add('active');
            tabEventList.classList.remove('active');
            contentTools.style.display = 'block';
            contentEventList.style.display = 'none';
        };
        // Set default tab
        tabEventList.click();
    }

    // --- NEW --- Plot Type Selection Logic ---
    const crossSectionRadio = document.getElementById('plot-type-cross-section');
    const magTimeRadio = document.getElementById('plot-type-mag-time');
    const plotTypeSelect = document.getElementById('plot-type-select');

    const updatePlotType = () => {
        const isCrossSection = crossSectionRadio.checked;
        const isMagTime = magTimeRadio.checked;

        document.querySelectorAll('.plot-type-content').forEach(div => div.style.display = 'none');

        if (isCrossSection) {
            document.getElementById('cross-section-content').style.display = 'block';
            // DO NOT call startCrossSectionSelection() here!
        } else if (isMagTime) {
            document.getElementById('mag-time-content').style.display = 'block';
            loadMagTimeData();
        }
    };

    // --- NEW --- Add change event listeners to radio buttons
    crossSectionRadio.addEventListener('change', updatePlotType);
    magTimeRadio.addEventListener('change', updatePlotType);

    // --- NEW --- Initialize plot type on load
    updatePlotType();
    // --- END NEW ---

    // --- NEW --- Data Selection Logic ---
    const dataSelectRadios = document.querySelectorAll('input[name="data-select"]');

    dataSelectRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'box') {
                // Disable cross section plot type, enable mag vs time
                crossSectionRadio.disabled = true;
                crossSectionRadio.parentElement.classList.add('opacity-50');
                magTimeRadio.checked = true;
                magTimeRadio.disabled = false;
            } else {
                // Enable both plot types
                crossSectionRadio.disabled = false;
                crossSectionRadio.parentElement.classList.remove('opacity-50');
                magTimeRadio.disabled = false;
            }
        });
    });
    // --- END NEW ---

    updateMap();
    setInterval(pollOgsForUpdates, 60000);

    // Attach event to the cross-section button
    const selectCrossSectionBtn = document.getElementById('select-cross-section-btn');
    if (selectCrossSectionBtn) {
        selectCrossSectionBtn.addEventListener('click', () => {
            if (typeof startCrossSectionSelection === 'function') {
                startCrossSectionSelection();
            } else {
                alert('Cross section selection functionality is not available.');
            }
        });
    }

    function onMapClick(e) {
        console.log("Map clicked for cross section", e.latlng);
        // ...rest of your code...
    }
});

// --- NEW --- Box Selection Logic ---
let boxSelectActive = false;
let boxCorners = [];
let boxRectangle = null;

function enableBoxSelect(map) {
    boxSelectActive = true;
    boxCorners = [];
    if (boxRectangle) {
        map.removeLayer(boxRectangle);
        boxRectangle = null;
    }
    map.getContainer().style.cursor = 'crosshair';

    function onMapClick(e) {
        if (!boxSelectActive) return;
        boxCorners.push(e.latlng);
        if (boxCorners.length === 2) {
            map.getContainer().style.cursor = '';
            boxSelectActive = false;
            map.off('click', onMapClick);

            // Draw rectangle
            const bounds = L.latLngBounds(boxCorners[0], boxCorners[1]);
            boxRectangle = L.rectangle(bounds, {color: 'purple', weight: 2, fillOpacity: 0.1}).addTo(map);

            // Pass selected data to magnitude vs time plot
            const selected = window.allPlottedEarthquakes.filter(eq => bounds.contains([eq.lat, eq.lng]));
            plotMagnitudeVsTime(selected);
        }
    }

    map.on('click', onMapClick);
}

// Attach to the button
document.addEventListener('DOMContentLoaded', function() {
    const selectBoxBtn = document.getElementById('select-box-btn');
    if (selectBoxBtn) {
        selectBoxBtn.addEventListener('click', function() {
            alert("Click twice for each diagonal corner of the desired box.");
            if (window.map) {
                enableBoxSelect(window.map);
            }
        });
    }
});

// --- NEW --- Function to plot magnitude vs time for selected earthquakes ---
function plotMagnitudeVsTime(events) {
    if (!events || events.length === 0) {
        alert("No earthquakes in selected box.");
        return;
    }

    // Sort events by time
    const sorted = [...events].sort((a, b) => new Date(a.time) - new Date(b.time));

    const x = sorted.map(d => new Date(d.time));
    const y = sorted.map(d => d.mag);
    const texts = sorted.map(d =>
        `<b>Magnitude:</b> ${d.mag ?? "?"}<br>` +
        `<b>Status:</b> ${d.status ?? "?"}<br>` +
        `<b>Time (UTC):</b> ${d.time ? new Date(d.time).toISOString().replace('T',' ').substring(0,19) : "?"}<br>` +
        `<b>Coordinates:</b> ${d.lat?.toFixed(4)}, ${d.lng?.toFixed(4)}<br>` +
        `<b>Depth:</b> ${d.depth ?? "?"} km<br>` +
        `<b>Location:</b> ${d.place ?? "?"}<br>` +
        `<b>Event id:</b> ${d.event_id ?? d.objectid ?? "?"}`
    );

    // Scatter plot only
    const scatter = {
        x: x,
        y: y,
        mode: 'markers',
        marker: {color: 'black', size: 10, symbol: 'circle'},
        name: 'Magnitude',
        type: 'scatter',
        text: texts,
        hovertemplate: '%{text}<extra></extra>'
    };

    const layout = {
        title: 'Magnitude vs Time (Box Selection)',
        xaxis: {title: 'Time'},
        yaxis: {title: 'Magnitude'},
        margin: {l: 60, r: 30, t: 50, b: 60},
        height: 400
    };

    // Modal
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-4 shadow-lg max-w-2xl w-full flex flex-col" style="width:90vw; height:70vh; min-width:320px; min-height:400px;">
            <div id="mag-time-plot" style="width:600px;height:350px;min-width:300px;min-height:250px;margin:0 auto;"></div>
            <div class="flex justify-end gap-2 mt-4">
                <button id="open-magtime-newwin" class="bg-green-600 text-white px-4 py-2 rounded">Open in New Window</button>
                <button id="close-magtime-modal" class="bg-blue-600 text-white px-4 py-2 rounded">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const plotDiv = document.getElementById('mag-time-plot');

    Plotly.newPlot(plotDiv, [scatter], {
        title: 'Magnitude vs Time (Box Selection)',
        xaxis: {title: 'Time'},
        yaxis: {title: 'Magnitude'},
        margin: {l: 60, r: 30, t: 50, b: 60},
        autosize: false,
        width: 600,
        height: 350
    }, {responsive: false});

    document.getElementById('close-magtime-modal').onclick = () => modal.remove();

    document.getElementById('open-magtime-newwin').onclick = () => {
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Magnitude vs Time</title>
                <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
                <style>
                    body { margin:0; padding:0; }
                </style>
            </head>
            <body>
                <div id="big-mag-time-plot" style="width:100vw;height:90vh;"></div>
            </body>
            </html>
        `);
        win.document.close();

        function tryPlot() {
            const plotDiv = win.document.getElementById('big-mag-time-plot');
            if (win.Plotly && plotDiv) {
                win.Plotly.newPlot(
                    plotDiv,
                    [scatter],
                    {
                        title: 'Magnitude vs Time (Box Selection)',
                        xaxis: {title: 'Time'},
                        yaxis: {title: 'Magnitude'},
                        margin: {l: 60, r: 30, t: 50, b: 60},
                        autosize: true
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

// --- NEW --- Function to show USGS API error modal ---
function showUsgsApiErrorModal() {
    // Prevent multiple modals
    if (document.getElementById('usgs-api-error-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'usgs-api-error-modal';
    modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 shadow-lg max-w-md w-full flex flex-col items-center">
            <div class="text-red-600 text-lg font-bold mb-2">USGS Data Not Updated</div>
            <div class="text-gray-700 mb-4">USGS API responded with an error (likely due to date range). Local data has loaded, but USGS events are not shown.</div>
            <button id="close-usgs-api-error-modal" class="bg-blue-600 text-white px-4 py-2 rounded">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-usgs-api-error-modal').onclick = () => modal.remove();
}

let lastOgsHash = null;

async function pollOgsForUpdates() {
    const startInput = document.getElementById('start-date').value;
    const endInput = document.getElementById('end-date').value;
    const minMag = document.getElementById('min-mag').value;
    const startDate = new Date(startInput);
    const endDate = new Date(endInput);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 0);
    const pad = n => n.toString().padStart(2, '0');
    const toApiDateString = date => {
        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate()) + 'T' +
            pad(date.getHours()) + ':' +
            pad(date.getMinutes()) + ':' +
            pad(date.getSeconds());
    }
    const startStr = toApiDateString(startDate);
    const endStr = toApiDateString(endDate);

    try {
        // Use OGS public REST API instead of local API
        function toOgsApiDateString(date) {
            return date.getFullYear().toString() +
                (date.getMonth() + 1).toString().padStart(2, '0') +
                date.getDate().toString().padStart(2, '0') +
                date.getHours().toString().padStart(2, '0') +
                date.getMinutes().toString().padStart(2, '0');
        }
        const startDateObj = new Date(startStr);
        const endDateObj = new Date(endStr);
        const ogsStart = toOgsApiDateString(startDateObj);
        const ogsEnd = toOgsApiDateString(endDateObj);
        const ogsWebUrl = `https://ogsweb.ou.edu/api/earthquake?start=${ogsStart}&end=${ogsEnd}&mag=${minMag}&format=geojson`;
        console.log('[OGS PUBLIC API] Polling:', ogsWebUrl);
        let ogsWebResponse, geojson;
        try {
            ogsWebResponse = await fetch(ogsWebUrl);
            if (!ogsWebResponse.ok) throw new Error(`OGS Web API responded with status: ${ogsWebResponse.status}`);
            geojson = await ogsWebResponse.json();
        } catch (fetchErr) {
            // CORS, network, or other fetch error
            console.error("Error polling OGS public API:", fetchErr);
            return;
        }
        // Convert GeoJSON features to event objects (same as fallback in updateMap)
        const ogsData = geojson.features
            .filter(f => {
                const g = f.geometry;
                return g && g.coordinates;
            })
            .map(f => {
                const p = f.properties;
                const g = f.geometry;
                let eventTime = p.origintime || p.time || null;
                if (eventTime) {
                    const eventDate = new Date(eventTime);
                    const startDateObj = new Date(startStr);
                    const endDateObj = new Date(endStr);
                    if (eventDate < startDateObj || eventDate > endDateObj) {
                        return null;
                    }
                }
                let depthVal = null;
                if (typeof p.depth !== 'undefined' && p.depth !== null && !isNaN(parseFloat(p.depth))) {
                    depthVal = parseFloat(p.depth);
                } else if (g && Array.isArray(g.coordinates) && g.coordinates.length > 2) {
                    depthVal = parseFloat(g.coordinates[2]);
                    if (isNaN(depthVal)) depthVal = null;
                }
                let isQuarry = false;
                if (typeof depthVal === 'number' && !isNaN(depthVal)) {
                    isQuarry = (depthVal < 0.05);
                }
                return {
                    objectid: p.objectid || null,
                    origintime: p.origintime || p.time || null,
                    prefmag: p.prefmag || p.mag || null,
                    pmag_src: p.pmag_src || null,
                    max_mmi: p.max_mmi || null,
                    latitude: g && g.coordinates ? g.coordinates[1] : null,
                    longitude: g && g.coordinates ? g.coordinates[0] : null,
                    depth: depthVal,
                    isQuarry: isQuarry,
                    err_lon: p.err_lon || null,
                    err_lat: p.err_lat || null,
                    err_depth: p.err_depth || null,
                    err_origintime: p.err_origintime || null,
                    state: p.state || null,
                    county: p.county || null,
                    status: p.status || null,
                    event_id: p.event_id || p.id || null
                };
            })
            .filter(e => e !== null);

        // Find new events not already plotted
        const newEvents = ogsData.filter(event => {
            const eventId = event.event_id || event.objectid;
            return !window.plottedOgsEventIds.has(eventId);
        });

        if (newEvents.length > 0) {
            // Plot only new events
            newEvents.forEach(event => {
                const rawEventId = event.event_id || event.objectid;
                const markerFeatureId = rawEventId && typeof rawEventId === 'string' && rawEventId.startsWith('ogs')
                    ? 'ok' + rawEventId.substring(3)
                    : rawEventId;

                const lat = Number(event.latitude);
                const lng = Number(event.longitude);
                const mag = Number(event.prefmag);
                const depth = Number(event.depth);
                if (isNaN(lat) || isNaN(lng)) return;

                const eventTime = new Date(event.origintime);
                const now = Date.now();
                const timeDiff = now - eventTime.getTime();
                const oneDay = 24 * 60 * 60 * 1000;
                const sevenDays = 7 * oneDay;

                let layerGroup, color;
                if (timeDiff < oneDay) {
                    layerGroup = layerGroups.past24Hours;
                    color = 'red';
                } else if (timeDiff < sevenDays) {
                    layerGroup = layerGroups.past7Days;
                    color = 'orange';
                } else {
                    layerGroup = layerGroups.past30Days;
                    color = 'yellow';
                }

                const radius = 1.75 * (mag + 1.01) ** 1.6;

                let marker;
                let isQuarry = !isNaN(depth) && depth < 0.05;
                if (isQuarry) {
                    marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: '',
                            html: `<svg width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}">
                                <polygon points="${radius},0 ${radius*2},${radius} ${radius},${radius*2} 0,${radius}" 
                                    style="fill:${color};stroke:black;stroke-width:1;opacity:0.7;" />
                            </svg>`,
                            iconSize: [radius*2, radius*2],
                            iconAnchor: [radius, radius]
                        })
                    });
                } else {
                    marker = L.circleMarker([lat, lng], {
                        radius: Math.max(radius, 6),
                        color: 'black',
                        fillColor: color,
                        fillOpacity: 0.7,
                        weight: 1
                    });
                }

                marker.featureId = markerFeatureId;

                const utcTimeStr = eventTime.toISOString().replace('T', ' ').substring(0, 19);
                const localTimeStr = getLocalTime(eventTime).toISOString().replace('T', ' ').substring(0, 19);
                const ogsdepth = !isNaN(depth) ? depth : "N/A";
                const quarryLabel = isQuarry ? `<strong>Type:</strong> Quarry Event<br>` : '';

                const popupContent = `<div style="width:300px; text-align: left; font-family:helvetica; font-size: 13px;">
                    <strong>Source:</strong> OGS<br>
                    <strong>Magnitude:</strong> ${!isNaN(mag) ? mag.toFixed(1) : "?"}<br>
                    <strong>Time (UTC):</strong> ${utcTimeStr}<br>
                    <strong>Time (Local):</strong> ${localTimeStr}<br>
                    <strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}<br>
                    <strong>Location:</strong> ${event.county || event.state || ""}<br>
                    ${!isNaN(depth) ? `<strong>Depth:</strong> ${depth.toFixed(2)} km<br>` : ''}
                    ${quarryLabel}
                    <a href="https://earthquake.usgs.gov/earthquakes/eventpage/${markerFeatureId}/tellus" target="_blank" rel="noopener noreferrer">Did you feel this earthquake?</a>
                </div>`;
                marker.bindPopup(popupContent);

                marker.addTo(layerGroup);

                // Track this event as plotted
                window.plottedOgsEventIds.add(eventId);
            });

            // Update window.ogsEventData and event list
            window.ogsEventData = (window.ogsEventData || []).concat(newEvents);
            renderEventList(window.ogsEventData);
            if (window.updateDownloadLinkVisibility) window.updateDownloadLinkVisibility();
        }
    } catch (e) {
        // Ignore polling errors
    }
}

const downloadLink = document.getElementById('download-ogs-csv-link');
function updateDownloadLinkVisibility() {
    if (window.ogsEventData && Array.isArray(window.ogsEventData) && window.ogsEventData.length > 0) {
        downloadLink.style.display = '';
    } else {
        downloadLink.style.display = 'none';
    }
}
window.updateDownloadLinkVisibility = updateDownloadLinkVisibility;

downloadLink.addEventListener('click', function(e) {
    e.preventDefault();
    if (!window.ogsEventData || !Array.isArray(window.ogsEventData) || window.ogsEventData.length === 0) {
        alert('No OGS data to download.');
        return;
    }

    // If a polygon is drawn, filter events within the polygon
    let filteredEvents = window.ogsEventData;
    if (window.polygonLayer && window.polygonLayer.getLatLngs) {
        const polygon = window.polygonLayer;
        filteredEvents = window.ogsEventData.filter(event => {
            if (!event.latitude || !event.longitude) return false;
            const latlng = L.latLng(event.latitude, event.longitude);
            return polygon.getBounds().contains(latlng) &&
                L.Polygon.prototype.isPrototypeOf(polygon) &&
                L.Polygon.prototype._containsPoint.call(polygon, polygon._map.latLngToLayerPoint(latlng));
        });
    }

    if (filteredEvents.length === 0) {
        alert('No OGS events within the polygon.');
        return;
    }

    // Convert to CSV
    const fields = Object.keys(filteredEvents[0]);
    const csvRows = [
        fields.join(','), // header
        ...filteredEvents.map(row => fields.map(f => `"${(row[f] ?? '').toString().replace(/"/g, '""')}"`).join(','))
    ];
    const csvContent = csvRows.join('\r\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ogs_events.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});



// --- NEW --- Function to fetch and plot stations from the local API
async function fetchAndPlotStations() {
    console.log("fetchAndPlotStations called");
    // Try local API first, then fallback to stations.json in root (same directory as index.html)
    const lat = 35.5, lon = -97.5, maxradius = 5;
    const url = `http://127.0.0.1:5000/api/stations?lat=${lat}&lon=${lon}&maxradius=${maxradius}`;
    let stations = null;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Local stations API failed');
        stations = await response.json();
    } catch (e) {
        console.warn("Failed to fetch stations from local API, trying stations.json in same directory as index.html...", e);
        try {
            // Use relative path to stations.json (should be in same directory as index.html)
            // This works when served via HTTP, not via file://
            let stationsJsonPath = 'stations.json';
            // If the page is not at the root, adjust the path RELATIVE TO window.location.origin
            // Always use an absolute path from the web root
            let basePath = window.location.pathname;
            if (!basePath.endsWith('/')) {
                basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
            }
            stationsJsonPath = basePath + 'stations.json';
            // Remove duplicate slashes except after protocol
            stationsJsonPath = stationsJsonPath.replace(/([^:]\/)\/+/, '$1');
            // Prepend origin to make an absolute URL
            const stationsJsonUrl = window.location.origin + stationsJsonPath;
            console.log('[STATIONS FALLBACK] Fetching', stationsJsonUrl);
            const response = await fetch(stationsJsonUrl);
            if (!response.ok) throw new Error('stations.json not found or failed');
            stations = await response.json();
        } catch (jsonErr) {
            console.warn("Failed to fetch stations.json. No stations will be shown.", jsonErr);
            alert("Failed to load stations from both local API and stations.json. No stations will be shown.");
            stations = [];
        }
    }
    if (stations && Array.isArray(stations)) {
        stations.forEach(sta => {
            const icon = L.divIcon({
                className: 'station-icon',
                html: '<svg height="15" width="15"><polygon points="7.5,0 15,15 0,15" style="fill:black;stroke:white;stroke-width:1" /></svg>',
                iconSize: [15, 15],
                iconAnchor: [7.5, 7.5]
            });
            L.marker([sta.latitude, sta.longitude], { icon })
                .addTo(layerGroups.stations)
                .bindPopup(`<b>${sta.Station}</b><br><a href="${sta.html}" target="_blank">Heliplot</a>`);
        });
    }
}


// --- NEW ---
//window.plottedOgsEventIds = new Set(ogsEventData.map(e => e.event_id || e.objectid));

document.addEventListener('DOMContentLoaded', () => {


    // ... all your map setup code ...


    // --- Fetch and plot stations from the local API ---
    fetchAndPlotStations();
    layerGroups.stations.bringToBack();

    setInitialDates();
    document.getElementById('update-map-btn').addEventListener('click', updateMap);

    // ...rest of your initialization code...


    const citationLink = document.getElementById('data-citation-link');
    const citationBox = document.getElementById('data-citation-box');
    if (citationLink && citationBox) {
        citationLink.addEventListener('click', function(e) {
            e.preventDefault();
            citationBox.style.display = citationBox.style.display === 'none' ? 'block' : 'none';
        });
    }
});