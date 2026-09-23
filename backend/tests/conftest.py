"""Тесты всегда в демо-режиме и без сети, даже если в .env есть ключ: переменные окружения главнее .env."""

import os

os.environ["APP_MODE"] = "demo"
os.environ["LLM_API_KEY"] = ""
os.environ["AUTH_REQUIRED"] = "0"  # роли проверяются отдельно в test_auth_stations.py
os.environ["WEATHER_ONLINE"] = "0"  # тесты без сети: погода из локального архива
