# ERP/POS Fashion Omnicanale — PRD (v1.0)

## Problem Statement
Gestionale ERP/POS web omnicanale per retail abbigliamento con Donna (2 negozi + Shopify) e Uomo (1 negozio + Shopify). 3 location, 2 pool, ERP source-of-truth.

## Scelte utente (confermate)
- **Database: MongoDB** (deviazione documentata dalla preferenza PostgreSQL — mongodb è nativo su piattaforma e non è installabile PostgreSQL. Schema comunque normalizzato con id UUID come stringa, indici unici, vincoli applicativi.)
- **Auth**: JWT custom + bcrypt
- **Shopify**: NON collegato realmente (form credenziali salvato + coda sync + webhook simulato)
- **Barcode**: CODE128/EAN13 in-app; Zebra/TSC predisposte per il futuro
- **Utenti demo**: automatici, visibili nella pagina login
- **Vincolo economico**: solo servizi gratuiti

## Cosa è implementato (Feb 2026 — MVP v1.0 collaudato)
### Backend
- FastAPI + MongoDB (motor), JWT + bcrypt, idempotenza (external_id unique partial), audit log
- **Indici confermati**: users.email UNIQUE, variants.sku UNIQUE, variants.ean indicizzato, inventory (variant_id, location_id) UNIQUE, sales.number UNIQUE, sales.external_id UNIQUE partial (string), inventory_movements.external_id UNIQUE partial
- API `/api/*`: auth, products, variants (lookup/search), inventory (+ pool-availability + movements + adjust), transfers, pos/sales, pos/returns, dashboard/summary, users, shopify/connections, sync/jobs, shopify/webhook/order (simulato), csv/{preview,import,profiles,imports}, promotions, customers, audit-logs, meta/{locations,pools,brands,categories,seasons}
- Validazione canali per genere (Donna non pubblicabile su Shopify Uomo)
- Trasferimenti solo dentro lo stesso pool

### Frontend
Interfaccia interamente in italiano, tablet-friendly, Manrope + tema chiaro elegante:
Login (con quick-select DEMO + errore visibile), Dashboard (8 KPI + attività + Shopify status), POS con barcode scanner, Prodotti + form matrice varianti, Magazzino (disponibilità + movimenti/ledger + trasferimenti), Ordini Shopify (con simulatore), Clienti, Promozioni, Import CSV con profili fornitori, Integrazioni Shopify Donna/Uomo, Utenti/Ruoli, Log sincronizzazioni, Audit log.
Sidebar filtrata per ruolo (i cassieri non vedono link admin).

### Dati DEMO seed
- Admin reale bhmen52na@gmail.com + 4 utenti DEMO (@demo.local/Demo123!)
- 8 prodotti (5 Donna, 3 Uomo) con varianti colore/taglia, EAN, stock distribuito

### Collaudi superati (iterazione 4)
- **Pytest**: 40/40 (33 suite principale + 7 supplementari) — 100%
- **TESTS A-E specifica**: tutti superati
  - A: vendita Donna 1 decrementa solo Donna 1
  - B: vendita Donna 2 decrementa solo Donna 2
  - C: vendita Uomo non tocca alcun valore Donna
  - D: trasferimento sposta ma pool totale invariato
  - E: idempotenza webhook (doppio external_id ⇒ decremento unico)
- **Permessi cassieri**: 403 su /api/users, sidebar filtrata, denied state
- **Frontend E2E**: login/POS/trasferimenti/import CSV/promozioni/simulatore ordini Shopify OK

## Limiti simulati (accettati per MVP)
1. **Test connessione Shopify**: risponde "Credenziali salvate. Test reale …dopo autorizzazione" — non chiama Admin API Shopify
2. **Webhook Shopify**: usa JWT invece di HMAC signature — accettabile per demo/simulazione
3. **Worker sync Shopify**: job accodati ma nessun worker background li processa
4. **Fiscalizzazione RT/scontrini**: non implementata (registratore telematico italiano)

## Backlog per iterazioni future
### P0 produzione
- Sostituire JWT con HMAC su /api/shopify/webhook/order
- CORS con origine esplicita (REACT_APP_BACKEND_URL) invece di `*`
- Worker background per elaborare sync jobs Shopify
- Test connessione Shopify reale (Admin API GraphQL)
- Fiscalizzazione italiana (integrazione registratore telematico)

### P1 nice-to-have
- Refactor server.py (>850 linee) in router per dominio
- Etichette PDF stampabili (CODE128/EAN13, prezzo, taglia)
- Modulo modifica prodotto + immagini
- Reso guidato con ricerca vendita originale
- Report PDF scontrino, email cliente (Resend)
- Grafici dashboard (Recharts già installato)

## Iter 5 · Performance fix (Feb 2026)
- Eliminato N+1 in `enrich_product`/`list_products`: ora batch-load con `$in` (una query per variants + una per inventory sull'intera lista)
- Aggiunte projection su `list_movements` (variants: id/sku/product_id, products: id/name)
- Aggiunte projection su `dashboard_summary` (inventory: variant_id/on_hand/location_id, variants: id/cost/product_id/sku, products: id/name)
- `deployment_agent`: **status pass** — nessun blocker, nessun WARN residuo
- pytest: 33/33 verdi (nessuna regressione)
