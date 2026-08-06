# Oceanik – Generátor ponúk (serverová verzia)

Generátor cenových ponúk, ktorý ukladá ponuky do **PostgreSQL**. Frontend je
jedno HTML (`public/index.html`), backend je malý Express server (`server.js`),
ktorý zároveň obsluhuje statické HTML aj REST API.

## Ako to funguje

- Každá ponuka sa ukladá pod svojím **číslom ponuky** (napr. `PN-2025-001`) — číslo je zároveň kľúč.
- Uloží sa celý stav: zákazník, varianty, ceny, obrázky, obchodné podmienky a **stav ponuky** (Nezáväzná / Akceptovaná / Dokončená).
- Ponuku kedykoľvek otvoríš zo zoznamu, upravíš detail (napr. model) a znova uložíš/vytlačíš — nemusíš ju robiť od začiatku.
- Stav ponuky sa zobrazuje ako farebný odznak v náhľade, ale **netlačí sa** do PDF pre zákazníka.

## Dve obrazovky

Prepínajú sa tlačidlom vpravo hore v lište.

1. **Editor** – formulár vľavo, živý náhľad vpravo (rovnaké polovice).
2. **Zoznam ponúk** – tabuľka všetkých uložených ponúk:
   - hľadanie podľa čísla, zákazníka alebo veci,
   - filtre podľa stavu + triedenie kliknutím na hlavičku stĺpca,
   - zmena stavu priamo v riadku (bez otvárania ponuky),
   - akcie **Otvoriť**, **Duplikovať** (kópia pre nové číslo), **Zmazať**.

Stĺpec „Suma“ zobrazuje cenu s DPH **prvého variantu**; ak má ponuka viac variantov
(sú to alternatívy pre zákazníka), pod sumou je poznámka `+N variant(y)`.

## Názov PDF

Tlačidlá **Tlačiť** aj **Stiahnuť PDF** predvyplnia názov súboru ako
`{cisloponuky}_{menozakaznika}.pdf`, napr. `PN-2025-001_Jan_Novak.pdf`.
Diakritika sa odstraňuje kvôli kompatibilite. Prehliadač si názov berie z titulku
stránky – spoľahlivo funguje v Chrome/Edge pri voľbe „Uložiť ako PDF“.

## REST API

| Metóda | Cesta                      | Popis                                    |
|--------|----------------------------|------------------------------------------|
| GET    | `/api/quotes`              | zoznam ponúk (súhrn, bez obrázkov)       |
| GET    | `/api/quotes/:cislo`       | celá ponuka                              |
| PUT    | `/api/quotes/:cislo`       | uloženie / prepis ponuky                 |
| PATCH  | `/api/quotes/:cislo/stav`  | zmena len stavu (používa zoznam)         |
| DELETE | `/api/quotes/:cislo`       | zmazanie ponuky                          |
| GET    | `/health`                  | health check                             |

Frontend volá API na rovnakom pôvode (`/api/...`), takže žiadne CORS riešiť netreba.
Zoznam zámerne neposiela base64 obrázky variantov – posiela len ich počet, aby bol rýchly.

## Premenné prostredia

Server potrebuje pripojenie na Postgres. Podporuje:

- `DATABASE_URL` — napr. `postgres://user:heslo@oceanik-db:5432/oceanik`
  (toto ti EasyPanel zvyčajne ponúkne ako "connection string" databázovej služby), **alebo**
- jednotlivé: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

Voliteľné: `PORT` (predvolene `3000`).

Tabuľka `quotes` sa vytvorí automaticky pri prvom štarte.

## Nasadenie na EasyPanel

1. **Databáza:** v projekte vytvor službu z **PostgreSQL** template (ak ešte nemáš).
   Pozri si jej connection string / názov hostiteľa, port, používateľa, heslo a databázu.

2. **Aplikácia:** vytvor novú **App** službu.
   - **Zdroj:** buď tento priečinok cez Git repozitár (EasyPanel zbuilduje podľa `Dockerfile`),
     alebo nahraj obsah priečinka. EasyPanel `Dockerfile` deteguje automaticky.
   - **Environment:** pridaj `DATABASE_URL` smerujúci na databázovú službu.
     Keďže obe služby bežia v tom istom projekte, ako host použi **interný názov databázovej služby**
     (napr. `oceanik-db`), nie verejnú adresu:
     `postgres://oceanik:HESLO@oceanik-db:5432/oceanik`
   - **Port:** aplikácia počúva na `3000`. Nastav ho v EasyPanel ako kontajnerový/HTTP port.

3. **Doména:** v záložke **Domains** prirať doménu (napr. `ponuky.oceanik.sk`).
   EasyPanel cez svoj reverzný proxy (Traefik) rieši HTTPS aj smerovanie — vlastný nginx blok netreba.
   Ak chceš mať pred tým **vlastný nginx**, len reverzne proxypni na port aplikácie:

   ```nginx
   server {
       listen 80;
       server_name ponuky.oceanik.sk;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. **Hotovo.** Otvor doménu — appka beží a ukladá do Postgresu.

## Lokálny test (voliteľné)

`npm start` neobsahuje žiadne pripojenie na databázu — bez `DATABASE_URL` (alebo `PG*` premenných)
server pri štarte skončí. Na lokálny vývoj slúži `npm run dev`, ktorý načíta súbor `.env`
(cez vstavaný `node --env-file`, preto je potrebný Node ≥ 20.6). `.env` je v `.gitignore`
a na server sa nenasadzuje — v produkcii premenné nastavuje EasyPanel.

```powershell
npm install

# 1) databáza v Dockeri
docker run -d --name oceanik-db-dev `
  -e POSTGRES_USER=oceanik -e POSTGRES_PASSWORD=oceanik -e POSTGRES_DB=oceanik `
  -p 5432:5432 postgres:16-alpine

# 2) .env s pripojením (vzor je v repozitári po prvom spustení)
#    DATABASE_URL=postgres://oceanik:oceanik@127.0.0.1:5432/oceanik

# 3) štart
npm run dev
# otvor http://localhost:3000
```

Upratanie databázy: `docker rm -f oceanik-db-dev`.

## Poznámky

- Obrázky variantov sa ukladajú ako data-URL priamo do JSONB stĺpca. Postgres to zvládne
  (TOAST), ale pri veľkom množstve obrázkov budú riadky veľké. Ak by si raz mal stovky
  obrázkových ponúk, zvážiť sa dá ukladanie obrázkov do object storage a v ponuke držať len odkaz.
- Zálohy rieši EasyPanel na úrovni databázovej služby (snapshoty/zálohy volume).
