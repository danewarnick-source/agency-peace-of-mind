Remove the literal `\u2190` and `\u2192` text from button labels in `src/components/training/hive-training-engine.tsx`. These were intended as arrow characters but are being rendered as raw escape text.

Changes (button labels only):
- `Continue \u2192` → `Continue`
- `\u2190 All topics` → `All topics`
- `Begin \u2192` → `Begin`
- `\u2190 Back` → `Back`

Scope: only the training engine button labels. No other files, logic, or content touched.