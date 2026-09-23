"""
Builds the card faces from the new artwork in "Component 5".

Two things are added to the supplied art:

* A small suit glyph under the corner rank. The fanned hand on a phone shows
  only the left edge of a card, and the supplied faces carry the suit in the
  middle only, so K of spades and K of clubs would look the same there.
* J, Q and K, which the folder does not contain. They are drawn from the suit's
  own Ace, keeping its centre pip and replacing only the corner rank, so they
  stay in the same style as the rest of the deck.
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

SRC = pathlib.Path("Component 5")
OUT = pathlib.Path("public/cards")
SUITS = {"Clubs": "clubs", "Diamonds": "diamonds", "Hearts": "hearts", "Spades": "spades"}
NUMBERS = {"Ace": "A", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "10": "10"}
COURT = ("J", "Q", "K")

BLACK = (33, 28, 29, 255)
RED = (188, 30, 36, 255)
FONT = ImageFont.truetype("C:/Windows/Fonts/GOTHIC.TTF", 62)  # Century Gothic, the face's own font
RANK_LEFT, BASELINE = 26, 66     # measured from the supplied cards
CLEAR_BOX = (18, 12, 96, 78)     # the corner rank, well clear of the centre pip
PIP_AT, PIP_H = (24, 70), 20     # the corner suit glyph, in the gap left of the centre pip


def ink_bbox(im, box, threshold=140):
    """Bounds of the drawn ink inside box, ignoring the card's pale border."""
    px = im.load()
    xs, ys = [], []
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r, g, b, a = px[x, y]
            if a > 200 and min(r, g, b) < threshold:
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def corner_pip(ace):
    """The centre pip, shrunk to sit under the rank."""
    pip = ace.crop(ink_bbox(ace, (16, 78, 203, 296)))
    return pip.resize((max(1, round(pip.width * PIP_H / pip.height)), PIP_H), Image.LANCZOS)


made = 0
for folder, suit in SUITS.items():
    ace = Image.open(SRC / folder / "Ace.png").convert("RGBA")
    pip = corner_pip(ace)
    colour = RED if suit in ("hearts", "diamonds") else BLACK

    for source, rank in NUMBERS.items():
        card = Image.open(SRC / folder / f"{source}.png").convert("RGBA")
        card.alpha_composite(pip, PIP_AT)
        card.save(OUT / f"{suit}-{rank}.png")
        made += 1

    for rank in COURT:
        card = ace.copy()
        draw = ImageDraw.Draw(card)
        draw.rectangle(CLEAR_BOX, fill=(255, 255, 255, 255))
        draw.text((RANK_LEFT, BASELINE), rank, font=FONT, fill=colour, anchor="ls")
        card.alpha_composite(pip, PIP_AT)
        card.save(OUT / f"{suit}-{rank}.png")
        made += 1

print(f"wrote {made} faces")
