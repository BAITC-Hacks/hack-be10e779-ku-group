"""Тесты всегда в демо-режиме и без сети, даже если в .env есть ключ: переменные окружения главнее .env."""

import os

os.environ["APP_MODE"] = "demo"
os.environ["LLM_API_KEY"] = ""
