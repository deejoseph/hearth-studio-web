# Dev Log

## 2026-03-16
- Premiere: renamed main sequence to `28号订单故事_主序列` for the Order #28 project.
- Subtitles: generated `28号订单故事/28.srt` from `28号订单故事/28.mp3` and confirmed import workflow in Premiere.
- Note: auto-generated subtitles were not accurate enough; plan to use a different method next time.

## 2026-03-15
- Admin order page: AI provider settings (Qwen/Gemini/Zhipu) with encrypted keys, model inputs, and polish prompts; added polling refresh and UI improvements (messages panel, reply tools, image carousel, payment badges, and preview images).
- Client order detail: unified API wrapper usage, polling refresh logic, and safer FormData handling.
- Frontend routing: added cover page at `/` and moved main homepage to `/home`.
- Cover page: restored original hero + split sections + gallery layout, slow auto-scroll to CTA, and “Enter Hearth Studio” button.
- Home page: new hero background (`/hearth-studio.jpg`), simplified hero layout, and added “Order Stories” card grid placeholders.
- Global styling: unified typography (Inter + Cormorant Garamond) and button style (rectangular, hover contrast) across site.
 - Image generation: tested Leonardo AI prompt for bisque-stage celadon plate with tulip linework; successful “safe” prompt produced realistic result.
 - Pending: generate final YouTube script file + image prompts for Order Story 01 after confirming best prompt; add YouTube link to Order #28 story card.

## Next Steps (TODO)
- Confirm preferred Leonardo prompt variant for “tulip incised bisque plate” (avoid glossy glaze, avoid lotus).
- Generate and save final story pack files in `Story/` (script + prompts).
- Wire YouTube URL into Order #28 story card when available.

## 2026-03-21

### Overview
Completed homepage UI/UX fixes and Story page video integration.

### Key Changes

#### 1. Homepage (Home.jsx)
- Fixed Hero button visibility issue.
- Improved contrast for primary and secondary CTAs.
- Adjusted button styles for better UX.
- Ensured buttons are above overlay (`z-index` fix).
- Updated CTA logic:
  - `Watch Order Stories` -> `/story`
  - `Explore Collection` -> `/collection`
  - Bottom CTA -> `/customize`

#### 2. Story Page (Cover.jsx)
- Implemented dual CTA structure:
  - `Watch Full Story` -> YouTube long-form video
  - `Watch Moments` -> YouTube Shorts playlist
- Added real content:

Order #28:
- Image: `/pet-portrait.jpg`
- Full Story: [https://www.youtube.com/watch?v=_voqLeXDNTg](https://www.youtube.com/watch?v=_voqLeXDNTg)
- Moments: [https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QuCAiGmDGZWvBLyTIDlg3D](https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QuCAiGmDGZWvBLyTIDlg3D)

Order #38:
- Image: `/wedding-gift.jpg`
- Full Story: [https://www.youtube.com/watch?v=GCXAOyTNrQk](https://www.youtube.com/watch?v=GCXAOyTNrQk)
- Moments: [https://www.youtube.com/playlist?list=PL8Eui6FZ9u0TuHRrBNjWRH1E_I6aSxH72](https://www.youtube.com/playlist?list=PL8Eui6FZ9u0TuHRrBNjWRH1E_I6aSxH72)

#### 3. SEO Improvements
- Added homepage H1.
- Updated meta title and description.
- Added canonical URL.
- Redirected `/home` -> `/`.

#### 4. Architecture Decisions
- Home = brand + emotional entry.
- Story = conversion (real cases).
- Collection = product browsing.
- Customize = conversion action.

#### 5. Current Status
- Core frontend structure stabilized.
- Story-driven marketing flow established.
- Ready to focus on content (YouTube videos + Shorts).

#### 6. Next Steps
- Produce and publish more Story videos.
- Improve Story page SEO (future).
- Consider individual story landing pages.
