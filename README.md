# 🌿 Little Learner Tracker

A warm, single-page homeschool **milestone dashboard** for tracking a child's
progress against the **Alabama Course of Study** (Kindergarten through 2nd
Grade). Mark each standard as *Working* or *Done*, watch the progress bars fill,
and keep everything in sync across devices via Firebase Firestore.

> These milestones reflect the Alabama Course of Study (ELA 2021, Math 2019) —
> the same standards used in Alabama public schools. In homeschooling, they
> serve as guideposts, not a strict timeline.

## ✨ Features

- **Four subject areas** — Language Arts 📖, Mathematics 🔢, Motor Skills ✍️,
  and Social & Emotional 🤝.
- **Grade filter** — view All Grades or focus on Kindergarten, 1st, or 2nd.
- **Three-state tracking** — cycle each milestone through *none → working →
  done*; "Working" items surface as active cards at the top.
- **Live progress** — an overall progress bar plus per-subject sub-bars and
  Mastered / In Progress / Total counts.
- **Real-time cloud sync** — state is saved to Firebase Firestore and reloaded
  automatically, with a sync-status indicator (`Loading… → ✓ Synced`).
- **Collapsible accordions** with a "peek / show more" pattern to keep long
  lists tidy.

## 📁 Project structure

```
.
├── index.html              # Page markup; loads the styles and scripts
├── css/
│   └── styles.css          # All styling (fonts, layout, components)
├── js/
│   ├── data.js             # MILESTONES array (the Alabama COS standards)
│   ├── app.js              # State, filtering, stats, and rendering
│   └── firebase.js         # Firebase init + Firestore load/save (ES module)
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages auto-deploy
├── LICENSE
└── README.md
```

### How the scripts fit together

`index.html` loads three scripts in order:

1. `js/data.js` — a classic script that defines the `MILESTONES` array.
2. `js/app.js` — a classic script that reads `MILESTONES`, holds state on
   `window`, and exposes `window.renderAll`. It renders immediately so the UI is
   never blank.
3. `js/firebase.js` — an ES module (deferred, so it runs after the classic
   scripts). It loads saved state from Firestore, wires up the `window.*` click
   handlers, and re-renders.

The two classic scripts share the global lexical scope, and the module
communicates with them through `window.*` globals — so load order matters and is
preserved by the tags at the bottom of `index.html`.

## 🚀 Running locally

It's a static site — no build step. Serve the folder with any static server:

```bash
# From the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` mostly works, but using a local
server avoids browser restrictions on ES modules.

## ☁️ Deployment (GitHub Pages)

This repo ships with a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that publishes the site to **GitHub Pages** on
every push to `main`.

To enable it: in the repository **Settings → Pages**, set **Source** to
**GitHub Actions**. After the next push, your site will be live at
`https://<owner>.github.io/<repo>/`.

## 🔥 Firebase setup

The Firestore configuration lives inline in
[`js/firebase.js`](js/firebase.js). The app reads and writes a single document
(`tracker/oliver`).

> **Note on the API key:** A Firebase Web `apiKey` is **not a secret** — it only
> identifies your project to Google's servers. It is safe to commit. Access is
> controlled by your **Firestore Security Rules**, *not* by hiding the key.

To point the app at your own Firebase project:

1. Create a project in the [Firebase console](https://console.firebase.google.com/)
   and add a **Web app** to get your config object.
2. Replace the `firebaseConfig` values in `js/firebase.js`.
3. Create a **Cloud Firestore** database.
4. Set **Security Rules** appropriate for your use. Locking the single tracker
   document down (for example, behind Firebase Authentication) is recommended
   before sharing the URL publicly.

## 📜 License

Released under the [MIT License](LICENSE).
