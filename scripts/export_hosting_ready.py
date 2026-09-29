#!/usr/bin/env python3
"""Export the built WOL-BUD website to _hosting-ready and update _github-repos-i-hosting.
"""
import shutil
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parents[1]
SITES_DIR = SOURCE_DIR.parents[3] / "sites"
HOSTING_READY_DIR = SITES_DIR / "_hosting-ready" / "wol-bud-wojciech-wolanski-tarnow"
GITHUB_INFO_DIR = SITES_DIR / "_github-repos-i-hosting"

REPO_URL = "https://github.com/KosmA0000/wol-bud-wojciech-wolanski-tarnow"
PAGES_URL = "https://kosma0000.github.io/wol-bud-wojciech-wolanski-tarnow/"
ORIGINAL_URL = "https://wol-bud.com.pl/"

print(f"Exporting to: {HOSTING_READY_DIR}")
HOSTING_READY_DIR.mkdir(parents=True, exist_ok=True)
GITHUB_INFO_DIR.mkdir(parents=True, exist_ok=True)

# Copy web directories
web_dirs = [
    "assets",
    "img",
    "kategorie",
    "produkty",
    "uslugi",
    "promocje",
    "oferta",
    "o-firmie",
    "nasze-sklepy",
    "kontakt",
]

for d in web_dirs:
    src = SOURCE_DIR / d
    dst = HOSTING_READY_DIR / d
    if src.exists():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        print(f"  Copied {d}/")

# Copy index.html
shutil.copy2(SOURCE_DIR / "index.html", HOSTING_READY_DIR / "index.html")
print("  Copied index.html")

# Write metadata files
(HOSTING_READY_DIR / "oryginalny-adres.txt").write_text(ORIGINAL_URL + "\n", encoding="utf-8")
repo_info = f"Repo GitHub: {REPO_URL}\nHosting (GitHub Pages): {PAGES_URL}\n"
(HOSTING_READY_DIR / "github-repo.txt").write_text(repo_info, encoding="utf-8")
print("  Created oryginalny-adres.txt and github-repo.txt")

# Write to _github-repos-i-hosting
(GITHUB_INFO_DIR / "wol-bud-wojciech-wolanski-tarnow.txt").write_text(repo_info, encoding="utf-8")
print(f"  Created {GITHUB_INFO_DIR / 'wol-bud-wojciech-wolanski-tarnow.txt'}")

print("\nExport to hosting-ready completed successfully!")
