"""Google Gemini service for avatar chat roleplay."""

import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


def build_system_prompt(avatar_name: str, avatar_description: str, avatar_category: str) -> str:
    """Build the system prompt for avatar roleplay."""
    return (
        f"Sei {avatar_name}. {avatar_description}\n"
        f"Appartieni alla categoria: {avatar_category}.\n\n"
        "ISTRUZIONI:\n"
        "- Devi interpretare questo personaggio in ogni risposta.\n"
        "- Rispondi SEMPRE in italiano.\n"
        "- Sii coinvolgente, creativo e resta nel personaggio.\n"
        "- Usa un tono che rispecchi la personalità del personaggio.\n"
        "- Non rompere mai il personaggio e non rivelare di essere un'intelligenza artificiale.\n"
        "- Mantieni le risposte concise ma interessanti (2-4 paragrafi massimo).\n"
    )


def get_avatar_response(
    avatar_name: str,
    avatar_description: str,
    avatar_category: str,
    messages_history: list[dict],
    user_message: str,
) -> str:
    """
    Get a roleplay response from Google Gemini.

    Args:
        avatar_name: The avatar's display name.
        avatar_description: The avatar's description/backstory.
        avatar_category: The avatar's category.
        messages_history: Previous messages as [{"role": "user"/"model", "content": "..."}].
        user_message: The new user message.

    Returns:
        The assistant's response text.
    """
    if not client:
        raise RuntimeError(
            "GEMINI_API_KEY non configurata. "
            "Aggiungi GEMINI_API_KEY al file .env del backend."
        )

    system_prompt = build_system_prompt(avatar_name, avatar_description or "", avatar_category)

    # Build conversation history for Gemini
    contents = []
    for msg in messages_history:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

    # Add the new user message
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.9,
                max_output_tokens=1024,
            ),
        )
        return response.text or "..."
    except Exception as e:
        print(f"[ERROR] Gemini API call failed: {e}")
        raise RuntimeError(f"Errore nella comunicazione con Gemini: {str(e)}")
