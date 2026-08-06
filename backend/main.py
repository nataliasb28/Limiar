import json
import logging
import os
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("assistente-limpeza")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "mvp.db"
TOKENS_PATH = DATA_DIR / "tokens.json"

CLIENT_ID = os.getenv("CLIENT_ID", "")
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "")
TENANT = os.getenv("TENANT", "common")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8787/auth/callback")
SCOPES = os.getenv("SCOPES", "User.Read Files.ReadWrite.All offline_access")

GRAPH_ROOT = "https://graph.microsoft.com/v1.0"
AUTH_BASE = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0"

app = FastAPI(title="assistente-limpeza", version="0.1.0")


@dataclass
class GraphItem:
    id: str
    name: str
    parent_path: str
    size: int
    mime_type: str
    created_at: str
    modified_at: str


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_db()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_path TEXT,
                size INTEGER,
                mime_type TEXT,
                created_at TEXT,
                modified_at TEXT,
                scanned_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS batches (
                batch_id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                total_size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS batch_items (
                batch_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                PRIMARY KEY (batch_id, file_id),
                FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
                FOREIGN KEY (file_id) REFERENCES files(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT NOT NULL,
                executed_at TEXT NOT NULL,
                moved_count INTEGER NOT NULL,
                failed_count INTEGER NOT NULL,
                moved_ids TEXT NOT NULL
            )
            """
        )


@app.on_event("startup")
def startup_event() -> None:
    init_db()


def _ensure_settings() -> None:
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Configure CLIENT_ID e CLIENT_SECRET no .env")


def save_tokens(tokens: Dict[str, Any]) -> None:
    payload = {
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
        "expires_in": tokens.get("expires_in"),
        "token_type": tokens.get("token_type"),
        "obtained_at": datetime.now(timezone.utc).isoformat(),
    }
    TOKENS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_tokens() -> Dict[str, Any]:
    if not TOKENS_PATH.exists():
        raise HTTPException(status_code=401, detail="Usuário não autenticado. Acesse /auth/login")
    return json.loads(TOKENS_PATH.read_text(encoding="utf-8"))


async def refresh_access_token_if_needed(tokens: Dict[str, Any]) -> str:
    access_token = tokens.get("access_token")
    if access_token:
        return access_token

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Token inválido. Refaça login em /auth/login")

    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{AUTH_BASE}/token", data=data)
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Falha ao renovar token")

    new_tokens = response.json()
    save_tokens(new_tokens)
    return new_tokens["access_token"]


async def graph_request(method: str, endpoint: str, token: str, **kwargs: Any) -> Dict[str, Any]:
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    headers["Content-Type"] = "application/json"

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(method, f"{GRAPH_ROOT}{endpoint}", headers=headers, **kwargs)

    if response.status_code >= 400:
        logger.error("Graph request failed: %s %s", response.status_code, endpoint)
        raise HTTPException(status_code=response.status_code, detail="Erro ao acessar Microsoft Graph")

    if response.content:
        return response.json()
    return {}


async def iter_children(token: str, start_endpoint: str) -> Iterable[Dict[str, Any]]:
    next_url: Optional[str] = f"{GRAPH_ROOT}{start_endpoint}"
    async with httpx.AsyncClient(timeout=60) as client:
        while next_url:
            response = await client.get(next_url, headers={"Authorization": f"Bearer {token}"})
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail="Erro ao listar arquivos")
            payload = response.json()
            for item in payload.get("value", []):
                yield item
            next_url = payload.get("@odata.nextLink")


async def collect_all_files(token: str) -> List[GraphItem]:
    queue: List[tuple[str, str]] = [("root", "")]
    files: List[GraphItem] = []

    while queue:
        item_id, parent = queue.pop(0)
        endpoint = "/me/drive/root/children" if item_id == "root" else f"/me/drive/items/{item_id}/children"

        async for item in iter_children(token, endpoint):
            parent_ref = item.get("parentReference", {})
            path = parent_ref.get("path", "")
            clean_path = path.replace("/drive/root:", "")
            if item.get("folder"):
                queue.append((item["id"], f"{clean_path}/{item['name']}".replace("//", "/")))
                continue

            files.append(
                GraphItem(
                    id=item["id"],
                    name=item.get("name", ""),
                    parent_path=clean_path or parent,
                    size=item.get("size", 0),
                    mime_type=item.get("file", {}).get("mimeType", "unknown"),
                    created_at=item.get("createdDateTime", ""),
                    modified_at=item.get("lastModifiedDateTime", ""),
                )
            )

    return files


def save_inventory(files: List[GraphItem]) -> None:
    scanned_at = datetime.now(timezone.utc).isoformat()
    with closing(get_db()) as conn, conn:
        conn.execute("DELETE FROM files")
        conn.executemany(
            """
            INSERT INTO files (id, name, parent_path, size, mime_type, created_at, modified_at, scanned_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    file.id,
                    file.name,
                    file.parent_path,
                    file.size,
                    file.mime_type,
                    file.created_at,
                    file.modified_at,
                    scanned_at,
                )
                for file in files
            ],
        )


def _rows_to_batch_items(rows: Iterable[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "path": f"{row['parent_path']}/{row['name']}".replace("//", "/"),
            "size": row["size"],
            "lastModifiedDateTime": row["modified_at"],
        }
        for row in rows
    ]


def generate_batches() -> List[Dict[str, Any]]:
    with closing(get_db()) as conn, conn:
        files = conn.execute("SELECT * FROM files").fetchall()
        if not files:
            return []

        conn.execute("DELETE FROM batch_items")
        conn.execute("DELETE FROM batches")

        batches: List[Dict[str, Any]] = []

        duplicate_groups: Dict[tuple[str, int], List[sqlite3.Row]] = {}
        for row in files:
            key = (row["name"], row["size"])
            duplicate_groups.setdefault(key, []).append(row)

        for group in duplicate_groups.values():
            paths = {item["parent_path"] for item in group}
            if len(group) > 1 and len(paths) > 1:
                batches.append(_create_batch_record(conn, "duplicados_nome_tamanho", group))

        large = [row for row in files if row["size"] >= 200 * 1024 * 1024]
        if large:
            batches.append(_create_batch_record(conn, "arquivos_grandes_200mb", large))

        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        old_files = []
        for row in files:
            try:
                modified = datetime.fromisoformat(row["modified_at"].replace("Z", "+00:00"))
            except ValueError:
                continue
            if modified <= cutoff:
                old_files.append(row)
        if old_files:
            batches.append(_create_batch_record(conn, "arquivos_antigos_365dias", old_files))

    return batches


def _create_batch_record(conn: sqlite3.Connection, batch_type: str, rows: List[sqlite3.Row]) -> Dict[str, Any]:
    batch_id = str(uuid.uuid4())
    total_size = sum(row["size"] for row in rows)
    created_at = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO batches (batch_id, type, quantity, total_size, created_at) VALUES (?, ?, ?, ?, ?)",
        (batch_id, batch_type, len(rows), total_size, created_at),
    )
    conn.executemany(
        "INSERT INTO batch_items (batch_id, file_id) VALUES (?, ?)",
        [(batch_id, row["id"]) for row in rows],
    )

    return {
        "batch_id": batch_id,
        "tipo": batch_type,
        "quantidade": len(rows),
        "tamanho_total": total_size,
        "itens": _rows_to_batch_items(rows),
    }


async def ensure_quarantine_folder(token: str) -> str:
    children = await graph_request("GET", "/me/drive/root/children?$select=id,name,folder", token)
    for item in children.get("value", []):
        if item.get("name") == "Quarentena_30dias" and item.get("folder") is not None:
            return item["id"]

    payload = {
        "name": "Quarentena_30dias",
        "folder": {},
        "@microsoft.graph.conflictBehavior": "rename",
    }
    created = await graph_request("POST", "/me/drive/root/children", token, json=payload)
    return created["id"]


async def move_item(token: str, item_id: str, parent_id: str) -> bool:
    payload = {"parentReference": {"id": parent_id}}
    try:
        await graph_request("PATCH", f"/me/drive/items/{item_id}", token, json=payload)
        return True
    except HTTPException:
        return False


@app.get("/auth/login")
async def auth_login() -> RedirectResponse:
    _ensure_settings()
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "response_mode": "query",
        "scope": SCOPES,
    }
    auth_url = f"{AUTH_BASE}/authorize?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@app.get("/auth/callback")
async def auth_callback(code: str = Query(...)) -> Dict[str, str]:
    _ensure_settings()
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{AUTH_BASE}/token", data=data)

    if response.status_code >= 400:
        logger.error("Falha no callback OAuth: %s", response.text)
        raise HTTPException(status_code=400, detail="Falha ao trocar code por token")

    save_tokens(response.json())
    return {"message": "Autenticado com sucesso. Tokens salvos localmente no MVP."}


@app.post("/scan")
async def scan(dry_run: bool = Query(False)) -> Dict[str, Any]:
    tokens = load_tokens()
    token = await refresh_access_token_if_needed(tokens)
    files = await collect_all_files(token)

    if not dry_run:
        save_inventory(files)

    return {
        "dry_run": dry_run,
        "arquivos_encontrados": len(files),
        "persistido_em_sqlite": not dry_run,
    }


@app.get("/batches")
async def batches() -> Dict[str, Any]:
    batch_list = generate_batches()
    return {"batches": batch_list}


@app.post("/approve/{batch_id}")
async def approve(batch_id: str, dry_run: bool = Query(False)) -> Dict[str, Any]:
    with closing(get_db()) as conn:
        rows = conn.execute(
            """
            SELECT f.id, f.name, f.parent_path, f.size, f.modified_at
            FROM files f
            JOIN batch_items bi ON bi.file_id = f.id
            WHERE bi.batch_id = ?
            """,
            (batch_id,),
        ).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="Batch não encontrado")

    if dry_run:
        return {
            "batch_id": batch_id,
            "dry_run": True,
            "total_itens": len(rows),
            "moved": 0,
            "failed": 0,
            "message": "Simulação concluída. Nenhum arquivo foi movido.",
        }

    tokens = load_tokens()
    token = await refresh_access_token_if_needed(tokens)
    quarantine_id = await ensure_quarantine_folder(token)

    moved_ids: List[str] = []
    failed = 0
    for row in rows:
        moved = await move_item(token, row["id"], quarantine_id)
        if moved:
            moved_ids.append(row["id"])
        else:
            failed += 1

    with closing(get_db()) as conn, conn:
        conn.execute(
            """
            INSERT INTO executions (batch_id, executed_at, moved_count, failed_count, moved_ids)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                datetime.now(timezone.utc).isoformat(),
                len(moved_ids),
                failed,
                json.dumps(moved_ids),
            ),
        )

    return {
        "batch_id": batch_id,
        "dry_run": False,
        "total_itens": len(rows),
        "moved": len(moved_ids),
        "failed": failed,
    }
