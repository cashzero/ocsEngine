# OCS rules reference

This directory contains development references transcribed from the published
Operational Combat Series rules. The source rulebook remains authoritative.

## Series Rules v4.3

- Markdown: [ocs-series-rules-v4.3.md](ocs-series-rules-v4.3.md)
- Official source: [OCS Series Rules v4.3 PDF][ocs-v43-pdf]
- Version: 4.3 (2018)
- Author: Dean N. Essig
- Publisher: Multi-Man Publishing, Inc.
- Converted input SHA-256:
  `9B05A8AC39A6AC56A2215A41AE97C43E2D9639AB1E7093DB0236F2E2549A9515`

The Markdown preserves each PDF page boundary as an HTML comment such as
`<!-- PDF page 14 -->`. Extracted figures are stored under
`assets/ocs-series-rules-v4.3/`.

## Charts and tables

Every chart and table image of the Beyond the Rhine VASSAL module 1.27.0 is transcribed as text, whether or not the
engine applies it, so the images need not be opened again:

- [ocs-4.3-charts-full.md](ocs-4.3-charts-full.md): OCS v4.3 Charts and Tables, pages 1-4.
- [btr-charts-full.md](btr-charts-full.md): Beyond the Rhine game charts (TEC, weather, supply, replacements,
  rebuilds, shipping, Rhine bridges, terrain key).
- [ocs-4.3-charts.md](ocs-4.3-charts.md): how the engine uses the series charts, generated-game choices and
  cross-checks; [btr-movement-tec.md](btr-movement-tec.md): the movement TEC from the Japanese edition.

## Regenerating the transcription

Install the isolated conversion dependency and pass a local copy of the PDF to
the converter:

```powershell
python -m pip install -r scripts/requirements-rules.txt
python scripts/convert_ocs_rules.py C:\path\to\OCS_Rulesv4.3.pdf
```

The conversion is layout-aware because the PDF uses multi-column pages. Review
the generated headings, lists, figures, and page transitions before treating a
regenerated file as ready for engine work.

[ocs-v43-pdf]: https://mmpgamers.com/support/gamersarchive/ocs/OCS_Rulesv4.3.pdf
