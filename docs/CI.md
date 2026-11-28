# CI dan perlindungan branch

Workflow: `.github/workflows/ci.yml` (berjalan di setiap push ke `main`, setiap PR, dan manual).

| Job | Nama status | Isi | Memblokir? |
|---|---|---|---|
| `build` | `build-consistency` | `python3 build/build.py --check` (bangun ulang di salinan sementara dan bandingkan `index.html`, `sw.js`, `tools/*.html`), lalu dua kali build + `git diff --exit-code` | Ya |
| `bot` | `bot-tests (node 20)`, `bot-tests (node 22)` | `npm ci && npm test` di `bot/` dengan ffmpeg dan berkas sampel | Ya |
| `ui` | `ui-tests (chromium)` | `tests/ui_smoke.py`, `pwa_update.py`, `panel_e2e.py`, `a11y.py` | Ya |
| `ui` | `ui-tests (firefox)`, `ui-tests (webkit)` | Rangkaian yang sama di Firefox dan WebKit (mesin Safari) | **Belum** (`continue-on-error`) sampai terbukti stabil di CI |
| `gate` | `ci-gate` | Gagal bila `build`, `bot`, atau `ui` gagal | Ya — **satu-satunya status yang perlu dijadikan required** |

## Agar PR tidak bisa digabung bila build/tes gagal
Workflow saja tidak bisa melarang merge; itu pengaturan repositori. Lakukan **setelah CI berjalan sekali** (status baru muncul di daftar setelah pernah dijalankan):

1. GitHub → **Settings → Rules → Rulesets → New branch ruleset** (atau *Branches → Add branch protection rule*) untuk `main`.
2. Aktifkan: *Require a pull request before merging*, *Require status checks to pass* → tambahkan **`ci-gate`**, *Block force pushes*.
3. (Opsional) Tambahkan juga `build-consistency` agar lebih jelas di UI.

Setara dengan API (ganti `OWNER/REPO`; butuh token dengan izin admin — jangan menempelkannya di chat/commit):

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["ci-gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false
}
JSON
```

## Menjalankan seperti CI secara lokal
```bash
python3 build/build.py --check
(cd bot && npm ci && npm test)                       # TEST_IMG/TEST_VID opsional untuk tes media
pip install -r tests/requirements.txt && python3 -m playwright install chromium
(cd tests && npm ci)                                 # axe-core
for t in ui_smoke pwa_update panel_e2e a11y; do python3 tests/$t.py --browser chromium; done
```
Tes tidak mengirim pesan WhatsApp dan tidak menyambung ke WhatsApp: `tests/bot_server.js` hanya menyalakan server HTTP bot dan mengganti proses pairing dengan stub.
