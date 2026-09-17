# Suvai — AR 3D Menu

Restaurant owners photograph a dish; customers scan a QR code and place a photoreal 3D
model of it on their table in AR (Android Chrome and iPhone Safari).

- **Owner dashboard** — `/` — add up to 6 dishes with Front (required) / Back / Left / Right
  photos. Each save kicks off 3D generation; the plate shows *Making 3D… → 3D ready*.
- **Customer menu** — `/menu/{restaurantId}` — the QR target. A `<model-viewer>` stage with
  *View on your table* (WebXR / Scene Viewer / Quick Look) and prev/next dish navigation.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · `@google/model-viewer` · Vercel Blob

## How 3D generation works

```
owner saves dish ──▶ POST /api/generate ──▶ 202 (status: queued)
                                  └─ after(): photos ──▶ provider ──▶ GLB
                                               normalize scale/origin ──▶ Blob ──▶ status: ready
dashboard polls GET /api/restaurant/{id} every 5 s while anything is generating
```

`src/lib/providers/` — pluggable generators, chosen by `MODEL_PROVIDER`:

| Provider | Cost | Notes |
| --- | --- | --- |
| `trellis` (default) | Free | Microsoft TRELLIS.2 Space on Hugging Face ZeroGPU (session pipeline: preprocess → image_to_3d → extract_glb). ~75 s GPU per dish, each step requests 120 s. Free HF token: 5 min/day ≈ 3 dishes; PRO 40 min/day. |
| `hunyuan` | Free | Tencent Hunyuan3D-2 (single photo) / 2mv (multi-view) Gradio Spaces on Hugging Face ZeroGPU. One dish ≈ 135 s of GPU. Quota per HF account: 5 min/day free (≈2 dishes), 40 min/day PRO ($9/mo, ≈17 dishes). A token is required — anonymous quota is smaller than one dish. Hunyuan3D-2.1 (PBR) needs 270 s/run and is PRO-only: `HUNYUAN_SPACES=tencent/Hunyuan3D-2.1,tencent/Hunyuan3D-2`. |
| `meshy` | Free tier (200 credits/mo ≈ 10 dishes), then paid | Set `MESHY_API_KEY`; PBR textures, multi-image support. |

Generated GLBs are rescaled to a 28 cm plate footprint with the base at y=0
(`src/lib/glb-transform.ts`) so they land on the table at true size.

## Environment variables

```
BLOB_READ_WRITE_TOKEN=   # Vercel Blob (auto-injected when the store is linked)
HF_TOKEN=hf_...          # Hugging Face token — https://huggingface.co/settings/tokens (read scope)
MODEL_PROVIDER=trellis   # or "hunyuan" / "meshy"
MESHY_API_KEY=           # only for MODEL_PROVIDER=meshy
HUNYUAN_SPACES=          # optional: comma-separated single-image Spaces to try, in order
HUNYUAN_MV_SPACES=       # optional: same for multi-view
TRELLIS_SPACE=           # optional: alternate TRELLIS.2 Space id (default microsoft/TRELLIS.2)
TRELLIS_DECIMATION=80000 # optional: triangle budget per dish (file size); TRELLIS_TEXTURE_SIZE=2048
```

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint && npx tsc --noEmit
```

Blob storage needs the token locally (`npx vercel env pull .env.local`).

## Data model

One JSON blob per restaurant (`suvai/restaurants/{id}.json`). Photos and models are
separate blobs referenced by URL, so the customer page fetches a few KB, not megabytes.
The server owns `menuItem.model`; owner saves are merged so an in-flight generation is
never clobbered, and changing photos invalidates the model.

## Known limits

- One hard-coded restaurant (`theobroma-001`); no auth on the owner API.
- Six dish slots.
