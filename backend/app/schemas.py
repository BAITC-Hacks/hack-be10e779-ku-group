"""Pydantic-схемы запросов и ответов API (основа docs/api-contract.md)."""

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    mode: str
    commit: str
