<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Bank Statement Analyzer

## Run locally

Install the frontend dependencies and run the Next.js app:

```sh
npm install
npm run dev
```

The PDF forensic analysis backend runs separately:

```sh
cd ml-service
python -m pip install -r requirement.txt
python main.py
```

For local AI settings, create `ml-service/.env.vertex` with
`GOOGLE_CLOUD_PROJECT=your-project-id`, `GOOGLE_CLOUD_LOCATION=us-central1`,
and optionally `VERTEX_MODEL=gemini-3.8-flash`. This local-only file is ignored
by Git. The backend loads it on startup; environment variables already set by
the shell or deployment take precedence. Restart the backend after changing
the file.

If you want to use Google AI Studio instead of Vertex AI, set `GEMINI_API_KEY`
in the same environment or a local `.env` file and keep it out of source control.
For example:

```sh
export GEMINI_API_KEY="your-key"
```

### Configure Vertex AI

The backend sends PDF statements to Gemini models hosted on Vertex AI. Set
`GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` in the backend process
environment, and configure Google Cloud Application Default Credentials (ADC)
for that same environment. For local development, authenticate with
`gcloud auth application-default login`; in deployment, use the workload's
attached service account. The identity needs permission to invoke Vertex AI,
and the Vertex AI API must be enabled for the project.

`VERTEX_MODEL` is optional and defaults to `gemini-3.8-flash`. The chosen model
must be available in the configured location. If Vertex AI is not configured
or a request fails, the backend logs the reason and falls back to local PDF
extraction. If no Vertex configuration is available and `GEMINI_API_KEY` is
defaulted to an empty value, the backend will fail fast instead of silently using
an embedded secret.

### Hybrid training strategy

The backend is now structured as a hybrid pipeline: the local forensic model handles routine cases, while Vertex AI is used as a validation and labeling source for harder or higher-risk statements. When Vertex AI returns a trusted structured result, the backend saves the record as a labeled training sample so the local extractor can be retrained later without depending entirely on cloud inference.

For multi-statement analysis, the same client can be treated as a bundle: each statement is processed individually, normalized into a common schema, and then aggregated into a client-level cash-flow view before a final underwriting verdict is compiled.

### PostgreSQL + AD setup for enterprise deployment

This project is designed to support a PostgreSQL-backed enterprise workflow with Microsoft Entra ID / Active Directory authentication.

Recommended stack:
- PostgreSQL: primary app database for users, uploads, analysis runs, reports, audit history, and credit ledger
- Azure Blob Storage or AWS S3: original PDFs and generated report files
- Microsoft Entra ID / AD: login and user identity
- FastAPI: validates tokens and enforces credit consumption before analysis

The SQL schema and helper utilities are in `ml-service/pg_schema.sql`, `ml-service/db.py`, `ml-service/credit_service.py`, and `ml-service/test_postgres_credit_flow.py`.

1. Create a PostgreSQL database, for example:

```sql
CREATE DATABASE statement_analyzer;
```

2. Run the schema:

```bash
psql -h localhost -U postgres -d statement_analyzer -f ml-service/pg_schema.sql
```

3. Configure `ml-service/.env` using `ml-service/.env.example` and fill in:
- `DATABASE_URL`
- `AD_TENANT_ID`
- `AD_CLIENT_ID`
- `AD_CLIENT_SECRET`

4. Test the database connection:

```bash
cd ml-service
python test_postgres_credit_flow.py
```

The credit model is built as a ledger-based system so an admin can allocate a pool of credits and assign them to users, while each analysis reduces the user's available balance and records an immutable audit entry.
