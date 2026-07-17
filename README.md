# RevoMail frontend demo

Interactive frontend prototype based on slides 8–14 of `Week10_Sign-off_Presentation slides.pptx`.

## Run locally

```powershell
npm install
npm run dev
```

The terminal prints the local URL. Any OAuth provider enters the demo inbox; no real account is connected.

## Production preview

```powershell
Copy-Item .env.example .env
npm run build
npm run start
```

Set `HOST` and `PORT` in `.env` when needed.

## Included interactions

- OAuth-style demo login
- Searchable and filterable inbox
- Email reading with AI summary and extracted information
- Editable/regeneratable AI reply drafts
- Voice-command simulation
- Task and calendar extraction
- Light/dark settings and responsive mobile layout
