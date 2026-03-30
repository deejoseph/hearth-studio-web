# Dev Log

## 2026-03-30

### SEO & Routing
- Confirmed `/home` returns single-step `301` to `/` and `/` returns `200`.
- Fixed `robots.txt` sitemap host to `https://www.ichessgeek.com/sitemap.xml`.
- Added `/story` into sitemap and completed Search Console recovery checklist.

### Homepage Onboarding
- Added a dismissible onboarding banner on Home page with admin contact:
  - `admin@ichessgeek.com`
  - construction notice, feedback invitation, and direct custom-request-by-email guidance.
- Banner now supports guest users and logged-in users with per-user dismissal key in localStorage.

### Registration & Optional Profile Fields
- Refactored Register page to use API layer (`src/api/authService`) instead of direct page-level `fetch`.
- Added optional registration fields:
  - `display_name`, `country`, `city`, `style_preference`, `budget_range`, `bio`, `avatar_url`
- Added avatar upload during registration via `upload_image.php` (`type=avatar`) and preview before submit.
- Improved auth styles for file input/textarea and fixed verification-code visibility (high-contrast input style).

### User Profile UX
- Added `/profile` route and new profile page.
- Header now shows avatar + display name and links to profile.
- Added profile edit flow:
  - edit profile fields
  - upload/change avatar
  - save to backend and sync local auth state immediately
- Added avatar click-to-zoom preview modal with close action.

### API Updates (hearth-api)
- `register.php`: now accepts optional profile fields (column-aware compatibility).
- `login.php`: now returns extended user profile payload (column-aware compatibility).
- `verify-email.php`: now returns extended user profile payload after verification.
- `upload_image.php`: added avatar upload mode (`type=avatar`) with independent validation and storage path.
- Added `update-profile.php` to persist profile edits and return refreshed user payload.
## 2026-03-16
- Premiere: renamed main sequence to `28鍙疯鍗曟晠浜媉涓诲簭鍒梎 for the Order #28 project.
- Subtitles: generated `28鍙疯鍗曟晠浜?28.srt` from `28鍙疯鍗曟晠浜?28.mp3` and confirmed import workflow in Premiere.
- Note: auto-generated subtitles were not accurate enough; plan to use a different method next time.

## 2026-03-15
- Admin order page: AI provider settings (Qwen/Gemini/Zhipu) with encrypted keys, model inputs, and polish prompts; added polling refresh and UI improvements (messages panel, reply tools, image carousel, payment badges, and preview images).
- Client order detail: unified API wrapper usage, polling refresh logic, and safer FormData handling.
- Frontend routing: added cover page at `/` and moved main homepage to `/home`.
- Cover page: restored original hero + split sections + gallery layout, slow auto-scroll to CTA, and 鈥淓nter Hearth Studio鈥?button.
- Home page: new hero background (`/hearth-studio.jpg`), simplified hero layout, and added 鈥淥rder Stories鈥?card grid placeholders.
- Global styling: unified typography (Inter + Cormorant Garamond) and button style (rectangular, hover contrast) across site.
 - Image generation: tested Leonardo AI prompt for bisque-stage celadon plate with tulip linework; successful 鈥渟afe鈥?prompt produced realistic result.
 - Pending: generate final YouTube script file + image prompts for Order Story 01 after confirming best prompt; add YouTube link to Order #28 story card.

## Next Steps (TODO)
- Confirm preferred Leonardo prompt variant for 鈥渢ulip incised bisque plate鈥?(avoid glossy glaze, avoid lotus).
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

---

### 2026-03-26 Story Content Update

#### Story Page (Cover.jsx)
- Replaced the previous `Order #36` story card with `Order #45`.
- Updated title to: `Order #45 鈥?A Light That Understands`.
- Updated description to:
  `A thoughtful ceramic lamp designed for a father who refuses to compromise on elegance鈥攁nd a daughter who refuses to give up on him.`
- Updated image to: `/lamp.jpg` (from `public/lamp.jpg`).
- Updated `Watch Full Story`:
  [https://youtu.be/LAs87W0PyYY](https://youtu.be/LAs87W0PyYY)
- Updated `Watch Moments`:
  [https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QP0PpTB-ndY2ETN-dGJ2k6](https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QP0PpTB-ndY2ETN-dGJ2k6)

---

### 2026-03-27 Frontend Update

#### Order Detail Share MVP
- Enabled `Share` button on Order Detail page.
- Added Web Share API flow (mobile/system share sheet).
- Added fallback for unsupported environments:
  - copy share URL to clipboard
  - manual prompt fallback when clipboard API is unavailable
- Added sharing loading state (`Sharing...`) and error handling.
- Share button is enabled only for share-allowed orders.

#### Customize Visibility Rules
- Updated Customize page to use API-driven visibility (`can_view`) instead of local `is_public` hard-blocking.
- Behavior now matches product rule:
  - all orders are visible as cards
  - private orders from other users are visible but not openable
  - current user's own private orders are visible and openable

#### Encoding Fix
- Fixed garbled symbols in Customize page:
  - date separator now uses `&rarr;`
  - private badge now uses `&#128274; Private`

