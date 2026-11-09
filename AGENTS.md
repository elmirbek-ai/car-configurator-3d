# Project reporting rules

These rules apply to every task in this project.

1. After completing each task, write a detailed report in Kyrgyz in `codex-reports/latest.md`.
2. Always replace the contents of `codex-reports/latest.md` with the newest report.
3. Before replacing an existing `latest.md`, archive its complete previous contents as a Markdown file in `codex-reports/history/`. Use a unique timestamped filename in the form `YYYYMMDD-HHMMSS-ffffff.md` (local time); if that name already exists, add a numeric suffix. Verify the archive was written before replacing `latest.md`.
4. Every report must include: task description, actions performed, files inspected, files modified, errors discovered, tests executed and their actual results, remaining issues, and recommended next steps. State explicitly when a category has no items.
5. Include relevant file paths and line numbers where applicable.
6. Never claim a test passed unless it was actually executed. State when a test was not run and why.
7. Never delete or overwrite historical reports.
8. Never include passwords, API keys, tokens, or other secrets in reports.
9. Do not modify application source code unless the task explicitly requires it.
10. Keep `latest.md` and all files in `codex-reports/history/` in Markdown format.
