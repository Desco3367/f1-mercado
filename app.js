import { firebaseConfig } from "./firebase-config.js";
import { extractMarketItemsFromSave } from "./save-reader.js";

const FIREBASE_VERSION = "10.7.0";
const M = 1_000_000;
const BID = 0.5 * M;
const UNDO_WINDOW_MS = 2 * 60_000;
const MAX_SAVE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_MONEY_JSON_BYTES = 2 * 1024 * 1024;
const MAX_MONEY_TEAMS = 50;
const ADMIN_EMAIL = "admin@manager.local";
const TEAM_AUTH_EMAILS = {
  andretti: "andretti@ligaf1.local",
  aston: "astonmartin@ligaf1.local",
  ferrari: "ferrari@ligaf1.local",
  haas: "haas@ligaf1.local",
  mclaren: "mclaren@ligaf1.local",
  mercedes: "mercedes@ligaf1.local",
  porsche: "porsche@ligaf1.local",
  redbull: "redbull@ligaf1.local",
  sauber: "sauber@ligaf1.local",
  williams: "williams@ligaf1.local",
};

const TIERS = {
  driver: [[90, 30 * M], [85, 25 * M], [80, 20 * M], [70, 10 * M], [0, 2 * M]],
  raceEngineer: [[90, 8.5 * M], [85, 7 * M], [80, 5.5 * M], [0, 3 * M]],
  jTecnico: [[90, 9 * M], [85, 7.5 * M], [80, 6 * M], [0, 4 * M]],
  sDirector: [[90, 7.5 * M], [85, 6 * M], [80, 4 * M], [0, 2 * M]],
  hOfAero: [[90, 8.5 * M], [85, 7.5 * M], [80, 6 * M], [0, 4 * M]],
};

const CAT_LABEL = {
  driver: "Piloto",
  raceEngineer: "Race Engineer",
  jTecnico: "J. Tecnico",
  sDirector: "S. Director",
  hOfAero: "H. of Aero",
};

const STAFF_CATS = ["raceEngineer", "jTecnico", "sDirector", "hOfAero"];
const AUCTION_CATS = ["driver", ...STAFF_CATS];
const MONEY_TEAM_ALIASES = {
  aston: "aston",
  astonmartin: "aston",
  renault: "andretti",
  alpine: "andretti",
  hugoboss: "porsche",
};

const ROSTER = [
  { slot: "p1", label: "PILOTO 1", cat: "driver" },
  { slot: "p2", label: "PILOTO 2", cat: "driver" },
  { slot: "r1", label: "RESERVA 1", cat: "driver" },
  { slot: "r2", label: "RESERVA 2", cat: "driver" },
  { slot: "ic1", label: "ING CARRERA 1", cat: "raceEngineer" },
  { slot: "ic2", label: "ING CARRERA 2", cat: "raceEngineer" },
  { slot: "tc", label: "TECHNICAL CHIEF", cat: "jTecnico" },
  { slot: "sd", label: "SPORTING DIR.", cat: "sDirector" },
  { slot: "ha", label: "HEAD OF AERO", cat: "hOfAero" },
];

const ROSTER_LIMITS = {
  p1: { label: "PILOTO 1", limit: 1 },
  p2: { label: "PILOTO 2", limit: 1 },
  r1: { label: "RESERVA 1", limit: 1 },
  r2: { label: "RESERVA 2", limit: 1 },
  ic1: { label: "ING CARRERA 1", limit: 1 },
  ic2: { label: "ING CARRERA 2", limit: 1 },
  tc: { label: "TECHNICAL CHIEF", limit: 1 },
  sd: { label: "SPORTING DIR.", limit: 1 },
  ha: { label: "HEAD OF AERO", limit: 1 },
};

const DEFAULT_TEAMS = {
  mercedes: { name: "MERCEDES", manager: "TOMIK", budget: 100 * M },
  aston: { name: "ASTON", manager: "DIABLITO", budget: 100 * M },
  ferrari: { name: "FERRARI", manager: "ASEGALINO", budget: 100 * M },
  mclaren: { name: "MCLAREN", manager: "JDAV", budget: 100 * M },
  williams: { name: "WILLIAMS", manager: "PRICHID", budget: 100 * M },
  haas: { name: "HAAS", manager: "ALEXGAMER", budget: 100 * M },
  redbull: { name: "RED BULL", manager: "MARTINI", budget: 100 * M },
  porsche: { name: "PORSCHE", manager: "ANTONIO", budget: 100 * M },
  sauber: { name: "SAUBER", manager: "MARIETE", budget: 100 * M },
  andretti: { name: "ANDRETTI", manager: "ZAK", budget: 100 * M },
};

let initializeApp;
let getDatabase;
let ref;
let onValue;
let set;
let update;
let push;
let get;
let runTransaction;
let dbQuery;
let orderByChild;
let equalTo;
let getAuth;
let signInWithEmailAndPassword;
let firebaseSignOut;
let onAuthStateChanged;

const state = {
  db: null,
  auth: null,
  authReady: false,
  authUser: null,
  listenersAttached: false,
  unsubscribers: [],
  fatal: "",
  config: null,
  market: { status: "closed" },
  auctions: {},
  rosters: {},
  pool: { drivers: {}, staff: {} },
  loaded: {
    config: false,
    market: false,
    auctions: false,
    rosters: false,
    pool: false,
  },
  session: null,
  closing: new Set(),
  bidding: new Set(),
  undoing: new Set(),
};

const ui = {
  loginMode: "team",
  loginTeam: "",
  loginPin: "",
  loginError: "",
  loginBusy: false,
  teamTab: "live",
  adminTab: "subastas",
  bidInputs: {},
  dismissedOutbid: new Set(),
  poolSearch: "",
  poolFilter: "all",
  poolSort: "rating-desc",
  teamPoolSearch: "",
  teamPoolFilter: "all",
  teamPoolSort: "rating-desc",
  teamAuctionFilter: "all",
  teamAuctionSort: "rating-desc",
  adminAuctionFilter: "all",
  adminAuctionTeamFilter: "all",
  adminAuctionSort: "rating-desc",
  historyAuctionFilter: "all",
  historyAuctionTeamFilter: "all",
  historyAuctionSort: "rating-desc",
  bidSlots: {},
  importDriversText: "",
  importStaffText: "",
  importStaffCat: "raceEngineer",
  saveImportFile: null,
  saveImportName: "",
  saveImportBusy: false,
  saveImportStatus: "",
  saveImportError: "",
  saveImportResult: null,
  moneyImportFile: null,
  moneyImportName: "",
  moneyImportBusy: false,
  moneyImportStatus: "",
  moneyImportError: "",
  moneyImportResult: null,
  editBudget: {},
  assign: null,
};

const appEl = document.getElementById("app");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const attr = escapeHtml;

function money(value) {
  const n = Number(value || 0) / M;
  return `$${Number.isInteger(n) ? n : n.toFixed(1)}M`;
}

function moneyValue(value) {
  const n = Number(value || 0) / M;
  return `$${Number.isInteger(n) ? n : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}M`;
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function parseMoney(value) {
  const n = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n * M : NaN;
}

function uid() {
  return `${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function firebaseKey(value) {
  return String(value || "").replace(/[.#$/[\]]/g, "_");
}

function auctionKeyFor(itemId) {
  return `${firebaseKey(currentMarketId())}__${firebaseKey(itemId)}`;
}

function calcDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatDeadline(ts) {
  const deadline = new Date(Number(ts || 0));
  const now = new Date();
  if (deadline < now) return "Vencio";

  const diff = deadline - now;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.max(0, Math.floor((diff % 3_600_000) / 60_000));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${Math.max(1, minutes)}min`;
}

function formatShortDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function minBidFor(cat, rating = 0) {
  const tier = TIERS[cat] || TIERS.driver;
  for (const [min, price] of tier) {
    if (Number(rating || 0) >= min) return price;
  }
  return tier.at(-1)[1];
}

function nextBidForAuction(auction) {
  const current = Number(auction.currentBid || 0);
  return auction.currentBidder ? current + BID : openingBidForAuction(auction);
}

function auctionBasePrice(auction) {
  const stored = Number(auction?.basePrice);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const tierPrice = minBidFor(auction?.cat, auction?.rating || 0);
  if (Number.isFinite(tierPrice) && tierPrice > 0) return tierPrice;
  return Number(auction?.currentBid || 0);
}

function reserveBidForAuction(auction) {
  return auction?.cat === "driver" ? auctionBasePrice(auction) / 2 : auctionBasePrice(auction);
}

function openingBidForAuction(auction) {
  return auction?.cat === "driver" ? reserveBidForAuction(auction) : auctionBasePrice(auction);
}

function bidRoleForAmount(auction, amount) {
  if (auction?.cat !== "driver") return "";
  return Number(amount || 0) < auctionBasePrice(auction) ? "reserve" : "full";
}

function bidRoleLabel(role) {
  if (role === "reserve") return "Reserva";
  if (role === "full") return "Base";
  return "";
}

function bidRoleSuffix(role) {
  const label = bidRoleLabel(role);
  return label ? ` (${label.toLowerCase()})` : "";
}

function rosterSlot(slotId) {
  return ROSTER.find((slot) => slot.slot === slotId) || null;
}

function slotLabel(slotId) {
  return rosterSlot(slotId)?.label || "";
}

function isReserveSlot(slotId) {
  return slotId === "r1" || slotId === "r2";
}

function isFullDriverSlot(slotId) {
  return slotId === "p1" || slotId === "p2";
}

function slotsForAuction(auction) {
  return ROSTER.filter((slot) => slot.cat === auction?.cat);
}

function normalizeBidSlot(auction, slotId) {
  const slots = slotsForAuction(auction);
  if (!slots.length) return "";
  if (slots.some((slot) => slot.slot === slotId)) return slotId;
  if (slots.length === 1) return slots[0].slot;
  return "";
}

function bidRoleForSlot(slotId) {
  if (isReserveSlot(slotId)) return "reserve";
  if (isFullDriverSlot(slotId)) return "full";
  return "";
}

function bidRoleForAuction(auction, amount, slotId) {
  if (auction?.cat !== "driver") return "";
  return bidRoleForSlot(slotId) || bidRoleForAmount(auction, amount);
}

function bidSlotSuffix(auction, amount, slotId) {
  const label = slotLabel(slotId);
  if (label) return ` (${label})`;
  return bidRoleSuffix(bidRoleForAuction(auction, amount, slotId));
}

function minimumBidForSlot(auction, slotId) {
  const current = Number(auction?.currentBid || 0);
  const leaderMin = auction?.currentBidder ? current + BID : 0;
  const base = auctionBasePrice(auction);
  if (auction?.cat === "driver") {
    const slotBase = isReserveSlot(slotId) ? base / 2 : base;
    return Math.max(leaderMin, slotBase);
  }
  return Math.max(leaderMin, base);
}

function isHalfMillionStep(amount) {
  if (!Number.isFinite(amount)) return false;
  return Math.abs(amount - Math.round(amount / BID) * BID) < 1;
}

function ratingClass(rating) {
  const r = Number(rating || 0);
  if (r >= 90) return "gold";
  if (r >= 80) return "blue";
  return "green";
}

function ratingBadge(rating) {
  if (rating === null || rating === undefined || rating === "") {
    return `<span class="avatar">ST</span>`;
  }
  return `<span class="rating ${ratingClass(rating)}">${escapeHtml(rating)}</span>`;
}

function emptyPool() {
  return { drivers: {}, staff: {} };
}

function cloneDefaultTeams() {
  return JSON.parse(JSON.stringify(DEFAULT_TEAMS));
}

function normalizeConfig(raw) {
  const defaults = cloneDefaultTeams();
  const teams = { ...defaults };
  for (const [id, team] of Object.entries(raw?.teams || {})) {
    teams[id] = { ...(teams[id] || {}), ...team };
  }
  for (const [id, team] of Object.entries(teams)) {
    team.authEmail = team.authEmail || authEmailForTeam(id);
  }
  return {
    teams,
  };
}

function normalizeTeamScopedConfig(teamId, rawTeam) {
  const { pin, ...safeTeam } = rawTeam || {};
  const teams = cloneDefaultTeams();
  Object.entries(teams).forEach(([id, team]) => {
    team.budget = id === teamId ? Number(safeTeam?.budget ?? team.budget ?? 0) : 0;
    team.authEmail = authEmailForTeam(id);
  });
  teams[teamId] = {
    ...(teams[teamId] || {}),
    ...safeTeam,
    authEmail: authEmailForTeam(teamId),
  };
  return { teams };
}

function authEmailForTeam(teamId) {
  return TEAM_AUTH_EMAILS[teamId] || `${teamId}@ligaf1.local`;
}

function sessionFromAuthUser(user) {
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  if (email === ADMIN_EMAIL) return { type: "admin", email, uid: user.uid };

  for (const [teamId, teamEmail] of Object.entries(TEAM_AUTH_EMAILS)) {
    if (email === teamEmail) return { type: "team", teamId, email, uid: user.uid };
  }

  return null;
}

function assertFileSize(file, maxBytes, label) {
  if (!file) return;
  if (Number(file.size || 0) > maxBytes) {
    throw new Error(`${label} demasiado grande. Maximo permitido: ${formatBytes(maxBytes)}.`);
  }
}

function resetFirebaseData() {
  state.config = null;
  state.market = { status: "closed" };
  state.auctions = {};
  state.rosters = {};
  state.pool = emptyPool();
  state.loaded = { config: false, market: false, auctions: false, rosters: false, pool: false };
}

function clearFirebaseListeners() {
  state.unsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("No pude cerrar listener Firebase", error);
    }
  });
  state.unsubscribers = [];
  state.listenersAttached = false;
}

function firebaseIsConfigured(config) {
  return Object.values(config || {}).every((value) => {
    const text = String(value || "");
    return text && !text.includes("TU_");
  });
}

function loadedAll() {
  return Object.values(state.loaded).every(Boolean);
}

function markLoaded(key) {
  state.loaded[key] = true;
}

function marketIsOpen() {
  return state.market?.status === "open" && Boolean(state.market?.periodId);
}

function currentMarketId() {
  return state.market?.periodId || "";
}

function teamName(teamId) {
  return state.config?.teams?.[teamId]?.name || teamId || "Sin equipo";
}

function activeAuctions() {
  return Object.values(state.auctions || {})
    .filter((auction) => auction?.status === "active")
    .sort((a, b) => Number(a.deadline || Number.MAX_SAFE_INTEGER) - Number(b.deadline || Number.MAX_SAFE_INTEGER));
}

function allHistoryAuctions() {
  return Object.values(state.auctions || {})
    .filter((auction) => auction && auction.status !== "active")
    .sort((a, b) => Number(b.closedAt || b.createdAt || b.deadline || 0) - Number(a.closedAt || a.createdAt || a.deadline || 0));
}

function historyAuctions() {
  return allHistoryAuctions().slice(0, 60);
}

function resettableHistoryAuctionEntries() {
  const periodId = currentMarketId();
  return Object.entries(state.auctions || {}).filter(([, auction]) => {
    if (!auction || auction.status === "active") return false;
    if (marketIsOpen() && periodId && auction.marketId === periodId) return false;
    return true;
  });
}

function resettableHistoryAuctions() {
  return resettableHistoryAuctionEntries().map(([, auction]) => auction);
}

function filterAuctionsByCat(auctions, filter) {
  if (!filter || filter === "all") return auctions;
  return auctions.filter((auction) => auction.cat === filter);
}

function auctionSortValue(auction, sort) {
  if (sort.startsWith("rating")) return Number(auction.rating ?? -1);
  if (sort.startsWith("bid")) return Number(auction.currentBid || auction.basePrice || 0);
  return 0;
}

function sortAuctions(auctions, sort) {
  if (!sort || sort === "default") return auctions;
  const direction = sort.endsWith("-asc") ? 1 : -1;
  return [...auctions].sort((a, b) => {
    const diff = auctionSortValue(a, sort) - auctionSortValue(b, sort);
    if (diff) return diff * direction;
    return String(a.itemName || "").localeCompare(String(b.itemName || ""), "es");
  });
}

function auctionMatchesTeamFilter(auction, teamId, mode = "bid") {
  if (!teamId || teamId === "all") return true;
  if (mode === "leading") return auction?.currentBidder === teamId;
  if (mode === "winner") return auction?.winner === teamId;
  return teamHasBid(auction, teamId);
}

function filterAuctionsByTeam(auctions, teamId, mode = "bid") {
  if (!teamId || teamId === "all") return auctions;
  return auctions.filter((auction) => auctionMatchesTeamFilter(auction, teamId, mode));
}

function visibleAuctions(auctions, filter, sort, teamFilter = "all", teamFilterMode = "bid") {
  return sortAuctions(filterAuctionsByTeam(filterAuctionsByCat(auctions, filter), teamFilter, teamFilterMode), sort);
}

function teamHasBid(auction, teamId) {
  if (!auction || !teamId) return false;
  if (auction.currentBidder === teamId) return true;
  return Object.values(auction.bids || {}).some((bid) => bid.teamId === teamId);
}

function auctionFilterOptionsHtml(current) {
  return `
    <option value="all" ${current === "all" ? "selected" : ""}>Todos</option>
    ${AUCTION_CATS.map((cat) => `
      <option value="${attr(cat)}" ${current === cat ? "selected" : ""}>${escapeHtml(CAT_LABEL[cat])}</option>
    `).join("")}
  `;
}

function auctionSortOptionsHtml(current) {
  return `
    <option value="default" ${current === "default" ? "selected" : ""}>Orden actual</option>
    <option value="rating-desc" ${current === "rating-desc" ? "selected" : ""}>Media alta</option>
    <option value="rating-asc" ${current === "rating-asc" ? "selected" : ""}>Media baja</option>
    <option value="bid-desc" ${current === "bid-desc" ? "selected" : ""}>Precio alto</option>
    <option value="bid-asc" ${current === "bid-asc" ? "selected" : ""}>Precio bajo</option>
  `;
}

function teamBidFilterOptionsHtml(current, auctions, mode = "bid") {
  const teams = Object.entries(state.config?.teams || {})
    .sort(([teamA], [teamB]) => teamName(teamA).localeCompare(teamName(teamB), "es"));
  return `
    <option value="all" ${current === "all" ? "selected" : ""}>Todos los equipos</option>
    ${teams.map(([teamId]) => {
      const count = auctions.filter((auction) => auctionMatchesTeamFilter(auction, teamId, mode)).length;
      return `<option value="${attr(teamId)}" ${current === teamId ? "selected" : ""}>${escapeHtml(teamName(teamId))}${count ? ` (${count})` : ""}</option>`;
    }).join("")}
  `;
}

function renderAuctionFilter(id, current, all, filtered, sortId, sortCurrent, teamFilterId = "", teamFilterCurrent = "all", teamFilterMode = "bid") {
  const hasTeamFilter = Boolean(teamFilterId);
  return `
    <div class="filters auction-filter ${hasTeamFilter ? "with-team-filter" : ""}">
      <div class="muted">${filtered.length} visibles - ${all.length} subastas</div>
      <select id="${attr(id)}">
        ${auctionFilterOptionsHtml(current)}
      </select>
      ${hasTeamFilter ? `
        <select id="${attr(teamFilterId)}">
          ${teamBidFilterOptionsHtml(teamFilterCurrent, all, teamFilterMode)}
        </select>
      ` : ""}
      <select id="${attr(sortId)}">
        ${auctionSortOptionsHtml(sortCurrent)}
      </select>
    </div>
  `;
}

function teamRoster(teamId) {
  return Object.entries(state.rosters?.[teamId] || {})
    .filter(([, signing]) => signing)
    .sort(([, a], [, b]) => Number(b.wonAt || 0) - Number(a.wonAt || 0));
}

function teamStaffRoster(teamId) {
  return teamRoster(teamId).filter(([, signing]) => signing?.cat && signing.cat !== "driver");
}

function rosterKeyForSigning(signing) {
  if (!signing?.cat || !ROSTER_LIMITS[signing.slot]) return "";
  return signing.slot;
}

function candidateSlotsForSigning(signing) {
  const slots = ROSTER.filter((slot) => slot.cat === signing?.cat);
  if (signing?.cat === "driver" && signing?.reserveOnly) return slots.filter((slot) => isReserveSlot(slot.slot));
  if (signing?.cat === "driver" && signing?.bidRole === "full") return slots.filter((slot) => isFullDriverSlot(slot.slot));
  return slots;
}

function candidateSlotsForAuctionBid(auction, amount, slotId) {
  const explicitSlot = normalizeBidSlot(auction, slotId);
  if (explicitSlot) return [rosterSlot(explicitSlot)].filter(Boolean);
  const slots = slotsForAuction(auction);
  if (auction?.cat === "driver" && bidRoleForAmount(auction, amount) === "reserve") {
    return slots.filter((slot) => isReserveSlot(slot.slot));
  }
  if (auction?.cat === "driver") return slots.filter((slot) => isFullDriverSlot(slot.slot));
  return slots;
}

function addRosterUsage(usage, slots) {
  if (!slots.length) return;
  const availableSlot = slots.find((slot) => (usage[slot.slot] || 0) < (ROSTER_LIMITS[slot.slot]?.limit || 0));
  const slot = availableSlot || slots[0];
  usage[slot.slot] = (usage[slot.slot] || 0) + 1;
}

function rosterKeyForAuctionBid(auction, amount, slotId) {
  return candidateSlotsForAuctionBid(auction, amount, slotId)[0]?.slot || "";
}

function emptyRosterUsage() {
  return Object.fromEntries(Object.keys(ROSTER_LIMITS).map((key) => [key, 0]));
}

function teamRosterUsage(teamId, excludedAuctionId = "") {
  const usage = emptyRosterUsage();

  teamRoster(teamId).forEach(([, signing]) => {
    const key = rosterKeyForSigning(signing);
    if (key) {
      usage[key] += 1;
    } else {
      addRosterUsage(usage, candidateSlotsForSigning(signing));
    }
  });

  activeAuctions()
    .filter((auction) => auction.id !== excludedAuctionId && auction.currentBidder === teamId)
    .forEach((auction) => {
      const key = rosterKeyForSigning({ cat: auction.cat, slot: auction.currentBidSlot });
      if (key) {
        usage[key] += 1;
      } else {
        addRosterUsage(usage, candidateSlotsForAuctionBid(auction, auction.currentBid, auction.currentBidSlot));
      }
    });

  return usage;
}

function defaultBidSlotForAuction(teamId, auction) {
  const slots = slotsForAuction(auction);
  if (!slots.length) return "";

  const storedSlot = normalizeBidSlot(auction, ui.bidSlots[auction.id]);
  if (storedSlot) return storedSlot;

  const leaderSlot = auction.currentBidder === teamId ? normalizeBidSlot(auction, auction.currentBidSlot) : "";
  if (leaderSlot) return leaderSlot;

  const usage = teamRosterUsage(teamId, auction.id);
  const availableSlot = slots.find((slot) => (usage[slot.slot] || 0) < (ROSTER_LIMITS[slot.slot]?.limit || 0));
  return availableSlot?.slot || slots[0].slot;
}

function rosterBidCheck(teamId, auction, amount, slotId) {
  const key = normalizeBidSlot(auction, slotId) || rosterKeyForAuctionBid(auction, amount, slotId);
  const limit = ROSTER_LIMITS[key];
  if (!key || !limit) return { ok: true, key: "", used: 0, limit: 0, label: "" };

  const usage = teamRosterUsage(teamId, auction.id);
  const used = usage[key] || 0;
  return {
    ok: used < limit.limit,
    key,
    used,
    limit: limit.limit,
    label: limit.label,
  };
}

function hasAnyRosterCapacityForBid(teamId, auction, available) {
  return slotsForAuction(auction).some((slot) => {
    const min = minimumBidForSlot(auction, slot.slot);
    return available >= min && rosterBidCheck(teamId, auction, min, slot.slot).ok;
  });
}

function teamStats(teamId) {
  const team = state.config?.teams?.[teamId] || {};
  const budget = Number(team.budget || 0);
  const spent = teamRoster(teamId).reduce((sum, [, signing]) => sum + Number(signing.cost || 0), 0);
  const committed = activeAuctions()
    .filter((auction) => auction.currentBidder === teamId)
    .reduce((sum, auction) => sum + Number(auction.currentBid || 0), 0);
  return {
    budget,
    spent,
    committed,
    available: budget - spent - committed,
  };
}

function budgetBar(teamId) {
  const { budget, spent, committed, available } = teamStats(teamId);
  const spentPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const committedPct = budget > 0 ? Math.min(100 - spentPct, (committed / budget) * 100) : 0;
  return `
    <div class="budget-bar">
      <div class="budget-fill">
        <div class="spent" style="width:${spentPct}%"></div>
        <div class="committed" style="width:${committedPct}%"></div>
      </div>
    </div>
    <div class="budget-legend">
      <span><i class="dot spent"></i>${money(spent)} gastado</span>
      ${committed > 0 ? `<span><i class="dot committed"></i>${money(committed)} en pujas</span>` : ""}
      <span class="budget-free ${available < 0 ? "negative" : ""}">
        ${available < 0 ? "-" : "+"}${money(Math.abs(available))} libre
      </span>
    </div>
  `;
}

function getAllPool() {
  const drivers = Object.values(state.pool?.drivers || {}).map((item) => ({
    ...item,
    cat: "driver",
  }));
  const staff = Object.values(state.pool?.staff || {}).map((item) => ({
    ...item,
    cat: item.cat || "raceEngineer",
  }));
  return [...drivers, ...staff];
}

function usedItemIds() {
  const ids = new Set();
  const periodId = currentMarketId();
  Object.values(state.auctions || {}).forEach((auction) => {
    if (!auction?.itemId) return;
    const samePeriod = periodId
      ? auction.marketId === periodId
      : !auction.marketId;
    if (samePeriod && ["active", "completed", "cancelled"].includes(auction.status)) {
      ids.add(auction.itemId);
    }
  });
  return ids;
}

function availablePoolFor(searchText, filter, sort = "rating-desc") {
  const used = usedItemIds();
  const search = String(searchText || "").trim().toLowerCase();
  const items = getAllPool()
    .filter((item) => !used.has(item.id))
    .filter((item) => filter === "all" || item.cat === filter)
    .filter((item) => !search || String(item.name || "").toLowerCase().includes(search));
  return sortAuctions(items, sort);
}

function availablePool() {
  return availablePoolFor(ui.poolSearch, ui.poolFilter, ui.poolSort);
}

function parseGameFormat(text) {
  const lines = String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const result = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^\d+$/.test(lines[i]) && i + 1 < lines.length && /^\d+$/.test(lines[i + 1])) {
      const name = lines[i].replace(/([a-zA-Z])([A-Z]{2,})/g, "$1 $2").trim();
      result.push({ name, rating: Number.parseInt(lines[i + 1], 10) });
      i += 2;
    } else {
      i += 1;
    }
  }
  return result;
}

function normalizeLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function bidEntries(auction, teamFilter = "all") {
  return Object.entries(auction.bids || {})
    .filter(([, bid]) => bid)
    .filter(([, bid]) => !teamFilter || teamFilter === "all" || bid.teamId === teamFilter)
    .sort(([, a], [, b]) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

function allBids(auction, teamFilter = "all") {
  return bidEntries(auction, teamFilter).map(([, bid]) => bid);
}

function latestBidEntry(auction) {
  if (auction?.lastBidKey && auction?.bids?.[auction.lastBidKey]) {
    return { key: auction.lastBidKey, bid: auction.bids[auction.lastBidKey] };
  }
  const entry = bidEntries(auction)[0];
  return entry ? { key: entry[0], bid: entry[1] } : null;
}

function undoWindowState(auction, teamId = "") {
  const latest = latestBidEntry(auction);
  const latestBid = latest?.bid || null;
  const latestTeam = latestBid?.teamId || "";
  const isLeaderBid = latestTeam && latestTeam === auction?.currentBidder;
  const until = isLeaderBid ? Number(latestBid?.timestamp || 0) + UNDO_WINDOW_MS : 0;
  const remaining = until - Date.now();
  const active = Boolean(auction && auction.status === "active" && latest && isLeaderBid && remaining > 0);
  return {
    active,
    canUndo: active && latestTeam === teamId,
    until,
    remaining: Math.max(0, remaining),
    latestKey: latest?.key || "",
    latestBid,
    teamId: latestTeam,
  };
}

function buildBidRecord(currentAuction, bid) {
  const previous = latestBidEntry(currentAuction);
  return cleanRecord({
    teamId: bid.teamId,
    amount: bid.amount,
    timestamp: bid.timestamp,
    bidderUid: bid.bidderUid,
    bidderEmail: bid.bidderEmail,
    slot: bid.slot || null,
    bidRole: bid.bidRole || null,
    previousBidKey: previous?.key || null,
    previousBid: Number(currentAuction?.currentBid || 0),
    previousBidder: currentAuction?.currentBidder || null,
    previousBidderUid: currentAuction?.currentBidderUid || null,
    previousBidderEmail: currentAuction?.currentBidderEmail || null,
    previousBidSlot: currentAuction?.currentBidSlot || null,
    previousBidRole: currentAuction?.currentBidRole || null,
  });
}

function lastBids(auction, teamFilter = "all") {
  return allBids(auction, teamFilter).slice(0, 3);
}

function bidCountLabel(auction, teamFilter = "all") {
  if (!teamFilter || teamFilter === "all") return `${Object.keys(auction.bids || {}).length} pujas`;
  return `${allBids(auction, teamFilter).length} pujas de ${teamName(teamFilter)}`;
}

function renderBidRows(auction, teamFilter = "all") {
  const bids = allBids(auction, teamFilter);
  if (!bids.length) {
    return `<div class="fine">${teamFilter && teamFilter !== "all" ? `Sin pujas registradas de ${escapeHtml(teamName(teamFilter))}.` : "Sin pujas todavia."}</div>`;
  }

  return `
    <div class="bid-list">
      ${bids.map((bid) => `
        <div class="bid-row ${bid.teamId === auction.currentBidder ? "bid-leader" : ""}">
          <div class="grow">
            <strong>${escapeHtml(teamName(bid.teamId))}</strong>
            <span class="fine">${new Date(Number(bid.timestamp || Date.now())).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <div class="metric">${money(bid.amount)}${bidSlotSuffix(auction, bid.amount, bid.slot)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBidFormatCard() {
  return `
    <div class="card bid-format-card">
      <div class="label">Formato de pujas</div>
      <div class="rule-grid">
        <div>
          <strong>Primera puja</strong>
          <span>Pilotos: reserva puede iniciar a mitad del precio base; titular/base mantiene el valor completo.</span>
        </div>
        <div>
          <strong>Incremento</strong>
          <span>Minimo ${money(BID)} por encima de la lider.</span>
        </div>
        <div>
          <strong>Reloj</strong>
          <span>Empieza con la primera puja y se muestra como tiempo restante.</span>
        </div>
        <div>
          <strong>Periodo</strong>
          <span>Un item cerrado no se reabre hasta otro mercado.</span>
        </div>
        <div>
          <strong>Presupuesto</strong>
          <span>Solo se acepta si el equipo tiene dinero libre.</span>
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (state.fatal) {
    appEl.innerHTML = renderFatal(state.fatal);
    return;
  }

  if (!firebaseIsConfigured(firebaseConfig)) {
    appEl.innerHTML = renderSetupNeeded();
    return;
  }

  if (!state.authReady) {
    appEl.innerHTML = `
      <section class="loading">
        <div class="brand-mark">F1 MANAGER</div>
        <div class="muted">Preparando acceso seguro...</div>
      </section>
    `;
    return;
  }

  if (!state.session) {
    appEl.innerHTML = renderLogin();
    bindEvents();
    return;
  }

  if (!loadedAll() || !state.config) {
    appEl.innerHTML = `
      <section class="loading">
        <div class="brand-mark">F1 MANAGER</div>
        <div class="muted">Cargando datos protegidos...</div>
      </section>
    `;
    return;
  }

  if (state.session.type === "admin") {
    appEl.innerHTML = renderAdmin();
    bindEvents();
    return;
  }

  if (!state.config.teams[state.session.teamId]) {
    state.session = null;
    appEl.innerHTML = renderLogin();
    bindEvents();
    return;
  }

  appEl.innerHTML = renderTeam();
  bindEvents();
}

function renderFatal(message) {
  return `
    <section class="setup-card">
      <div class="card">
        <div class="title">No pude iniciar la app</div>
        <p class="muted">${escapeHtml(message)}</p>
      </div>
    </section>
  `;
}

function renderSetupNeeded() {
  return `
    <section class="setup-card">
      <div class="card">
        <div class="brand-mark">F1 MANAGER</div>
        <p class="muted">
          Falta configurar Firebase. Abri <code>firebase-config.js</code> y reemplaza los valores
          <code>TU_API_KEY</code>, <code>TU_PROYECTO</code>, <code>TU_SENDER_ID</code> y <code>TU_APP_ID</code>.
        </p>
        <p class="fine">
          Esta version no usa npm. Solo descarga Firebase desde el CDN oficial cuando la config ya esta completa.
        </p>
      </div>
    </section>
  `;
}

function renderLogin() {
  const teams = Object.entries(state.config?.teams || cloneDefaultTeams());
  return `
    <section class="login">
      <div class="login-head">
        <div class="brand-mark">F1 MANAGER</div>
        <div class="subtitle">Mercado</div>
        <div class="gold-line"></div>
      </div>

      <div class="segmented">
        <button class="tab ${ui.loginMode === "team" ? "btn-primary" : ""}" data-action="login-mode" data-mode="team">EQUIPO</button>
        <button class="tab ${ui.loginMode === "admin" ? "btn-gold" : ""}" data-action="login-mode" data-mode="admin">ADMIN</button>
      </div>

      <div class="stack">
        <div class="notice auth-notice">
          Acceso protegido con Firebase Auth. La clave debe existir en Authentication.
        </div>
        ${ui.loginMode === "team" ? `
          <select id="login-team">
            <option value="">Selecciona tu equipo...</option>
            ${teams.map(([id, team]) => `
              <option value="${attr(id)}" ${ui.loginTeam === id ? "selected" : ""}>
                ${escapeHtml(team.name)} - ${escapeHtml(team.manager)}
              </option>
            `).join("")}
          </select>
        ` : ""}
        <input id="login-pin" type="password" placeholder="Clave Firebase" value="${attr(ui.loginPin)}" autocomplete="off" ${ui.loginBusy ? "disabled" : ""} />
        <button class="btn-primary btn-strong" data-action="login" ${ui.loginBusy ? "disabled" : ""}>
          ${ui.loginBusy ? "ENTRANDO..." : "INGRESAR"}
        </button>
        <div class="fine">
          ${ui.loginMode === "admin"
            ? `Cuenta: ${escapeHtml(ADMIN_EMAIL)}`
            : ui.loginTeam ? `Cuenta: ${escapeHtml(authEmailForTeam(ui.loginTeam))}` : "Selecciona un equipo para ver su cuenta."}
        </div>
      </div>
      ${ui.loginError ? `<div class="error">${escapeHtml(ui.loginError)}</div>` : ""}
    </section>
  `;
}

function renderTeam() {
  const teamId = state.session.teamId;
  const team = state.config.teams[teamId];
  const live = activeAuctions();
  const myBids = live.filter((auction) => teamHasBid(auction, teamId));
  const won = teamRoster(teamId);
  const teamPool = availablePoolFor(ui.teamPoolSearch, ui.teamPoolFilter, ui.teamPoolSort);
  const outbid = live.filter((auction) => {
    if (auction.currentBidder === teamId) return false;
    if (ui.dismissedOutbid.has(auction.id)) return false;
    return Object.values(auction.bids || {}).some((bid) => bid.teamId === teamId);
  });

  return `
    <section>
      <header class="topbar">
        <div class="topbar-main">
          <div class="team-name">${escapeHtml(team.name)}</div>
          <div class="subtitle">${escapeHtml(team.manager)}</div>
          ${budgetBar(teamId)}
        </div>
        <button data-action="logout">Salir</button>
      </header>

      ${outbid.length ? `
        <div class="notice split">
          <div>
            <strong>Te superaron en ${outbid.length === 1 ? "una subasta" : `${outbid.length} subastas`}.</strong>
            <div class="fine">${outbid.map((auction) => escapeHtml(auction.itemName)).join(", ")}</div>
          </div>
          <button class="btn-warn" data-action="dismiss-outbid">Ocultar</button>
        </div>
      ` : ""}

      <nav class="tabs">
        <button class="tab ${ui.teamTab === "live" ? "btn-primary" : ""}" data-team-tab="live">Subastas activas (${live.length})</button>
        <button class="tab ${ui.teamTab === "bids" ? "btn-primary" : ""}" data-team-tab="bids">Mis pujas (${myBids.length})</button>
        <button class="tab ${ui.teamTab === "pool" ? "btn-primary" : ""}" data-team-tab="pool">Abrir subasta (${teamPool.length})</button>
        <button class="tab ${ui.teamTab === "won" ? "btn-primary" : ""}" data-team-tab="won">Mis fichajes (${won.length})</button>
      </nav>

      ${ui.teamTab === "won"
        ? renderTeamWon(teamId, won)
        : ui.teamTab === "pool"
          ? renderTeamPool(teamPool)
          : ui.teamTab === "bids"
            ? renderTeamBids(teamId, myBids)
            : renderTeamLive(teamId, live)}
    </section>
  `;
}

function renderMarketNotice() {
  if (marketIsOpen()) {
    return `
      <div class="notice market-open">
        Mercado abierto. Periodo ${escapeHtml(currentMarketId())}.
      </div>
    `;
  }
  return `
    <div class="notice">
      Mercado cerrado. No se pueden abrir nuevas subastas hasta que el admin inicie otro periodo.
    </div>
  `;
}

function renderTeamPool(items) {
  return `
    ${renderMarketNotice()}
    <div class="filters">
      <input id="team-pool-search" placeholder="Buscar en pool..." value="${attr(ui.teamPoolSearch)}" />
      <select id="team-pool-filter">
        <option value="all" ${ui.teamPoolFilter === "all" ? "selected" : ""}>Todos</option>
        <option value="driver" ${ui.teamPoolFilter === "driver" ? "selected" : ""}>Pilotos</option>
        ${STAFF_CATS.map((cat) => `
          <option value="${attr(cat)}" ${ui.teamPoolFilter === cat ? "selected" : ""}>${escapeHtml(CAT_LABEL[cat])}</option>
        `).join("")}
      </select>
      <select id="team-pool-sort">
        ${auctionSortOptionsHtml(ui.teamPoolSort)}
      </select>
    </div>
    ${items.length ? `
      <div class="stack">
        ${items.map((item) => renderPoolItem(item, { canOpen: marketIsOpen(), label: "Abrir con minima" })).join("")}
      </div>
    ` : `<div class="card muted">No hay items disponibles para este periodo de mercado.</div>`}
  `;
}

function renderTeamLive(teamId, live) {
  if (!live.length) {
    return `<div class="empty"><div class="muted">No hay subastas abiertas en este momento.</div></div>`;
  }
  const filtered = visibleAuctions(live, ui.teamAuctionFilter, ui.teamAuctionSort);
  return `
    ${renderAuctionFilter("team-auction-filter", ui.teamAuctionFilter, live, filtered, "team-auction-sort", ui.teamAuctionSort)}
    ${filtered.length ? `
      <div class="stack">${filtered.map((auction) => renderTeamAuction(teamId, auction)).join("")}</div>
    ` : `<div class="card muted">No hay subastas con estos filtros.</div>`}
  `;
}

function renderTeamBids(teamId, auctions) {
  if (!auctions.length) {
    return `<div class="empty"><div class="muted">Todavia no participaste en subastas activas.</div></div>`;
  }
  const filtered = visibleAuctions(auctions, ui.teamAuctionFilter, ui.teamAuctionSort);
  return `
    ${renderAuctionFilter("team-auction-filter", ui.teamAuctionFilter, auctions, filtered, "team-auction-sort", ui.teamAuctionSort)}
    ${filtered.length ? `
      <div class="stack">${filtered.map((auction) => renderTeamAuction(teamId, auction, { showBidStatus: true })).join("")}</div>
    ` : `<div class="card muted">No hay pujas propias con estos filtros.</div>`}
  `;
}

function renderTeamAuction(teamId, auction, options = {}) {
  const stats = teamStats(teamId);
  const current = Number(auction.currentBid || 0);
  const base = auctionBasePrice(auction);
  const reserveMin = reserveBidForAuction(auction);
  const firstDriverBid = auction.cat === "driver" && !auction.currentBidder;
  const slots = slotsForAuction(auction);
  const selectedSlot = defaultBidSlotForAuction(teamId, auction);
  const selectedSlotLabel = slotLabel(selectedSlot);
  const min = minimumBidForSlot(auction, selectedSlot);
  const leading = auction.currentBidder === teamId;
  const hasDeadline = Boolean(auction.deadline);
  const expired = hasDeadline && Number(auction.deadline || 0) < Date.now();
  const undo = undoWindowState(auction, teamId);
  const undoBusy = state.undoing.has(`${auction.id}:${teamId}`);
  const bidLocked = undo.active;
  const effectiveAvailable = stats.available + (leading ? current : 0);
  const minRosterCheck = rosterBidCheck(teamId, auction, min, selectedSlot);
  const canBidMin = !expired && !bidLocked && effectiveAvailable >= min && minRosterCheck.ok;
  const canBidCustom = canBidMin;
  const bids = lastBids(auction);
  const wasOutbid = !leading && !ui.dismissedOutbid.has(auction.id) &&
    Object.values(auction.bids || {}).some((bid) => bid.teamId === teamId);
  const participated = teamHasBid(auction, teamId);
  const bidBlockedText = !minRosterCheck.ok
    ? `Cupo completo: ${minRosterCheck.label}.`
    : bidLocked
      ? `La puja de ${teamName(undo.teamId)} esta protegida ${formatShortDuration(undo.remaining)}.`
    : `Minimo para ${selectedSlotLabel || "este slot"}: ${money(min)}.`;
  const classes = [
    "card",
    leading ? "leading" : "",
    expired ? "expired" : "",
    wasOutbid ? "outbid" : "",
  ].join(" ");

  return `
    <article class="${classes}" data-auction-id="${attr(auction.id)}">
      <div class="row row-top">
        ${ratingBadge(auction.rating)}
        <div class="grow">
          <div class="item-name">${escapeHtml(auction.itemName)}</div>
          <div class="muted">${escapeHtml(CAT_LABEL[auction.cat] || auction.cat)}${auction.rating != null ? ` - OVR ${escapeHtml(auction.rating)}` : ""}</div>
        </div>
        <div class="right">
          <div class="${expired ? "pill gold" : "fine"}">${expired ? "Vencio" : hasDeadline ? formatDeadline(auction.deadline) : "Sin reloj"}</div>
          <div class="fine">${Object.keys(auction.bids || {}).length} pujas</div>
        </div>
      </div>

      ${wasOutbid ? `<div class="pill red" style="margin-top:10px;">Te superaron - puja minima ${money(min)}</div>` : ""}
      ${options.showBidStatus && participated ? `
        <div class="pill ${leading ? "green" : "red"}" style="margin-top:10px;">
          ${leading ? "Estas liderando esta puja" : "Te superaron en esta puja"}
        </div>
      ` : ""}
      ${undo.active ? `
        <div class="notice undo-window split wrap">
          <div>
            <strong>${undo.canUndo ? "Puedes arrepentirte de esta puja." : `Puja protegida de ${escapeHtml(teamName(undo.teamId))}.`}</strong>
            <div class="fine">${undo.canUndo ? "Nadie puede subirla mientras tanto." : "No se puede levantar hasta que cierre la ventana."} Quedan ${escapeHtml(formatShortDuration(undo.remaining))}.</div>
          </div>
          ${undo.canUndo ? `<button class="btn-warn" data-action="undo-bid" ${undoBusy ? "disabled" : ""}>Arrepentirme</button>` : ""}
        </div>
      ` : ""}
      ${!canBidCustom && !expired && !undo.active ? `<div class="pill red" style="margin-top:10px;">${escapeHtml(bidBlockedText)}</div>` : ""}

      <div class="row wrap" style="margin-top:12px;">
        <div class="price">${money(current)}</div>
        <div class="muted">
          ${auction.currentBidder
            ? `${leading ? "tu puja lidera" : `lidera ${escapeHtml(teamName(auction.currentBidder))}`}${bidSlotSuffix(auction, current, auction.currentBidSlot)}`
            : firstDriverBid
              ? `sin pujas - reserva desde ${money(reserveMin)} - titular ${money(base)}`
              : "sin pujas - precio base"}
        </div>
      </div>

      ${leading && !expired ? `<div class="pill green" style="margin-top:8px;">Vas ganando</div>` : ""}

      ${bids.length > 1 ? `
        <div class="fine" style="margin-top:8px;">
          Ultimas: ${bids.map((bid) => `${escapeHtml(teamName(bid.teamId))} ${money(bid.amount)}${bidSlotSuffix(auction, bid.amount, bid.slot)}`).join(" - ")}
        </div>
      ` : ""}

      ${expired ? `
        <div class="muted" style="margin-top:12px;">Pendiente de cierre por admin.</div>
      ` : `
        <div class="grid-3" style="margin-top:12px;">
          ${renderBidSlotSelect(auction, selectedSlot, expired)}
          <input data-bid-input="${attr(auction.id)}" type="number" step="0.5" min="${min / M}" placeholder="min ${money(min)}" value="${attr(ui.bidInputs[auction.id] || "")}" ${canBidCustom ? "" : "disabled"} />
          <button data-action="bid-min" ${canBidMin ? "" : "disabled"}>Minima</button>
        </div>
        <button class="${canBidCustom ? "btn-success" : ""} btn-strong" data-action="bid-custom" ${canBidCustom ? "" : "disabled"} style="width:100%; margin-top:8px;">PUJAR</button>
      `}
    </article>
  `;
}

function renderBidSlotSelect(auction, selectedSlot, disabled = false) {
  const slots = slotsForAuction(auction);
  if (!slots.length) return `<span class="pill">Sin slot</span>`;

  return `
    <select data-bid-slot="${attr(auction.id)}" ${disabled || slots.length === 1 ? "disabled" : ""}>
      ${slots.map((slot) => `
        <option value="${attr(slot.slot)}" ${selectedSlot === slot.slot ? "selected" : ""}>${escapeHtml(slot.label)}</option>
      `).join("")}
    </select>
  `;
}

function confirmBid(auction, teamId, amount, slotId) {
  if (!Number.isFinite(amount)) {
    alert("Importe invalido.");
    return false;
  }

  const leading = auction.currentBidder === teamId;
  const leaderLine = auction.currentBidder
    ? `Puja lider actual: ${teamName(auction.currentBidder)} por ${money(auction.currentBid)}.`
    : "Todavia no hay pujas.";
  const warningLine = leading
    ? "Ya lideras esta subasta; confirmar subira tu propio precio."
    : "Revisa el importe antes de confirmar.";
  const message = [
    `Confirmar puja por ${auction.itemName}?`,
    `Equipo: ${teamName(teamId)}`,
    `Slot: ${slotLabel(slotId) || CAT_LABEL[auction.cat] || auction.cat}`,
    `Importe: ${money(amount)}`,
    leaderLine,
    warningLine,
    "Tendras 2 minutos para arrepentirte; durante ese tiempo nadie puede levantarla.",
  ].join("\n");

  return window.confirm(message);
}

function renderTeamWon(teamId, won) {
  if (!won.length) {
    return `<div class="empty"><div class="muted">Todavia no tenes fichajes.</div></div>`;
  }
  const stats = teamStats(teamId);
  return `
    <div class="stack">
      ${won.map(([, signing]) => renderSigning(signing)).join("")}
      <div class="card split">
        <span class="muted">Total gastado</span>
        <strong>${money(stats.spent)} de ${money(stats.budget)}</strong>
      </div>
    </div>
  `;
}

function renderSigning(signing, controls = "") {
  const slotLabel = signing.slot ? ROSTER.find((slot) => slot.slot === signing.slot)?.label : "";
  return `
    <div class="card">
      <div class="row">
        ${ratingBadge(signing.rating)}
        <div class="grow">
          <div class="item-name">${escapeHtml(signing.itemName)}</div>
          <div class="${slotLabel ? "muted" : "pill gold"}">
            ${slotLabel || "Rol pendiente de asignacion"}${signing.reserveOnly ? " - Reserva" : ""}
          </div>
        </div>
        <div class="metric">${money(signing.cost)}</div>
        ${controls}
      </div>
    </div>
  `;
}

function renderAdmin() {
  const tabs = [
    ["subastas", "Subastas"],
    ["pool", "Pool"],
    ["importar", "Importar"],
    ["equipos", "Equipos"],
    ["historial", "Historial"],
  ];
  return `
    <section>
      <header class="topbar">
        <div class="topbar-main">
          <div class="title">PANEL ADMIN</div>
          <div class="subtitle">F1 Manager</div>
        </div>
        <button data-action="logout">Salir</button>
      </header>

      <nav class="tabs">
        ${tabs.map(([id, label]) => `
          <button class="tab ${ui.adminTab === id ? "btn-primary" : ""}" data-admin-tab="${id}">
            ${escapeHtml(label)}
          </button>
        `).join("")}
      </nav>

      ${renderAdminTab()}
    </section>
  `;
}

function renderAdminTab() {
  if (ui.adminTab === "pool") return renderAdminPool();
  if (ui.adminTab === "importar") return renderAdminImport();
  if (ui.adminTab === "equipos") return renderAdminTeams();
  if (ui.adminTab === "historial") return renderAdminHistory();
  return renderAdminAuctions();
}

function renderAdminAuctions() {
  const live = activeAuctions();
  const filtered = visibleAuctions(live, ui.adminAuctionFilter, ui.adminAuctionSort, ui.adminAuctionTeamFilter, "leading");
  if (!live.length) {
    return `
      ${renderMarketControl()}
      ${renderBidFormatCard()}
      <div class="label">Subastas activas (0)</div>
      <div class="card muted">Sin subastas abiertas. Inicia el mercado para que los equipos puedan abrirlas desde su pool.</div>
    `;
  }
  return `
    ${renderMarketControl()}
    ${renderBidFormatCard()}
    <div class="label">Subastas activas (${live.length})</div>
    ${renderAuctionFilter("admin-auction-filter", ui.adminAuctionFilter, live, filtered, "admin-auction-sort", ui.adminAuctionSort, "admin-auction-team-filter", ui.adminAuctionTeamFilter, "leading")}
    ${filtered.length ? `
      <div class="stack">${filtered.map((auction) => renderAdminAuction(auction, ui.adminAuctionTeamFilter)).join("")}</div>
    ` : `<div class="card muted">No hay subastas con estos filtros.</div>`}
  `;
}

function renderMarketControl() {
  const open = marketIsOpen();
  return `
    <div class="card market-control">
      <div class="split wrap">
        <div class="grow">
          <div class="label">Estado del mercado</div>
          <div class="item-name">${open ? "Mercado abierto" : "Mercado cerrado"}</div>
          <div class="muted">
            ${open
              ? `Periodo ${escapeHtml(currentMarketId())} - los equipos pueden abrir subastas.`
              : "Los equipos no pueden abrir subastas nuevas."}
          </div>
        </div>
        <button class="${open ? "btn-danger" : "btn-success"} btn-strong" data-action="${open ? "close-market" : "start-market"}">
          ${open ? "Cerrar mercado" : "Iniciar mercado"}
        </button>
      </div>
    </div>
  `;
}

function renderAdminAuction(auction, teamFilter = "all") {
  const hasDeadline = Boolean(auction.deadline);
  const expired = hasDeadline && Number(auction.deadline || 0) < Date.now();
  const undo = undoWindowState(auction);
  const bids = lastBids(auction, teamFilter);
  return `
    <article class="card ${expired ? "expired" : ""}" data-auction-id="${attr(auction.id)}">
      <div class="row row-top">
        ${ratingBadge(auction.rating)}
        <div class="grow">
          <div class="item-name">${escapeHtml(auction.itemName)}</div>
          <div class="muted">
            <strong>${money(auction.currentBid)}</strong>
            ${auction.currentBidder ? ` - ${escapeHtml(teamName(auction.currentBidder))}${bidSlotSuffix(auction, auction.currentBid, auction.currentBidSlot)}` : " - sin pujas"}
            - ${escapeHtml(bidCountLabel(auction, teamFilter))}
          </div>
          ${bids.length ? `
            <div class="fine">
              Ultimas: ${bids.map((bid) => `${escapeHtml(teamName(bid.teamId))} ${money(bid.amount)}${bidSlotSuffix(auction, bid.amount, bid.slot)}`).join(" - ")}
            </div>
          ` : ""}
          <div class="bid-panel">
            <div class="label">Pujas recibidas</div>
            ${renderBidRows(auction, teamFilter)}
          </div>
        </div>
        <div class="right">
          <div class="${expired ? "pill gold" : "fine"}">${expired ? "Vencio" : hasDeadline ? formatDeadline(auction.deadline) : "Sin reloj"}</div>
          ${undo.active ? `<div class="pill gold" style="margin-top:7px;">Protegida ${escapeHtml(formatShortDuration(undo.remaining))}</div>` : ""}
          <button class="btn-danger" data-action="close-auction" style="margin-top:7px;">Cerrar</button>
        </div>
      </div>
    </article>
  `;
}

function renderAdminPool() {
  const items = availablePool();
  const all = getAllPool();
  return `
    <div class="filters">
      <input id="pool-search" placeholder="Buscar..." value="${attr(ui.poolSearch)}" />
      <select id="pool-filter">
        <option value="all" ${ui.poolFilter === "all" ? "selected" : ""}>Todos</option>
        <option value="driver" ${ui.poolFilter === "driver" ? "selected" : ""}>Pilotos</option>
        ${STAFF_CATS.map((cat) => `
          <option value="${attr(cat)}" ${ui.poolFilter === cat ? "selected" : ""}>${escapeHtml(CAT_LABEL[cat])}</option>
        `).join("")}
      </select>
      <select id="pool-sort">
        ${auctionSortOptionsHtml(ui.poolSort)}
      </select>
    </div>
    <div class="muted" style="margin-bottom:10px;">${items.length} disponibles - ${all.length} en pool total</div>
    ${items.length ? `
      <div class="stack">
        ${items.map((item) => renderPoolItem(item, { canOpen: false, label: "Disponible" })).join("")}
      </div>
    ` : `<div class="card muted">Pool vacio. Importa pilotos y staff desde la pestana Importar.</div>`}
  `;
}

function poolAuctionDraft(item) {
  const basePrice = Number(item.basePrice || minBidFor(item.cat, item.rating || 0));
  return {
    id: auctionKeyFor(item.id),
    itemId: item.id,
    itemName: item.name,
    rating: item.rating ?? null,
    cat: item.cat,
    catLabel: CAT_LABEL[item.cat] || item.cat,
    basePrice,
    currentBid: basePrice,
    currentBidder: null,
  };
}

function renderPoolItem(item, options = {}) {
  const canOpen = options.canOpen ?? true;
  const label = options.label || "Subastar";
  const draft = poolAuctionDraft(item);
  const teamId = state.session?.type === "team" ? state.session.teamId : "";
  const selectedSlot = teamId ? defaultBidSlotForAuction(teamId, draft) : "";
  const openingAmount = teamId ? minimumBidForSlot(draft, selectedSlot) : Number(draft.currentBid || 0);
  const actionLabel = canOpen ? `${label} ${money(openingAmount)}` : label;
  return `
    <article class="card" data-item-id="${attr(item.id)}">
      <div class="row">
        ${ratingBadge(item.rating)}
        <div class="grow">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="muted">
            ${escapeHtml(CAT_LABEL[item.cat] || item.cat)}
            ${item.rating != null ? ` - OVR ${escapeHtml(item.rating)}` : ""}
            - desde ${money(item.basePrice || minBidFor(item.cat, item.rating || 0))}
            ${item.cat === "driver" ? ` - reserva ${money((item.basePrice || minBidFor(item.cat, item.rating || 0)) / 2)}` : ""}
          </div>
        </div>
        ${canOpen ? `
          <div class="pool-actions">
            ${renderBidSlotSelect(draft, selectedSlot, !canOpen)}
            <button class="btn-success btn-strong" data-action="open-auction">${escapeHtml(actionLabel)}</button>
          </div>
        ` : `
          <button class="btn-strong" data-action="open-auction" disabled>${escapeHtml(actionLabel)}</button>
        `}
      </div>
    </article>
  `;
}

function renderSavePreview(items) {
  if (!items.length) return `<div class="fine">Sin registros detectados.</div>`;

  return `
    <div class="save-preview-list">
      ${items.slice(0, 5).map((item) => `
        <div class="save-preview-row">
          ${ratingBadge(item.rating)}
          <div class="grow">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="fine">${escapeHtml(CAT_LABEL[item.cat] || item.cat || "Piloto")}</div>
          </div>
        </div>
      `).join("")}
      ${items.length > 5 ? `<div class="fine">+${items.length - 5} mas</div>` : ""}
    </div>
  `;
}

function renderSaveImportCard() {
  const save = ui.saveImportResult;
  const drivers = save?.drivers || [];
  const staff = save?.staff || [];
  const hasItems = drivers.length || staff.length;

  return `
    <div class="card">
      <div class="label">Importar desde save</div>
      <p class="muted">Carga un .sav y lee la media de pilotos e ingenieros desde la base interna.</p>
      <input id="save-file-input" type="file" accept=".sav" />
      <div class="split wrap" style="margin-top:10px;">
        <span class="muted">${ui.saveImportName ? escapeHtml(ui.saveImportName) : "Ningun save seleccionado"}</span>
        <button class="${ui.saveImportFile ? "btn-primary" : ""}" data-action="read-save" ${ui.saveImportFile && !ui.saveImportBusy ? "" : "disabled"}>
          ${ui.saveImportBusy ? "Leyendo..." : "Leer save"}
        </button>
      </div>
      ${ui.saveImportStatus ? `<div class="fine save-status">${escapeHtml(ui.saveImportStatus)}</div>` : ""}
      ${ui.saveImportError ? `<div class="error left">${escapeHtml(ui.saveImportError)}</div>` : ""}

      ${save ? `
        <div class="save-summary">
          <div class="save-metrics">
            <div><strong>${drivers.length}</strong><span>Pilotos</span></div>
            <div><strong>${staff.length}</strong><span>Staff</span></div>
            <div><strong>${formatBytes(save.databaseSize)}</strong><span>SQLite</span></div>
          </div>
          <div class="fine">Offset ${escapeHtml(save.databaseOffset)} - payload ${formatBytes(save.compressedSize)} - inflado ${formatBytes(save.inflatedSize)}</div>
        </div>

        <div class="grid-2 save-preview-grid">
          <div>
            <div class="label">Pilotos detectados</div>
            ${renderSavePreview(drivers.map((item) => ({ ...item, cat: "driver" })))}
          </div>
          <div>
            <div class="label">Ingenieros detectados</div>
            ${renderSavePreview(staff)}
          </div>
        </div>

        <div class="split wrap" style="margin-top:12px;">
          <button class="${drivers.length ? "btn-primary" : ""}" data-action="import-save-drivers" ${drivers.length ? "" : "disabled"}>Importar pilotos</button>
          <button class="${staff.length ? "btn-primary" : ""}" data-action="import-save-staff" ${staff.length ? "" : "disabled"}>Importar staff</button>
          <button class="${hasItems ? "btn-success" : ""} btn-strong" data-action="import-save-all" ${hasItems ? "" : "disabled"}>Importar todo</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderMoneyImportCard() {
  const money = ui.moneyImportResult;
  const matched = money?.matched || [];
  const unmatched = money?.unmatched || [];

  return `
    <div class="card">
      <div class="label">Importar dinero</div>
      <p class="muted">Carga un JSON de dinero de LigaF1ManagerWeb para actualizar el presupuesto libre de cada equipo.</p>
      <input id="money-file-input" type="file" accept=".json,application/json" />
      <div class="split wrap" style="margin-top:10px;">
        <span class="muted">${ui.moneyImportName ? escapeHtml(ui.moneyImportName) : "Ningun JSON seleccionado"}</span>
        <button class="${ui.moneyImportFile ? "btn-primary" : ""}" data-action="read-money" ${ui.moneyImportFile && !ui.moneyImportBusy ? "" : "disabled"}>
          ${ui.moneyImportBusy ? "Leyendo..." : "Leer dinero"}
        </button>
      </div>
      ${ui.moneyImportStatus ? `<div class="fine save-status">${escapeHtml(ui.moneyImportStatus)}</div>` : ""}
      ${ui.moneyImportError ? `<div class="error left">${escapeHtml(ui.moneyImportError)}</div>` : ""}

      ${money ? `
        <div class="save-summary">
          <div class="save-metrics">
            <div><strong>${matched.length}</strong><span>Equipos listos</span></div>
            <div><strong>${unmatched.length}</strong><span>Sin match</span></div>
            <div><strong>${escapeHtml(ui.moneyImportName || "JSON")}</strong><span>Archivo</span></div>
          </div>
        </div>

        <div class="money-preview-list">
          ${matched.map((item) => `
            <div class="money-preview-row">
              <div class="grow">
                <div class="item-name">${escapeHtml(state.config.teams[item.appTeamId]?.name || item.appTeamId)}</div>
                <div class="fine">${escapeHtml(item.sourceName)} -> ${escapeHtml(item.appTeamId)}</div>
              </div>
              <div class="metric">${moneyValue(item.budgetRemaining)}</div>
            </div>
          `).join("")}
          ${unmatched.map((item) => `
            <div class="money-preview-row unmatched">
              <div class="grow">
                <div class="item-name">${escapeHtml(item.sourceName)}</div>
                <div class="fine">No coincide con ningun equipo local</div>
              </div>
              <div class="metric">${moneyValue(item.budgetRemaining)}</div>
            </div>
          `).join("")}
        </div>

        <div class="split wrap" style="margin-top:12px;">
          <span class="fine">Se ajusta el presupuesto base para que el dinero libre coincida con el JSON.</span>
          <button class="${matched.length ? "btn-success" : ""} btn-strong" data-action="import-money" ${matched.length ? "" : "disabled"}>
            Aplicar dinero
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderAdminImport() {
  const driverCount = parseGameFormat(ui.importDriversText).length;
  const staffCount = parseGameFormat(ui.importStaffText).length;
  return `
    <div class="stack">
      ${renderSaveImportCard()}
      ${renderMoneyImportCard()}

      <div class="card">
        <div class="label">Importar pilotos</div>
        <p class="muted">Pega la lista en formato nombre y OVR en lineas alternadas.</p>
        <textarea id="import-drivers-text" placeholder="MaxVERSTAPPEN&#10;92&#10;FernandoALONSO&#10;90">${escapeHtml(ui.importDriversText)}</textarea>
        <div class="split wrap" style="margin-top:10px;">
          <span class="muted"><span id="driver-detected">${driverCount}</span> pilotos detectados</span>
          <button class="${driverCount ? "btn-primary" : ""}" data-action="import-drivers" ${driverCount ? "" : "disabled"}>Importar al pool</button>
        </div>
      </div>

      <div class="card">
        <div class="label">Importar staff tecnico</div>
        <p class="muted">Selecciona la categoria y pega la lista con el mismo formato.</p>
        <select id="import-staff-cat">
          ${STAFF_CATS.map((cat) => `
            <option value="${attr(cat)}" ${ui.importStaffCat === cat ? "selected" : ""}>${escapeHtml(CAT_LABEL[cat])}</option>
          `).join("")}
        </select>
        <textarea id="import-staff-text" placeholder="JamesALLISON&#10;92&#10;PaulMONAGHAN&#10;88" style="margin-top:10px;">${escapeHtml(ui.importStaffText)}</textarea>
        <div class="split wrap" style="margin-top:10px;">
          <span class="muted"><span id="staff-detected">${staffCount}</span> staff detectados - ${escapeHtml(CAT_LABEL[ui.importStaffCat])}</span>
          <button class="${staffCount ? "btn-primary" : ""}" data-action="import-staff" ${staffCount ? "" : "disabled"}>Importar al pool</button>
        </div>
      </div>

      <div class="card">
        <div class="label">Estado del pool</div>
        <div class="muted">Pilotos: <strong>${Object.keys(state.pool.drivers || {}).length}</strong></div>
        ${STAFF_CATS.map((cat) => {
          const count = Object.values(state.pool.staff || {}).filter((item) => item.cat === cat).length;
          return `<div class="muted">${escapeHtml(CAT_LABEL[cat])}: <strong>${count}</strong></div>`;
        }).join("")}
        ${(Object.keys(state.pool.drivers || {}).length || Object.keys(state.pool.staff || {}).length) ? `
          <button class="btn-danger" data-action="clear-pool" style="margin-top:12px;">Limpiar pool completo</button>
        ` : ""}
      </div>
    </div>
  `;
}

function renderAdminTeams() {
  return `
    <div class="stack">
      ${Object.entries(state.config.teams || {}).map(([teamId, team]) => renderAdminTeam(teamId, team)).join("")}
    </div>
  `;
}

function renderAdminTeam(teamId, team) {
  const stats = teamStats(teamId);
  const signings = teamRoster(teamId);
  return `
    <article class="card" data-team-id="${attr(teamId)}">
      <div class="split">
        <div class="grow">
          <div class="item-name">${escapeHtml(team.name)}</div>
          <div class="muted">${escapeHtml(team.manager)}</div>
        </div>
        <div class="metric ${stats.available < 0 ? "negative" : ""}">
          ${stats.available < 0 ? "-" : "+"}${money(Math.abs(stats.available))}
        </div>
      </div>
      ${budgetBar(teamId)}
      <div class="row wrap" style="margin-top:12px;">
        ${renderBudgetEditor(teamId, team)}
        ${renderAuthEmailPill(teamId, team)}
      </div>
      ${signings.length ? `
        <div class="stack" style="margin-top:12px;">
          ${signings.map(([key, signing]) => renderAdminSigning(teamId, key, signing)).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderBudgetEditor(teamId, team) {
  if (ui.editBudget[teamId] !== undefined) {
    return `
      <input data-edit-budget-input value="${attr(ui.editBudget[teamId])}" type="number" min="0" step="0.5" style="max-width:120px;" />
      <button class="btn-primary" data-action="save-budget">OK</button>
      <button data-action="cancel-budget">Cancelar</button>
    `;
  }
  return `<button data-action="edit-budget">${money(team.budget)}</button>`;
}

function renderAuthEmailPill(teamId, team) {
  return `<span class="pill">Auth ${escapeHtml(team.authEmail || authEmailForTeam(teamId))}</span>`;
}

function renderAdminSigning(teamId, signingKey, signing) {
  const assigning = ui.assign?.teamId === teamId && ui.assign?.key === signingKey;
  const slots = ROSTER.filter((slot) => {
    if (slot.cat !== signing.cat) return false;
    if (signing.cat === "driver" && signing.reserveOnly) return slot.slot === "r1" || slot.slot === "r2";
    return true;
  });
  const controls = assigning ? `
    <select data-slot-select style="max-width:170px;">
      <option value="">Slot...</option>
      ${slots.map((slot) => `
        <option value="${attr(slot.slot)}" ${signing.slot === slot.slot ? "selected" : ""}>${escapeHtml(slot.label)}</option>
      `).join("")}
    </select>
    <button class="btn-success" data-action="save-slot">OK</button>
    <button data-action="cancel-slot">Cancelar</button>
    <button class="btn-danger" data-action="delete-signing">Borrar</button>
  ` : signing.slot ? `
    <span class="pill">${escapeHtml(ROSTER.find((slot) => slot.slot === signing.slot)?.label || signing.slot)}</span>
    <button data-action="edit-slot">Cambiar</button>
    <button class="btn-danger" data-action="delete-signing">Borrar</button>
  ` : `
    <button class="btn-warn" data-action="edit-slot">Asignar slot</button>
    <button class="btn-danger" data-action="delete-signing">Borrar</button>
  `;

  return `
    <div class="signing-row" data-team-id="${attr(teamId)}" data-signing-key="${attr(signingKey)}">
      <div class="row wrap">
          ${ratingBadge(signing.rating)}
        <div class="grow">
          <div class="item-name">${escapeHtml(signing.itemName)}</div>
          <div class="muted">
            ${escapeHtml(CAT_LABEL[signing.cat] || signing.cat)}
            ${signing.reserveOnly ? " - Reserva" : ""}
            - ${money(signing.cost)}
          </div>
        </div>
        ${controls}
      </div>
    </div>
  `;
}

function renderAdminHistory() {
  const hist = historyAuctions();
  if (!hist.length) {
    return `
      ${renderHistoryTools()}
      <div class="card muted">Sin historial aun.</div>
    `;
  }
  const filtered = visibleAuctions(hist, ui.historyAuctionFilter, ui.historyAuctionSort, ui.historyAuctionTeamFilter, "winner");
  const teamFilter = ui.historyAuctionTeamFilter;
  return `
    ${renderHistoryTools()}
    ${renderAuctionFilter("history-auction-filter", ui.historyAuctionFilter, hist, filtered, "history-auction-sort", ui.historyAuctionSort, "history-auction-team-filter", ui.historyAuctionTeamFilter, "winner")}
    ${filtered.length ? `
      <div class="stack">
        ${filtered.map((auction) => `
          <article class="card">
            <div class="row">
              ${ratingBadge(auction.rating)}
              <div class="grow">
                <div class="item-name">${escapeHtml(auction.itemName)}</div>
                <div class="muted">
                  ${auction.winner ? `Gano ${escapeHtml(teamName(auction.winner))} - ${money(auction.currentBid)}${bidSlotSuffix(auction, auction.currentBid, auction.currentBidSlot)}` : "Sin ganador"}
                  - ${escapeHtml(bidCountLabel(auction, teamFilter))}
                </div>
                ${teamFilter && teamFilter !== "all" ? `
                  <div class="bid-panel">
                    <div class="label">Pujas de ${escapeHtml(teamName(teamFilter))}</div>
                    ${renderBidRows(auction, teamFilter)}
                  </div>
                ` : ""}
              </div>
              <div class="fine right">${new Date(Number(auction.closedAt || auction.deadline || Date.now())).toLocaleDateString("es-AR")}</div>
            </div>
          </article>
        `).join("")}
      </div>
    ` : `<div class="card muted">No hay historial con estos filtros.</div>`}
  `;
}

function renderHistoryTools() {
  const allHistory = allHistoryAuctions();
  const resettable = resettableHistoryAuctions();
  const protectedCurrent = allHistory.length - resettable.length;
  const exportRosterCount = exportStaffRows()
    .reduce((sum, team) => sum + team.drivers.length + team.staff.length, 0);
  const rosterCount = Object.values(state.rosters || {})
    .reduce((sum, roster) => sum + Object.values(roster || {}).filter(Boolean).length, 0);

  return `
    <div class="card">
      <div class="split wrap">
        <div class="grow">
          <div class="label">Herramientas de cierre</div>
          <div class="muted">
            Historial: ${allHistory.length} subastas.
            ${protectedCurrent ? `${protectedCurrent} del periodo actual se conservan mientras el mercado siga abierto.` : ""}
          </div>
        </div>
      </div>
      <div class="row wrap" style="margin-top:12px;">
        <button class="btn-primary" data-action="export-money">Exportar dinero</button>
        <button class="btn-primary" data-action="export-staff" ${exportRosterCount ? "" : "disabled"}>Exportar pilotos/staff</button>
        <button class="btn-danger" data-action="clear-rosters" ${rosterCount ? "" : "disabled"}>Limpiar personal</button>
        <button class="btn-danger" data-action="reset-history" ${resettable.length ? "" : "disabled"}>Reiniciar historial</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", onAction);
  });

  document.querySelectorAll("[data-team-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      ui.teamTab = el.dataset.teamTab;
      render();
    });
  });

  document.querySelectorAll("[data-admin-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      ui.adminTab = el.dataset.adminTab;
      render();
    });
  });

  const loginTeam = document.getElementById("login-team");
  if (loginTeam) {
    loginTeam.addEventListener("change", (event) => {
      ui.loginTeam = event.target.value;
    });
  }

  const loginPin = document.getElementById("login-pin");
  if (loginPin) {
    loginPin.addEventListener("input", (event) => {
      ui.loginPin = event.target.value;
    });
    loginPin.addEventListener("keydown", (event) => {
      if (event.key === "Enter") doLogin();
    });
  }

  document.querySelectorAll("[data-bid-input]").forEach((input) => {
    input.addEventListener("input", (event) => {
      ui.bidInputs[event.target.dataset.bidInput] = event.target.value;
    });
  });

  document.querySelectorAll("[data-bid-slot]").forEach((select) => {
    select.addEventListener("change", (event) => {
      ui.bidSlots[event.target.dataset.bidSlot] = event.target.value;
      render();
    });
  });

  const poolSearch = document.getElementById("pool-search");
  if (poolSearch) {
    poolSearch.addEventListener("input", (event) => {
      ui.poolSearch = event.target.value;
      render();
    });
  }

  const poolFilter = document.getElementById("pool-filter");
  if (poolFilter) {
    poolFilter.addEventListener("change", (event) => {
      ui.poolFilter = event.target.value;
      render();
    });
  }

  const poolSort = document.getElementById("pool-sort");
  if (poolSort) {
    poolSort.addEventListener("change", (event) => {
      ui.poolSort = event.target.value;
      render();
    });
  }

  const teamPoolSearch = document.getElementById("team-pool-search");
  if (teamPoolSearch) {
    teamPoolSearch.addEventListener("input", (event) => {
      ui.teamPoolSearch = event.target.value;
      render();
    });
  }

  const teamPoolFilter = document.getElementById("team-pool-filter");
  if (teamPoolFilter) {
    teamPoolFilter.addEventListener("change", (event) => {
      ui.teamPoolFilter = event.target.value;
      render();
    });
  }

  const teamPoolSort = document.getElementById("team-pool-sort");
  if (teamPoolSort) {
    teamPoolSort.addEventListener("change", (event) => {
      ui.teamPoolSort = event.target.value;
      render();
    });
  }

  const teamAuctionFilter = document.getElementById("team-auction-filter");
  if (teamAuctionFilter) {
    teamAuctionFilter.addEventListener("change", (event) => {
      ui.teamAuctionFilter = event.target.value;
      render();
    });
  }

  const teamAuctionSort = document.getElementById("team-auction-sort");
  if (teamAuctionSort) {
    teamAuctionSort.addEventListener("change", (event) => {
      ui.teamAuctionSort = event.target.value;
      render();
    });
  }

  const adminAuctionFilter = document.getElementById("admin-auction-filter");
  if (adminAuctionFilter) {
    adminAuctionFilter.addEventListener("change", (event) => {
      ui.adminAuctionFilter = event.target.value;
      render();
    });
  }

  const adminAuctionTeamFilter = document.getElementById("admin-auction-team-filter");
  if (adminAuctionTeamFilter) {
    adminAuctionTeamFilter.addEventListener("change", (event) => {
      ui.adminAuctionTeamFilter = event.target.value;
      render();
    });
  }

  const adminAuctionSort = document.getElementById("admin-auction-sort");
  if (adminAuctionSort) {
    adminAuctionSort.addEventListener("change", (event) => {
      ui.adminAuctionSort = event.target.value;
      render();
    });
  }

  const historyAuctionFilter = document.getElementById("history-auction-filter");
  if (historyAuctionFilter) {
    historyAuctionFilter.addEventListener("change", (event) => {
      ui.historyAuctionFilter = event.target.value;
      render();
    });
  }

  const historyAuctionTeamFilter = document.getElementById("history-auction-team-filter");
  if (historyAuctionTeamFilter) {
    historyAuctionTeamFilter.addEventListener("change", (event) => {
      ui.historyAuctionTeamFilter = event.target.value;
      render();
    });
  }

  const historyAuctionSort = document.getElementById("history-auction-sort");
  if (historyAuctionSort) {
    historyAuctionSort.addEventListener("change", (event) => {
      ui.historyAuctionSort = event.target.value;
      render();
    });
  }

  const driversText = document.getElementById("import-drivers-text");
  if (driversText) {
    driversText.addEventListener("input", (event) => {
      ui.importDriversText = event.target.value;
      const count = parseGameFormat(ui.importDriversText).length;
      const output = document.getElementById("driver-detected");
      if (output) output.textContent = count;
    });
  }

  const staffText = document.getElementById("import-staff-text");
  if (staffText) {
    staffText.addEventListener("input", (event) => {
      ui.importStaffText = event.target.value;
      const count = parseGameFormat(ui.importStaffText).length;
      const output = document.getElementById("staff-detected");
      if (output) output.textContent = count;
    });
  }

  const staffCat = document.getElementById("import-staff-cat");
  if (staffCat) {
    staffCat.addEventListener("change", (event) => {
      ui.importStaffCat = event.target.value;
      render();
    });
  }

  const saveFileInput = document.getElementById("save-file-input");
  if (saveFileInput) {
    saveFileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      ui.saveImportFile = file;
      ui.saveImportName = file?.name || "";
      ui.saveImportResult = null;
      ui.saveImportError = "";
      ui.saveImportStatus = file ? "Save listo para analizar." : "";
      render();
    });
  }

  const moneyFileInput = document.getElementById("money-file-input");
  if (moneyFileInput) {
    moneyFileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      ui.moneyImportFile = file;
      ui.moneyImportName = file?.name || "";
      ui.moneyImportResult = null;
      ui.moneyImportError = "";
      ui.moneyImportStatus = file ? "JSON listo para analizar." : "";
      render();
    });
  }

  document.querySelectorAll("[data-edit-budget-input]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const card = event.target.closest("[data-team-id]");
      if (card) ui.editBudget[card.dataset.teamId] = event.target.value;
    });
  });

}

async function onAction(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;

  try {
    if (action === "login-mode") {
      ui.loginMode = target.dataset.mode;
      ui.loginError = "";
      ui.loginPin = "";
      render();
      return;
    }

    if (action === "login") return doLogin();
    if (action === "logout") return doLogout();

    if (action === "dismiss-outbid") {
      activeAuctions().forEach((auction) => {
        if (Object.values(auction.bids || {}).some((bid) => bid.teamId === state.session.teamId)) {
          ui.dismissedOutbid.add(auction.id);
        }
      });
      render();
      return;
    }

    if (action === "bid-min" || action === "bid-custom") {
      const card = target.closest("[data-auction-id]");
      const auction = state.auctions[card?.dataset.auctionId];
      if (!auction) return;
      const undo = undoWindowState(auction, state.session.teamId);
      if (undo.active) {
        alert(undo.canUndo
          ? `Todavia puedes arrepentirte durante ${formatShortDuration(undo.remaining)}.`
          : `Esta puja esta protegida durante ${formatShortDuration(undo.remaining)}.`);
        return;
      }
      const slot = defaultBidSlotForAuction(state.session.teamId, auction);
      const amount = action === "bid-min"
        ? minimumBidForSlot(auction, slot)
        : parseMoney(card.querySelector("[data-bid-input]")?.value);
      if (Number.isFinite(amount) && !isHalfMillionStep(amount)) {
        alert(`Las pujas deben ir en saltos de ${money(BID)}.`);
        return;
      }
      if (!confirmBid(auction, state.session.teamId, amount, slot)) return;
      await placeBid(auction.id, amount, state.session.teamId, slot);
      return;
    }

    if (action === "undo-bid") {
      const card = target.closest("[data-auction-id]");
      if (card) await undoBid(card.dataset.auctionId, state.session.teamId);
      return;
    }

    if (action === "close-auction") {
      const card = target.closest("[data-auction-id]");
      if (card) await closeAuction(card.dataset.auctionId);
      return;
    }

    if (action === "start-market") return startMarket();
    if (action === "close-market") return closeMarket();

    if (action === "open-auction") {
      const card = target.closest("[data-item-id]");
      if (card) await openAuction(card.dataset.itemId);
      return;
    }

    if (action === "import-drivers") return importDrivers();
    if (action === "import-staff") return importStaff();
    if (action === "read-save") return readSaveFile();
    if (action === "import-save-drivers") return importSaveItems("drivers");
    if (action === "import-save-staff") return importSaveItems("staff");
    if (action === "import-save-all") return importSaveItems("all");
    if (action === "read-money") return readMoneyFile();
    if (action === "import-money") return importMoneyBudgets();
    if (action === "export-money") return exportMoney();
    if (action === "export-staff") return exportStaff();
    if (action === "reset-history") return resetHistory();
    if (action === "clear-rosters") return clearRosters();
    if (action === "clear-pool") {
      if (window.confirm("Limpiar todo el pool?")) await set(ref(state.db, "pool"), emptyPool());
      return;
    }

    if (action === "edit-budget") {
      const teamId = target.closest("[data-team-id]")?.dataset.teamId;
      if (teamId) ui.editBudget[teamId] = String(Number(state.config.teams[teamId].budget || 0) / M);
      render();
      return;
    }

    if (action === "cancel-budget") {
      const teamId = target.closest("[data-team-id]")?.dataset.teamId;
      if (teamId) delete ui.editBudget[teamId];
      render();
      return;
    }

    if (action === "save-budget") {
      const card = target.closest("[data-team-id]");
      const teamId = card?.dataset.teamId;
      const amount = parseMoney(card?.querySelector("[data-edit-budget-input]")?.value);
      if (!teamId || !Number.isFinite(amount) || amount < 0) return alert("Presupuesto invalido.");
      await update(ref(state.db, `config/teams/${teamId}`), { budget: amount });
      delete ui.editBudget[teamId];
      return;
    }

    if (action === "edit-slot") {
      const card = target.closest("[data-signing-key]");
      if (card) ui.assign = { teamId: card.dataset.teamId, key: card.dataset.signingKey };
      render();
      return;
    }

    if (action === "cancel-slot") {
      ui.assign = null;
      render();
      return;
    }

    if (action === "delete-signing") {
      const card = target.closest("[data-signing-key]");
      const teamId = card?.dataset.teamId;
      const signingKey = card?.dataset.signingKey;
      if (!teamId || !signingKey) return;
      const signing = state.rosters?.[teamId]?.[signingKey];
      if (!signing) return;
      const message = [
        `Borrar ${signing.itemName || "este fichaje"} de ${teamName(teamId)}?`,
        "Esto solo lo saca del personal del equipo.",
        "No borra la subasta ni el historial.",
      ].join("\n");
      if (!window.confirm(message)) return;
      await set(ref(state.db, `rosters/${teamId}/${signingKey}`), null);
      if (ui.assign?.teamId === teamId && ui.assign?.key === signingKey) ui.assign = null;
      return;
    }

    if (action === "save-slot") {
      const card = target.closest("[data-signing-key]");
      const slot = card?.querySelector("[data-slot-select]")?.value;
      if (!card || !slot) return alert("Selecciona un slot.");
      const slotDef = rosterSlot(slot);
      const signing = state.rosters?.[card.dataset.teamId]?.[card.dataset.signingKey];
      if (!slotDef || slotDef.cat !== signing?.cat) {
        return alert("Slot invalido para este fichaje.");
      }
      if (signing?.cat === "driver" && signing.reserveOnly && slot !== "r1" && slot !== "r2") {
        return alert("Este piloto fue ganado como reserva y solo puede ir a RESERVA 1 o RESERVA 2.");
      }
      const duplicate = teamRoster(card.dataset.teamId)
        .some(([key, item]) => key !== card.dataset.signingKey && item?.slot === slot);
      if (duplicate) return alert(`${slotDef.label} ya esta ocupado en este equipo.`);
      const patch = signing?.cat === "driver"
        ? { slot, bidRole: bidRoleForSlot(slot) || null, reserveOnly: isReserveSlot(slot) }
        : { slot };
      await update(ref(state.db, `rosters/${card.dataset.teamId}/${card.dataset.signingKey}`), patch);
      ui.assign = null;
    }
  } catch (error) {
    console.error(error);
    alert(error?.message || "Ocurrio un error.");
  }
}

async function doLogin() {
  ui.loginError = "";
  if (!state.auth || !signInWithEmailAndPassword) {
    ui.loginError = "Firebase Auth todavia no esta listo.";
    render();
    return;
  }

  if (ui.loginMode === "team" && !ui.loginTeam) {
    ui.loginError = "Selecciona tu equipo.";
    render();
    return;
  }

  if (!ui.loginPin) {
    ui.loginError = "Ingresa la clave Firebase.";
    render();
    return;
  }

  const email = ui.loginMode === "admin" ? ADMIN_EMAIL : authEmailForTeam(ui.loginTeam);
  ui.loginBusy = true;
  render();

  try {
    await signInWithEmailAndPassword(state.auth, email, ui.loginPin);
    ui.loginPin = "";
  } catch (error) {
    ui.loginError = authErrorMessage(error);
  } finally {
    ui.loginBusy = false;
    render();
  }
}

async function doLogout() {
  ui.loginPin = "";
  ui.loginError = "";
  state.session = null;
  if (state.auth && firebaseSignOut) {
    await firebaseSignOut(state.auth);
  }
  render();
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Cuenta o clave incorrecta. Revisa Authentication en Firebase.";
  }
  if (code.includes("invalid-email")) return "Email de Firebase invalido.";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Espera un rato y vuelve a probar.";
  return error?.message || "No pude iniciar sesion.";
}

async function placeBid(auctionId, amount, teamId, slotId = "") {
  const auction = state.auctions[auctionId];
  if (!auction || auction.status !== "active") return;
  const slot = normalizeBidSlot(auction, slotId) || defaultBidSlotForAuction(teamId, auction);
  const min = minimumBidForSlot(auction, slot);
  const current = Number(auction.currentBid || 0);
  const stats = teamStats(teamId);
  const available = stats.available + (auction.currentBidder === teamId ? current : 0);
  const rosterCheck = rosterBidCheck(teamId, auction, amount, slot);

  if (!Number.isFinite(amount) || amount < min) {
    alert(`Puja minima: ${money(min)}`);
    return;
  }
  if (!isHalfMillionStep(amount)) {
    alert(`Las pujas deben ir en saltos de ${money(BID)}.`);
    return;
  }
  if (amount > available) {
    alert(`Presupuesto insuficiente. Disponible: ${money(available)}`);
    return;
  }
  if (!rosterCheck.ok) {
    alert(`Cupo completo: ${rosterCheck.label}.`);
    return;
  }

  const bidKey = `${auctionId}:${teamId}`;
  if (state.bidding.has(bidKey)) return;
  state.bidding.add(bidKey);
  const nextBidKey = uid();

  try {
    const result = await runTransaction(ref(state.db, `auctions/${auctionId}`), (currentAuction) => {
      if (!currentAuction || currentAuction.status !== "active") return;
      if (currentAuction.deadline && Number(currentAuction.deadline) < Date.now()) return;
      const txUndo = undoWindowState(currentAuction, teamId);
      if (txUndo.active) return;
      const txSlot = normalizeBidSlot(currentAuction, slot);
      const txMin = minimumBidForSlot(currentAuction, txSlot);
      if (amount < txMin) return;
      if (!isHalfMillionStep(amount)) return;
      const txBidRole = bidRoleForSlot(txSlot);
      const txNow = Date.now();
      const bidderUid = state.session?.uid || state.authUser?.uid || null;
      const bidderEmail = state.session?.email || null;
      const bidRecord = buildBidRecord(currentAuction, {
        teamId,
        amount,
        timestamp: txNow,
        bidderUid,
        bidderEmail,
        slot: txSlot || null,
        bidRole: txBidRole || null,
      });
      return {
        ...currentAuction,
        basePrice: auctionBasePrice(currentAuction),
        currentBid: amount,
        currentBidder: teamId,
        currentBidderUid: bidderUid,
        currentBidderEmail: bidderEmail,
        currentBidSlot: txSlot || null,
        currentBidRole: txBidRole || null,
        deadline: calcDeadline(),
        lastBidKey: nextBidKey,
        lastBidAt: txNow,
        bids: {
          ...(currentAuction.bids || {}),
          [nextBidKey]: bidRecord,
        },
      };
    });

    if (!result.committed) {
      alert("La subasta cambio antes de guardar la puja. Revisa el nuevo minimo.");
      return;
    }

    ui.bidInputs[auctionId] = "";
    delete ui.bidSlots[auctionId];
    ui.dismissedOutbid.delete(auctionId);
  } finally {
    state.bidding.delete(bidKey);
  }
}

async function undoBid(auctionId, teamId) {
  if (!auctionId || !teamId) return;

  const undoKey = `${auctionId}:${teamId}`;
  if (state.undoing.has(undoKey)) return;
  state.undoing.add(undoKey);

  try {
    const result = await runTransaction(ref(state.db, `auctions/${auctionId}`), (currentAuction) => {
      if (!currentAuction || currentAuction.status !== "active") return;
      const undo = undoWindowState(currentAuction, teamId);
      if (!undo.canUndo || !undo.latestKey) return;

      const bids = { ...(currentAuction.bids || {}) };
      const latestBid = bids[undo.latestKey] || undo.latestBid || null;
      delete bids[undo.latestKey];

      const previousKey = latestBid?.previousBidKey || "";
      const previous = previousKey && bids[previousKey]
        ? bids[previousKey]
        : Object.entries(bids)
          .filter(([, bid]) => bid)
          .sort(([, a], [, b]) => {
            const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
            if (amountDiff) return amountDiff;
            return Number(b.timestamp || 0) - Number(a.timestamp || 0);
          })[0]?.[1] || null;

      if (!previous) return null;

      return cleanRecord({
        ...currentAuction,
        basePrice: auctionBasePrice(currentAuction),
        currentBid: Number(previous.amount || 0),
        currentBidder: previous.teamId || null,
        currentBidderUid: previous.bidderUid || null,
        currentBidderEmail: previous.bidderEmail || null,
        currentBidSlot: previous.slot || null,
        currentBidRole: previous.bidRole || bidRoleForAuction(currentAuction, previous.amount, previous.slot) || null,
        lastBidKey: previousKey || latestBidEntry({ bids })?.key || null,
        lastBidAt: Number(previous.timestamp || 0) || null,
        bids,
      });
    });

    if (!result.committed) {
      alert("La ventana de arrepentimiento ya cerro o la subasta cambio.");
      return;
    }

    delete ui.bidInputs[auctionId];
    delete ui.bidSlots[auctionId];
    ui.dismissedOutbid.delete(auctionId);
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.includes("permission_denied")) {
      alert("Firebase bloqueo el arrepentimiento. Hay que publicar las reglas actualizadas.");
      return;
    }
    throw error;
  } finally {
    state.undoing.delete(undoKey);
  }
}

async function openAuction(itemId) {
  if (!marketIsOpen()) {
    alert("El mercado esta cerrado. Espera a que el admin inicie un periodo.");
    return;
  }
  if (state.session?.type !== "team" || !state.session.teamId) {
    alert("Las subastas deben abrirlas los equipos con una puja minima.");
    return;
  }

  const item = getAllPool().find((poolItem) => poolItem.id === itemId);
  if (!item) return;
  if (usedItemIds().has(item.id)) {
    alert("Este item ya tuvo una subasta en el periodo actual.");
    return;
  }

  const teamId = state.session.teamId;
  const auction = poolAuctionDraft(item);
  const auctionId = auction.id;
  const slot = normalizeBidSlot(auction, ui.bidSlots[auctionId]) || defaultBidSlotForAuction(teamId, auction);
  const amount = minimumBidForSlot(auction, slot);
  const stats = teamStats(teamId);
  const rosterCheck = rosterBidCheck(teamId, auction, amount, slot);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Puja minima invalida.");
    return;
  }
  if (!isHalfMillionStep(amount)) {
    alert(`Las pujas deben ir en saltos de ${money(BID)}.`);
    return;
  }
  if (amount > stats.available) {
    alert(`Presupuesto insuficiente. Disponible: ${money(stats.available)}`);
    return;
  }
  if (!rosterCheck.ok) {
    alert(`Cupo completo: ${rosterCheck.label}.`);
    return;
  }

  if (!window.confirm([
    `Abrir subasta por ${item.name}?`,
    `Equipo: ${teamName(teamId)}`,
    `Slot: ${slotLabel(slot) || CAT_LABEL[item.cat] || item.cat}`,
    `Puja inicial: ${money(amount)}`,
    "Esto inicia el reloj de la subasta.",
  ].join("\n"))) return;

  const now = Date.now();
  const bidRole = bidRoleForSlot(slot);
  const bidderUid = state.session?.uid || state.authUser?.uid || null;
  const bidderEmail = state.session?.email || null;
  const openingBidKey = uid();
  const openingBid = buildBidRecord(auction, {
    teamId,
    amount,
    timestamp: now,
    bidderUid,
    bidderEmail,
    slot: slot || null,
    bidRole: bidRole || null,
  });
  const result = await runTransaction(ref(state.db, `auctions/${auctionId}`), (currentAuction) => {
    if (currentAuction) return;
    return {
      ...auction,
      marketId: currentMarketId(),
      openedBy: teamId,
      openedByUid: bidderUid,
      openedByEmail: bidderEmail,
      openedByType: "team",
      currentBid: amount,
      currentBidder: teamId,
      currentBidderUid: bidderUid,
      currentBidderEmail: bidderEmail,
      currentBidSlot: slot || null,
      currentBidRole: bidRole || null,
      deadline: calcDeadline(),
      status: "active",
      winner: null,
      createdAt: now,
      lastBidKey: openingBidKey,
      lastBidAt: now,
      bids: {
        [openingBidKey]: openingBid,
      },
    };
  });

  if (!result.committed) {
    alert("Esta subasta ya fue abierta por otro equipo.");
    return;
  }

  delete ui.bidSlots[auctionId];
}

async function closeAuction(auctionId) {
  if (!auctionId || state.closing.has(auctionId)) return;
  state.closing.add(auctionId);

  try {
    const result = await runTransaction(ref(state.db, `auctions/${auctionId}`), (auction) => {
      if (!auction || auction.status !== "active") return;
      return {
        ...auction,
        status: auction.currentBidder ? "completed" : "cancelled",
        winner: auction.currentBidder || null,
        closedAt: Date.now(),
      };
    });

    if (result.committed) {
      const auction = result.snapshot.val();
      if (auction?.winner) await addRosterSigning(auction);
    }
  } finally {
    state.closing.delete(auctionId);
  }
}

async function addRosterSigning(auction) {
  const key = auction.id || auction.itemId || uid();
  const slot = normalizeBidSlot(auction, auction.currentBidSlot);
  const bidRole = bidRoleForAuction(auction, auction.currentBid, slot);
  const signing = {
    auctionId: auction.id || key,
    itemId: auction.itemId,
    itemName: auction.itemName,
    rating: auction.rating ?? null,
    cat: auction.cat,
    catLabel: auction.catLabel || CAT_LABEL[auction.cat] || auction.cat,
    slot: slot || null,
    cost: Number(auction.currentBid || 0),
    wonAt: Number(auction.closedAt || Date.now()),
    bidRole: bidRole || null,
    reserveOnly: bidRole === "reserve",
  };

  await runTransaction(ref(state.db, `rosters/${auction.winner}/${key}`), (current) => {
    return current || signing;
  });
}

async function importDrivers() {
  const parsed = parseGameFormat(ui.importDriversText);
  if (!parsed.length) return;
  const updates = {};
  parsed.forEach((item) => {
    const id = uid();
    updates[id] = {
      id,
      name: item.name,
      rating: item.rating,
      basePrice: minBidFor("driver", item.rating),
    };
  });
  await update(ref(state.db, "pool/drivers"), updates);
  ui.importDriversText = "";
}

async function importStaff() {
  const parsed = parseGameFormat(ui.importStaffText);
  if (!parsed.length) return;
  const updates = {};
  parsed.forEach((item) => {
    const id = uid();
    updates[id] = {
      id,
      name: item.name,
      rating: item.rating,
      cat: ui.importStaffCat,
      basePrice: minBidFor(ui.importStaffCat, item.rating),
    };
  });
  await update(ref(state.db, "pool/staff"), updates);
  ui.importStaffText = "";
}

async function readSaveFile() {
  if (!ui.saveImportFile) {
    alert("Selecciona un archivo .sav primero.");
    return;
  }

  ui.saveImportBusy = true;
  ui.saveImportError = "";
  ui.saveImportStatus = "Leyendo save y cargando SQLite...";
  render();

  try {
    assertFileSize(ui.saveImportFile, MAX_SAVE_FILE_BYTES, "Save");
    ui.saveImportResult = await extractMarketItemsFromSave(ui.saveImportFile);
    ui.saveImportStatus = `Lectura completa: ${ui.saveImportResult.drivers.length} pilotos y ${ui.saveImportResult.staff.length} staff.`;
  } catch (error) {
    ui.saveImportResult = null;
    ui.saveImportError = error.message || String(error);
    ui.saveImportStatus = "";
  } finally {
    ui.saveImportBusy = false;
    render();
  }
}

async function importSaveItems(kind) {
  const save = ui.saveImportResult;
  if (!save) return;

  let driverCount = 0;
  let staffCount = 0;

  if (kind === "drivers" || kind === "all") {
    const driverUpdates = {};
    save.drivers.forEach((item) => {
      driverUpdates[item.id] = cleanRecord({
        id: item.id,
        name: item.name,
        rating: item.rating,
        basePrice: minBidFor("driver", item.rating),
        source: "save",
        sourceId: item.sourceId,
        teamId: item.teamId,
      });
    });
    driverCount = Object.keys(driverUpdates).length;
    if (driverCount) await update(ref(state.db, "pool/drivers"), driverUpdates);
  }

  if (kind === "staff" || kind === "all") {
    const staffUpdates = {};
    save.staff.forEach((item) => {
      staffUpdates[item.id] = cleanRecord({
        id: item.id,
        name: item.name,
        rating: item.rating,
        cat: item.cat,
        basePrice: minBidFor(item.cat, item.rating),
        source: "save",
        sourceId: item.sourceId,
        teamId: item.teamId,
        staffType: item.staffType,
      });
    });
    staffCount = Object.keys(staffUpdates).length;
    if (staffCount) await update(ref(state.db, "pool/staff"), staffUpdates);
  }

  ui.saveImportStatus = `Importado al pool: ${driverCount} pilotos y ${staffCount} staff.`;
  render();
}

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  );
}

function exportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function buildMoneyExport() {
  const exportedAt = new Date().toISOString();
  const teams = Object.entries(state.config?.teams || {}).map(([teamId, team]) => {
    const stats = teamStats(teamId);
    return {
      id: teamId,
      teamId,
      name: team.name || teamId,
      publicName: team.name || teamId,
      manager: team.manager || "",
      budget: Math.round(stats.budget),
      spent: Math.round(stats.spent),
      committed: Math.round(stats.committed),
      budgetRemaining: Math.round(stats.available),
      budgetRemainingM: Number((stats.available / M).toFixed(3)),
      lookupKeys: [teamId, team.name, team.manager].filter(Boolean),
    };
  });

  return {
    schema: "lfm_money_export",
    schemaVersion: 1,
    exportedAt,
    season: {
      id: currentMarketId(),
      name: currentMarketId(),
    },
    money: {
      scale: M,
      unit: "M",
    },
    teams,
    byTeam: Object.fromEntries(teams.map((team) => [team.teamId, team])),
  };
}

function exportStaffRows() {
  return Object.entries(state.config?.teams || {}).map(([teamId, team]) => {
    const drivers = teamRoster(teamId).filter(([, signing]) => signing?.cat === "driver").map(([signingKey, signing]) => {
      const slot = ROSTER.find((item) => item.slot === signing.slot);
      return cleanRecord({
        id: signing.itemId || signingKey,
        signingKey,
        auctionId: signing.auctionId,
        name: signing.itemName,
        rating: signing.rating ?? null,
        cat: signing.cat,
        catLabel: signing.catLabel || CAT_LABEL[signing.cat] || signing.cat,
        slot: signing.slot,
        slotLabel: slot?.label,
        cost: Number(signing.cost || 0),
        wonAt: signing.wonAt || null,
        bidRole: signing.bidRole,
        reserveOnly: signing.reserveOnly,
      });
    });

    const staff = teamStaffRoster(teamId).map(([signingKey, signing]) => {
      const slot = ROSTER.find((item) => item.slot === signing.slot);
      return cleanRecord({
        id: signing.itemId || signingKey,
        signingKey,
        auctionId: signing.auctionId,
        name: signing.itemName,
        rating: signing.rating ?? null,
        cat: signing.cat,
        catLabel: signing.catLabel || CAT_LABEL[signing.cat] || signing.cat,
        slot: signing.slot,
        slotLabel: slot?.label,
        cost: Number(signing.cost || 0),
        wonAt: signing.wonAt || null,
        bidRole: signing.bidRole,
        reserveOnly: signing.reserveOnly,
      });
    });

    return {
      id: teamId,
      teamId,
      name: team.name || teamId,
      manager: team.manager || "",
      drivers,
      staff,
    };
  });
}

function buildStaffExport() {
  const teams = exportStaffRows();
  return {
    schema: "f1_mercado_staff_export",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    market: {
      status: state.market?.status || "closed",
      periodId: currentMarketId(),
    },
    teams,
    byTeam: Object.fromEntries(teams.map((team) => [team.teamId, team])),
  };
}

function exportMoney() {
  downloadJson(`lfm-money-${exportDateStamp()}.json`, buildMoneyExport());
}

function exportStaff() {
  downloadJson(`lfm-staff-${exportDateStamp()}.json`, buildStaffExport());
}

async function resetHistory() {
  const entries = resettableHistoryAuctionEntries();
  if (!entries.length) {
    alert("No hay historial reiniciable.");
    return;
  }

  const protectedCount = allHistoryAuctions().length - entries.length;
  const message = [
    `Borrar ${entries.length} subastas del historial?`,
    protectedCount ? `${protectedCount} subastas cerradas del mercado actual se conservaran para que no puedan reabrirse.` : "",
    "Esto no borra presupuestos, pool ni staff ya fichado.",
  ].filter(Boolean).join("\n");

  if (!window.confirm(message)) return;

  const updates = {};
  entries.forEach(([auctionId]) => {
    updates[`auctions/${auctionId}`] = null;
  });
  await update(ref(state.db), updates);
}

async function clearRosters() {
  const rosterCount = Object.values(state.rosters || {})
    .reduce((sum, roster) => sum + Object.values(roster || {}).filter(Boolean).length, 0);
  if (!rosterCount) {
    alert("No hay personal para limpiar.");
    return;
  }

  const message = [
    `Borrar ${rosterCount} fichajes del personal de los equipos?`,
    "Usalo despues de cerrar mercado y exportar dinero/staff.",
    "Esto no borra historial, presupuestos, subastas ni pool.",
  ].join("\n");

  if (!window.confirm(message)) return;
  await set(ref(state.db, "rosters"), {});
}

async function readMoneyFile() {
  if (!ui.moneyImportFile) {
    alert("Selecciona un JSON de dinero primero.");
    return;
  }

  ui.moneyImportBusy = true;
  ui.moneyImportError = "";
  ui.moneyImportStatus = "Leyendo JSON de dinero...";
  render();

  try {
    assertFileSize(ui.moneyImportFile, MAX_MONEY_JSON_BYTES, "JSON de dinero");
    const raw = JSON.parse(await ui.moneyImportFile.text());
    ui.moneyImportResult = buildMoneyImport(raw);
    ui.moneyImportStatus = `Lectura completa: ${ui.moneyImportResult.matched.length} equipos emparejados.`;
  } catch (error) {
    ui.moneyImportResult = null;
    ui.moneyImportError = error.message || String(error);
    ui.moneyImportStatus = "";
  } finally {
    ui.moneyImportBusy = false;
    render();
  }
}

function buildMoneyImport(raw) {
  if (!raw || raw.schema !== "lfm_money_export") {
    throw new Error("El JSON no tiene schema lfm_money_export.");
  }
  if (raw.schemaVersion !== 1) {
    throw new Error("Version de JSON de dinero no soportada.");
  }
  const records = parseMoneyRecords(raw);
  const lookup = buildTeamLookup();
  const matchedByTeam = new Map();
  const unmatched = [];

  records.forEach((record) => {
    const appTeamId = findAppTeamId(record, lookup);
    if (!appTeamId) {
      unmatched.push(record);
      return;
    }

    if (!matchedByTeam.has(appTeamId)) {
      matchedByTeam.set(appTeamId, { ...record, appTeamId });
    }
  });

  return {
    schema: raw.schema || "",
    schemaVersion: raw.schemaVersion || null,
    exportedAt: raw.exportedAt || "",
    seasonId: raw.season?.id || "",
    seasonName: raw.season?.name || "",
    matched: Array.from(matchedByTeam.values()),
    unmatched,
  };
}

function parseMoneyRecords(raw) {
  const sourceRows = Array.isArray(raw?.teams)
    ? raw.teams
    : Object.entries(raw?.byTeam || {}).map(([id, value]) => ({ id, teamId: id, ...value }));
  const scale = Number(raw?.money?.scale || M);

  if (!sourceRows.length) {
    throw new Error("El JSON no tiene equipos en teams ni byTeam.");
  }
  if (sourceRows.length > MAX_MONEY_TEAMS) {
    throw new Error(`El JSON trae demasiados equipos (${sourceRows.length}).`);
  }

  return sourceRows.map((row) => {
    const budgetRemaining = Number.isFinite(Number(row.budgetRemaining))
      ? Number(row.budgetRemaining)
      : Number(row.budgetRemainingM) * scale;

    if (!Number.isFinite(budgetRemaining)) {
      throw new Error(`El equipo ${row.id || row.name || "sin nombre"} no tiene budgetRemaining valido.`);
    }

    const keys = [
      row.id,
      row.teamId,
      row.name,
      row.publicName,
      ...(Array.isArray(row.lookupKeys) ? row.lookupKeys : []),
      ...(Array.isArray(row.aliases) ? row.aliases : []),
    ].filter(Boolean);

    return {
      sourceTeamId: row.teamId || row.id || "",
      sourceName: row.publicName || row.name || row.teamId || row.id || "Equipo",
      budgetRemaining: Math.round(budgetRemaining),
      budgetRemainingM: Number.isFinite(Number(row.budgetRemainingM))
        ? Number(row.budgetRemainingM)
        : budgetRemaining / scale,
      lookupKeys: Array.from(new Set(keys.map(normalizeLookupKey).filter(Boolean))),
    };
  });
}

function buildTeamLookup() {
  const lookup = new Map();

  Object.entries(state.config?.teams || {}).forEach(([teamId, team]) => {
    addTeamLookup(lookup, teamId, teamId);
    addTeamLookup(lookup, team?.name, teamId);
  });

  Object.entries(MONEY_TEAM_ALIASES).forEach(([alias, teamId]) => {
    if (state.config?.teams?.[teamId]) addTeamLookup(lookup, alias, teamId);
  });

  return lookup;
}

function addTeamLookup(lookup, key, teamId) {
  const normalized = normalizeLookupKey(key);
  if (normalized && teamId && !lookup.has(normalized)) lookup.set(normalized, teamId);
}

function findAppTeamId(record, lookup) {
  for (const key of record.lookupKeys) {
    const aliasTarget = MONEY_TEAM_ALIASES[key];
    if (aliasTarget && state.config?.teams?.[aliasTarget]) return aliasTarget;
    if (lookup.has(key)) return lookup.get(key);
  }
  return null;
}

async function importMoneyBudgets() {
  const moneyImport = ui.moneyImportResult;
  if (!moneyImport?.matched?.length) return;
  const message = [
    `Aplicar dinero a ${moneyImport.matched.length} equipos?`,
    ui.moneyImportName ? `Archivo: ${ui.moneyImportName}` : "",
    "Esto recalcula el presupuesto base para que el dinero libre coincida con el JSON.",
  ].filter(Boolean).join("\n");
  if (!window.confirm(message)) return;

  const updates = {};
  const importedAt = Date.now();

  moneyImport.matched.forEach((item) => {
    const stats = teamStats(item.appTeamId);
    const adjustedBudget = Math.max(
      0,
      Math.round(Number(item.budgetRemaining) + Number(stats.spent || 0) + Number(stats.committed || 0)),
    );

    updates[`config/teams/${item.appTeamId}/budget`] = adjustedBudget;
    updates[`config/teams/${item.appTeamId}/moneyImport`] = cleanRecord({
      importedAt,
      sourceFile: ui.moneyImportName,
      schema: moneyImport.schema,
      schemaVersion: moneyImport.schemaVersion,
      exportedAt: moneyImport.exportedAt,
      seasonId: moneyImport.seasonId,
      seasonName: moneyImport.seasonName,
      sourceTeamId: item.sourceTeamId,
      sourceName: item.sourceName,
      budgetRemaining: item.budgetRemaining,
      budgetRemainingM: item.budgetRemainingM,
    });
  });

  await update(ref(state.db), updates);
  ui.moneyImportStatus = `Dinero aplicado a ${moneyImport.matched.length} equipos.`;
  render();
}

async function startMarket() {
  if (marketIsOpen()) return;
  const now = Date.now();
  await set(ref(state.db, "market"), {
    status: "open",
    periodId: `m${now}`,
    openedAt: now,
    openedBy: state.session?.email || ADMIN_EMAIL,
  });
}

async function closeMarket() {
  if (!marketIsOpen()) return;
  const live = activeAuctions().filter((auction) => auction.marketId === currentMarketId());
  const withBids = live.filter((auction) => auction.currentBidder).length;
  const withoutBids = live.length - withBids;
  const message = `Cerrar mercado? Se cerraran ${withBids} subastas con ganador y ${withoutBids} sin pujas quedaran canceladas.`;
  if (!window.confirm(message)) return;

  await update(ref(state.db, "market"), {
    status: "closed",
    closedAt: Date.now(),
    closedBy: state.session?.email || ADMIN_EMAIL,
  });

  for (const auction of live) {
    await closeAuction(auction.id);
  }
}

async function autoCloseExpired() {
  const now = Date.now();
  for (const auction of activeAuctions()) {
    if (auction.currentBidder && auction.deadline && Number(auction.deadline || 0) < now) {
      closeAuction(auction.id).catch((error) => console.error("Auto close failed", error));
    }
  }
}

function attachFirebaseListeners() {
  if (state.listenersAttached || !state.db || !state.session) return;
  state.listenersAttached = true;
  const isAdmin = state.session.type === "admin";
  const teamId = state.session.teamId || "";

  const configUnsubscribe = onValue(
    ref(state.db, isAdmin ? "config" : `config/teams/${teamId}`),
    async (snapshot) => {
      try {
        if (isAdmin) {
          if (!snapshot.exists()) {
            const initialConfig = { teams: cloneDefaultTeams() };
            await set(ref(state.db, "config"), initialConfig);
            state.config = normalizeConfig(initialConfig);
          } else {
            state.config = normalizeConfig(snapshot.val());
          }
        } else {
          if (!snapshot.exists()) {
            throw new Error("El admin debe inicializar la configuracion primero.");
          }
          state.config = normalizeTeamScopedConfig(teamId, snapshot.val());
        }
        markLoaded("config");
        render();
      } catch (error) {
        state.fatal = `No pude inicializar config: ${error.message || error}`;
        render();
      }
    },
    (error) => {
      state.fatal = `Firebase config: ${error.message || error}`;
      render();
    },
  );

  const marketUnsubscribe = onValue(
    ref(state.db, "market"),
    (snapshot) => {
      state.market = snapshot.val() || { status: "closed" };
      markLoaded("market");
      render();
    },
    (error) => {
      state.fatal = `Firebase market: ${error.message || error}`;
      render();
    },
  );

  const auctionsRef = isAdmin
    ? ref(state.db, "auctions")
    : dbQuery(ref(state.db, "auctions"), orderByChild("status"), equalTo("active"));

  const auctionsUnsubscribe = onValue(
    auctionsRef,
    (snapshot) => {
      state.auctions = snapshot.val() || {};
      markLoaded("auctions");
      render();
      autoCloseExpired();
    },
    (error) => {
      state.fatal = `Firebase auctions: ${error.message || error}`;
      render();
    },
  );

  const rostersUnsubscribe = onValue(
    ref(state.db, isAdmin ? "rosters" : `rosters/${teamId}`),
    (snapshot) => {
      state.rosters = isAdmin
        ? snapshot.val() || {}
        : { [teamId]: snapshot.val() || {} };
      markLoaded("rosters");
      render();
    },
    (error) => {
      state.fatal = `Firebase rosters: ${error.message || error}`;
      render();
    },
  );

  const poolUnsubscribe = onValue(
    ref(state.db, "pool"),
    (snapshot) => {
      state.pool = snapshot.val() || emptyPool();
      markLoaded("pool");
      ensurePoolBasePrices().catch((error) => console.error("Pool base price migration failed", error));
      render();
    },
    (error) => {
      state.fatal = `Firebase pool: ${error.message || error}`;
      render();
    },
  );

  state.unsubscribers = [configUnsubscribe, marketUnsubscribe, auctionsUnsubscribe, rostersUnsubscribe, poolUnsubscribe];
}

async function ensurePoolBasePrices() {
  if (state.session?.type !== "admin" || !state.db) return;
  const updates = {};

  Object.entries(state.pool?.drivers || {}).forEach(([id, item]) => {
    if (item && item.basePrice === undefined) {
      updates[`pool/drivers/${id}/basePrice`] = minBidFor("driver", item.rating || 0);
    }
  });

  Object.entries(state.pool?.staff || {}).forEach(([id, item]) => {
    if (item && item.basePrice === undefined) {
      const cat = item.cat || "raceEngineer";
      updates[`pool/staff/${id}/basePrice`] = minBidFor(cat, item.rating || 0);
    }
  });

  if (Object.keys(updates).length) await update(ref(state.db), updates);
}

function startClockRefresh() {
  window.setInterval(() => {
    if (!state.session || !loadedAll() || !activeAuctions().some((auction) => auction.deadline)) return;
    render();
    autoCloseExpired();
  }, 10_000);
}

async function boot() {
  if (!firebaseIsConfigured(firebaseConfig)) {
    render();
    return;
  }

  try {
    const [appModule, databaseModule, authModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    ]);

    initializeApp = appModule.initializeApp;
    getDatabase = databaseModule.getDatabase;
    ref = databaseModule.ref;
    onValue = databaseModule.onValue;
    set = databaseModule.set;
    update = databaseModule.update;
    push = databaseModule.push;
    get = databaseModule.get;
    runTransaction = databaseModule.runTransaction;
    dbQuery = databaseModule.query;
    orderByChild = databaseModule.orderByChild;
    equalTo = databaseModule.equalTo;
    getAuth = authModule.getAuth;
    signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
    firebaseSignOut = authModule.signOut;
    onAuthStateChanged = authModule.onAuthStateChanged;

    const firebaseApp = initializeApp(firebaseConfig);
    state.db = getDatabase(firebaseApp);
    state.auth = getAuth(firebaseApp);

    onAuthStateChanged(state.auth, (user) => {
      state.authReady = true;
      state.fatal = "";
      state.authUser = user || null;
      clearFirebaseListeners();
      resetFirebaseData();

      if (!user) {
        state.session = null;
        render();
        return;
      }

      const session = sessionFromAuthUser(user);
      if (!session) {
        state.session = null;
        ui.loginError = `La cuenta ${user.email || user.uid} no esta autorizada para esta app.`;
        firebaseSignOut(state.auth).catch((error) => console.error("Auth signOut failed", error));
        render();
        return;
      }

      state.session = session;
      attachFirebaseListeners();
      render();
    });

    render();
  } catch (error) {
    state.fatal = `No pude cargar Firebase desde el CDN oficial: ${error.message || error}`;
    render();
  }
}

startClockRefresh();
boot();
