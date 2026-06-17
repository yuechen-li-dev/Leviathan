# Leviathan M3: Android APK Shell

M3 packages the existing Leviathan web shell into an Android-capable wrapper with Capacitor. The goal is mobile proof, not product polish: MachinaLayout still owns shell geometry, Machina dispatch still owns navigation/state transitions, React still renders slots, and API effects still live in explicit shell command handlers.

## Purpose

- Build the existing `src/Leviathan.Web` shell into static assets.
- Wrap those assets in an Android project without forking into native screens.
- Keep RustSimulator playable against a configured backend URL from emulator or device.
- Preserve the M2 debug inspector for dev/debug diagnosis.

## Architecture boundaries

- No changes under `vendor/`.
- No social/auth/payments/persistence/live-LLM features were added.
- No React Router, Zustand, Redux, or CSS-only shell ownership was introduced.
- Android remains a Capacitor host around the existing web shell.
- MachinaLayout remains the source of shell geometry, including narrow/mobile layout decisions.

## Web and API configuration

The web shell now resolves its API base URL through a small configuration layer in `src/Leviathan.Web/src/machina/apiConfig.ts`.

Resolution order:

1. `?apiBaseUrl=http://...` query parameter
2. persisted `localStorage["leviathan.apiBaseUrl"]`
3. `VITE_LEVIATHAN_API_BASE_URL`
4. fallback `/api`

Behavior:

- Browser dev mode still works with the Vite proxy and relative `/api`.
- Android emulator builds can target `http://10.0.2.2:5188`.
- Physical devices can target `http://<LAN-IP>:5188`.
- `?apiBaseUrl=0` clears any stored override and falls back again.

Examples:

- Browser dev with proxy:
  `npm run dev`
- Emulator build using an env file:
  create `.env.local` or copy from `src/Leviathan.Web/.env.android.example` and set:
  `VITE_LEVIATHAN_API_BASE_URL=http://10.0.2.2:5188`
- Physical device build:
  `VITE_LEVIATHAN_API_BASE_URL=http://192.168.1.50:5188`
- Runtime override for a debug build already on device:
  append `?apiBaseUrl=http://192.168.1.50:5188&debug=1`

The M2 inspector now shows the resolved API base URL so mobile/backend wiring is visible at runtime.

## Capacitor setup

Capacitor lives inside `src/Leviathan.Web` with:

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`

Configuration:

- app id: `dev.yuechen.leviathan`
- app name: `Leviathan`
- web dir: `dist`
- Android cleartext enabled for local HTTP backend testing

Main files:

- [src/Leviathan.Web/capacitor.config.ts](/C:/Users/yuech/source/repos/Leviathan/src/Leviathan.Web/capacitor.config.ts)
- [src/Leviathan.Web/android](/C:/Users/yuech/source/repos/Leviathan/src/Leviathan.Web/android)

## How to run the backend

From repo root:

```powershell
dotnet restore
dotnet run --project src/Leviathan.Server/Leviathan.Server.csproj --urls http://localhost:5188
```

For physical device testing, use your machine LAN IP and make sure the backend is reachable from the device on the same network.

## How to run the browser frontend

From `src/Leviathan.Web`:

```powershell
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:5188`, so no extra browser config is needed for the default proof path.

## Android emulator notes

- Android emulator should use `http://10.0.2.2:5188` to reach a backend running on the host machine.
- This can be baked into the build with `VITE_LEVIATHAN_API_BASE_URL=http://10.0.2.2:5188`.
- The app uses local bundled web assets; it does not require deployed cloud hosting.

## Physical device notes

- Use a LAN-reachable backend URL such as `http://192.168.1.50:5188`.
- Do not hardcode a machine-specific IP into source control.
- Prefer an env override for repeatable builds, or a runtime `?apiBaseUrl=...` override for debug runs.

## Build, sync, and open Android

From `src/Leviathan.Web`:

```powershell
npm run build
npm run cap:sync
npm run android:open
```

Available scripts:

- `npm run build`
- `npm run test`
- `npm run cap:sync`
- `npm run cap:android`
- `npm run android:open`

`cap:sync` builds the Vite app first, then syncs the Android project.

## Debug APK / Android Studio

If local Android tooling is available:

```powershell
cd src/Leviathan.Web/android
.\gradlew.bat assembleDebug
```

Android Studio can also open `src/Leviathan.Web/android` directly after `npm run cap:sync`.

If Gradle fails against a too-new system JDK, run it with Android Studio's bundled JBR and an explicit SDK path for the current shell only:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

## Inspector usage

The M2 inspector remains debug-only:

- `?debug=1` enables it and persists the flag.
- `?debug=0` disables it and clears the flag.
- When enabled, an `Inspector` toggle appears.
- On mobile/narrow layouts, the inspector collapses into the existing shell rather than introducing native Android UI.

Useful combined example:

```text
?debug=1&apiBaseUrl=http://10.0.2.2:5188
```

## Known limitations

- This is still a web shell inside a native wrapper, not a native Android UI.
- Proof-path mobile layout was only adjusted enough for narrow usability, not fully polished for every screen size.
- The backend URL is still an external configuration concern; there is no in-product settings UI for it.
- Cleartext HTTP is enabled for local development/testing convenience.
- Some local environments may need an explicit Android Studio JBR / Android SDK shell setup before Gradle can build.
- Device/emulator runtime verification should only be claimed if actually executed in the target environment.

## Recommended M4

M4 should remain session persistence unless M3 field testing exposes a more urgent mobile-shell issue such as keyboard/viewport handling or backend-target ergonomics.
