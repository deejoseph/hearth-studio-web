# Module Index

This file is a fast map of the project for AI agents. Keep it short and current.

## Core Domains
- Orders: order creation, status changes, fulfillment.
- Products: catalog and customization options.
- Users: customer/admin accounts and permissions.
- Uploads: asset upload for custom designs.

## Entry Points
- Frontend app entry: `src/`
- API layer: `src/api/` with unified fetch wrapper in `client.js`

## Data Flow Summary
- UI components/pages call `src/api/*` modules.
- `src/api/*` modules call `src/api/client.js` only.
- API responses include a `meta` field and must be preserved.

## Admin
- Admin system lives under `/hearth_admin` on the main deployment.

## Notes
- Keep this file updated when modules or entry points change.
