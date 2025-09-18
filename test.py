import requests
import json

def fetch_api(api_url):
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        return None

api_url = "https://mlbb-stats.ridwaanhall.com/api/hero-position/?role=marksman&lane=gold&size=130&index=1"
data = fetch_api(api_url)

print(json.dumps(data, indent=4) if data else "No data fetched.")