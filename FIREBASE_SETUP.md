# Cursed Chest — Firebase multiplayer setup

The game is fully playable in Solo / Bots mode without Firebase. Online buttons become active when the Firebase Web App values below are present.

## 1. Enable Firebase products

1. Open the Firebase console and select the project.
2. Open **Authentication → Sign-in method** and enable **Anonymous**.
3. Open **Realtime Database → Create Database**. Choose the region closest to the players and start in locked mode.
4. In the Realtime Database **Rules** tab, replace the rules with the contents of `firebase.database.rules.json`, then publish them.
5. Open **Project settings → General → Your apps** and register a **Web app** if one does not already exist.

## 2. Add the Web App configuration

Copy `.env.example` to `.env.local` and fill in the values from the Firebase `firebaseConfig` snippet:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Do not add a Firebase Admin SDK private key, service-account JSON, client email, or private key to this project. The browser integration only needs the Firebase Web App configuration and is protected by Authentication plus Realtime Database Rules.

## 3. Local test

Restart the development server after adding `.env.local`. Open the game in two separate browser profiles or on two devices, create a room on one, and join with the five-character code on the other.

The host can add AI pirates until the room contains 6–10 players. Every connected human must select Ready before the host can start.

## Multiplayer authority model

- Every device receives an anonymous Firebase user ID.
- The host owns the canonical match simulation and AI bots.
- Human movement is sent separately for responsive interpolation.
- Player commands are validated and applied by the host, then published as one match snapshot.
- Secret roles and the cursed treasure ID are stored outside the public room tree. A player can read only their own role; the host can read the complete secret set to run the match.
- Presence uses Firebase `onDisconnect`. If the host leaves, the oldest connected human safely takes over. A disconnected carrier drops their key and does not block voting.

