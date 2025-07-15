import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
import json
import pandas as pd

# Load DB config from config.json
with open('config.json') as f:
    config = json.load(f)

def get_connection():
    return psycopg2.connect(
        dbname=config["DB_NAME"],
        user=config["DB_USER"],
        password=config["DB_PASS"],
        host=config["DB_HOST"],
        port=config.get("DB_PORT", 5432)
    )

def fetch_earthquakes(start=None, end=None, minmag=None, limit=500):
    DEFAULT_DAYS = 30  # days
    # Default time window: last 30 days
    if not end:
        end_dt = datetime.utcnow()
    else:
        end_dt = datetime.strptime(end, "%Y-%m-%dT%H:%M:%S")
    if not start:
        start_dt = end_dt - timedelta(days=DEFAULT_DAYS)
    else:
        start_dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")

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
    sql += " ORDER BY origintime DESC"
    # params.append(limit)  # Not used

    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print("Error fetching earthquakes:", str(e))
        return []
    return rows

if __name__ == "__main__":
    # You can set these as needed, or parse from sys.argv
    start = None
    end = None
    minmag = None
    limit = 500
    earthquakes = fetch_earthquakes(start, end, minmag, limit)
    with open("earthquakes.json", "w") as f:
        json.dump(earthquakes, f, default=str)
    print("Wrote earthquakes.json with {} records".format(len(earthquakes)))
