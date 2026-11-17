# ml-service/vertex_forensics.py
import os
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

class ExtractedTx(BaseModel):
    date: str = Field(description="Transaction date (DD/MM/YYYY or YYYY-MM-DD)")
    description: str = Field(description="Clean narration, counterparty name, or transaction remark")
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
    bank_provider: Optional[str] = Field(description="Detected bank name (e.g., Zenith Bank, Stanbic IBTC, Moniepoint, GTBank, OPay)")
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

def analyze_statement_with_vertex(pdf_bytes: bytes) -> Optional[SingleStatementAnalysis]:
    try:
        client = genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT", "573511105256"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        )
        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")

        prompt = """
        You are an institutional banking forensic auditor and credit underwriting specialist.
        Examine this bank statement PDF with high scrutiny across two dimensions:

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

        model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        
        response = client.models.generate_content(
            model=model_name,
            contents=[pdf_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SingleStatementAnalysis,
                temperature=0.0,
            ),
        )
        return response.parsed
    except Exception as e:
        print(f"Vertex AI analysis failed: {e}")
        return None