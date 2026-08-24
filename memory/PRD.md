# ERP/POS Fashion Omnicanale — PRD

## Problem Statement (originale)
Gestionale ERP/POS web omnicanale per retail abbigliamento con:
- Area DONNA: Negozio Donna 1, Negozio Donna 2, Shopify Donna
- Area UOMO: Negozio Uomo, Shopify Uomo
- 3 location fisiche + 2 inventory pool (POOL_DONNA = D1+D2, POOL_UOMO = U)
- ERP source of truth, Shopify come canali collegati

## Scelte utente confermate
- Database: **MongoDB** (PostgreSQL non installabile su piattaforma Emergent, fallback trasparente)
- Autenticazione: **JWT custom + bcrypt**
- Shopify: **NON collegato realmente** — solo predisposizione (form credenziali + coda sync + webhook simulato)
- Barcode: **CODE128/EAN13 in-app**, stampanti Zebra/TSC predisposte per il futuro
- Utenti demo automatici visibili nella pagina login (contrassegnati DEMO)
- Vincolo economico: **solo servizi gratuiti** (no integrazioni a pagamento, no deploy premium)

## Personas
- **Owner/Admin** (bhmen52na@gmail.com) — visione totale
- **Manager** — configurazione, prezzi, promozioni, sincronizzazioni
- **Cassiere Donna 1/2/Uomo** — POS del proprio punto vendita

## Cosa è implementato (Feb 2026 — MVP v1)
### Backend (`/app/backend/`)
- FastAPI + MongoDB (motor), JWT + bcrypt, audit log, idempotenza
- **Modelli**: Users, Locations, Pools, Products, Variants, Inventory, InventoryMovements, Sales, Transfers, Customers, Promotions, ShopifyConnections, SyncJobs, CSVProfiles, CSVImports, AuditLogs, Categories, Brands, Seasons
- **API** (/api prefix): auth, products, variants (lookup/search), inventory (+ pool-availability + movements + adjust), transfers, pos/sales, pos/returns, dashboard/summary, users, shopify/connections, sync/jobs, shopify/webhook/order (simulato), csv/{preview,import,profiles,imports}, promotions, customers, audit-logs, meta/{locations,pools,brands,categories,seasons}
- **Idempotenza**: external_id univoco su inventory_movements e sales
- **Validazione canali**: prodotto Donna non pubblicabile su Shopify Uomo (e viceversa)
- **Trasferimenti**: solo dentro lo stesso pool

### Frontend (`/app/frontend/src/`)
Interfaccia completa in **italiano**, tablet-friendly, font Manrope, tema chiaro elegante:
- Login con quick-select utenti DEMO
- Dashboard con 8 KPI + ultimi movimenti + stato Shopify + vendite per punto vendita
- POS con scanner barcode/EAN + suggerimenti + sconto per riga + pagamento
- Prodotti (lista + form creazione con matrice varianti + validazione canali per genere)
- Magazzino (disponibilità per location + pool aggregato, movimenti/ledger, trasferimenti)
- Ordini Shopify (visualizzazione + simulatore per test)
- Clienti, Promozioni (per brand/categoria/stagione), Import CSV con mapping profili fornitori riutilizzabili
- Integrazioni Shopify (Donna e Uomo separate, salvataggio credenziali, test, sync)
- Sistema: Utenti & Ruoli, Log sincronizzazioni, Audit log

### Dati DEMO seed
- Admin reale (bhmen52na@gmail.com) + 4 utenti DEMO (manager, 3 cassieri)
- 8 prodotti (5 Donna: camicie, vestiti, giacche, jeans, t-shirt; 3 Uomo: jeans, camicia, giacca) con varianti colore/taglia, EAN, stock distribuito

### Test superati
- TEST A: vendita Donna 1 decrementa solo Donna 1
- TEST B: vendita Donna 2 decrementa solo Donna 2
- TEST C: vendita Uomo non tocca Donna
- TEST D: trasferimento non altera pool totale
- TEST E: idempotenza ordine Shopify duplicato
- Testing agent: 31/33 pytest passano; 100% frontend pages render

## Backlog / Non ancora implementato (per iterazioni future)
### P0 (bloccanti per uso reale)
- Collegamento reale Shopify (Admin API GraphQL, HMAC webhook, worker sync in background)
- Fiscalizzazione italiana (integrazione registratore telematico)
- Login: mostrare toast di errore su credenziali sbagliate

### P1 (importanti)
- Modulo etichette con generazione barcode PDF stampabile (CODE128/EAN13)
- Modifica prodotto (form edit) + gestione immagini
- Reso guidato dal frontend con ricerca vendita originale
- Report PDF scontrino
- Notifiche via email (invio scontrino cliente)
- Modifica prezzi massiva (bulk update)

### P2 (nice-to-have)
- Split server.py in router per dominio
- CORS con origin esplicito (FRONTEND_URL)
- HMAC verification su webhook Shopify
- Dashboard grafici (Recharts già in package.json)
- Import CSV con anteprima progressiva su file grandi

## Vincoli attivi
- Solo servizi gratuiti. Nessuna spesa senza autorizzazione esplicita.
- Nessuna credenziale Shopify reale finché non fornita dall'utente.
- Nessun dato hardcoded per funzioni operative — tutti i dati risiedono in MongoDB.
