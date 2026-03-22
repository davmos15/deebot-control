/**
 * DEEBOT CONTROL SERVER
 * Multi-user Node.js backend using ecovacs-deebot.js
 *
 * Each user logs in with their own Ecovacs credentials.
 * Sessions are stored in memory with their own robot connection.
 */

require("dotenv").config();
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const ecovacsDeebot = require("ecovacs-deebot");
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
const countries = ecovacsDeebot.countries;
const nodeMachineId = require("node-machine-id");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Sessions: token -> { api, vacBot, vacState, mapData, cleaningLog, timer } ─
const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 4; // 4 hours

function getSession(req, res) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const s = sessions.get(token);
  // refresh TTL
  clearTimeout(s.timer);
  s.timer = setTimeout(() => destroySession(token), SESSION_TTL);
  return s;
}

function destroySession(token) {
  const s = sessions.get(token);
  if (!s) return;
  try { if (s.vacBot) s.vacBot.disconnect(); } catch {}
  clearTimeout(s.timer);
  sessions.delete(token);
  console.log(`Session ${token.slice(0, 8)}... destroyed (${sessions.size} active)`);
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { email, password, country, continent } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const cc = (country || "us").toUpperCase();
  const cont = (continent || (countries[cc] ? countries[cc].continent : "WW")).toUpperCase();

  try {
    const deviceId = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync());

    const api = new EcoVacsAPI(deviceId, cc, cont);
    console.log(`Logging in ${email}...`);
    await api.connect(email, EcoVacsAPI.md5(password));

    const devices = await api.devices();
    if (!devices.length) {
      return res.status(404).json({ error: "No devices found on this Ecovacs account" });
    }

    const device = devices[0];
    const vacBot = api.getVacBot(
      api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token,
      device
    );

    const vacState = {
      status: "connecting",
      battery: null,
      consumables: {},
      deviceName: device.name || device.nick || "Deebot",
    };
    const mapData = { pieces: [], robotPos: { x: 0, y: 0, angle: 0 } };

    // Create session object early so event handlers can mutate it directly
    const token = crypto.randomUUID();
    const timer = setTimeout(() => destroySession(token), SESSION_TTL);
    const session = { api, vacBot, vacState, mapData, cleaningLog: [], timer };

    // Wire up events
    vacBot.on("ready", () => {
      vacState.status = "idle";
      vacBot.run("GetBatteryState");
      vacBot.run("GetCleanState");
      vacBot.run("GetChargeState");
      vacBot.run("GetLifeSpan", "main_brush");
      vacBot.run("GetLifeSpan", "side_brush");
      vacBot.run("GetLifeSpan", "filter");
      vacBot.run("GetMaps");
    });
    vacBot.on("BatteryInfo", (v) => { vacState.battery = Math.round(v * 100); });
    vacBot.on("CleanReport", (v) => { vacState.status = v; });
    vacBot.on("ChargeState", (v) => { if (v === "charging") vacState.status = "charging"; });
    vacBot.on("LifeSpan_main_brush", (v) => { vacState.consumables.mainBrush = v; });
    vacBot.on("LifeSpan_side_brush", (v) => { vacState.consumables.sideBrush = v; });
    vacBot.on("LifeSpan_filter", (v) => { vacState.consumables.filter = v; });
    vacBot.on("MapPieceFound", (p) => { mapData.pieces.push(p); });
    vacBot.on("DeebotPosition", (p) => { mapData.robotPos = p; });
    vacBot.on("CleanLogs", (l) => { session.cleaningLog = l; });
    vacBot.on("Error", (msg) => { console.error("VacBot error:", msg); });

    await vacBot.connect_and_wait_until_ready();

    sessions.set(token, session);

    console.log(`Session created for ${email} (${sessions.size} active)`);

    const deviceList = devices.map((d, i) => ({
      index: i,
      name: d.name || d.nick || "Unknown",
      did: d.did,
    }));

    res.json({ token, device: vacState.deviceName, devices: deviceList });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(401).json({ error: "Login failed: " + err.message });
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) destroySession(token);
  res.json({ ok: true });
});

// ── STATE ─────────────────────────────────────────────────────────────────────
app.get("/api/state", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  res.json({ ...s.vacState, map: s.mapData, cleaningLog: s.cleaningLog });
});

// ── COMMANDS ──────────────────────────────────────────────────────────────────
function cmdRoute(route, fn) {
  app.post(route, (req, res) => {
    const s = getSession(req, res);
    if (!s) return;
    if (!s.vacBot) return res.status(503).json({ error: "Robot not connected" });
    fn(s, req, res);
  });
}

cmdRoute("/api/clean", (s, req, res) => {
  const { mode = "auto" } = req.body;
  const modeMap = { auto: "auto", spot: "spot_area", edge: "edge", custom: "custom_area" };
  s.vacBot.run("Clean", modeMap[mode] || "auto");
  res.json({ success: true });
});

cmdRoute("/api/stop", (s, _req, res) => {
  s.vacBot.run("Stop");
  res.json({ success: true });
});

cmdRoute("/api/pause", (s, _req, res) => {
  s.vacBot.run("Pause");
  res.json({ success: true });
});

cmdRoute("/api/charge", (s, _req, res) => {
  s.vacBot.run("Charge");
  res.json({ success: true });
});

cmdRoute("/api/move", (s, req, res) => {
  s.vacBot.run("Move", req.body.direction);
  res.json({ success: true });
});

cmdRoute("/api/playSound", (s, _req, res) => {
  s.vacBot.run("PlaySound");
  res.json({ success: true });
});

cmdRoute("/api/setSuction", (s, req, res) => {
  const suctionMap = { quiet: 1000, standard: 0, max: 1, "max+": 2 };
  s.vacBot.run("SetFanSpeed", suctionMap[req.body.level] ?? 0);
  res.json({ success: true });
});

app.get("/api/map", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  res.json(s.mapData);
});

app.get("/api/cleaningLog", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (s.vacBot) s.vacBot.run("GetCleanLogs", 20);
  res.json(s.cleaningLog);
});

cmdRoute("/api/relocate", (s, _req, res) => {
  s.vacBot.run("Relocate");
  res.json({ success: true });
});

cmdRoute("/api/resetLifeSpan", (s, req, res) => {
  s.vacBot.run("ResetLifeSpan", req.body.component);
  res.json({ success: true });
});

cmdRoute("/api/setContinuousCleaning", (s, req, res) => {
  s.vacBot.run("SetContinuousCleaning", req.body.enabled ? 1 : 0);
  res.json({ success: true });
});

cmdRoute("/api/setDoNotDisturb", (s, req, res) => {
  s.vacBot.run("SetDoNotDisturb", req.body.enabled ? 1 : 0);
  res.json({ success: true });
});

cmdRoute("/api/setVolume", (s, req, res) => {
  const volMap = { mute: 0, low: 33, mid: 66, high: 100 };
  s.vacBot.run("SetVolume", volMap[req.body.value] ?? 66);
  res.json({ success: true });
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, activeSessions: sessions.size });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Deebot Control Server running on http://0.0.0.0:${PORT}`);
});
