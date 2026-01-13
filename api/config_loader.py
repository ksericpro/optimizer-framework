import json
import os

def load_global_config():
    api_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(api_dir, "global_config.json")
    
    with open(config_path, 'r') as f:
        return json.load(f)

# Global instance
CONFIG = load_global_config()
