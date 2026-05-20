# BookingWang

BookingWang is a theater-style seat reservation web app.

## Current MVP

- Click a seat to select it.
- Enter name, contact number, and memo.
- Reserved seats persist in the browser with localStorage.
- Admin view can export reservations, cancel a reservation, or clear all reservations.
- Built with React, TypeScript, and Vite.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

This project can be deployed as a static site to Vercel, Netlify, or GitHub Pages.

For real multi-device booking, replace localStorage with a backend such as Supabase or Firebase so reservations are shared across visitors and double-booking can be prevented server-side.

