// Oceanik – generátor ponúk: jednoduchý backend (Express + PostgreSQL)
const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Pripojenie na Postgres. EasyPanel dáva connection string do premennej prostredia.
// Skús DATABASE_URL, inak poskladaj z jednotlivých PG* premenných.
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT || 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }
);

// Obrázky sú uložené ako data-URL priamo v JSON, preto väčší limit tela požiadavky.
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Vytvorenie tabuľky pri štarte (idempotentné).
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      cislo      TEXT PRIMARY KEY,
      zak_meno   TEXT,
      stav       TEXT NOT NULL DEFAULT 'nezavazna',
      data       JSONB NOT NULL,
      saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS quotes_stav_idx ON quotes (stav);`);
}

// Zoznam ponúk – súhrn pre zoznamové zobrazenie.
// Obrázky variantov sa zámerne neposielajú (veľké base64), len počet variantov.
app.get("/api/quotes", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT cislo,
              zak_meno,
              stav,
              saved_at,
              data->'data'->>'vec'                    AS vec,
              (data->>'total')::numeric               AS total,
              jsonb_array_length(COALESCE(data->'variants', '[]'::jsonb)) AS pocet_variantov
         FROM quotes
        ORDER BY saved_at DESC`
    );
    res.json(
      r.rows.map((row) => ({
        cislo: row.cislo,
        zak_meno: row.zak_meno,
        vec: row.vec,
        total: row.total === null ? 0 : Number(row.total),
        pocetVariantov: row.pocet_variantov,
        stav: row.stav,
        savedAt: row.saved_at,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Jedna ponuka (celý objekt presne v tvare, aký frontend uložil).
app.get("/api/quotes/:cislo", async (req, res) => {
  try {
    const r = await pool.query(`SELECT data FROM quotes WHERE cislo = $1`, [
      req.params.cislo,
    ]);
    if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
    res.json(r.rows[0].data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Uloženie / prepis ponuky.
app.put("/api/quotes/:cislo", async (req, res) => {
  try {
    const payload = req.body || {};
    const stav = payload.stav || "nezavazna";
    const zakMeno = (payload.data && payload.data.zak_meno) || null;
    await pool.query(
      `INSERT INTO quotes (cislo, zak_meno, stav, data, saved_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (cislo)
       DO UPDATE SET zak_meno = EXCLUDED.zak_meno,
                     stav     = EXCLUDED.stav,
                     data     = EXCLUDED.data,
                     saved_at = now()`,
      [req.params.cislo, zakMeno, stav, payload]
    );
    res.json({ ok: true, cislo: req.params.cislo });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Zmena len stavu ponuky (používa zoznam ponúk).
const STAVY = ["nezavazna", "akceptovana", "dokoncena"];
app.patch("/api/quotes/:cislo/stav", async (req, res) => {
  try {
    const stav = (req.body || {}).stav;
    if (!STAVY.includes(stav)) return res.status(400).json({ error: "bad_stav" });
    const r = await pool.query(
      `UPDATE quotes
          SET stav = $2,
              data = jsonb_set(data, '{stav}', to_jsonb($2::text), true),
              saved_at = now()
        WHERE cislo = $1`,
      [req.params.cislo, stav]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, stav });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Zmazanie ponuky.
app.delete("/api/quotes/:cislo", async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM quotes WHERE cislo = $1`, [
      req.params.cislo,
    ]);
    if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Health check pre EasyPanel.
app.get("/health", (req, res) => res.json({ ok: true }));

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Oceanik ponuky beží na porte ${PORT}`));
  })
  .catch((e) => {
    console.error("Nepodarilo sa inicializovať databázu:", e);
    process.exit(1);
  });
