# Release Checklist

## Before Packaging

- [ ] Confirm `package.json` version is the intended release version.
- [ ] Run `pnpm assets:store` if icon or store artwork changed.
      This command requires local Chrome for screenshot rendering and `sips` for
      icon PNG rendering. Set `CHROME_PATH` if needed.
- [ ] Run `pnpm check:ci`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test:coverage`.
- [ ] Run `pnpm audit --audit-level moderate`.

## Package

```bash
pnpm build:release
```

The script validates:

- Manifest version is MV3.
- Manifest version matches `package.json`.
- Only expected permissions are present: `history`, `alarms`, `storage`.
- Required locales exist.
- Required icon files exist with correct dimensions.
- Release build does not contain sourcemaps.

## Chrome Web Store Upload

- [ ] Upload `release/histsieve-v<version>.zip`.
- [ ] Fill Store Listing using `docs/chrome-web-store-listing.md`.
- [ ] Fill Privacy tab using `PRIVACY.md` and the Privacy Tab Notes.
- [ ] Upload store assets from `store-assets/`.
- [ ] Add test instructions from `docs/chrome-web-store-listing.md`.
- [ ] Submit with deferred publishing for the first release.
