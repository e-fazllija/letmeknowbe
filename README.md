# Introduction 
TODO: Give a short introduction of your project. Let this section explain the objectives or the motivation behind this project. 

# Getting Started
TODO: Guide users through getting your code up and running on their own system. In this section you can talk about:
1.	Installation process
2.	Software dependencies
3.	Latest releases
4.	API references

# Build and Test
TODO: Describe and show how to build your code and run the tests. 

# Contribute
TODO: Explain how other users and developers can contribute to make your code better. 

If you want to learn more about creating good readme files then refer the following [guidelines](https://docs.microsoft.com/en-us/azure/devops/repos/git/create-a-readme?view=azure-devops). You can also seek inspiration from the below readme files:
- [ASP.NET Core](https://github.com/aspnet/Home)
- [Visual Studio Code](https://github.com/Microsoft/vscode)
- [Chakra Core](https://github.com/Microsoft/ChakraCore)
# LetMeKnow API
## Public Report API: Quick Test (curl)

Prerequisiti
- Server avviato su `http://localhost:3000` (vedi `src/main.ts`).
- `x-tenant-id` disponibile in dev (in prod lo inietta il proxy). In prod abilita `TENANT_ID_ALLOWLIST`.
- Il tenant ha almeno un `Department` attivo e relative `Category` attive.
- Migrazioni applicate e Prisma generato (tenant):
- `npx prisma migrate deploy --schema prisma-tenant/schema.prisma`
- `npx prisma generate --schema prisma-tenant/schema.prisma`

Env utili (dev)
- `PRESIGN_ENABLED=false` (presign disabilitato → allegati rifiutati su create; endpoint presign → 501)
- `REPORT_SECRET_COST=12`, `REPORT_SECRET_PEPPER=dev_report_pepper`
- `IP_HASH_PEPPER=dev_ip_pepper`, `PII_CHECK_ENABLED=false`
- `ATTACH_MAX_FILES=3`, `ATTACH_MAX_FILE_MB=10`, `ATTACH_MAX_TOTAL_MB=20`

Flusso base
1) Lista reparti del tenant
```
curl -sS -H "x-tenant-id: TENANT_ID" \
  http://localhost:3000/v1/public/departments
```
Output atteso: `[{ "id": "dep_...", "name": "...", "sortOrder": 0 }]`.

2) Lista categorie per reparto
```
curl -sS -H "x-tenant-id: TENANT_ID" \
  "http://localhost:3000/v1/public/categories?departmentId=DEP_ID"
```
Output atteso: `[{ "id": "cat_...", "name": "...", "sortOrder": 0 }]`.

3) Crea segnalazione testuale (form pubblico)
```
curl -sS -X POST \
  -H "x-tenant-id: TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-14T09:30:00.000Z",
    "source": "WEB",
    "privacy": "ANONIMO",
    "subject": "Oggetto della segnalazione",
    "departmentId": "DEP_ID",
    "categoryId": "CAT_ID",
    "description": "Descrizione dettagliata (>=10 caratteri)"
  }' \
  http://localhost:3000/v1/public/reports
```
Risposta 201:
```
{ "reportId": "rep_...", "publicCode": "R-XXXX-YYYY", "secret": "<mostrato-una-sola-volta>", "createdAt": "..." }
```

4) Presign allegati (stub finché disabilitato)
```
curl -sS -X POST -H "x-tenant-id: TENANT_ID" \
  http://localhost:3000/v1/public/reports/attachments/presign
```
Risposta attesa: 501 (Not Implemented) se `PRESIGN_ENABLED=false`.

5) Segnalazioni vocali (audio)
- Endpoint dedicato:
  - POST `/v1/public/voice/attachments/presign` → 501 se presign disabilitato
  - POST `/v1/public/voice/reports` → crea report con allegati audio (richiede presign attivo)

6) Stato pubblico (publicCode + secret)
```
curl -sS -H "x-tenant-id: TENANT_ID" \
  "http://localhost:3000/v1/public/reports/status?publicCode=R-XXXX-YYYY&secret=<SECRET>"
```
Risposta 200: `{ message: 'Segnalazione trovata', report: { id, publicCode, status, title, summary, createdAt, updatedAt, eventDate, privacy, channel, messages: [ { id, author, body, createdAt } ] } }`.

Presign DEV (MOCK)
- Abilita: `PRESIGN_ENABLED=true` e `PRESIGN_MODE=MOCK` in `.env`.
- Opzionale: `PRESIGN_PROOF_REQUIRED=true` abilita la verifica HMAC dello `storageKey` lato server. Imposta `PRESIGN_PROOF_SECRET`.
- Public allegati:
```
curl -sS -X POST -H "x-tenant-id: TENANT_ID" -H "Content-Type: application/json" \
  -d '{"files":[{"fileName":"allegato.pdf","mimeType":"application/pdf","sizeBytes":1234}]}' \
  http://localhost:3000/v1/public/reports/attachments/presign
```
- Voice allegati:
```
curl -sS -X POST -H "x-tenant-id: TENANT_ID" -H "Content-Type: application/json" \
  -d '{"files":[{"fileName":"audio.mp3","mimeType":"audio/mpeg","sizeBytes":524288}]}' \
  http://localhost:3000/v1/public/voice/attachments/presign
```
- Risposta (entrambi):
```
{ "items": [ { "storageKey": "<tenant>/tmp/<uuid>.<ext>", "method": "PUT", "uploadUrl": "https://example.invalid/upload/<tenant>/tmp/<uuid>.<ext>", "headers": {"content-type": "..."}, "maxSizeBytes": 10485760, "expiresIn": 300, "proof": "<hmac>" } ] }
```
Nota: in MOCK non avviene alcun upload reale; usa solo per sviluppo UI.

Attachments: proof HMAC (facoltativo)
- Se `PRESIGN_PROOF_REQUIRED=true`, gli endpoint `POST /v1/public/reports` e `POST /v1/public/voice/reports` richiedono `attachments[].proof` con HMAC-SHA256 calcolato su `storageKey` usando `PRESIGN_PROOF_SECRET`.
- In MOCK il `proof` viene già generato nella risposta del presign.

Tenant reports: paginazione e filtri
- `GET /v1/tenant/reports?clientId=<TENANT>&page=1&pageSize=20&status=OPEN,NEED_INFO&departmentId=...&categoryId=...&q=ricerca`

## Trascrizione (STT) – Setup
- Abilita pipeline asincrona con env:
  - `TRANSCRIBE_ENABLED=true`
  - `TRANSCRIBE_ENGINE=MOCK|WHISPER_LOCAL`
  - `TRANSCRIBE_TIMER_MS=300000` (facoltativo, default 5 minuti)
  - `WHISPER_URL=http://whisper:8080/transcribe` (quando il microservizio è pronto)
  - `WHISPER_MODEL=small-int8|small|medium`, `WHISPER_DEVICE=cpu|cuda`, `WHISPER_LANG=it`, `TRANSCRIBE_MAX_DURATION_S=600`
- Flusso:
  - Creazione voice report → marker SYSTEM `TRANSCRIPT_JOB_QUEUED`
  - Scheduler `report-transcription.scheduler.ts` cerca report con allegati audio e senza `TRANSCRIPT_DONE/ERROR`
  - ENGINE=MOCK → scrive messaggio `INTERNAL` (nota `Trascrizione audio`) con testo fittizio e marca `TRANSCRIPT_DONE`
  - ENGINE=WHISPER_LOCAL → pronto a chiamare `WHISPER_URL` (integrazione reale storage/HTTP da collegare)

Codici di stato
- 200/201: OK
- 400: validazione (es. allegati presenti con presign disabilitato)
- 404: scoping tenant/relazioni non valide
- 413: limiti allegati superati (max 3, ≤10MB cad., ≤20MB tot)
- 429: rate-limit sui POST
- 501: presign disabilitato/non implementato

Note sicurezza
- Nessun `clientId` in input pubblico; scoping via `x-tenant-id` (in dev) e allowlist in prod.
- Nessun log di subject/description/allegati/secret. In DB salva solo l'hash del secret.
- Le viste pubbliche del thread mostrano solo messaggi `visibility=PUBLIC`.

## Tenant Auth & MFA: Quick Test (curl)

Prerequisiti
- Server su `http://localhost:3000` e frontend su `http://localhost:5173` (dev).
- Utente interno esistente nel tenant e `x-tenant-id` (in dev lo passi tu; in produzione lo inietta un proxy).

Login (esiti possibili)
- POST `POST /v1/tenant/auth/login`
  - Headers: `x-tenant-id: <TENANT_ID>`, `Content-Type: application/json`
  - Body: `{ "email": "user@example.com", "password": "..." }`
  - Esiti:
    - 428 Precondition Required: `{ "requireMfaSetup": true, "setupToken": "..." }` (owner senza MFA)
    - 201 Created: `{ "mfaRequired": true, "mfaToken": "..." }` (MFA abilitata, serve TOTP)
    - 201 Created: `{ "accessToken": "...", "user": {...} }` (se MFA non richiesta)

MFA Setup (solo alla prima attivazione)
- Genera segreto TOTP: `POST /v1/tenant/auth/mfa/setup`
  - Headers: `Authorization: Bearer <setupToken>` oppure `x-mfa-token: <setupToken>`
  - Risposta: `{ otpauthUrl, secret, expiresIn }` (in dev espone anche `secret`)
- Verifica setup: `POST /v1/tenant/auth/mfa/verify`
  - Headers: come sopra (Bearer o `x-mfa-token`)
  - Body: `{ "code": "123456" }`
  - Risposta: `{ message: "MFA attivata con successo", recoveryCodes: [ ... ] }`

MFA durante il login
- Dopo il login (201 con `mfaToken`): `POST /v1/tenant/auth/mfa/complete`
  - Headers: `Authorization: Bearer <mfaToken>` oppure `x-mfa-token: <mfaToken>`
  - Body: `{ "code": "123456" }`
  - Risposta: `{ user, accessToken }` e `Set-Cookie: refresh_token=...; HttpOnly` + `Set-Cookie: access_token=...; HttpOnly`

Altri endpoint
- `POST /v1/tenant/auth/refresh` → ruota refresh, emette nuovo `access_token` come cookie HttpOnly (ritorna anche `accessToken` nel body per compatibilità)
- `POST /v1/tenant/auth/logout` → revoca la sessione di refresh corrente
- `GET /v1/tenant/auth/me` → profilo utente (accetta `access_token` da cookie HttpOnly o `Authorization: Bearer <accessToken>`) 

## Tenant Reports (Sicurezza & Uso)

- Tutte le rotte sotto `GET/POST/PATCH/DELETE /v1/tenant/reports` richiedono `Authorization: Bearer <accessToken>`.
- Scoping forte: il `clientId` nel token deve coincidere con il `clientId` della richiesta (query/body) e con quello dei dati a DB.
- Esempi
  - Lista report del tenant:
    - `curl -sS -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/v1/tenant/reports?clientId=<TENANT_ID>"`
  - Aggiorna stato:
    - `curl -sS -X PATCH -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
       -d '{"clientId":"<TENANT_ID>","reportId":"rep_...","status":"IN_PROGRESS"}' \
       "http://localhost:3000/v1/tenant/reports/<REPORT_ID>/status"`
  - Elimina report:
    - `curl -sS -X DELETE -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/v1/tenant/reports/<REPORT_ID>"`

Dettaglio con auto-ack
- `GET /v1/tenant/reports/:reportId` (JWT) imposta automaticamente `acknowledgeAt` alla prima lettura e calcola `dueAt = acknowledgeAt + RESPONSE_TTL_DAYS`.
- Scrive anche un messaggio `SYSTEM` (nota `SLA_ACK_ON_VIEW`). Chiamate successive sono idempotenti (non ricreano l'ack).

SLA Reminder (opzionale)
- Abilita reminder con `SLA_REMINDER_ENABLED=true` (job giornaliero di default; override con `SLA_TIMER_MS`).
- Configurazione:
  - `ACK_TTL_DAYS=7` (default) → ricezione (ricevuta) entro 7 giorni
  - `RESPONSE_TTL_DAYS=90` (default) → riscontro entro 90 giorni
  - `ACK_REMIND_DAYS=2,3,7` → promemoria ack a 2/3/7 giorni (SYSTEM messages con note `SLA_ACK_REMINDER_DX`)
  - `RESPONSE_REMIND_DAYS=30,60,80,90` → promemoria risposta (note `SLA_RESPONSE_REMINDER_DX`) e `SLA_OVERDUE` oltre scadenza

Note
- In dev, puoi continuare a passare `x-tenant-id` solo per le rotte public. Le rotte `tenant/reports` usano esclusivamente il JWT.
- In caso di mismatch tra token e `clientId` di richiesta/dato, il server risponde `403 Forbidden`.

## CORS (Dev vs Prod)

Dev (default)
- Origin: consentiti tutti, a meno di `CORS_ALLOWED_ORIGINS`.
- Headers consentiti: `Content-Type, Authorization, Accept, X-Requested-With, x-tenant-id, x-mfa-token`.
- Headers esposti: `x-mfa-token, x-auth-mfa`.
- Implicazione: il browser può inviare `Authorization` e `x-mfa-token` alle rotte MFA.

Prod (raccomandato)
- Imposta `NODE_ENV=production` e configura `CORS_ALLOWED_ORIGINS` (CSV degli origin ammessi).
- Non esporre/accettare `x-tenant-id` dal browser: farlo iniettare dal proxy/edge e valida `TENANT_ID_ALLOWLIST`.
- Headers consentiti: base `Content-Type, Authorization, Accept, X-Requested-With`.

Esempio preflight (dev)
```
curl -i -X OPTIONS \
  http://localhost:3000/v1/tenant/auth/mfa/verify \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, authorization, x-tenant-id, x-mfa-token"
```
Output atteso: `Access-Control-Allow-Headers` include `authorization` (e `x-mfa-token`).

## Env utili (Auth/CORS)
- `CORS_ALLOWED_ORIGINS` → CSV origin ammessi (prod consigliato)
- `COOKIE_DOMAIN` → dominio cookie refresh (in dev: `localhost`)
- `API_BASE_URL`, `FRONTEND_BASE_URL` → URL base per FE/BE in locale
- JWT/MFA: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TTL`, `REFRESH_TTL`, `JWT_MFA_SECRET`, `MFA_TOKEN_TTL`, `MFA_ISSUER`

## Cookie & Sicurezza (env)

- Cookie di sessione
  - `ACCESS_TTL` (default `900s`)
  - `REFRESH_TTL` (default `30d`, ridurre a 1–7 giorni in dev)
  - `COOKIE_DOMAIN` (es. `localhost` in dev; `.tuodominio.tld` in prod)
  - `COOKIE_SECURE` (`true`/`false`, default: `true` in prod, `false` altrove)
  - `COOKIE_SAMESITE` (`lax` | `none` | `strict`; default `lax`; in cross-site prod usare `none` + `secure=true`)

- CORS
  - `CORS_ALLOWED_ORIGINS` (CSV) o `FRONTEND_BASE_URL` singolo origin; richiesto in prod con `credentials:true`.

- CSRF opzionale (double submit cookie)
  - `CSRF_PROTECTION=true` abilita controllo su `POST/PUT/PATCH/DELETE` con header `X-CSRF-Token` uguale al cookie `XSRF-TOKEN`.
  - Escluso `GET/HEAD/OPTIONS` e `POST /v1/tenant/auth/refresh`.

Nota: Il BE imposta `access_token` e `refresh_token` come cookie HttpOnly; il FE deve usare `withCredentials: true`.

## Logging
- `HTTP_LOG_ENABLED` → se true, stampa un log sintetico per ogni richiesta con `x-request-id`, metodo, URL, status e durata.
