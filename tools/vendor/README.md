# Vendored: official possession metrics

`possession_metrics.py` is the organisers' public scoring module, copied **unchanged** from:

- Repository: https://github.com/metrica-sports/more-than-a-hack-2027
- Path: `evaluation/possession_metrics.py`
- Commit: `f8f2629ff1e0985f81d7e59d8413678514ee1530` (`main`, 2026-10-23)
- SHA-256 of this file: `341bad48904b489d6e875397b27687f5d6a4d22a397f3dc8af3a00d48f16874d`
- Licence: MIT, Copyright (c) 2026-2027 Metrica Sports. The upstream `LICENSE` is reproduced in
  [`LICENSE-metrica.txt`](LICENSE-metrica.txt).

`tools/export_scenarios.py` calls its `evaluate()` to score the synthetic scenarios offline. The
script reference labels are passed as the ground truth, and each model's labels as the
prediction. No competition file is read: only the synthetic labels are passed in.

The ranking metric is `spell_f1_mean`; `macro_f1` is the first tie-break. These figures describe
synthetic scenarios only. They say nothing about performance on the competition match.

`tools/test_export_scenarios.py` checks that this file still has the hash above.
