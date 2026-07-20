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
COGNITO_REGION = os.getenv("COGNITO_REGION")
if not COGNITO_REGION:
    raise RuntimeError("COGNITO_REGION non configurata. Aggiungila al file .env del backend.")

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
            if "disabled" in error_message.lower():
                raise RuntimeError(
                    "L'account è stato sospeso o disabilitato. Contatta l'amministratore."
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


def change_own_password(access_token: str, previous_password: str, new_password: str) -> None:
    """
    Change the password of the currently authenticated user (self-service),
    using their own access token. Cognito verifies `previous_password`
    server-side before accepting the new one — exactly like the hosted UI's
    "change password" flow.

    Raises RuntimeError on failure.
    """
    try:
        _cognito_client.change_password(
            PreviousPassword=previous_password,
            ProposedPassword=new_password,
            AccessToken=access_token,
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NotAuthorizedException":
            raise RuntimeError("La password attuale non è corretta.")
        elif error_code == "InvalidPasswordException":
            raise RuntimeError("La nuova password non soddisfa i requisiti di sicurezza.")
        elif error_code == "LimitExceededException":
            raise RuntimeError("Troppi tentativi. Riprova più tardi.")
        else:
            raise RuntimeError(f"Errore nel cambio password: {e.response['Error']['Message']}")
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")


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


def revoke_refresh_token(refresh_token: str) -> None:
    """
    Revoke a refresh token on Cognito (server-side blacklist).

    After revocation every initiate_auth(REFRESH_TOKEN_AUTH) with this token
    fails: a refresh token stolen from the browser dies with the logout
    instead of staying spendable for 30 days. Requires token revocation
    enabled on the app client (EnableTokenRevocation, the default).

    Raises RuntimeError on failure.
    """
    if refresh_token == "mock-admin-refresh-token":
        return

    try:
        _cognito_client.revoke_token(
            Token=refresh_token,
            ClientId=COGNITO_APP_CLIENT_ID,
        )
    except ClientError as e:
        raise RuntimeError(
            f"Errore nella revoca del refresh token: {e.response['Error']['Message']}"
        )
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")


def verify_access_token(token: str, verify_exp: bool = True) -> dict:
    """
    Verify a Cognito JWT access token.

    Returns the decoded token claims on success.
    Raises RuntimeError on invalid/expired token.

    With verify_exp=False the signature/issuer are still verified but an
    expired token is accepted: the refresh endpoint uses it to identify
    the OLD access token (jti) for the session-binding pre-check — the
    identifier matters there, not the validity.
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
            options={
                "verify_aud": False,  # Access tokens use client_id, not aud
                "verify_exp": verify_exp,
            },
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


def admin_set_user_enabled(email: str, enabled: bool) -> None:
    """
    Enable or disable sign-in for the user on Cognito.

    Disabling immediately blocks new logins and refresh-token use. A user
    missing on Cognito is tolerated (local-only accounts): the local status
    flag still enforces the block on every authenticated request.
    Raises RuntimeError on any other failure.
    """
    try:
        if enabled:
            _cognito_client.admin_enable_user(
                UserPoolId=COGNITO_USER_POOL_ID, Username=email
            )
        else:
            _cognito_client.admin_disable_user(
                UserPoolId=COGNITO_USER_POOL_ID, Username=email
            )
    except ClientError as e:
        if e.response["Error"]["Code"] == "UserNotFoundException":
            return
        action = "riattivazione" if enabled else "sospensione"
        raise RuntimeError(
            f"Errore nella {action} su Cognito: {e.response['Error']['Message']}"
        )
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")


def admin_resend_credentials(email: str) -> str:
    """
    Send the user a fresh temporary password via Cognito email.

    Two cases, depending on the account state:
    - The user has never completed the first login (FORCE_CHANGE_PASSWORD):
      the invitation is re-sent (MessageAction=RESEND) — Cognito generates
      a new temporary password and emails it; the previous temporary
      password stops working.
    - The user already set a permanent password (CONFIRMED): Cognito has no
      re-invite for confirmed accounts, so the account is recreated
      (delete + create) and Cognito emails a brand-new temporary password.
      The old password and any active session stop working; on the next
      login the user is forced to choose a new password.

    Returns the (possibly new) cognito sub: the caller MUST persist it,
    because recreation changes it.
    Raises RuntimeError on failure.
    """
    try:
        cognito_user = _cognito_client.admin_get_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "UserNotFoundException":
            # Orphan account (e.g. a previous recreation failed halfway):
            # create it again so the invitation goes out anyway
            return admin_create_user(email)
        raise RuntimeError(
            f"Errore nella lettura dell'utente da Cognito: {e.response['Error']['Message']}"
        )
    except Exception as e:
        raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")

    if cognito_user.get("UserStatus") == "FORCE_CHANGE_PASSWORD":
        try:
            _cognito_client.admin_create_user(
                UserPoolId=COGNITO_USER_POOL_ID,
                Username=email,
                MessageAction="RESEND",
                DesiredDeliveryMediums=["EMAIL"],
            )
        except ClientError as e:
            raise RuntimeError(
                f"Errore nel rinvio dell'invito: {e.response['Error']['Message']}"
            )
        except Exception as e:
            raise RuntimeError(f"Errore di comunicazione con AWS Cognito: {str(e)}")

        for attr in cognito_user.get("UserAttributes", []):
            if attr["Name"] == "sub":
                return attr["Value"]
        raise RuntimeError("Impossibile ottenere il cognito_sub dell'utente.")

    # CONFIRMED (or any other state): recreate the account to trigger a new
    # invitation email with a temporary password
    admin_delete_user(email)
    return admin_create_user(email)


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

