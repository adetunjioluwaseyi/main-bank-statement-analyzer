import pymupdf
import re
import pandas as pd
import xgboost as xgb
from pathlib import Path

SAMPLE_PASSWORDS = ["", "08012345678", "password"]

def extract_pdf_features(pdf_path: Path, label: int):
    try:
        doc = pymupdf.open(pdf_path)
    except Exception as e:
        print(f"Skipping {pdf_path.name}: {e}")
        return None

    if doc.is_encrypted:
        unlocked = False
        for pwd in SAMPLE_PASSWORDS:
            if doc.authenticate(pwd):
                unlocked = True
                break
        if not unlocked:
            doc.close()
            return None

    if len(doc) == 0:
        doc.close()
        return None

    metadata = doc.metadata or {}
    producer = metadata.get("producer", "").lower()
    creator = metadata.get("creator", "").lower()

    suspicious_tools = ["canva", "photoshop", "itext", "pdfescape"]
    is_suspicious_tool = int(any(t in producer or t in creator for t in suspicious_tools))

    all_fonts = set()
    for page in doc:
        for f in page.get_fonts():
            all_fonts.add(f[3])

    stream_bytes = doc.write()
    revision_count = len(re.findall(rb"/XRef", stream_bytes))
    page_count = len(doc)
    doc.close()

    return {
        "is_suspicious_tool": is_suspicious_tool,
        "revision_count": revision_count,
        "font_count": len(all_fonts),
        "page_count": page_count,
        "label": label
    }

if __name__ == "__main__":
    records = []

    # 0 = Genuine
    for f in Path("data/raw/genuine").glob("*.pdf"):
        feats = extract_pdf_features(f, label=0)
        if feats:
            records.append(feats)

    # 1 = Tampered
    for f in Path("data/raw/tampered").glob("*.pdf"):
        feats = extract_pdf_features(f, label=1)
        if feats:
            records.append(feats)

    df = pd.DataFrame(records)
    print("\nDataset Extracted:")
    print(df)

    if len(df) < 2 or len(df["label"].unique()) < 2:
        print("\nNeed at least one genuine and one tampered sample to train.")
        exit()

    X = df.drop(columns=["label"])
    y = df["label"]

    clf = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=3,
        learning_rate=0.05,
        scale_pos_weight=2.0
    )
    clf.fit(X, y)

    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    clf.save_model("models/tamper_xgb.json")
    print("\n✅ Successfully trained and saved model to: models/tamper_xgb.json")