#!/usr/bin/env python3
"""Génère la collection d'avatars pixel art de Bootcade.

    python3 tools/make-avatars.py

Écrit un SVG par avatar dans avatars/, plus avatars/index.json que le site lit
pour construire le sélecteur.

POURQUOI UN GÉNÉRATEUR et pas quarante fichiers SVG écrits à la main : un
sprite dessiné en balises `<rect>` est illisible et impossible à corriger. Ici
chaque avatar tient en douze lignes de caractères, on voit le dessin dans le
code, et changer un pixel se relit dans un diff.

DES DESSINS ORIGINAUX, et c'est délibéré. Les héros qui viennent à l'esprit
quand on dit « rétro » (le plombier, le hérisson, le mangeur de pastilles)
sont des marques déposées de Nintendo, Sega ou Bandai Namco. Les distribuer
comme avatars sur un site public expose son auteur à une mise en demeure. Ces
motifs-ci évoquent la même époque sans appartenir à personne : du matériel
d'arcade, des objets de jeu, des créatures génériques.
"""

import json
import os

# Chaque avatar est pose sur une TUILE coloree aux coins arrondis, avec une
# bordure plus claire. C'est ce qui fait tenir la planche ensemble : sans
# elle, quarante sprites flottant sur du transparent n'ont plus l'air d'une
# collection mais d'un dossier d'icones depareillees.
TILES = {
    "joystick": "#1d4ed8", "cabinet": "#7c2d12", "cartridge": "#334155",
    "coin": "#78350f",     "ship":    "#0f172a", "alien":     "#14532d",
    "ghosty":  "#1e1b4b",  "robot":   "#0c4a6e", "skull":     "#7f1d1d",
    "heart":   "#831843",  "star":    "#1e3a8a", "sword":     "#3f2d1a",
    "shield":  "#1e293b",  "potion":  "#064e3b", "chest":     "#713f12",
    "bomb":    "#92400e",  "rocket":  "#0f172a", "ufo":       "#164e63",
    "planet":  "#2e1065",  "pad":     "#4c1d95", "crt":       "#111827",
    "floppy":  "#1e3a8a",  "cat":     "#831843", "frog":      "#14532d",
    "owl":     "#3f2d1a",  "fish":    "#0c4a6e", "dragon":    "#7f1d1d",
    "bat":     "#2e1065",  "knight":  "#1e3a8a", "wizard":    "#4c1d95",
    "ninja":   "#7f1d1d",  "pirate":  "#3f2d1a", "astronaut": "#0f172a",
    "dice":    "#334155",  "trophy":  "#7f1d1d", "bolt":      "#1e3a8a",
    "flame":   "#7c2d12",  "gem":     "#0c4a6e", "key":       "#78350f",
    "mushroom": "#14532d", "barrel":  "#3f2d1a", "tank":      "#14532d",
    "crown":   "#4c1d95",
}
TILE_DEFAULT = "#1b222e"

SIZE = 12          # grille 12x12 : assez pour être reconnaissable, assez peu
                   # pour rester lisible dans ce fichier
CELL = 8           # pixels par case dans le SVG rendu -> 96x96

# Palette partagée. Une lettre par couleur, '.' pour le vide.
PALETTE = {
    "k": "#0b0f14",  # noir
    "w": "#f8fafc",  # blanc
    "g": "#a1a7b3",  # gris
    "G": "#5b6675",  # gris foncé
    "r": "#f85149",  # rouge
    "R": "#a8231d",  # rouge foncé
    "o": "#f0913a",  # orange
    "y": "#f5d24a",  # jaune
    "n": "#41d08a",  # vert
    "N": "#1f7d55",  # vert foncé
    "b": "#2563eb",  # bleu
    "B": "#16367a",  # bleu foncé
    "c": "#4fd0e0",  # cyan
    "v": "#7c3aed",  # violet
    "V": "#4b1e9e",  # violet foncé
    "p": "#f57ab6",  # rose
    "s": "#d8a373",  # sable / peau
    "S": "#8a5a33",  # brun
}

# ── Les motifs ────────────────────────────────────────────────────────────
# Chaque avatar : (identifiant, nom affiché, 12 lignes de 12 caractères).
AVATARS = [
    ("joystick", "Joystick", [
        "............", ".....rr.....", ".....rr.....", ".....rr.....",
        "....GGGG....", "..GGGGGGGG..", ".GGGGGGGGGG.", ".GkGGGGGGkG.",
        ".GGGGGGGGGG.", "..GGGGGGGG..", "...GGGGGG...", "............"]),
    ("cabinet", "Arcade cabinet", [
        "..vvvvvvvv..", ".vVVVVVVVVv.", ".vVccccccVv.", ".vVcbbbbcVv.",
        ".vVcbwwbcVv.", ".vVccccccVv.", ".vVVVVVVVVv.", ".vVyVVVVyVv.",
        ".vVVVVVVVVv.", ".vVVVVVVVVv.", ".vvvvvvvvvv.", "..kk....kk.."]),
    ("cartridge", "Cartridge", [
        "............", ".GGGGGGGGGG.", ".GwwwwwwwwG.", ".GwkkkkkkwG.",
        ".GwkyyyykwG.", ".GwkkkkkkwG.", ".GwwwwwwwwG.", ".GGGGGGGGGG.",
        ".GkGkGkGkGG.", ".GkGkGkGkGG.", ".GGGGGGGGGG.", "............"]),
    ("coin", "Coin", [
        "....yyyy....", "..yyoooyyy..", ".yoooooooooy", "yooyyyyyyooy",
        "yooyooooyooy", "yooyooooyooy", "yooyooooyooy", "yooyyyyyyooy",
        ".yoooooooooy", "..yyoooyyy..", "....yyyy....", "............"]),
    ("ship", "Starship", [
        ".....ww.....", "....wccw....", "....wccw....", "...wwccww...",
        "..wwccccww..", "..wccccccw..", ".wwccccccww.", ".wbbccccbbw.",
        "..w.bbbb.w..", "....roro....", ".....rr.....", "............"]),
    ("alien", "Invader", [
        "............", "..n......n..", "...n....n...", "..nnnnnnnn..",
        ".nnkknnkknn.", "nnnnnnnnnnnn", "n.nnnnnnnn.n", "n.n......n.n",
        "...nn..nn...", "............", "............", "............"]),
    ("ghosty", "Spook", [
        "....cccc....", "..cccccccc..", ".cccccccccc.", ".cckwcckwcc.",
        ".cckwcckwcc.", ".cccccccccc.", ".cccccccccc.", ".cccccccccc.",
        ".cccccccccc.", ".cc.cc.cc.c.", ".c...c...c..", "............"]),
    ("robot", "Robot", [
        ".....y......", ".....y......", "..gggggggg..", ".gGGGGGGGGg.",
        ".gGcGGGGcGg.", ".gGGGGGGGGg.", ".gGGkkkkGGg.", ".gGGGGGGGGg.",
        "..gggggggg..", "...g....g...", "..gg....gg..", "............"]),
    ("skull", "Skull", [
        "............", "...wwwwww...", "..wwwwwwww..", ".wwwwwwwwww.",
        ".wwkkwwkkww.", ".wwkkwwkkww.", ".wwwwwwwwww.", "..wwwkkwww..",
        "...wwwwww...", "...w.ww.w...", "............", "............"]),
    ("heart", "Heart", [
        "............", "..rr....rr..", ".rrrr..rrrr.", "rrrrrrrrrrrr",
        "rrrrrrrrrrrr", "rrrrrrrrrrrr", ".rrrrrrrrrr.", "..rrrrrrrr..",
        "...rrrrrr...", "....rrrr....", ".....rr.....", "............"]),
    ("star", "Star", [
        ".....yy.....", ".....yy.....", "....yyyy....", "yyyyyyyyyyyy",
        ".yyyyyyyyyy.", "..yyyyyyyy..", "...yyyyyy...", "..yyyyyyyy..",
        "..yy....yy..", ".yy......yy.", "............", "............"]),
    ("sword", "Sword", [
        ".......ww...", "......wwgw..", ".....wwgw...", "....wwgw....",
        "...wwgw.....", "..wwgw......", ".SSSSSS.....", "..SwwS......",
        ".SSSSSS.....", "..SS........", ".SS.........", "............"]),
    ("shield", "Shield", [
        "............", ".bbbbbbbbbb.", ".bBBBBBBBBb.", ".bByyyyyyBb.",
        ".bByBBBByBb.", ".bByyyyyyBb.", ".bBBBBBBBBb.", "..bBBBBBBb..",
        "...bBBBBb...", "....bBBb....", ".....bb.....", "............"]),
    ("potion", "Potion", [
        ".....SS.....", ".....SS.....", "....wwww....", "...wwwwww...",
        "..wwwwwwww..", "..wwnnnnww..", "..wnnnnnnw..", "..wnnnnnnw..",
        "..wnnnnnnw..", "...wnnnnw...", "....wwww....", "............"]),
    ("chest", "Treasure", [
        "............", "..SSSSSSSS..", ".SyyyyyyyyS.", ".SSSSSSSSSS.",
        ".SyyyyyyyyS.", ".SSSyyyySSS.", ".SySkkkkySS.", ".SyyyyyyyyS.",
        ".SSSSSSSSSS.", "..SSSSSSSS..", "............", "............"]),
    ("bomb", "Bomb", [
        "..........y.", ".........y..", "........o...", "...kkkk.....",
        "..kkkkkk....", ".kkkkkkkk...", ".kkwkkkkk...", ".kkkkkkkk...",
        "..kkkkkk....", "...kkkk.....", "............", "............"]),
    ("rocket", "Rocket", [
        ".....ww.....", "....wwww....", "....wrrw....", "....wrrw....",
        "....wwww....", "...wwwwww...", "..ww.ww.ww..", ".ww..ww..ww.",
        ".....oo.....", "....oyyo....", ".....oo.....", "............"]),
    ("ufo", "Saucer", [
        "............", "....cccc....", "...cwwwwc...", "..cwwwwwwc..",
        ".gggggggggg.", "gyGyGyGyGyGg", ".gggggggggg.", "..c......c..",
        "...c....c...", "............", "............", "............"]),
    ("planet", "Planet", [
        "............", "....vvvv....", "..vvvvvvvv..", ".vvvVVvvvvv.",
        "yyyyyyyyyyyy", ".vvvvvvVVvv.", "..vvvvvvvv..", "....vvvv....",
        "............", "............", "............", "............"]),
    ("pad", "Gamepad", [
        "............", "............", ".GGGGGGGGGG.", "GGkGGGGGGrGG",
        "GkkkGGGGrrrG", "GGkGGGGGGrGG", ".GGGGGGGGGG.", "..G......G..",
        "............", "............", "............", "............"]),
    ("crt", "CRT", [
        "............", ".GGGGGGGGGG.", ".GkkkkkkkkG.", ".GknnnnnnkG.",
        ".GknkkkknkG.", ".GknnnnnnkG.", ".GkkkkkkkkG.", ".GGGGGGGGGG.",
        "...GG..GG...", "..GGGGGGGG..", "............", "............"]),
    ("floppy", "Floppy", [
        "............", ".bbbbbbbbbb.", ".bwwwwwwwwb.", ".bwkkkkkkwb.",
        ".bwwwwwwwwb.", ".bbbbbbbbbb.", ".bbwwwwwwbb.", ".bbwkkkkwbb.",
        ".bbwwwwwwbb.", ".bbbbbbbbbb.", "............", "............"]),
    ("cat", "Cat", [
        "..o......o..", ".oo......oo.", ".ooooooooooo", ".osoooooosoo",
        ".ookoooookoo", ".oooooooooo.", ".oowwwwwwoo.", ".oowkwwkwoo.",
        ".ooowwwwooo.", "..oooooooo..", "...oooooo...", "............"]),
    ("frog", "Frog", [
        "............", "..nn....nn..", ".nwwn..nwwn.", ".nwkn..nwkn.",
        ".nnnnnnnnnn.", "nnnnnnnnnnnn", "nnnnnnnnnnnn", "nnnkkkkkknnn",
        ".nnnnnnnnnn.", "..nn....nn..", ".nn......nn.", "............"]),
    ("owl", "Owl", [
        "...S....S...", "..SSS..SSS..", ".SSSSSSSSSS.", ".SwwSSSSwwS.",
        ".SwkSSSSwkS.", ".SSSSyySSSS.", ".SSSSyySSSS.", ".SsSSSSSSsS.",
        ".SsssSSsssS.", "..SSSSSSSS..", "...SS..SS...", "............"]),
    ("fish", "Fish", [
        "............", "............", "....cccc....", "..cccccccc..",
        ".ccccccccccc", "cckcccccccc.", ".ccccccccc.c", "..ccccccc.cc",
        "....cccc..c.", "............", "............", "............"]),
    ("dragon", "Dragon", [
        "............", "..N......N..", "..NN....NN..", "..NNNNNNNN..",
        ".NNrNNNNrNN.", ".NNNNNNNNNN.", ".NNNwwwwNNN.", "..NNNNNNNN..",
        "...NN..NN...", "..NN....NN..", "............", "............"]),
    ("bat", "Bat", [
        "............", "............", "V..VVVVVV..V", "VVVVVVVVVVVV",
        "VVVVrVVrVVVV", "VVVVVVVVVVVV", ".VVVVwwVVVV.", "..VVVVVVVV..",
        "...VV..VV...", "............", "............", "............"]),
    ("knight", "Knight", [
        "............", "....gggg....", "...gggggg...", "..gggggggg..",
        "..ggkggkgg..", "..gggggggg..", "...gg..gg...", "..bbbbbbbb..",
        ".bbbbbbbbbb.", ".bb.bbbb.bb.", "............", "............"]),
    ("wizard", "Wizard", [
        ".....v......", "....vvv.....", "...vvvvv....", "..vvvvvvv...",
        ".vvvvvvvvv..", "....ssss....", "...skssks...", "...ssssss...",
        "..vvvvvvvv..", ".vvvvvvvvvv.", "............", "............"]),
    ("ninja", "Ninja", [
        "............", "...kkkkkk...", "..kkkkkkkk..", "..kkkkkkkk..",
        "..kwkkkkwk..", "..kkkkkkkk..", "...kkkkkk...", "..RRRRRRRR..",
        "..kkkkkkkk..", "..kk....kk..", "............", "............"]),
    ("pirate", "Pirate", [
        "............", "..kkkkkkkk..", ".kkkkkkkkkk.", ".kkwwkkwwkk.",
        "..ssssssss..", "..skssskss..", "..ssssssss..", "...ssssss...",
        "..RRRRRRRR..", ".RRRRRRRRRR.", "............", "............"]),
    ("astronaut", "Astronaut", [
        "............", "...wwwwww...", "..wwwwwwww..", "..wkkkkkkw..",
        "..wkcccckw..", "..wkkkkkkw..", "..wwwwwwww..", "..wwwwwwww..",
        ".ww.wwww.ww.", ".ww......ww.", "............", "............"]),
    ("dice", "Dice", [
        "............", ".wwwwwwwwww.", ".wkwwwwwwkw.", ".wwwwwwwwww.",
        ".wwwwkwwwww.", ".wwwwwwwwww.", ".wkwwwwwwkw.", ".wwwwwwwwww.",
        ".wwwwwwwwww.", ".wwwwwwwwww.", "............", "............"]),
    ("trophy", "Trophy", [
        "............", ".yyyyyyyyyy.", "y.yyyyyyyy.y", "y.yyyyyyyy.y",
        "y..yyyyyy..y", "....yyyy....", ".....yy.....", "....oooo....",
        "...oooooo...", "..oooooooo..", "............", "............"]),
    ("bolt", "Bolt", [
        "......yyy...", ".....yyy....", "....yyy.....", "...yyyyyy...",
        "..yyyyyyy...", ".....yyy....", "....yyy.....", "...yyy......",
        "..yyy.......", "............", "............", "............"]),
    ("flame", "Flame", [
        ".....o......", "....oro.....", "...orro.....", "..orrrro....",
        ".orrrrrro...", ".orryyrro...", ".orryyrro...", ".orrrrrro...",
        "..orrrro....", "...oooo.....", "............", "............"]),
    ("gem", "Gem", [
        "............", "..cccccccc..", ".cwwccccwwc.", "cccccccccccc",
        ".cccccccccc.", "..cccccccc..", "...cccccc...", "....cccc....",
        ".....cc.....", "............", "............", "............"]),
    ("key", "Key", [
        "............", "...yyyy.....", "..yyooyy....", "..yo..oy....",
        "..yyooyy....", "...yyyy.....", "....yy......", "....yyyy....",
        "....yy......", "....yyy.....", "............", "............"]),
    ("mushroom", "Mushroom", [
        "............", "...rrrrrr...", "..rrwwwwrr..", ".rwwrrrrwwr.",
        ".rrrrrrrrrr.", ".rrwwrrwwrr.", "..ssssssss..", "..skssskss..",
        "..ssssssss..", "...ssssss...", "............", "............"]),
    ("barrel", "Barrel", [
        "............", "..SSSSSSSS..", ".SSSSSSSSSS.", ".SyySSSSyyS.",
        ".SSSSSSSSSS.", ".SSSSSSSSSS.", ".SyySSSSyyS.", ".SSSSSSSSSS.",
        ".SSSSSSSSSS.", "..SSSSSSSS..", "............", "............"]),
    ("tank", "Tank", [
        "............", "............", "....NNNN....", "...NNNNNN...",
        "...NNNNNNNNN", "..NNNNNNNN..", ".NNNNNNNNNN.", "kkkkkkkkkkkk",
        "kGkGkGkGkGkk", "kkkkkkkkkkkk", "............", "............"]),
    ("crown", "Crown", [
        "............", "y....y....y.", "yy..yyy..yy.", "yyy.yyy.yyy.",
        "yyyyyyyyyyy.", "yyyyyyyyyyy.", "yyoyyoyyoyy.", "yyyyyyyyyyy.",
        "............", "............", "............", "............"]),
]


def to_svg(rows, tile):
    """Un rect par suite horizontale de meme couleur, pas un par pixel : un
    sprite 12x12 tombe de 144 balises a une trentaine, et le fichier reste
    lisible si on l'ouvre."""
    parts = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            ch = row[x]
            run = 1
            while x + run < len(row) and row[x + run] == ch:
                run += 1
            if ch != "." and ch in PALETTE:
                parts.append(
                    '<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>'
                    % (x * CELL, y * CELL, run * CELL, CELL, PALETTE[ch]))
            x += run
    side = SIZE * CELL
    # La tuile d'abord, le sprite par-dessus. `shape-rendering` ne s'applique
    # qu'au sprite : force sur la tuile, elle en crenelerait les coins arrondis.
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">'
            '<rect width="%d" height="%d" rx="%d" fill="%s"/>'
            '<rect x="1.5" y="1.5" width="%d" height="%d" rx="%d" fill="none" '
            'stroke="rgba(255,255,255,.22)" stroke-width="3"/>'
            '<g shape-rendering="crispEdges">%s</g></svg>'
            % (side, side, side, side, side // 6, tile,
               side - 3, side - 3, side // 6, "".join(parts)))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "avatars")
    os.makedirs(out, exist_ok=True)

    index = []
    for key, name, rows in AVATARS:
        bad = [i for i, r in enumerate(rows) if len(r) != SIZE]
        if len(rows) != SIZE or bad:
            raise SystemExit("!! %s : grille invalide (lignes %s)" % (key, bad or len(rows)))
        with open(os.path.join(out, key + ".svg"), "w", encoding="utf-8") as f:
            f.write(to_svg(rows, TILES.get(key, TILE_DEFAULT)))
        index.append({"id": key, "name": name})

    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print("%d avatars ecrits dans %s" % (len(index), out))


if __name__ == "__main__":
    main()
