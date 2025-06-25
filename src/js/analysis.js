// This file contains functions for performing various analyses on the earthquake data, such as statistical summaries, filtering based on user input, and visualizing results on the map.

const analysis = (() => {
    // Function to calculate the average magnitude of earthquakes
    const calculateAverageMagnitude = (earthquakeData) => {
        const totalMagnitude = earthquakeData.features.reduce((sum, feature) => sum + feature.properties.mag, 0);
        return totalMagnitude / earthquakeData.features.length;
    };

    // Function to filter earthquakes based on minimum magnitude
    const filterByMagnitude = (earthquakeData, minMagnitude) => {
        return earthquakeData.features.filter(feature => feature.properties.mag >= minMagnitude);
    };

    // Function to generate a summary of earthquake occurrences
    const generateSummary = (earthquakeData) => {
        const summary = {
            totalEarthquakes: earthquakeData.features.length,
            averageMagnitude: calculateAverageMagnitude(earthquakeData),
            magnitudes: earthquakeData.features.map(feature => feature.properties.mag)
        };
        return summary;
    };

    // Function to visualize analysis results on the map
    const visualizeAnalysisResults = (map, filteredData) => {
        // Clear existing analysis layers
        const analysisLayer = L.featureGroup().addTo(map);
        filteredData.forEach(feature => {
            const latlng = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
            L.circleMarker(latlng, {
                radius: 5,
                color: 'blue',
                fillColor: 'blue',
                fillOpacity: 0.5
            }).addTo(analysisLayer).bindPopup(`Magnitude: ${feature.properties.mag}`);
        });
    };

    return {
        calculateAverageMagnitude,
        filterByMagnitude,
        generateSummary,
        visualizeAnalysisResults
    };
})();

// Example usage (to be called from another module):
// const earthquakeData = await fetchEarthquakeData();
// const summary = analysis.generateSummary(earthquakeData);
// console.log(summary);
// const filteredData = analysis.filterByMagnitude(earthquakeData, 5);
// analysis.visualizeAnalysisResults(map, filteredData);