# Daymo

A simple, local-first calendar app for iOS and Android. Daymo reads calendars already configured on your device and provides a focused agenda for viewing, creating, editing, and deleting events.

## App Installation

App Store: https://apps.apple.com/app/daymo/id6762902133<br>
Google Play: https://play.google.com/store/apps/details?id=io.flown.daymo

![Daymo](assets/images/social.jpg)

## Development

### Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- Xcode and macOS for iOS development
- Android Studio and the Android SDK for Android development

Daymo uses native calendar APIs and is not intended to run on the web.

### Getting started

```sh
git clone https://github.com/simonbengtsson/daymo.git
cd daymo
bun install
```

Build and run the app on a simulator, emulator, or connected device:

```sh
bun run ios
# or
bun run android
```

These commands generate the native `ios` or `android` directory when needed.
Both directories are intentionally ignored because this project uses Expo's
Continuous Native Generation workflow.

After the first native build, start Metro for normal JavaScript and TypeScript
development:

```sh
bun run start
```

### Validation

Run the project check before opening a pull request:

```sh
bun run check
```

This runs TypeScript in type-checking mode without emitting build output.

## Contributing

Contributions are welcome. Create a branch from `main`, keep changes focused,
run `bun run check`, and open a pull request describing the change and how it
was verified. Releases will be published to the Google Play Store and App Store 
as needed.

## Release builds

Maintainers with signing credentials can prepare a release by:

1. Updating the app version, iOS build number, and Android version code in
   `app.json`.
2. Regenerating native projects with `bunx expo prebuild` when native
   configuration has changed.
3. Building the Android App Bundle with `bun run build:aab` after installing
   the maintainer signing keystore.
4. Archiving and submitting the iOS app through Xcode.

## License

Daymo is available under the [MIT License](LICENSE).
