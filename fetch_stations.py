import json
import pandas as pd
from obspy.clients.fdsn import Client
from obspy import UTCDateTime

# Load config if needed (not used for IRIS, but for future use)
# with open('config.json') as f:
#     config = json.load(f)

def fetch_stations(lat=35.5, lon=-97.5, maxradius=5, hours=24):
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
        print("IRIS query failed: {}".format(str(e)))
        return []
    stalat = []
    stalon = []
    names = []
    htmls = []
    for net in inv:
        for sta in net:
            stalat.append(sta.latitude)
            stalon.append(sta.longitude)
            names.append(sta.code)
            htmls.append('http://wichita.ogs.ou.edu/eq/heliplot/{}.png'.format(sta.code))
    df = pd.DataFrame({
        'Station': names,
        'latitude': stalat,
        'longitude': stalon,
        'html': htmls
    })
    return df.to_dict(orient='records')

if __name__ == "__main__":
    stations = fetch_stations()
    with open("stations.json", "w") as f:
        json.dump(stations, f)
    print("Wrote stations.json with {} records".format(len(stations)))
