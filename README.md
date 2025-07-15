# Earthquake Map Project

A web application for visualizing Oklahoma and USGS earthquake data, plotting seismic stations, and exploring event details interactively.

![Screenshot of earthquake website](earthquake_map_screenshot.png)
---

## Features

- Interactive Leaflet map with Oklahoma polygon overlay
- Plots OGS and USGS earthquake events by age and magnitude
- Plots OGS seismic stations as black triangles
- Event list with popups and CSV download
- Box and cross-section selection tools
- Magnitude vs. Time and Depth Cross Section plots (Plotly)
- Data citation and attribution
- REST API (Flask) for OGS events and station metadata

---

## Project Structure

```
earthquake-map-project/
├── .gitignore
├── README.md
├── requirements.txt
├── config.example.json         # Template config (safe to commit)
├── config.json                 # (not tracked by git, user creates this)
├── earthquake_api.py           # Flask REST API backend
└── src/
    ├── index.html              # Main web app HTML
    ├── css/
    │   └── style.css           # (optional) Custom styles
    └── js/
        └── map.js              # Main JavaScript for map and UI
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/earthquake-map-project.git
cd earthquake-map-project
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up configuration

Copy the example config and fill in your database credentials:

```bash
cp config.example.json config.json
# Edit config.json with your DB credentials
```

**Never commit your real `config.json`!**


### 4. Generate Static Data Files

Run the provided scripts to fetch earthquake and station data and write them to JSON files:

```bash
python fetch_earthquakes.py
python fetch_stations.py
```


These will create `earthquakes.json` and `stations.json` in your project directory. You can schedule these scripts to run periodically using cron to keep the data up to date.

#### Example: Setting up cron jobs

Edit your crontab with:

```bash
crontab -e
```

Add the following lines to run the scripts automatically:

```
# Run fetch_earthquakes.py every minute
* * * * * cd /path/to/earthquake_web_map && /usr/bin/python3 fetch_earthquakes.py

# Run fetch_stations.py once per day at 2:00 AM
0 2 * * * cd /path/to/earthquake_web_map && /usr/bin/python3 fetch_stations.py
```

Replace `/path/to/earthquake_web_map` with the actual path to your project directory.

### 5. Open the web app

Open `index.html` in your browser.  
If running on a server, configure your web server to serve the project root directory (so it can access `index.html`, `earthquakes.json`, and `stations.json`).


---

## Static Data Workflow (No Live API Required)

- Earthquake and station data are periodically fetched and written to `earthquakes.json` and `stations.json` using the provided scripts.
- The web app loads these static files directly (no CORS issues, no backend server required for data access).
- To update data, simply re-run the scripts or set up a cron job.

---

## License

[MIT License](LICENSE)

---

## Acknowledgments

- [Leaflet](https://leafletjs.com/)
- [Plotly.js](https://plotly.com/javascript/)
- [ObsPy](https://docs.obspy.org/)
- [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [IRIS FDSN Web Services](https://service.iris.edu/)

---

## Contributing

Pull requests and issues are welcome! Please open an issue for bugs or feature requests.

---

## Contact

For questions, contact Jake Walter
