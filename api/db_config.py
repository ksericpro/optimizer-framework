import os
from dotenv import load_dotenv

load_dotenv()

def get_db_params():
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", 15433),
        "database": os.getenv("DB_NAME", "optimizer_db"),
        "user": os.getenv("DB_USER", "optimizer_user"),
        "password": os.getenv("DB_PASSWORD", "optimizer_password")
    }
