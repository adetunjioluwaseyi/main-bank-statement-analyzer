# ml-service/vertex_forensics.py
import os
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# -------------------------------------------------------------
# 1. Pydantic Schemas
# -------------------------------------------------------------

class ExtractedTx(BaseModel):
    date: str = Field(description="Transaction date (DD/MM/YYYY or YYYY-MM-DD)")
    description: str = Field(description="Clean narration, merchant, or counterparty name")
    debit: float = Field(default=0.0, description="Outflow amount (positive float). 0.0 if credit.")
    credit: float = Field(default=0.0, description="Inflow amount (positive float). 0.0 if debit.")
    balance: float = Field(description="Stated running balance after transaction")

class ForensicVerdict(BaseModel):
    is_tampered: bool = Field(description="True if digital, visual, typographic, or mathematical manipulation is detected")
    status: Literal["VERIFIED", "MANUAL_REVIEW", "POSSIBLE_MANIPULATION"]
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0")
    reasons: List[str] = Field(description="List of specific forensic flags or anomaly codes")
    font_status: str = Field(description="Font consistency, kerning, baseline alignment, or visual patch observations")
    tamper_details: List[str] = Field(default_factory=list, description="Specific page or row locations where tampering is suspected")

class SingleStatementAnalysis(BaseModel):
    bank_provider: Optional[str] = Field(description="Detected bank name (e.g. Zenith Bank, Stanbic IBTC, Moniepoint, GTBank, OPay)")
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    total_debits: Optional[float] = None
    total_credits: Optional[float] = None
    forensics: ForensicVerdict
    transactions: List[ExtractedTx]
    engine_used: Optional[str] = None

# -------------------------------------------------------------
# 2. Forensic Prompt
# -------------------------------------------------------------

ANALYSIS_PROMPT = """
You are an institutional banking forensic auditor and credit underwriting specialist.
Examine this bank statement PDF thoroughly across two dimensions:

1. FORENSIC & VISUAL TAMPER AUDIT:
   - Micro-Inconsistency Inspection: Check if numbers in the balance or amount columns look pasted, typed over, or misaligned with the grid.
   - Font & Typography: Check for mismatched font families, inconsistent character kerning, fuzzy antialiasing, or baseline misalignment.
   - Template & Watermark Discrepancies: Identify repeated static summary headers across pages, altered bank logos, or signs of PDF editor tools (Canva, Photoshop, iText, Sejda, Acrobat).
   - Running Arithmetic Continuity: Verify that (Previous Balance + Credit - Debit = Stated Balance).

2. ACCURATE TRANSACTION EXTRACTION:
   - Extract transaction rows strictly in chronological order (oldest to newest).
   - In single-amount fintech statements (e.g., Moniepoint, OPay, Kuda), use '+' / '-' signs or 'CR' / 'DR' tags to cleanly separate debits (outflows) and credits (inflows).
   - Extract declared summary totals from headers if available (Opening Balance, Closing Balance, Total Debits, Total Credits).

Output strictly adhering to the defined JSON schema.
"""

# -------------------------------------------------------------
# 3. Cascading Failover Function
# -------------------------------------------------------------

def analyze_statement_with_vertex(pdf_bytes: bytes) -> Optional[SingleStatementAnalysis]:
    """
    Tier 1: Attempts Google Cloud Vertex AI first.
    Tier 2: Automatically fails over to Google AI Studio if Vertex is unavailable.
    """
    pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")

    # --- TIER 1: VERTEX AI ---
    try:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "statement-analyzer-512616")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        model_name = os.getenv("VERTEX_MODEL", "gemini-3.8-flash")
        print(f"--> [Tier 1] Trying Vertex AI ({project_id} / {model_name})...")

        vertex_client = genai.Client(
            vertexai=True,
            project=project_id,
            location=location
        )

        response = vertex_client.models.generate_content(
            model=model_name,
            contents=[pdf_part, ANALYSIS_PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SingleStatementAnalysis,
                temperature=0.0,
            ),
        )

        if response.parsed:
            result = response.parsed
            result.engine_used = "GOOGLE_CLOUD_VERTEX_AI"
            print("✅ [Tier 1] Vertex AI analysis succeeded.")
            return result

    except Exception as vertex_err:
        print(f"⚠️ [Tier 1 Failed] Vertex AI error: {vertex_err}")
        print("--> [Tier 2] Falling back to Google AI Studio...")

    # --- TIER 2: GOOGLE AI STUDIO (FAILOVER) ---
    try:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. Configure it in your environment or local .env file before using Google AI Studio.")

        studio_model = os.getenv("STUDIO_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"

        # FIX: Explicitly set vertexai=False so the client routes via API key
        studio_client = genai.Client(
            api_key=api_key,
            vertexai=False
        )

        response = studio_client.models.generate_content(
            model=studio_model,
            contents=[pdf_part, ANALYSIS_PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SingleStatementAnalysis,
                temperature=0.0,
            ),
        )

        if response.parsed:
            result = response.parsed
            result.engine_used = "GOOGLE_AI_STUDIO"
            print("✅ [Tier 2] Google AI Studio analysis succeeded.")
            return result

    except Exception as studio_err:
        print(f"⚠️ [Tier 2 Failed] Google AI Studio error: {studio_err}")

    # Returning None activates Tier 3 (Local Extractor) in main.py
    return None