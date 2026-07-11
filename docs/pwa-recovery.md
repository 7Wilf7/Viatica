# PWA Stale-Shell Recovery

The Settings action labelled `清除缓存并重载` uses the same family-wide
refresh flow as Aevum, Ultreia, and Sidera: unregister service workers, delete
Cache Storage, then reload through a timestamped URL. It does not delete the
local `viatica:v1` ledger or account session.

## Problem

An installed PWA can keep an old HTML shell that references a hashed JavaScript
asset removed by a newer deployment. If the server rewrites that missing asset
request to `index.html`, the browser receives HTML where JavaScript is expected
and the app cannot start far enough to clear its cache.

## Current Strategy

- `public/sw.js` uses the `viatica-v8` cache. The v8 bump retires clients that
  still held the pre-static-logo splash shell.
- Navigation requests are network-first and fall back to the cached shell only
  when the network is unavailable or unsuccessful.
- Same-origin static assets remain cache-first.
- `vercel.json` excludes assets, icons, the service worker, the manifest, and
  file-like paths from the SPA rewrite.
- Two historical hashed paths in `public/assets/` are compatibility stubs. They
  import `viatica-pwa-rescue.js`, which unregisters service workers, clears
  origin caches, and reloads with a cache-busting query parameter.

The rescue clears Cache Storage and service-worker registrations. It does not
delete the `viatica:v1` localStorage ledger.

## File Ownership

These files are intentional source-controlled compatibility assets:

- `public/assets/index--xAdr15n.js`
- `public/assets/index-BLUcj4aL.js`
- `public/assets/viatica-pwa-rescue.js`

Do not replace them with current build output. Do not remove them as generated
clutter without first verifying that the old hashed URLs no longer need to
recover deployed clients.

`dist/` remains generated and must not be edited by hand.

## Verification

After changing the service worker, rewrites, or compatibility assets:

1. Run `npm run test`, `npm run lint`, and `npm run build`.
2. Confirm the compatibility asset URLs return JavaScript, not `index.html`.
3. Confirm a normal navigation returns the current hashed bundle.
4. Deploy production and verify `https://viatica.cash` directly.
5. Confirm localStorage ledger data survives the in-app cache-clear flow.

Do not reset a real user's browser data as part of verification.
