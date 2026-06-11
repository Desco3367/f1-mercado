const SQL_JS_VERSION = "1.13.0";
const SQL_JS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/sql.js/${SQL_JS_VERSION}`;
const SQLITE_SIGNATURE = "SQLite format 3";
const MAX_SAVE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_BYTES = 128 * 1024 * 1024;

const DRIVER_STAT_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const STAFF_TYPES = {
  1: { cat: "jTecnico", statIds: [0, 1, 14, 15, 16, 17] },
  2: { cat: "raceEngineer", statIds: [13, 25, 43] },
  3: { cat: "hOfAero", statIds: [19, 20, 26, 27, 28, 29, 30, 31] },
  4: { cat: "sDirector", statIds: [11, 22, 23, 24] },
};

let sqlJsPromise;

export async function extractMarketItemsFromSave(file) {
  if (!file) throw new Error("Selecciona un archivo .sav primero.");
  if (Number(file.size || 0) > MAX_SAVE_FILE_BYTES) {
    throw new Error("El save es demasiado grande para importarlo desde el navegador.");
  }

  const saveBytes = new Uint8Array(await file.arrayBuffer());
  const extraction = await extractDatabaseBytes(saveBytes);
  const SQL = await loadSqlJs();
  const db = new SQL.Database(extraction.databaseBytes);

  try {
    ensureTables(db, [
      "Staff_BasicData",
      "Staff_Contracts",
      "Staff_DriverData",
      "Staff_GameData",
      "Staff_PerformanceStats",
    ]);

    const drivers = readDrivers(db);
    const staff = readStaff(db);

    return {
      filename: file.name,
      saveSize: saveBytes.length,
      databaseOffset: extraction.offset,
      compressedSize: extraction.compressedSize,
      databaseSize: extraction.databaseSize,
      inflatedSize: extraction.inflatedSize,
      drivers,
      staff,
    };
  } finally {
    db.close();
  }
}

export function findSaveDatabaseCandidate(bytes) {
  for (let offset = 16; offset < bytes.length - 2; offset += 1) {
    if (!isZlibHeader(bytes, offset)) continue;

    const compressedSize = readUInt32LE(bytes, offset - 16);
    const databaseSize = readUInt32LE(bytes, offset - 12);
    const auxSize1 = readUInt32LE(bytes, offset - 8);
    const auxSize2 = readUInt32LE(bytes, offset - 4);
    const inflatedSize = databaseSize + auxSize1 + auxSize2;

    if (!isPlausiblePayload(bytes.length, offset, compressedSize, databaseSize, inflatedSize)) {
      continue;
    }

    return { offset, compressedSize, databaseSize, auxSize1, auxSize2, inflatedSize };
  }

  return null;
}

async function extractDatabaseBytes(saveBytes) {
  for (let offset = 16; offset < saveBytes.length - 2; offset += 1) {
    if (!isZlibHeader(saveBytes, offset)) continue;

    const compressedSize = readUInt32LE(saveBytes, offset - 16);
    const databaseSize = readUInt32LE(saveBytes, offset - 12);
    const auxSize1 = readUInt32LE(saveBytes, offset - 8);
    const auxSize2 = readUInt32LE(saveBytes, offset - 4);
    const inflatedSize = databaseSize + auxSize1 + auxSize2;

    if (!isPlausiblePayload(saveBytes.length, offset, compressedSize, databaseSize, inflatedSize)) {
      continue;
    }

    try {
      const compressedBytes = saveBytes.slice(offset, offset + compressedSize);
      const inflated = await inflateZlib(compressedBytes);
      const databaseBytes = inflated.slice(0, databaseSize);

      if (readAscii(databaseBytes, 0, SQLITE_SIGNATURE.length) !== SQLITE_SIGNATURE) {
        continue;
      }

      return { offset, compressedSize, databaseSize, inflatedSize: inflated.length, databaseBytes };
    } catch (error) {
      continue;
    }
  }

  throw new Error("No encontre una base SQLite valida dentro del save.");
}

function isPlausiblePayload(saveLength, offset, compressedSize, databaseSize, inflatedSize) {
  return compressedSize > 1024
    && databaseSize > 1024
    && inflatedSize >= databaseSize
    && inflatedSize < MAX_INFLATED_BYTES
    && offset + compressedSize <= saveLength;
}

function isZlibHeader(bytes, offset) {
  if (bytes[offset] !== 0x78) return false;
  const header = (bytes[offset] << 8) + bytes[offset + 1];
  return header % 31 === 0;
}

async function inflateZlib(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Este navegador no soporta DecompressionStream para leer saves comprimidos.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      await loadScript(`${SQL_JS_BASE}/sql-wasm.js`);
      if (typeof window.initSqlJs !== "function") {
        throw new Error("No pude cargar sql.js.");
      }
      return window.initSqlJs({
        locateFile: (file) => `${SQL_JS_BASE}/${file}`,
        wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 2048 }),
      });
    })();
  }

  return sqlJsPromise;
}

function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No pude cargar ${src}`));
    document.head.appendChild(script);
  });
}

function ensureTables(db, names) {
  const missing = names.filter((name) => {
    const row = selectOne(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
    return !row;
  });

  if (missing.length) {
    throw new Error(`El save no tiene las tablas esperadas: ${missing.join(", ")}.`);
  }
}

function readDrivers(db) {
  const rows = selectAll(db, `
    SELECT DISTINCT
      bas.FirstName AS firstName,
      bas.LastName AS lastName,
      bas.StaffID AS staffId,
      con.TeamID AS teamId,
      con.PosInTeam AS posInTeam,
      MIN(con.ContractType) AS minContractType,
      gam.Retired AS retired,
      COUNT(*) AS contractCount
    FROM Staff_BasicData bas
    JOIN Staff_DriverData dri ON bas.StaffID = dri.StaffID
    LEFT JOIN Staff_Contracts con ON dri.StaffID = con.StaffID
    LEFT JOIN Staff_GameData gam ON dri.StaffID = gam.StaffID
    GROUP BY bas.StaffID
    ORDER BY con.TeamID, bas.LastName
  `);

  return rows
    .map((row) => {
      if (isPlaceholder(row.firstName) || isPlaceholder(row.lastName)) return null;

      const stats = readStats(db, row.staffId, DRIVER_STAT_IDS, true);
      const rating = calculateDriverOverall(stats);
      const name = formatStaffName(row.firstName, row.lastName);
      if (!name || !Number.isFinite(rating)) return null;

      return {
        id: `save-driver-${row.staffId}`,
        source: "save",
        sourceId: Number(row.staffId),
        name,
        rating,
        teamId: row.teamId ?? null,
      };
    })
    .filter(Boolean);
}

function readStaff(db) {
  const rows = selectAll(db, `
    SELECT DISTINCT
      bas.FirstName AS firstName,
      bas.LastName AS lastName,
      bas.StaffID AS staffId,
      con.TeamID AS teamId,
      gam.StaffType AS staffType
    FROM Staff_GameData gam
    JOIN Staff_BasicData bas ON gam.StaffID = bas.StaffID
    LEFT JOIN Staff_Contracts con
      ON bas.StaffID = con.StaffID
      AND (con.ContractType = 0 OR con.ContractType IS NULL)
    WHERE gam.StaffType != 0
    ORDER BY
      CASE WHEN con.TeamID IS NULL THEN 1 ELSE 0 END,
      con.TeamID,
      bas.LastName
  `);

  return rows
    .map((row) => {
      const meta = STAFF_TYPES[Number(row.staffType)];
      if (!meta || isPlaceholder(row.firstName) || isPlaceholder(row.lastName)) return null;

      const stats = readStats(db, row.staffId, meta.statIds, false);
      const rating = calculateStaffOverall(stats);
      const name = formatStaffName(row.firstName, row.lastName);
      if (!name || !Number.isFinite(rating)) return null;

      return {
        id: `save-staff-${row.staffId}`,
        source: "save",
        sourceId: Number(row.staffId),
        name,
        rating,
        cat: meta.cat,
        teamId: row.teamId ?? null,
        staffType: Number(row.staffType),
      };
    })
    .filter(Boolean);
}

function readStats(db, staffId, statIds, defaultDrivers) {
  const placeholders = statIds.map(() => "?").join(", ");
  const rows = selectAll(db, `
    SELECT StatID AS statId, Val AS value
    FROM Staff_PerformanceStats
    WHERE StaffID = ?
      AND StatID IN (${placeholders})
  `, [staffId, ...statIds]);

  if (!rows.length && defaultDrivers) return Array(statIds.length).fill(50);

  const byId = new Map(rows.map((row) => [Number(row.statId), Number(row.value)]));
  return statIds
    .map((id) => byId.get(id))
    .filter((value) => Number.isFinite(value));
}

function calculateDriverOverall(stats) {
  if (stats.length < 9) return NaN;

  const [
    cornering,
    braking,
    control,
    smoothness,
    adaptability,
    overtaking,
    defence,
    reactions,
    accuracy,
  ] = stats;

  return Math.round(
    (cornering
      + braking * 0.75
      + reactions * 0.5
      + control * 0.75
      + smoothness * 0.5
      + accuracy * 0.75
      + adaptability * 0.25
      + overtaking * 0.25
      + defence * 0.25) / 5,
  );
}

function calculateStaffOverall(stats) {
  if (!stats.length) return NaN;
  return Math.round(stats.reduce((sum, value) => sum + value, 0) / stats.length);
}

function formatStaffName(firstRaw, lastRaw) {
  const firstName = formatNamePart(extractNamePart(firstRaw, "forename"));
  const lastName = formatNamePart(extractNamePart(lastRaw, "surname"));
  return `${firstName} ${lastName}`.trim();
}

function extractNamePart(raw, type) {
  const value = String(raw || "");
  if (value.includes("STRING_LITERAL")) {
    const match = value.match(/\|([^|]+)\|/);
    return match ? match[1] : "";
  }

  const pattern = type === "forename"
    ? /StaffName_Forename_(?:Male|Female)_([\w]+)/i
    : /StaffName_Surname_([\w]+)/i;
  const match = value.match(pattern);
  return match ? match[1].replace(/\d$/, "") : value;
}

function formatNamePart(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function isPlaceholder(value) {
  return String(value || "").toLowerCase().includes("placeholder");
}

function selectOne(db, sql, params = []) {
  return selectAll(db, sql, params)[0] || null;
}

function selectAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];
  try {
    if (params.length) statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }
  return rows;
}

function readUInt32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] * 0x1000000)
  ) >>> 0;
}

function readAscii(bytes, start, length) {
  return Array.from(bytes.slice(start, start + length), (byte) => String.fromCharCode(byte)).join("");
}
