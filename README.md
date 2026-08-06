# assistente-limpeza (MVP)

MVP local (Windows) para inventariar arquivos no OneDrive, sugerir lotes de limpeza e **mover** itens aprovados para `/Quarentena_30dias` usando Microsoft Graph.

> ⚠️ Segurança MVP: os tokens OAuth são salvos em `data/tokens.json` para simplificar o protótipo. Em produção, use cofre de segredos + criptografia + rotação de credenciais.

## Estrutura

```txt
/backend
  main.py
  requirements.txt
/data
  (sqlite e tokens gerados em runtime)
.env.example
README.md
```

## Requisitos

- Windows 10/11
- Python 3.10+
- Conta Microsoft pessoal ou Microsoft 365 com OneDrive

## 1) Criar app no Microsoft Entra (Azure Portal)

1. Acesse: https://entra.microsoft.com
2. Vá em **App registrations** > **New registration**.
3. Nome: `assistente-limpeza-mvp`.
4. Supported account types:
   - Para aceitar pessoal + corporativo: **Accounts in any organizational directory and personal Microsoft accounts**.
5. Redirect URI (Web):
   - `http://localhost:8787/auth/callback`
6. Clique em **Register**.
7. Copie:
   - `Application (client) ID` → `CLIENT_ID`
8. Em **Certificates & secrets** > **New client secret**:
   - Copie o valor gerado → `CLIENT_SECRET`.
9. Em **API permissions** adicione Microsoft Graph delegated permissions:
   - `User.Read`
   - `Files.ReadWrite.All`
   - `offline_access`
10. Conceda consentimento (ou peça ao admin no tenant corporativo).

## 2) Configurar ambiente local no Windows

No PowerShell, dentro da pasta do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
copy .env.example .env
```

Edite `.env` com suas credenciais:

```env
CLIENT_ID=...
CLIENT_SECRET=...
TENANT=common
REDIRECT_URI=http://localhost:8787/auth/callback
SCOPES=User.Read Files.ReadWrite.All offline_access
```

## 3) Rodar API

```powershell
uvicorn backend.main:app --reload --port 8787
```

Acesse docs Swagger:
- http://localhost:8787/docs

## Fluxo do MVP

1. **Login OAuth**
   - `GET /auth/login` abre consentimento Microsoft.
2. **Callback**
   - `GET /auth/callback` troca `code` por tokens e salva em `data/tokens.json`.
3. **Inventário**
   - `POST /scan` lista recursivamente arquivos OneDrive e persiste no SQLite (`data/mvp.db`).
   - Não baixa conteúdo de arquivos.
   - Opcional: `POST /scan?dry_run=true` não persiste no banco.
4. **Sugestões**
   - `GET /batches` cria e retorna lotes sugeridos:
     - duplicados heurísticos por `(name + size)` em pastas diferentes;
     - arquivos grandes (`>= 200MB`);
     - arquivos antigos (`>= 365 dias sem modificação`).
5. **Aprovação e ação**
   - `POST /approve/{batch_id}` cria (se necessário) `/Quarentena_30dias` e move arquivos do lote.
   - Nunca faz deleção definitiva no MVP.
   - Opcional: `POST /approve/{batch_id}?dry_run=true` simula sem mover.

## Endpoints

- `GET /auth/login`
- `GET /auth/callback?code=...`
- `POST /scan?dry_run=false`
- `GET /batches`
- `POST /approve/{batch_id}?dry_run=false`

## Exemplo de resposta JSON para `/batches`

```json
{
  "batches": [
    {
      "batch_id": "c7bc90d4-8fb3-4184-9f2d-8d8e0f88edaa",
      "tipo": "duplicados_nome_tamanho",
      "quantidade": 2,
      "tamanho_total": 7340032,
      "itens": [
        {
          "id": "01ABCDEF123",
          "name": "relatorio.pdf",
          "path": "/Projetos/2023/relatorio.pdf",
          "size": 3670016,
          "lastModifiedDateTime": "2024-01-10T12:33:01Z"
        },
        {
          "id": "01ABCDEF456",
          "name": "relatorio.pdf",
          "path": "/Backup/relatorio.pdf",
          "size": 3670016,
          "lastModifiedDateTime": "2024-01-09T20:11:44Z"
        }
      ]
    },
    {
      "batch_id": "81f29ef2-fd9a-4a6a-a27c-907c8da9f1e5",
      "tipo": "arquivos_grandes_200mb",
      "quantidade": 1,
      "tamanho_total": 650117120,
      "itens": [
        {
          "id": "01AAA11",
          "name": "video-final.mp4",
          "path": "/Videos/video-final.mp4",
          "size": 650117120,
          "lastModifiedDateTime": "2023-07-02T08:00:00Z"
        }
      ]
    }
  ]
}
```

## Observações de segurança e UX

- Tokens **não** são retornados por endpoints.
- Logs evitam imprimir segredos/tokens.
- Faça revisão manual dos lotes antes de aprovar movimentações.
- MVP usa quarentena; não remove definitivamente itens.
