const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Base de données SQLite (fichier local, parfait pour commencer)
const dbPath = process.env.DB_PATH || path.join(__dirname, "supafriends.db");
const db = new Database(dbPath);

// Création des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS states (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

app.use(express.json({ limit: "10mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-moi-en-production-s'il-te-plait",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 jours
}));

// Sert le gros HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public.html"));
});

// Helper : état par défaut d'une joueuse
function defaultState(user) {
  return {
    user: { id: user.id, pseudo: user.pseudo, email: user.email },
    collection: {},
    coins: 0,
    xp: 0,
    powder: 0,
    pity: 0,
    stock: 0,
    gifts: 0,
    rareBoosters: 0,
    streak: 0,
    bestStreak: 0,
    rating: 1000,
    duelW: 0,
    duelL: 0,
    duelStreak: 0,
    combos: 0,
    boosters: 1,
    nextBoosterAt: Date.now(),
    favs: [],
    mail: [],
    notifications: []
  };
}

function getState(userId) {
  const row = db.prepare("SELECT data FROM states WHERE user_id = ?").get(userId);
  if (!row) return null;
  return JSON.parse(row.data);
}

function saveState(userId, state) {
  db.prepare(`
    INSERT INTO states (user_id, data) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data
  `).run(userId, JSON.stringify(state));
}

// Middleware : vérifie que l'utilisatrice est connectée
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Non connectée" });
  }
  next();
}

// ===== AUTH =====
app.post("/api/register", (req, res) => {
  const { pseudo, email, password } = req.body;
  if (!pseudo || !email || !password) return res.status(400).json({ error: "Champs manquants" });
  if (password.length < 8) return res.status(400).json({ error: "Mot de passe trop court" });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      "INSERT INTO users (pseudo, email, password_hash) VALUES (?, ?, ?)"
    ).run(pseudo, email, hash);

    const user = { id: info.lastInsertRowid, pseudo, email };
    const state = defaultState(user);
    saveState(user.id, state);

    req.session.userId = user.id;
    res.set("x-sf-server", "1");
    res.json(state);
  } catch (e) {
    if (e.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Pseudo ou e-mail déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/login", (req, res) => {
  const { id, password } = req.body; // "id" peut être pseudo ou email
  if (!id || !password) return res.status(400).json({ error: "Champs manquants" });

  const user = db.prepare(
    "SELECT * FROM users WHERE pseudo = ? OR email = ?"
  ).get(id, id);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
  }

  req.session.userId = user.id;
  const state = getState(user.id) || defaultState(user);
  res.set("x-sf-server", "1");
  res.json(state);
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.delete("/api/account", requireAuth, (req, res) => {
  const { password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: "Mot de passe incorrect" });
  }
  db.prepare("DELETE FROM states WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  req.session.destroy(() => res.json({ ok: true }));
});

// ===== ÉTAT =====
app.get("/api/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, pseudo, email FROM users WHERE id = ?").get(req.session.userId);
  let state = getState(user.id);
  if (!state) {
    state = defaultState(user);
    saveState(user.id, state);
  }
  state.user = { id: user.id, pseudo: user.pseudo, email: user.email };
  res.set("x-sf-server", "1");
  res.json(state);
});

// ===== BOOSTER (version simplifiée pour démarrer) =====
// Pour l'instant on tire 5 cartes aléatoires. On pourra affiner les taux plus tard.
const SAMPLE_CARDS = [
  "Ylvaryn", "Valyria", "Elijah", "Loryc", "Enzo", "Aria", "Kael", "Lyra", "Thorne", "Sera"
]; // Tu pourras remplacer par la vraie liste plus tard

app.post("/api/booster/open", requireAuth, (req, res) => {
  const state = getState(req.session.userId);
  if (!state) return res.status(400).json({ error: "État introuvable" });

  const mode = req.body.mode || "timer";

  // Vérification simple du cooldown / stock
  if (mode === "timer" && state.stock <= 0 && Date.now() < (state.nextBoosterAt || 0)) {
    return res.status(400).json({ error: "Booster pas encore prêt", code: "cooldown" });
  }

  // Tirage basique de 5 cartes
  const cards = [];
  for (let i = 0; i < 5; i++) {
    const name = SAMPLE_CARDS[Math.floor(Math.random() * SAMPLE_CARDS.length)];
    const holo = Math.random() < 0.08; // 8% de chance holo
    cards.push({ n: name, holo });

    // Ajout à la collection
    if (!state.collection[name]) state.collection[name] = { qty: 0, holo: 0 };
    state.collection[name].qty += 1;
    if (holo) state.collection[name].holo += 1;
  }

  // Mise à jour simple de l'état
  if (mode === "timer") {
    if (state.stock > 0) state.stock -= 1;
    else state.nextBoosterAt = Date.now() + 4 * 60 * 60 * 1000; // 4h
  } else if (mode === "gift") {
    state.gifts = Math.max(0, (state.gifts || 0) - 1);
  }

  state.xp = (state.xp || 0) + 10;
  saveState(req.session.userId, state);

  res.json({ cards, state });
});

// ===== AUTRES ENDPOINTS DE BASE =====
app.post("/api/recycle", requireAuth, (req, res) => {
  const { card, qty } = req.body;
  const state = getState(req.session.userId);
  if (!state || !state.collection[card]) return res.status(400).json({ error: "Carte introuvable" });

  const have = state.collection[card].qty || 0;
  const remove = Math.min(qty || 1, have);
  state.collection[card].qty -= remove;
  if (state.collection[card].qty <= 0) delete state.collection[card];

  state.powder = (state.powder || 0) + remove * 2;
  saveState(req.session.userId, state);
  res.json({ state });
});

app.post("/api/powder/buy", requireAuth, (req, res) => {
  const state = getState(req.session.userId);
  if ((state.powder || 0) < 50) return res.status(400).json({ error: "Pas assez de poudre" });
  state.powder -= 50;
  state.stock = (state.stock || 0) + 1;
  saveState(req.session.userId, state);
  res.json({ state });
});

app.put("/api/favs", requireAuth, (req, res) => {
  const state = getState(req.session.userId);
  state.favs = req.body.cards || [];
  saveState(req.session.userId, state);
  res.json({ ok: true });
});

// ===== ENDPOINTS MULTI (stubs pour ne pas casser l'interface) =====
app.get("/api/mail", requireAuth, (req, res) => res.json({ mails: [] }));
app.get("/api/notifications", requireAuth, (req, res) => res.json({ notes: [] }));
app.get("/api/market", requireAuth, (req, res) => res.json({ listings: [], cotes: {} }));
app.get("/api/duel/open", requireAuth, (req, res) => res.json({ open: [] }));
app.get("/api/duel/leaderboard", requireAuth, (req, res) => res.json({ board: [] }));
app.get("/api/duel/history", requireAuth, (req, res) => res.json({ history: [] }));

// Reset / clear (utiles)
app.post("/api/account/clear-cards", requireAuth, (req, res) => {
  const state = getState(req.session.userId);
  state.collection = {};
  saveState(req.session.userId, state);
  res.json({ ok: true });
});

app.post("/api/account/reset", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, pseudo, email FROM users WHERE id = ?").get(req.session.userId);
  const state = defaultState(user);
  saveState(req.session.userId, state);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`SupaFriends server running on port ${PORT}`);
});
