import os
import subprocess
import requests
from api.logger_config import logger

OSRM_DATA_DIR = os.path.abspath("osrm_data")
OSM_FILE_URL = "https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf"
OSM_FILE_NAME = "malaysia-singapore-brunei-latest.osm.pbf"
OSM_FILE_PATH = os.path.join(OSRM_DATA_DIR, OSM_FILE_NAME)

def setup_osrm():
    if not os.path.exists(OSRM_DATA_DIR):
        os.makedirs(OSRM_DATA_DIR)
        logger.info(f"Created directory: {OSRM_DATA_DIR}")

    # 1. Download OSM Data
    if not os.path.exists(OSM_FILE_PATH):
        logger.info(f"Downloading NYC map data from {OSM_FILE_URL}...")
        response = requests.get(OSM_FILE_URL, stream=True)
        with open(OSM_FILE_PATH, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info("Download complete.")
    else:
        logger.info("Map data already exists. Skipping download.")

    # 2. Process OSRM Data using Docker
    logger.info("Processing map data (this may take a few minutes)...")
    
    # Extract
    logger.info("Step 1/3: Extracting...")
    subprocess.run([
        "docker", "run", "-t", "-v", f"{OSRM_DATA_DIR}:/data", 
        "osrm/osrm-backend", "osrm-extract", "-p", "/opt/car.lua", f"/data/{OSM_FILE_NAME}"
    ], check=True)

    # Partition
    logger.info("Step 2/3: Partitioning...")
    subprocess.run([
        "docker", "run", "-t", "-v", f"{OSRM_DATA_DIR}:/data", 
        "osrm/osrm-backend", "osrm-partition", f"/data/{OSM_FILE_NAME.replace('.osm.pbf', '.osrm')}"
    ], check=True)

    # Customize
    logger.info("Step 3/3: Customizing...")
    subprocess.run([
        "docker", "run", "-t", "-v", f"{OSRM_DATA_DIR}:/data", 
        "osrm/osrm-backend", "osrm-customize", f"/data/{OSM_FILE_NAME.replace('.osm.pbf', '.osrm')}"
    ], check=True)

    logger.info("OSRM data processing complete! You can now start the OSRM service with docker-compose.")

if __name__ == "__main__":
    try:
        setup_osrm()
    except Exception as e:
        logger.error(f"Failed to setup OSRM: {e}")
