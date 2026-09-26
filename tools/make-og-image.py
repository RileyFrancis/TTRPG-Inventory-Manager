#!/usr/bin/env python3
"""Draws img/og-preview.jpg — the picture Discord, Slack and the like show
under a shared link (the `og:image` tag in index.html's <head>).

    python3 tools/make-og-image.py     # needs Pillow (pip install pillow)

1200x630 is the size every link-preview renderer is built around. The paper,
the d20 and the ink/accent colours are the app's own (img/, tokens.css light
palette), so the preview looks like the page it links to. Re-run after
changing any of them; the output is committed, not built on deploy.
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'img', 'og-preview.jpg')
W, H = 1200, 630

INK = (0x33, 0x28, 0x1a)      # --text, light palette
ACCENT = (0x8a, 0x5a, 0x1c)   # --accent, light palette

TITLE = 'BAG OF HOLDING'

# Cinzel is what the app asks for first but does not ship; these are the
# nearest serifs commonly installed, first found wins.
TITLE_FONTS = [
    '/usr/share/fonts/truetype/noto/NotoSerifDisplay-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
]


def font(candidates, size):
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit('No serif font found — edit TITLE_FONTS.')


def paper():
    src = Image.open(os.path.join(ROOT, 'img', 'paper-antique-seamless.jpg')).convert('RGB')
    scale = max(W / src.width, H / src.height)
    src = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
    left, top = (src.width - W) // 2, (src.height - H) // 2
    img = src.crop((left, top, left + W, top + H))

    # Darkened edges, so the sheet reads as a sheet rather than a flat fill.
    vignette = Image.new('L', (W, H), 0)
    ImageDraw.Draw(vignette).rectangle((70, 60, W - 70, H - 60), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(90))
    dark = Image.new('RGB', (W, H), (0x4a, 0x36, 0x1c))
    return Image.composite(img, dark, vignette)


def spaced(draw, text, fnt, tracking):
    """Width of `text` drawn with `tracking` px between letters."""
    return sum(draw.textlength(ch, font=fnt) for ch in text) + tracking * (len(text) - 1)


def draw_spaced(draw, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking


def tinted_icon(path, size, colour):
    """An icon PNG as a mask over one colour — the same trick icons.css uses."""
    mask = Image.open(path).convert('RGBA').split()[-1].resize((size, size), Image.LANCZOS)
    icon = Image.new('RGBA', (size, size), colour + (255,))
    icon.putalpha(mask)
    return icon


def main():
    img = paper().convert('RGBA')
    draw = ImageDraw.Draw(img)

    # The d20 and the title side by side as one lockup, centred on the card.
    # The title is sized down until the pair fits inside MAX_W, so a longer
    # TITLE still lands clear of the vignette.
    MAX_W, ICON, GAP, TRACKING = 1000, 150, 40, 8
    size = 92
    while True:
        title_font = font(TITLE_FONTS, size)
        tw = spaced(draw, TITLE, title_font, TRACKING)
        if ICON + GAP + tw <= MAX_W or size <= 40:
            break
        size -= 2
    left = (W - (ICON + GAP + tw)) / 2

    d20 = tinted_icon(os.path.join(ROOT, 'img', 'icon', 'd20.png'), ICON, ACCENT)
    img.alpha_composite(d20, (round(left), (H - ICON) // 2))

    # The capitals' ink plus the gold rule under them (the one the home screen
    # puts under its headings) are centred as a block on the middle of the die
    # — measured off the ink, not the font's line box.
    RULE_GAP = 22
    _, top, _, bottom = title_font.getbbox(TITLE)
    block = (bottom - top) + RULE_GAP
    tx, ty = left + ICON + GAP, H / 2 - block / 2 - top
    draw_spaced(draw, (tx, ty), TITLE, title_font, INK, TRACKING)

    rule_y = ty + bottom + RULE_GAP
    draw.line((tx, rule_y, tx + tw, rule_y), fill=ACCENT, width=3)

    img.convert('RGB').save(OUT, quality=88, optimize=True, progressive=True)
    print('Wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
