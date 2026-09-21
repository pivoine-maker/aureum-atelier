# Multi-format Codex Attachments

## Objective

Aureum Atelier must let users attach common office documents, text files, images, and videos to Codex Chat. Codex app-server does not expose a generic binary-file or video `UserInput`, so AA must convert every selected file into the native input types Codex supports: `text` and `localImage`.

## Supported formats

- Spreadsheets: `.xlsx`, `.xls`, `.csv`, `.tsv`.
- Documents: `.docx`, `.doc`, `.rtf`.
- PDF: `.pdf` with extractable text.
- Text and code: `.txt`, `.md`, `.mdx`, `.json`, `.jsonl`, `.xml`, `.html`, `.css`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.py`, `.rs`, `.sh`, `.toml`, `.yaml`, `.yml`, `.sql`, `.log`, and other valid UTF-8 text selected through the all-files filter.
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.heic`, `.heif`.
- Videos: `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.m4v`.
- Archives, executables, encrypted documents, and unknown binary formats remain unsupported.

## Conversion architecture

The main process owns file validation and conversion. The renderer receives only a serializable attachment manifest and never parses arbitrary binary files.

- Text and code files are decoded as UTF-8 and become one `text` attachment.
- CSV and TSV files are parsed as spreadsheets so row and column structure is preserved.
- XLSX and XLS files are parsed with a bundled spreadsheet library. Each non-empty worksheet becomes labeled tabular text containing sheet name, cell values, and formulas when present.
- DOCX files are parsed with a bundled document library and converted to readable Markdown-like text. DOC and RTF use macOS `textutil` as the compatibility path.
- PDFs are parsed with a bundled PDF text extractor. Page boundaries are labeled. A PDF with no useful text returns an explicit scanned-PDF/OCR-not-supported error.
- Existing native image formats are passed as `localImage`. HEIC, HEIF, TIFF, and animated GIF inputs are normalized to cached PNG files when Codex cannot reliably consume the original.
- Videos are processed with an FFmpeg binary bundled inside the application. Scene-change detection extracts representative frames; if it yields too few frames, uniform sampling fills the remaining positions. AA sends no video audio.

## Attachment model

`CodexAttachment` expands from a single-file shape into a manifest that can describe converted outputs:

- `path`: original user-selected path.
- `kind`: `text`, `image`, or `video`.
- `language`: syntax or content label for text rendering.
- `content`: extracted text for document-like inputs.
- `mediaPaths`: cached image paths generated from an image conversion or video frame extraction.
- `displayName`: original file name shown in the composer.
- `format`: normalized source format such as `xlsx`, `pdf`, or `mp4`.
- `metadata`: optional worksheet count, page count, frame timestamps, or conversion notes.

Text documents map to independent Codex `text` items. Images map to one `localImage`. Videos map to a short `text` item describing the source and frame timestamps followed by multiple `localImage` items.

## Video keyframes

- Maximum input size: 500 MB.
- Maximum extracted frames: 12.
- Scene threshold defaults to a conservative value that avoids near-duplicate frames.
- Uniform fallback samples across the complete duration.
- Frame names include the timestamp and are stored as PNG or JPEG in the attachment cache.
- Selecting the same unchanged video reuses cached frames.
- Audio is not extracted or submitted.

## Limits and failure behavior

- Text/code: 10 MB.
- Office documents and PDFs: 50 MB.
- Images: 25 MB each.
- Videos: 500 MB.
- Extracted text is capped before IPC transfer and Codex submission. If a document exceeds the cap, AA includes an explicit truncation notice rather than silently omitting content.
- Password-protected, corrupt, unsupported, or empty-extraction files produce a file-specific error.
- Multi-selection processes files independently. Successful attachments remain attached even when another selected file fails; the UI reports each failed file instead of rejecting the entire selection.

## Cache and lifecycle

- Converted images and video frames live under Electron `userData/codex-attachments`.
- Cache keys use original absolute path, file size, modification time, and conversion version.
- Cache entries are reused while the source signature matches.
- Old cache entries are cleaned opportunistically by age and total size.
- The original files are never modified.

## Packaging

- Spreadsheet, DOCX, and PDF parsers are regular production dependencies included in `app.asar`.
- FFmpeg is packaged as an application resource and resolved through `process.resourcesPath` in production.
- Development may fall back to a discovered local FFmpeg binary, but the distributed app must not depend on Homebrew or another user-installed command.
- `textutil` is acceptable only for legacy DOC and RTF because it is provided by macOS.

## User interface

- The file picker exposes grouped filters for Documents, Spreadsheets, Images, Videos, Text and Code, and All Files.
- Attachment chips retain the source file name and show a compact type indicator.
- Converted videos remain one removable attachment chip even though they submit several frames.
- Conversion may show a short processing state before the chip appears.
- Errors state the affected file and reason, including size limits, encryption, unsupported OCR, or missing conversion capability.

## Verification

- Unit tests cover format classification, size checks, text extraction, spreadsheet structure, document extraction, PDF page labeling, image normalization, video frame mapping, caching, and partial multi-file failures.
- App-server payload tests verify documents become `text`, images become `localImage`, and videos become timestamped text plus ordered frame images.
- Packaging verification confirms the distributed app contains the parser dependencies, bundled FFmpeg resource, and conversion code.
