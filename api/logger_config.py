import logging
import os
from logging.handlers import RotatingFileHandler
import colorlog

def setup_logger(name):
    # Create logs directory if it doesn't exist
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

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
    file_path = os.path.join(log_dir, "app.log")
    file_handler = RotatingFileHandler(
        file_path, 
        maxBytes=10*1024*1024, # 10MB
        backupCount=5
    )
    file_formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    return logger

# Create a default logger instance
logger = setup_logger("optimizer")
