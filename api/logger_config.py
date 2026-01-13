import logging
import os
from logging.handlers import RotatingFileHandler
import colorlog
from api.config_loader import CONFIG

def setup_logger(name):
    # Requirement: Save logs in api/logs folder
    api_dir = os.path.dirname(os.path.abspath(__file__))
    log_dir = os.path.join(api_dir, "logs")
    
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    log_settings = CONFIG.get("logging", {})
    
    logger = logging.getLogger(name)
    level_str = log_settings.get("level", "DEBUG").upper()
    logger.setLevel(getattr(logging, level_str))

    # Prevent double logging if logger is already configured
    if logger.hasHandlers():
        return logger

    # 1. Console Handler with Color
    console_handler = colorlog.StreamHandler()
    console_formatter = colorlog.ColoredFormatter(
        "%(log_color)s%(levelname)-8s%(reset)s %(blue)s%(name)s%(reset)s: %(message)s",
        log_colors={
            'DEBUG':    'cyan',
            'INFO':     'green',
            'WARNING':  'yellow',
            'ERROR':    'red',
            'CRITICAL': 'red,bg_white',
        }
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 2. Rotating File Handler
    file_name = log_settings.get("file_name", "api.log")
    file_path = os.path.join(log_dir, file_name)
    file_handler = RotatingFileHandler(
        file_path, 
        maxBytes=log_settings.get("max_bytes", 5242880),
        backupCount=log_settings.get("backup_count", 10)
    )
    file_formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    return logger

# Create a default logger instance
logger = setup_logger("optimizer-api")
