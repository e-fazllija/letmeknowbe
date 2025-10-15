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
