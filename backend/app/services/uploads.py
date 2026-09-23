"""Безопасный приём загруженных файлов: белый список расширений, лимит размера, имя на диске — uuid, не имя клиента."""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import ROOT_DIR

UPLOAD_DIR = ROOT_DIR / "data" / "uploads"
MAX_BYTES = 10 * 1024 * 1024


async def save_upload(file: UploadFile, allowed: set[str], max_bytes: int = MAX_BYTES) -> tuple[Path, str]:
    """Сохраняет файл, возвращает (путь на диске, исходное имя для показа). allowed — например {".pdf", ".csv"}."""
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            415, detail=f"Неподдерживаемый тип файла «{ext or 'без расширения'}». Можно: {', '.join(sorted(allowed))}"
        )
    data = await file.read(max_bytes + 1)
    if not data:
        raise HTTPException(400, detail="Файл пустой")
    if len(data) > max_bytes:
        raise HTTPException(413, detail=f"Файл больше {max_bytes // (1024 * 1024)} МБ")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(data)
    return path, original
