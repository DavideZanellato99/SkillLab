"""Generate beautiful SVG avatar images for the app."""

import os

AVATAR_SVGS = {
    "luna_enchantress.webp": {
        "gradient": ["#7c3aed", "#a855f7", "#c084fc"],
        "emoji": "🌙",
        "bg_shape": "circle",
    },
    "drako_flameheart.webp": {
        "gradient": ["#dc2626", "#f97316", "#fbbf24"],
        "emoji": "🐉",
        "bg_shape": "diamond",
    },
    "sylva_thornwood.webp": {
        "gradient": ["#059669", "#10b981", "#34d399"],
        "emoji": "🌿",
        "bg_shape": "circle",
    },
    "nova7_android.webp": {
        "gradient": ["#0284c7", "#06b6d4", "#22d3ee"],
        "emoji": "🤖",
        "bg_shape": "hexagon",
    },
    "captain_orion.webp": {
        "gradient": ["#1e3a5f", "#3b82f6", "#60a5fa"],
        "emoji": "🚀",
        "bg_shape": "circle",
    },
    "zephyr_hacker.webp": {
        "gradient": ["#be185d", "#ec4899", "#f472b6"],
        "emoji": "👾",
        "bg_shape": "diamond",
    },
    "koda_bear.webp": {
        "gradient": ["#7e22ce", "#a855f7", "#06b6d4"],
        "emoji": "🐻",
        "bg_shape": "circle",
    },
    "phoenix_blaze.webp": {
        "gradient": ["#ea580c", "#f59e0b", "#fcd34d"],
        "emoji": "🔥",
        "bg_shape": "hexagon",
    },
    "aqua_leviathan.webp": {
        "gradient": ["#0e7490", "#06b6d4", "#67e8f9"],
        "emoji": "🐋",
        "bg_shape": "circle",
    },
    "prism_shift.webp": {
        "gradient": ["#7c3aed", "#ec4899", "#f97316"],
        "emoji": "💎",
        "bg_shape": "diamond",
    },
    "nebula_core.webp": {
        "gradient": ["#1e1b4b", "#6366f1", "#a78bfa"],
        "emoji": "🌌",
        "bg_shape": "circle",
    },
    "echo_fractal.webp": {
        "gradient": ["#581c87", "#7c3aed", "#06b6d4"],
        "emoji": "✨",
        "bg_shape": "hexagon",
    },
    "shadow_ninja.webp": {
        "gradient": ["#1e293b", "#334155", "#475569"],
        "emoji": "🥷",
        "bg_shape": "diamond",
    },
    "aurora_mage.webp": {
        "gradient": ["#d946ef", "#e879f9", "#f0abfc"],
        "emoji": "🧙‍♀️",
        "bg_shape": "circle",
    },
    "titan_golem.webp": {
        "gradient": ["#b45309", "#f59e0b", "#fbbf24"],
        "emoji": "🗿",
        "bg_shape": "hexagon",
    },
}


def generate_svg(name: str, config: dict) -> str:
    """Generate a beautiful SVG avatar."""
    colors = config["gradient"]
    emoji = config["emoji"]
    
    # Create SVG with gradient background and decorative elements
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="{colors[2]}" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="{colors[1]}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="{colors[0]}" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="{colors[2]}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="{colors[0]}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="{colors[0]}" flood-opacity="0.5"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="400" height="400" rx="32" fill="{colors[0]}"/>
  <rect width="400" height="400" rx="32" fill="url(#bg)"/>
  
  <!-- Decorative circles -->
  <circle cx="320" cy="80" r="100" fill="{colors[1]}" opacity="0.15" filter="url(#blur)"/>
  <circle cx="80" cy="320" r="80" fill="{colors[2]}" opacity="0.15" filter="url(#blur)"/>
  <circle cx="200" cy="200" r="150" fill="url(#glow)"/>
  
  <!-- Decorative ring -->
  <circle cx="200" cy="200" r="130" fill="none" stroke="{colors[2]}" stroke-width="1" opacity="0.3"/>
  <circle cx="200" cy="200" r="160" fill="none" stroke="{colors[1]}" stroke-width="0.5" opacity="0.2"/>
  
  <!-- Small decorative dots -->
  <circle cx="100" cy="100" r="3" fill="{colors[2]}" opacity="0.6"/>
  <circle cx="300" cy="120" r="2" fill="{colors[2]}" opacity="0.5"/>
  <circle cx="320" cy="280" r="4" fill="{colors[1]}" opacity="0.4"/>
  <circle cx="80" cy="250" r="2.5" fill="{colors[2]}" opacity="0.5"/>
  <circle cx="150" cy="60" r="2" fill="{colors[1]}" opacity="0.6"/>
  <circle cx="260" cy="340" r="3" fill="{colors[2]}" opacity="0.4"/>
  
  <!-- Emoji Avatar -->
  <text x="200" y="215" text-anchor="middle" dominant-baseline="central" 
        font-size="120" filter="url(#shadow)">{emoji}</text>
  
  <!-- Bottom gradient overlay -->
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0.7" x2="0" y2="1">
      <stop offset="0%" stop-color="{colors[0]}" stop-opacity="0"/>
      <stop offset="100%" stop-color="{colors[0]}" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="32" fill="url(#bottomFade)"/>
</svg>"""
    return svg


def generate_all_avatars():
    """Generate all avatar SVG files."""
    output_dir = os.path.join(os.path.dirname(__file__), "static", "avatars")
    os.makedirs(output_dir, exist_ok=True)

    for filename, config in AVATAR_SVGS.items():
        # Save as SVG (we'll rename to match the expected filename pattern)
        svg_filename = filename.replace(".webp", ".svg")
        filepath = os.path.join(output_dir, svg_filename)
        
        svg_content = generate_svg(filename, config)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(svg_content)
        
        print(f"  [OK] Generated {svg_filename}")

    print(f"\n[DONE] Generated {len(AVATAR_SVGS)} avatar images in {output_dir}")


if __name__ == "__main__":
    generate_all_avatars()
