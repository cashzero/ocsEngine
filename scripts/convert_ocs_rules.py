#!/usr/bin/env python3
"""Convert the OCS Series Rules PDF into repository Markdown."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

try:
    import pymupdf.layout  # noqa: F401 - enables layout-aware extraction
    import pymupdf4llm
except ImportError as exc:  # pragma: no cover - exercised by environment setup
    raise SystemExit(
        "Missing conversion dependencies. Install scripts/requirements-rules.txt first."
    ) from exc


OFFICIAL_SOURCE_URL = (
    "https://mmpgamers.com/support/gamersarchive/ocs/OCS_Rulesv4.3.pdf"
)
TOP_LEVEL_HEADINGS = {
    "Introduction",
    "Version 4.3 Rules",
    "Game Components",
    "House Rules",
    "Terms and Abbreviations",
    "Terms and Definitions",
    "Notes",
    "Index",
    "Summaries",
}
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
NUMBERED_SECTION_RE = re.compile(r"^(\d+)\.(\d+)([a-z]?)\b")
IMAGE_LINK_RE = re.compile(r"(!\[[^]]*]\()([^)]*[\\/])?([^\\/)]+\.png)(\))")


def _plain_heading(value: str) -> str:
    value = re.sub(r"</?(?:mark|u)>", "", value)
    value = re.sub(r"[*_`]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def _normalize_heading(line: str) -> str:
    match = HEADING_RE.match(line)
    if not match:
        return line

    heading = re.sub(r"</?(?:mark|u)>", "", match.group(2)).strip()
    plain = _plain_heading(heading)
    if plain == "The Gamers, Inc.":
        return ""
    numbered = NUMBERED_SECTION_RE.match(plain)

    if numbered:
        if numbered.group(3):
            return heading
        level = 2 if numbered.group(2) == "0" else 3
    elif plain in TOP_LEVEL_HEADINGS or plain.startswith("Index by "):
        level = 2
    elif plain.lower().startswith("example:"):
        level = 4
    else:
        level = min(max(len(match.group(1)), 3), 4)

    return f"{'#' * level} {heading}"


def _normalize_page(markdown: str) -> str:
    markdown = markdown.replace("\r\n", "\n").replace("\r", "\n")
    markdown = re.sub(
        r"^#\s+(?:<mark>)?Series Rules, v4\.3(?:</mark>)?\s*$",
        "",
        markdown,
        flags=re.MULTILINE,
    )
    markdown = re.sub(
        r"^©2018\. Multi-Man Publishing, Inc\. All Rights Reserved\.\s*$",
        "",
        markdown,
        flags=re.MULTILINE,
    )
    markdown = markdown.replace("v4.3 Special Tanks:h", "v4.3 Special Thanks:")
    markdown = markdown.replace("Gamespecific", "Game-specific")
    markdown = markdown.replace("AttackCapable", "Attack-Capable")
    markdown = markdown.replace("multi -step", "multi-step")
    markdown = markdown.replace("Modifers to Air Combat.i", "Modifiers to Air Combat.")
    markdown = markdown.replace("Inedpendent", "Independent")
    markdown = markdown.replace("Modifiy", "Modify")
    markdown = re.sub(r"</?(?:mark|u)>", "", markdown)

    lines = [_normalize_heading(line.rstrip()) for line in markdown.splitlines()]
    markdown = "\n".join(lines)
    markdown = re.sub(r"^#{1,6}\s+~~1~~\s*$", "", markdown, flags=re.MULTILINE)
    markdown = re.sub(r"[ \t]+\n", "\n", markdown)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip()


def _rewrite_image_links(markdown: str, asset_directory: Path) -> str:
    relative_directory = asset_directory.as_posix()

    def replace(match: re.Match[str]) -> str:
        page_match = re.search(r"-(\d{4})-", match.group(3))
        alt_text = "OCS rulebook figure"
        if page_match:
            alt_text = f"OCS rulebook figure from PDF page {int(page_match.group(1))}"
        return (
            f"![{alt_text}]({relative_directory}/{match.group(3)}"
            f"{match.group(4)}"
        )

    return IMAGE_LINK_RE.sub(replace, markdown)


def convert(pdf_path: Path, output_path: Path, asset_path: Path) -> None:
    if not pdf_path.is_file():
        raise SystemExit(f"PDF not found: {pdf_path}")
    with pdf_path.open("rb") as pdf_file:
        signature = pdf_file.read(5)
    if signature != b"%PDF-":
        raise SystemExit(f"Input is not a PDF: {pdf_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.mkdir(parents=True, exist_ok=True)
    for generated_asset in asset_path.glob(f"{pdf_path.name}-*.png"):
        generated_asset.unlink()

    chunks = pymupdf4llm.to_markdown(
        str(pdf_path),
        page_chunks=True,
        header=False,
        footer=False,
        write_images=True,
        image_path=str(asset_path),
        image_format="png",
        dpi=144,
        show_progress=True,
    )
    if not chunks:
        raise SystemExit("The converter returned no pages.")

    asset_link = Path("assets") / asset_path.name
    pages: list[str] = []
    for expected_page, chunk in enumerate(chunks, start=1):
        actual_page = chunk["metadata"].get("page_number")
        if actual_page != expected_page:
            raise SystemExit(
                f"Unexpected page order: expected {expected_page}, got {actual_page}"
            )
        page_text = _normalize_page(chunk["text"])
        page_text = _rewrite_image_links(page_text, asset_link)
        if expected_page == 55:
            page_text = f"## Summaries\n\n{page_text}"
        pages.append(f"<!-- PDF page {expected_page} -->\n\n{page_text}")

    preamble = f"""# Operational Combat Series Rules v4.3

> Source: [OCS Series Rules v4.3 (PDF)]({OFFICIAL_SOURCE_URL})
>
> Author: Dean N. Essig
>
> Publisher: Multi-Man Publishing, Inc.
>
> Published: 2018
>
> Conversion note: This is an unofficial, layout-aware transcription for engine
> development. PDF page boundaries are preserved as HTML comments. If this text
> differs from the published rulebook, use the PDF as the authority.
"""
    output = f"{preamble.rstrip()}\n\n" + "\n\n".join(pages) + "\n"
    output_path.write_text(output, encoding="utf-8", newline="\n")

    if len(pages) != 56:
        raise SystemExit(f"Expected 56 pages, converted {len(pages)}")

    print(f"Converted {len(pages)} pages to {output_path}")
    print(f"Extracted {len(list(asset_path.glob('*.png')))} images to {asset_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Path to OCS_Rulesv4.3.pdf")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("docs/rules/ocs-series-rules-v4.3.md"),
        help="Markdown output path",
    )
    parser.add_argument(
        "--assets",
        type=Path,
        default=Path("docs/rules/assets/ocs-series-rules-v4.3"),
        help="Directory for extracted images",
    )
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    convert(arguments.pdf, arguments.output, arguments.assets)
