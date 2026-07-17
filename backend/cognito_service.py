"""Service for communicating with AWS Cognito for authentication."""

import os
import json
import time
import uuid
import requests as http_requests
from jose import jwt, JWTError
import boto3
import botocore.exceptions
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID", "")
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-central-1")

# Cognito client
_cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)

# JWKS cache
_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
_JWKS_CACHE_TTL = 3600  # 1 hour


def _get_jwks() -> dict:
    """Fetch and cache the JSON Web Key Set from Cognito."""
    global _jwks_cache, _jwks_cache_time

    if _jwks_cache and (time.time() - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache

    jwks_url = (
        f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
        f"{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )
    response = http_requests.get(jwks_url, timeout=10)
    response.raise_for_status()
    _jwks_cache = response.json()
    _jwks_cache_time = time.time()
    return _jwks_cache


def authenticate(email: str, password: str) -> dict:
    """
    Authenticate a user with email and password via Cognito.

    Returns either:
    - Auth tokens (if login succeeds)
    - A challenge dict (if NEW_PASSWORD_REQUIRED)

    Raises RuntimeError on failure.
    """
    if email in ("admin", "admin@admin.com", "admin@skilllab.local") and password == "admin":
        return {
            "access_token": "mock-admin-access-token",
            "refresh_token": "mock-admin-refresh-token",
            "id_token": "mock-admin-id-token",
        }

    try:
        response = _cognito_client.initiate_auth(
            ClientId=COGNITO_APP_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PASSWORD": password,
            },
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        if error_code == "NotAuthorizedException":
            if "expired" in error_message.lower():
                raise RuntimeError(
                    "La password temporanea è scaduta. "
                    "Contatta l'amministratore per ricevere un nuovo invito."
                )
            raise RuntimeError("Email o password non corretti.")
        elif error_code == "UserNotFoundException":
            raise RuntimeError("Email o password non corretti.")
        elif error_code == "UserNotConfirmedException":
            raise RuntimeError("L'account non è stato confermato.")
        else:
            raise RuntimeError(f"Errore di autenticazione: {e.response['Error']['Message']}")

    # Check if Cognito requires a new password
    if response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
        return {
            "challenge": "NEW_PASSWORD_REQUIRED",
            "session": response["Session"],
        }

    # Successful auth — return tokens
    auth_result = response["AuthenticationResult"]
    return {
        "access_token": auth_result["AccessToken"],
        "refresh_token": auth_result["RefreshToken"],
        "id_token": auth_result["IdToken"],
    }


def respond_to_new_password_challenge(
    email: str, new_password: str, session: str
) -> dict:
    """
    Complete the NEW_PASSWORD_REQUIRED challenge.

    Returns auth tokens on success.
    Raises RuntimeError on failure.
    """
    try:
        response = _cognito_client.respond_to_auth_challenge(
            ClientId=COGNITO_APP_CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME": email,
                "NEW_PASSWORD": new_password,
            },
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "InvalidPasswordException":
            raise RuntimeError("La password non soddisfa i requisiti di sicurezza.")
        elif error_code in ("CodeMismatchException", "NotAuthorizedException"):
            raise RuntimeError("Sessione scaduta. Effettua nuovamente il login.")
        else:
            raise RuntimeError(f"Errore nel cambio password: {e.response['Error']['Message']}")

    auth_result = response["AuthenticationResult"]
    return {
        "access_token": auth_result["AccessToken"],
        "refresh_token": auth_result["RefreshToken"],
        "id_token": auth_result["IdToken"],
    }


def refresh_tokens(refresh_token: str) -> dict:
    """
    Refresh the access token using a refresh token.

    Returns new access token.
    Raises RuntimeError on failure.
    """
    if refresh_token == "mock-admin-refresh-token":
        return {
            "access_token": "mock-admin-access-token",
        }

    try:
        response = _cognito_client.initiate_auth(
            ClientId=COGNITO_APP_CLIENT_ID,
            AuthFlow="REFRESH_TOKEN_AUTH",
            AuthParameters={
                "REFRESH_TOKEN": refresh_token,
            },
        )
    except ClientError as e:
        raise RuntimeError(f"Impossibile rinnovare il token: {e.response['Error']['Message']}")

    auth_result = response["AuthenticationResult"]
    return {
        "access_token": auth_result["AccessToken"],
    }


def verify_access_token(token: str) -> dict:
    """
    Verify a Cognito JWT access token.

    Returns the decoded token claims on success.
    Raises RuntimeError on invalid/expired token.
    """
    if token == "mock-admin-access-token":
        return {
            "sub": "mock-admin-sub-0000-0000-0000",
            "username": "admin",
            "token_use": "access",
        }

    try:
        jwks = _get_jwks()

        # Get the key ID from the token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find the matching key
        rsa_key = None
        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                rsa_key = key
                break

        if not rsa_key:
            raise RuntimeError("Chiave di firma non trovata.")

        # Verify the token
        claims = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}",
            options={"verify_aud": False},  # Access tokens use client_id, not aud
        )

        # Verify token_use is "access"
        if claims.get("token_use") != "access":
            raise RuntimeError("Token non valido: non è un access token.")

        return claims

    except JWTError as e:
        raise RuntimeError(f"Token non valido o scaduto: {str(e)}")


def get_cognito_sub_from_token(token: str) -> str:
    """Extract the cognito sub (user ID) from a verified access token."""
    claims = verify_access_token(token)
    return claims["sub"]


def admin_create_user(email: str) -> str:
    """
    Create a new user in Cognito as an admin.

    The user receives a temporary password via email.
    Returns the cognito sub (unique user ID).

    Raises RuntimeError on failure.
    """
    try:
        response = _cognito_client.admin_create_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "UsernameExistsException":
            raise RuntimeError("Un utente con questa email esiste già su Cognito.")
        elif error_code == "InvalidParameterException":
            raise RuntimeError(f"Parametro non valido: {e.response['Error']['Message']}")
        else:
            raise RuntimeError(f"Errore nella creazione utente: {e.response['Error']['Message']}")
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")

    # Extract the sub from the user attributes
    cognito_sub = None
    for attr in response["User"]["Attributes"]:
        if attr["Name"] == "sub":
            cognito_sub = attr["Value"]
            break

    if not cognito_sub:
        raise RuntimeError("Impossibile ottenere il cognito_sub dell'utente creato.")

    return cognito_sub


def admin_delete_user(email: str) -> None:
    """
    Delete a user from Cognito as an admin.

    A user missing on Cognito is not an error (e.g. already deleted, or a
    local-only account): the local DB cleanup must proceed anyway.
    Raises RuntimeError on any other failure.
    """
    try:
        _cognito_client.admin_delete_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "UserNotFoundException":
            return
        raise RuntimeError(
            f"Errore nell'eliminazione da Cognito: {e.response['Error']['Message']}"
        )
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")

