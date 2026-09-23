"""
Builds the card faces from the new artwork in "Component 5".

The folder holds A and 2 to 10. J, Q and K keep their painted illustrations and
this script leaves them alone.

One thing is added to the supplied art: a small suit glyph under the corner
rank. The fanned hand on a phone shows only the left edge of a card, and the
supplied faces carry the suit in the middle only, so K of spades and K of clubs
would look the same there.
"""
from PIL import Image
import pathlib

SRC = pathlib.Path("Component 5")
OUT = pathlib.Path("public/cards")
SUITS = {"Clubs": "clubs", "Diamonds": "diamonds", "Hearts": "hearts", "Spades": "spades"}
NUMBERS = {"Ace": "A", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "10": "10"}

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
    pip = corner_pip(Image.open(SRC / folder / "Ace.png").convert("RGBA"))

    for source, rank in NUMBERS.items():
        card = Image.open(SRC / folder / f"{source}.png").convert("RGBA")
        card.alpha_composite(pip, PIP_AT)
        card.save(OUT / f"{suit}-{rank}.png")
        made += 1

print(f"wrote {made} faces")
