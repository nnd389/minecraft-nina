#!/bin/sh
# Submission script.
# Collects three sources:
#   minecraft-starter/make-minecraft.py
#   minecraft-starter/src
#   ./README.md
# Into one file, ready for submission:
#   cs354h-s26-delta-minecraft.tgz
tar -czvf cs354h-s26-delta-minecraft.tgz minecraft-starter/make-minecraft.py minecraft-starter/src ./README.md
