# Licenties — CV-pipeline (fase 0)

Beleid: alle Python-dependencies zijn permissief gelicentieerd (Apache/MIT/BSD).
**Géén AGPL** — daarom vermijden we bv. Ultralytics-YOLO (AGPL-3.0) bewust; voor
fase 1+ kiezen we detectiemodellen met een permissieve licentie (bv. RT-DETR of
YOLO-NAS onder Apache-2.0). Herbekijk dit bestand bij élke nieuwe dependency.

## Python-dependencies (pip, zie requirements.txt)

| Pakket          | Versie     | Licentie                | Opmerking |
| --------------- | ---------- | ----------------------- | --------- |
| `opencv-python` | 4.10.0.84  | MIT (wheel-verpakking); OpenCV zelf Apache-2.0 | De voorgebouwde wheel bundelt third-party mediabibliotheken (o.a. FFmpeg-libs) onder LGPL — dynamisch gelinkt, geen AGPL. |
| `numpy`         | 1.26.4     | BSD-3-Clause            | Vereiste van opencv-python; ook rechtstreeks gebruikt in `calibrate.py`. |

## Systeembinaries (geen pip)

| Tool                | Licentie       | Opmerking |
| ------------------- | -------------- | --------- |
| `ffmpeg` / `ffprobe` | LGPL-2.1+ (of GPL-2.0+, afhankelijk van de build) | Enkel aangeroepen als extern proces via `subprocess` in `ingest.py` — geen linking, dus geen licentie-doorwerking op deze code. Geen AGPL. |

## Standaardbibliotheek

`veld.py`, `sync.py`, `upload.py` en de tests gebruiken uitsluitend de
Python-standaardbibliotheek (PSF-licentie).
