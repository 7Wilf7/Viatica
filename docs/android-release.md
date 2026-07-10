# Android APK Release Runbook

## Distribution Path

Viatica follows Ultreia's APK distribution model:

1. Keep the GitHub repository public.
2. Align `package.json` `version` with a semantic tag such as `v0.2.3`.
3. Push the version commit and tag.
4. Let `.github/workflows/release.yml` build, sign, and upload the APK to a
   GitHub Release.
5. Let the in-app updater compare `__APP_VERSION__` with the latest GitHub
   Release.

The standard tag command is:

```bash
git tag v0.2.3
git push origin v0.2.3
```

`ANDROID_VERSION_NAME` comes from the tag without `v`.
`ANDROID_VERSION_CODE` comes from the GitHub Actions run number so Android
upgrade codes remain monotonic.

## Validation Before Tagging

Run the following when the local toolchain is available:

```bash
npm run test
npm run lint
npm run build
cd android
.\gradlew.bat :app:processReleaseMainManifest --no-daemon
```

If Java or the Android SDK is unavailable, report the missing dependency and
inspect the GitHub Actions result after pushing the tag.

## Signing And Mirrors

GitHub Actions reads these secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never commit a keystore or password. Local signing may use the gitignored
`android/keystore.properties` file.

The workflow may mirror the latest APK to Supabase Storage at
`releases/viatica-latest.apk` using `SUPABASE_SERVICE_ROLE_KEY`. That mirror is
only a download accelerator; GitHub Releases remains the version source of
truth.

## Command Semantics

- "推 APK" means validate, choose and bump the version, commit, push, tag, and
  hand the signed build to GitHub Actions. It never means only build a local
  debug APK.
- A shorthand such as `推 0111` maps to `0.11.1`; `推 0110` maps to `0.11.0`.
  Stop and confirm if a number has no single clear semantic-version split.
- Once the version commit and tag push are confirmed, handoff may finish without
  waiting for GitHub Actions unless Wilf asks, the release flow changed, or the
  run needs troubleshooting.

Before 1.0, every tag is one release. Use PATCH for fixes, copy, style,
performance, or docs-only changes. Use MINOR and reset PATCH for a user-visible
feature or feature batch. Do not skip numbers by feel; reserve `1.0.0` for a
stable public-ready product.
