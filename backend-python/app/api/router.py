from fastapi import APIRouter

from app.api.routes import docs, health, prd, tests

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(tests.router)
api_router.include_router(prd.router)
api_router.include_router(docs.router)
