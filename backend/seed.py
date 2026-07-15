"""Seed the database with predefined avatars."""

from database import engine, SessionLocal, Base
from models import Avatar

# Avatar data organized by category
AVATARS = [
    # --- Fantasy ---
    {
        "name": "Luna the Enchantress",
        "image_url": "/static/avatars/luna_enchantress.svg",
        "category": "Fantasy",
        "description": "A mystical sorceress wielding moonlight magic, cloaked in shimmering robes of silver and violet.",
    },
    {
        "name": "Drako Flameheart",
        "image_url": "/static/avatars/drako_flameheart.svg",
        "category": "Fantasy",
        "description": "A fierce dragon knight with ember-red armor and a blazing sword forged in dragon fire.",
    },
    {
        "name": "Sylva Thornwood",
        "image_url": "/static/avatars/sylva_thornwood.svg",
        "category": "Fantasy",
        "description": "An ancient forest guardian with bark-like skin and glowing emerald eyes, protector of the sacred groves.",
    },
    # --- Sci-Fi ---
    {
        "name": "Nova-7 Android",
        "image_url": "/static/avatars/nova7_android.svg",
        "category": "Sci-Fi",
        "description": "A sleek humanoid android with cyan circuit patterns and holographic displays integrated into its frame.",
    },
    {
        "name": "Captain Orion",
        "image_url": "/static/avatars/captain_orion.svg",
        "category": "Sci-Fi",
        "description": "A starship commander in a futuristic suit, navigating the cosmos with determination and courage.",
    },
    {
        "name": "Zephyr Cyber-Hacker",
        "image_url": "/static/avatars/zephyr_hacker.svg",
        "category": "Sci-Fi",
        "description": "A neon-lit cyberpunk hacker with augmented reality visors and glowing data streams flowing around them.",
    },
    # --- Nature ---
    {
        "name": "Koda Spirit Bear",
        "image_url": "/static/avatars/koda_bear.svg",
        "category": "Nature",
        "description": "A majestic cosmic bear with fur that shimmers like the northern lights and wise, ancient eyes.",
    },
    {
        "name": "Phoenix Blaze",
        "image_url": "/static/avatars/phoenix_blaze.svg",
        "category": "Nature",
        "description": "A radiant phoenix emerging from golden flames, its feathers cascading with fire and rebirth energy.",
    },
    {
        "name": "Aqua Leviathan",
        "image_url": "/static/avatars/aqua_leviathan.svg",
        "category": "Nature",
        "description": "A graceful deep-sea creature with bioluminescent scales and flowing fins that dance like underwater auroras.",
    },
    # --- Abstract ---
    {
        "name": "Prism Shift",
        "image_url": "/static/avatars/prism_shift.svg",
        "category": "Abstract",
        "description": "A geometric entity of constantly shifting prismatic shapes, radiating beams of pure spectral light.",
    },
    {
        "name": "Nebula Core",
        "image_url": "/static/avatars/nebula_core.svg",
        "category": "Abstract",
        "description": "A swirling cosmic nebula condensed into a spherical form, with galaxies orbiting its luminous center.",
    },
    {
        "name": "Echo Fractal",
        "image_url": "/static/avatars/echo_fractal.svg",
        "category": "Abstract",
        "description": "An infinitely recursive fractal being that pulses with deep purple and electric blue energy waves.",
    },
    # --- New Mock Avatars ---
    {
        "name": "Shadow Ninja",
        "image_url": "/static/avatars/shadow_ninja.svg",
        "category": "Fantasy",
        "description": "A silent warrior cloaked in midnight shadows, moving unseen through the darkest corners of the realm.",
    },
    {
        "name": "Aurora Mage",
        "image_url": "/static/avatars/aurora_mage.svg",
        "category": "Fantasy",
        "description": "A radiant spellcaster who channels the shimmering lights of the aurora into devastating arcane magic.",
    },
    {
        "name": "Titan Golem",
        "image_url": "/static/avatars/titan_golem.svg",
        "category": "Nature",
        "description": "An ancient stone colossus awakened from millennia of slumber, its amber eyes burning with primordial power.",
    },
]


def seed_database():
    """Populate the database with predefined avatar data."""
    # Create tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if avatars already exist
        existing_count = db.query(Avatar).count()
        if existing_count > 0:
            print(f"Database already has {existing_count} avatars. Skipping seed.")
            return

        # Insert avatars
        for avatar_data in AVATARS:
            avatar = Avatar(**avatar_data)
            db.add(avatar)

        db.commit()
        print(f"[OK] Successfully seeded {len(AVATARS)} avatars into the database!")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
