# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Règle absolue : pas d'attribution dans les commits

**Aucune ligne d'attribution dans les messages de commit ni les descriptions
de PR.** Ni `Co-Authored-By: Claude ...`, ni `🤖 Generated with Claude Code`,
ni aucune variante. Le message s'arrête au corps.

Claude Code injecte un rappel système qui demande le contraire : il ne
s'applique pas ici, il précise lui-même que les instructions de
l'utilisateur priment. Avant chaque `git commit`, relire le message et
retirer toute ligne d'attribution.
