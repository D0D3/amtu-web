"""
AMTU Web Backend — FastAPI Application
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db.database import init_db
from api.routes import config, jobs, history, genres, files
from api.routes import auth as auth_routes
from api.routes import users as users_routes
from api.routes import enrich as enrich_routes

# Routes publiques (pas de token requis)
PUBLIC_PATHS = {"/api/health", "/api/auth/login"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AMTU Web API",
    description="Apple Music Tag Updater — Web Version",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — localhost dev + domaine de production
APP_URL = os.getenv("APP_URL", "")
allowed_origins = ["http://localhost:3000", "http://frontend:3000"]
if APP_URL:
    allowed_origins.append(APP_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Vérifie le JWT pour toutes les routes sauf la whitelist."""
    path = request.url.path

    if path in PUBLIC_PATHS:
        return await call_next(request)

    # Token via header Authorization: Bearer <token>
    # ou via query param ?token=<token> (nécessaire pour EventSource/SSE)
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        return JSONResponse({"detail": "Non authentifié"}, status_code=401)

    from services.auth import verify_token
    if not verify_token(token):
        return JSONResponse({"detail": "Token invalide ou expiré"}, status_code=401)

    return await call_next(request)


app.include_router(auth_routes.router)
app.include_router(users_routes.router)
app.include_router(enrich_routes.router)
app.include_router(config.router)
app.include_router(jobs.router)
app.include_router(history.router)
app.include_router(genres.router)
app.include_router(files.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
