# Noctra browser smoke fixtures

These three files are deterministic synthetic documents created by
`scripts/create-qa-fixtures.mjs`. They contain no real user data:

- `noctra-qa.pdf`
- `noctra-qa.docx`
- `noctra-qa.pptx`

## Manual browser smoke test

1. Open `http://localhost:3000/`.
2. Resume the Google sign-in popup and complete sign-in with an authorized test
   account.
3. Confirm the app lands on `/dashboard`.
4. Upload `noctra-qa.pdf` from this directory. Confirm progress reaches 100%,
   download the result, and open it in a PDF viewer. Confirm the text remains
   selectable and the page is readable in dark mode.
5. Repeat with `noctra-qa.docx`. Confirm the downloaded file opens as an
   editable Word document and the text remains editable.
6. Repeat with `noctra-qa.pptx`. Confirm the downloaded file opens as an
   editable presentation and the slide text remains editable.
7. In the dashboard history list, confirm each completed conversion belongs to
   the signed-in test account.

Structural ZIP/PDF checks prove package validity only; they do not prove that
Microsoft Word, PowerPoint, or another Office-compatible viewer renders every
converted element correctly.
