from flask import Flask, request, jsonify
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
from flask_cors import CORS
from obspy.clients.fdsn import Client
from obspy import UTCDateTime
import pandas as pd
import json

# Load DB config from config.json
with open('config.json') as f:
    config = json.load(f)

app = Flask(__name__)
# Improved CORS setup for all routes and methods, including OPTIONS
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Explicitly handle OPTIONS preflight requests for all routes
@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        resp = app.make_default_options_response()
        headers = None
        if hasattr(resp, 'headers'):
            headers = resp.headers
        else:
            headers = resp
        headers['Access-Control-Allow-Origin'] = '*'
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', '*')
        headers['Access-Control-Allow-Credentials'] = 'true'
        return resp

DEFAULT_TIME_OFFSET = 24  # hours

def get_connection():
    return psycopg2.connect(
        dbname=config["DB_NAME"],
        user=config["DB_USER"],
        password=config["DB_PASS"],
        host=config["DB_HOST"],
        port=config.get("DB_PORT", 5432)
    )

@app.route('/api/earthquakes', methods=['GET'])
def get_earthquakes():
    # Parse query params
    start = request.args.get('start')
    end = request.args.get('end')
    minmag = request.args.get('minmag', type=float)
    limit = request.args.get('limit', default=500, type=int)

    # Default time window: last 24 hours
    if not end:
        end_dt = datetime.utcnow()
    else:
        end_dt = datetime.strptime(end, "%Y-%m-%dT%H:%M:%S")
    if not start:
        start_dt = end_dt - timedelta(hours=DEFAULT_TIME_OFFSET)
    else:
        start_dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")

    # Build SQL
    sql = """
        SELECT objectid, origintime, prefmag, pmag_src, max_mmi, latitude, longitude, depth,
               err_lon, err_lat, err_depth, err_origintime, state, county, status, event_id
        FROM earthquake_quake.quakes
        WHERE origintime BETWEEN %s AND %s
    """
    params = [start_dt, end_dt]
    if minmag is not None:
        sql += " AND prefmag >= %s"
        params.append(minmag)
    #sql += " ORDER BY origintime DESC LIMIT %s"
    sql += " ORDER BY origintime DESC"
    #params.append(limit)

    # Query DB
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Return as JSON
    return jsonify(rows)

@app.route('/api/stations', methods=['GET'])
def get_stations():
    # Parse query params (optional: center and radius)
    lat = float(request.args.get('lat', 35.5))
    lon = float(request.args.get('lon', -97.5))
    maxradius = float(request.args.get('maxradius', 5))
    hours = int(request.args.get('hours', 24))
    starttime = UTCDateTime.now() - hours * 3600
    endtime = UTCDateTime.now()

    client = Client("IRIS")
    try:
        inv = client.get_stations(
            latitude=lat, longitude=lon, maxradius=maxradius,
            net='OK,O2,2V', channel='?HZ',
            starttime=starttime, endtime=endtime
        )
    except Exception as e:
        return jsonify({"error": "IRIS query failed: {}".format(str(e))}), 500

    stalat = []
    stalon = []
    names = []
    htmls = []

    for net in inv:
        for sta in net:
            #if not sta.code.startswith('OS'):
            stalat.append(sta.latitude)
            stalon.append(sta.longitude)
            names.append(sta.code)

            # Use .format() instead of f-string for Python 3.4 compatibility
            htmls.append('http://wichita.ogs.ou.edu/eq/heliplot/{}.png'.format(sta.code))

    df = pd.DataFrame({
        'Station': names,
        'latitude': stalat,
        'longitude': stalon,
        'html': htmls
    })

    # Return as JSON
    return df.to_json(orient='records')

if __name__ == '__main__':
    # Remove debug=True for Python 3.4 compatibility (optional, but safer)
    app.run()