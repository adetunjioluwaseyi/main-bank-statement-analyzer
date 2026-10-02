import fitz  # PyMuPDF
import random
import os
from pathlib import Path

GENUINE_DIR = Path("data/raw/genuine")
TAMPERED_DIR = Path("data/raw/tampered")

# If your statements have passwords, list potential passwords here (e.g. phone numbers, DOBs):
SAMPLE_PASSWORDS = ["", "08012345678", "password"]

def unlock_pdf(doc: fitz.Document) -> bool:
    """Attempts to decrypt the PDF if it is locked."""
    if not doc.is_encrypted:
        return True
    
    # Try empty password first, then candidate passwords
    for pwd in SAMPLE_PASSWORDS:
        if doc.authenticate(pwd):
            return True
            
    return False

def tamper_statement(input_path: Path, output_path: Path) -> bool:
    try:
        doc = fitz.open(input_path)
    except Exception as e:
        print(f"❌ Could not open {input_path.name}: {e}")
        return False

    # Check and handle encryption
    if doc.is_encrypted:
        if not unlock_pdf(doc):
            print(f"⚠️ Skipping {input_path.name}: PDF is password-protected. Provide the password in SAMPLE_PASSWORDS or use an unencrypted PDF.")
            doc.close()
            return False

    if len(doc) == 0:
        print(f"⚠️ Skipping {input_path.name}: Document has no pages.")
        doc.close()
        return False

    page = doc[0]

    # 1. Modify metadata to simulate PDF editing tools
    fake_tools = ["Canva", "iText 2.1.7", "PDFescape", "Adobe Photoshop CC"]
    doc.set_metadata({
        "producer": random.choice(fake_tools),
        "creator": "Web PDF Exporter",
    })

    # 2. Overwrite digits/balances to simulate visual & font tampering
    text_instances = page.search_for(".")
    if text_instances:
        target_rect = random.choice(text_instances)
        page.draw_rect(target_rect, color=(1, 1, 1), fill=(1, 1, 1))
        page.insert_text(target_rect.bl, "98,450.00", fontsize=9, fontname="helv", color=(0, 0, 0))

    # Save to tampered folder
    doc.save(str(output_path), incremental=False, encryption=fitz.PDF_ENCRYPT_NONE)
    doc.close()
    return True

if __name__ == "__main__":
    TAMPERED_DIR.mkdir(parents=True, exist_ok=True)
    genuine_files = list(GENUINE_DIR.glob("*.pdf"))

    if not genuine_files:
        print("Place at least 1-2 PDF statements inside 'data/raw/genuine' first.")
    else:
        for idx, pdf in enumerate(genuine_files):
            out_file = TAMPERED_DIR / f"tampered_{idx}_{pdf.name}"
            success = tamper_statement(pdf, out_file)
            if success:
                print(f"✅ Generated tampered file: {out_file.name}")