# Echo Canvas

A three-player, browser-based sensory telegraph party game built with React, TypeScript, Vite, Firebase Realtime Database, Canvas, and the Web Audio API.

## Current gameplay

1. Host creates a private four-letter room and shares the code.
2. Players join from their own devices.
3. Player 1 hears a five-second generated sound (up to two plays) and draws a line.
4. Player 2 sees the line and recreates its rhythm with six sound pads.
5. Player 3 listens to the recreated rhythm and chooses from four sound cards.
6. The reveal compares the starting sound, drawing, and recreated beat.

A two-player room is supported: the host takes the third role after their first turn. The game uses anonymous Firebase Authentication; players do not create accounts or enter passwords.

## 1. Create Firebase project

1. Go to https://console.firebase.google.com/ and create a project.
2. Add a Web App and copy its Firebase config.
3. In **Build → Authentication → Sign-in method**, enable **Anonymous**.
4. In **Build → Realtime Database**, create a database.
5. Copy the database URL and project settings into `.env.local`.

Create `.env.local` in the project root:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=...
```

Do not commit `.env.local`.

## 2. Database rules

The included `database.rules.json` is a **development starter only**. It allows authenticated anonymous clients to read and write room data so the prototype can be tested quickly. It is not production-hardened: a malicious client could tamper with a room or another player's state.

Before public challenge submission, replace the starter rules with strict validation or move authoritative game actions into trusted server code (for example, Cloud Functions). At minimum, validate room-code format, player count, phase transitions, host-only actions, role ownership, and allowed field changes. Firebase client config is not a secret; database rules are the security boundary.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the local URL in three browser windows/devices. Use one to create a room and share the four-letter code.

## 4. Deploy to Vercel

1. Push this project to a GitHub repository.
2. In https://vercel.com/, import the repository.
3. Add the same `VITE_FIREBASE_*` environment variables in Vercel → Project → Settings → Environment Variables.
4. Deploy. Vercel detects Vite automatically; build command is `npm run build`, output directory is `dist`.

## Notes and prototype limitations

- The current sound engine uses synthesized sound-inspired effects with Web Audio API; it does not yet include genuine pre-recorded environmental audio assets. Add properly licensed recordings to complete the requested hybrid library.
- Ambient music is generated in-browser and starts only after the player enables it, because browsers require a user gesture before audio can start.
- Drawing data is synchronized when submitted, then animated locally for the next player.
- Firebase anonymous authentication is invisible to players, but it is still authentication under the hood.
- The host currently coordinates phase changes. For a public competitive release, move phase transitions, scoring, role validation, and deadlines to trusted server code and use server timestamps.
- The included starter UI is responsive for phones and desktops.
