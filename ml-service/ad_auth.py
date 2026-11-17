import json
import os
from pathlib import Path

import jwt
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

AD_TENANT_ID = os.getenv("AD_TENANT_ID")
AD_CLIENT_ID = os.getenv("AD_CLIENT_ID")
AD_AUTHORITY = os.getenv("AD_AUTHORITY", "https://login.microsoftonline.com/")
AD_JWKS_URL = os.getenv(
    "AD_JWKS_URL",
    "https://login.microsoftonline.com/common/discovery/keys",
)


def get_ad_token_config() -> dict:
    return {
        "tenant_id": AD_TENANT_ID,
        "client_id": AD_CLIENT_ID,
        "authority": AD_AUTHORITY,
        "jwks_url": AD_JWKS_URL,
    }


def validate_ad_token(token: str) -> dict:
    """Placeholder for Entra ID / Active Directory validation.

    In production, fetch the tenant JWKS and validate the token signature, issuer,
    audience, and expiry before accepting a user session.
    """
    if not token:
        raise ValueError("Missing token")

    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False, "verify_exp": False},
            algorithms=["RS256"],
        )
        return payload
    except Exception as exc:
        raise ValueError(f"Token validation failed: {exc}") from exc
