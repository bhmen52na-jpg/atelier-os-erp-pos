"""ERP/POS backend — FastAPI + MongoDB."""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import io
import csv
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Response, Depends, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware

from db import db, ensure_indexes, seed_base, seed_admin_and_demo_users, seed_demo_catalog
from auth_utils import hash_password, verify_password, create_access_token, get_current_user_dep, require_roles
from models import LoginIn, ProductCreate, SaleCreate, TransferCreate, ShopifyConnectionIn, new_id, now_utc

logger = logging.getLogger("erp")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ERP/POS Fashion")
api = APIRouter(prefix="/api")


def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def clean_list(docs):
    return [clean(d) for d in docs]


async def log_audit(action, entity, entity_id, user, details=None):
    await db.audit_logs.insert_one({
        "id": new_id(), "action": action, "entity": entity, "entity_id": entity_id,
        "user_id": (user or {}).get("id"), "user_email": (user or {}).get("email"),
        "details": details or {}, "created_at": now_utc().isoformat(),
    })


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed_base()
    await seed_admin_and_demo_users()
    await seed_demo_catalog()
    try:
        Path("/app/memory").mkdir(parents=True, exist_ok=True)
        Path("/app/memory/test_credentials.md").write_text(
            f"""# ERP/POS - Credenziali Test

## Admin (owner)
- Email: {os.environ['ADMIN_EMAIL']}
- Password: {os.environ['ADMIN_PASSWORD']}
- Ruolo: ADMIN

## Utenti DEMO
- manager@demo.local / Demo123! — MANAGER
- cassa.donna1@demo.local / Demo123! — CASSIERE_DONNA_1
- cassa.donna2@demo.local / Demo123! — CASSIERE_DONNA_2
- cassa.uomo@demo.local / Demo123! — CASSIERE_UOMO

## Endpoints
- POST /api/auth/login
- GET  /api/auth/me
- POST /api/auth/logout
"""
        )
    except Exception as e:
        logger.warning("test_credentials write failed: %s", e)


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 12, path="/")


@api.post("/auth/login")
async def auth_login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password errata")
    token = create_access_token(user["id"], user["email"], user["role"])
    _set_auth_cookie(response, token)
    await log_audit("LOGIN", "user", user["id"], user)
    return {"user": clean(user), "token": token}


@api.post("/auth/logout")
async def auth_logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def auth_me(user=Depends(get_current_user_dep)):
    return clean(user)


@api.get("/auth/demo-users")
async def demo_users():
    return [
        {"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"], "role": "ADMIN", "label": "Admin (owner)"},
        {"email": "manager@demo.local", "password": "Demo123!", "role": "MANAGER", "label": "Manager DEMO"},
        {"email": "cassa.donna1@demo.local", "password": "Demo123!", "role": "CASSIERE_DONNA_1", "label": "Cassa Donna 1 DEMO"},
        {"email": "cassa.donna2@demo.local", "password": "Demo123!", "role": "CASSIERE_DONNA_2", "label": "Cassa Donna 2 DEMO"},
        {"email": "cassa.uomo@demo.local", "password": "Demo123!", "role": "CASSIERE_UOMO", "label": "Cassa Uomo DEMO"},
    ]


@api.get("/meta/locations")
async def get_locations():
    return clean_list(await db.locations.find({}).to_list(100))


@api.get("/meta/pools")
async def get_pools():
    return clean_list(await db.inventory_pools.find({}).to_list(10))


@api.get("/meta/brands")
async def get_brands():
    return clean_list(await db.brands.find({}).to_list(500))


@api.post("/meta/brands")
async def create_brand(payload: dict, user=Depends(get_current_user_dep)):
    doc = {"id": new_id(), "name": payload["name"]}
    await db.brands.insert_one(doc)
    return clean(doc)


@api.get("/meta/categories")
async def get_categories():
    return clean_list(await db.categories.find({}).to_list(500))


@api.post("/meta/categories")
async def create_category(payload: dict, user=Depends(get_current_user_dep)):
    doc = {"id": new_id(), "name": payload["name"], "parent_id": payload.get("parent_id")}
    await db.categories.insert_one(doc)
    return clean(doc)


@api.get("/meta/seasons")
async def get_seasons():
    return clean_list(await db.seasons.find({}).to_list(200))


@api.post("/meta/seasons")
async def create_season(payload: dict, user=Depends(get_current_user_dep)):
    doc = {"id": new_id(), "code": payload["code"], "name": payload.get("name", payload["code"])}
    await db.seasons.insert_one(doc)
    return clean(doc)


async def enrich_product(prod: dict) -> dict:
    variants = clean_list(await db.variants.find({"product_id": prod["id"]}).to_list(500))
    for v in variants:
        rows = await db.inventory.find({"variant_id": v["id"]}).to_list(20)
        stock_by_loc = {r["location_id"]: r.get("on_hand", 0) for r in rows}
        v["stock_by_location"] = stock_by_loc
        v["total_stock"] = sum(stock_by_loc.values())
    prod["variants"] = variants
    prod["total_stock"] = sum(v["total_stock"] for v in variants)
    return prod


@api.get("/products")
async def list_products(user=Depends(get_current_user_dep)):
    prods = clean_list(await db.products.find({}).sort("created_at", -1).to_list(1000))
    return [await enrich_product(p) for p in prods]


@api.get("/products/{product_id}")
async def get_product(product_id: str, user=Depends(get_current_user_dep)):
    p = await db.products.find_one({"id": product_id})
    if not p:
        raise HTTPException(404, "Prodotto non trovato")
    return await enrich_product(clean(p))


def _validate_channels(gender, channels):
    donna_ok = {"DONNA_1", "DONNA_2", "SHOPIFY_DONNA"}
    uomo_ok = {"UOMO", "SHOPIFY_UOMO"}
    invalid = []
    for c in channels:
        if gender == "DONNA" and c not in donna_ok:
            invalid.append(c)
        elif gender == "UOMO" and c not in uomo_ok:
            invalid.append(c)
        elif gender == "UNISEX" and c not in donna_ok | uomo_ok:
            invalid.append(c)
    return invalid


@api.post("/products")
async def create_product(payload: ProductCreate, user=Depends(get_current_user_dep)):
    invalid = _validate_channels(payload.gender, payload.channels)
    if invalid:
        raise HTTPException(400, f"Canali non validi per genere {payload.gender}: {invalid}. Un prodotto Donna non può stare sul Shopify Uomo (e viceversa).")
    prod_doc = payload.model_dump(exclude={"variants"})
    prod_doc["id"] = new_id()
    prod_doc["created_at"] = now_utc().isoformat()
    prod_doc["updated_at"] = prod_doc["created_at"]
    await db.products.insert_one(prod_doc)
    for v in payload.variants:
        var_doc = v.model_dump(exclude={"initial_stock"})
        var_doc["id"] = new_id()
        var_doc["product_id"] = prod_doc["id"]
        var_doc["created_at"] = now_utc().isoformat()
        for k in ("promo_start", "promo_end"):
            if var_doc.get(k) and hasattr(var_doc[k], "isoformat"):
                var_doc[k] = var_doc[k].isoformat()
        # sku uniqueness
        if await db.variants.find_one({"sku": var_doc["sku"]}):
            raise HTTPException(400, f"SKU già esistente: {var_doc['sku']}")
        await db.variants.insert_one(var_doc)
        for loc_id, qty in (v.initial_stock or {}).items():
            await db.inventory.insert_one({
                "id": new_id(), "variant_id": var_doc["id"], "location_id": loc_id,
                "on_hand": int(qty), "reserved": 0, "updated_at": now_utc().isoformat(),
            })
            if int(qty) > 0:
                await db.inventory_movements.insert_one({
                    "id": new_id(), "variant_id": var_doc["id"], "location_id": loc_id,
                    "type": "INITIAL_STOCK", "quantity": int(qty), "origin": "MANUAL",
                    "document_ref": None, "user_id": user["id"], "external_id": None,
                    "note": "Stock iniziale", "created_at": now_utc().isoformat(),
                })
        await enqueue_shopify_sync_for_variant(var_doc["id"])
    await log_audit("CREATE", "product", prod_doc["id"], user, {"model_code": prod_doc["model_code"]})
    return await enrich_product(clean(prod_doc))


@api.get("/variants/search")
async def search_variants(q: str = "", user=Depends(get_current_user_dep)):
    if not q:
        return []
    q_re = {"$regex": q, "$options": "i"}
    variants = await db.variants.find({"$or": [{"sku": q_re}, {"ean": q_re}]}).to_list(50)
    result = []
    for v in variants:
        v = clean(v)
        prod = await db.products.find_one({"id": v["product_id"]})
        v["product_name"] = prod["name"] if prod else ""
        v["product_gender"] = prod["gender"] if prod else ""
        result.append(v)
    return result


@api.get("/variants/lookup")
async def lookup_variant(code: str, user=Depends(get_current_user_dep)):
    v = await db.variants.find_one({"$or": [{"ean": code}, {"sku": code}]})
    if not v:
        raise HTTPException(404, "Articolo non trovato — barcode o SKU non presenti nel catalogo")
    v = clean(v)
    prod = await db.products.find_one({"id": v["product_id"]})
    v["product"] = clean(prod)
    rows = await db.inventory.find({"variant_id": v["id"]}).to_list(10)
    v["stock_by_location"] = {r["location_id"]: r.get("on_hand", 0) for r in rows}
    return v


@api.get("/inventory")
async def list_inventory(user=Depends(get_current_user_dep)):
    rows = await db.inventory.find({}).to_list(5000)
    variants_ids = list({r["variant_id"] for r in rows})
    variants = {v["id"]: clean(v) for v in await db.variants.find({"id": {"$in": variants_ids}}).to_list(5000)}
    products = {p["id"]: clean(p) for p in await db.products.find({"id": {"$in": [v["product_id"] for v in variants.values()]}}).to_list(5000)}
    out = []
    for r in rows:
        r = clean(r)
        v = variants.get(r["variant_id"])
        if not v:
            continue
        p = products.get(v["product_id"], {})
        r.update({"sku": v["sku"], "ean": v.get("ean"), "color": v["color"], "size": v["size"],
                  "product_name": p.get("name", ""), "product_gender": p.get("gender", ""),
                  "price": v.get("price", 0)})
        out.append(r)
    return out


@api.get("/inventory/pool-availability")
async def pool_availability(user=Depends(get_current_user_dep)):
    locations = {l["id"]: l for l in await db.locations.find({}).to_list(10)}
    rows = await db.inventory.find({}).to_list(5000)
    agg = {}
    for r in rows:
        loc = locations.get(r["location_id"])
        if not loc:
            continue
        key = (r["variant_id"], loc["pool_id"])
        agg[key] = agg.get(key, 0) + int(r.get("on_hand", 0))
    return [{"variant_id": vid, "pool_id": pid, "available": q} for (vid, pid), q in agg.items()]


@api.get("/inventory/movements")
async def list_movements(limit: int = 200, user=Depends(get_current_user_dep)):
    mvs = await db.inventory_movements.find({}).sort("created_at", -1).to_list(limit)
    variants = {v["id"]: clean(v) for v in await db.variants.find({}).to_list(5000)}
    products = {p["id"]: clean(p) for p in await db.products.find({}).to_list(5000)}
    out = []
    for m in mvs:
        m = clean(m)
        v = variants.get(m["variant_id"], {})
        p = products.get(v.get("product_id"), {})
        m["sku"] = v.get("sku"); m["product_name"] = p.get("name", "")
        out.append(m)
    return out


@api.post("/inventory/adjust")
async def adjust_stock(payload: dict, user=Depends(get_current_user_dep)):
    await apply_movement(payload["variant_id"], payload["location_id"], int(payload["delta"]),
                         "ADJUSTMENT", "MANUAL", None, user["id"], None, payload.get("note", "Rettifica"))
    await log_audit("ADJUST_STOCK", "inventory", payload["variant_id"], user, payload)
    return {"ok": True}


async def apply_movement(variant_id, location_id, quantity, mtype, origin, document_ref,
                         user_id, external_id, note=""):
    if external_id:
        existing = await db.inventory_movements.find_one({"external_id": external_id})
        if existing:
            return
    row = await db.inventory.find_one({"variant_id": variant_id, "location_id": location_id})
    if not row:
        await db.inventory.insert_one({
            "id": new_id(), "variant_id": variant_id, "location_id": location_id,
            "on_hand": max(0, quantity), "reserved": 0, "updated_at": now_utc().isoformat(),
        })
    else:
        await db.inventory.update_one(
            {"variant_id": variant_id, "location_id": location_id},
            {"$inc": {"on_hand": quantity}, "$set": {"updated_at": now_utc().isoformat()}}
        )
    await db.inventory_movements.insert_one({
        "id": new_id(), "variant_id": variant_id, "location_id": location_id,
        "type": mtype, "quantity": quantity, "origin": origin,
        "document_ref": document_ref, "user_id": user_id, "external_id": external_id,
        "note": note or "", "created_at": now_utc().isoformat(),
    })
    await enqueue_shopify_sync_for_variant(variant_id)


async def _next_number(collection, prefix):
    doc = await db.counters.find_one_and_update(
        {"_id": collection}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    return f"{prefix}-{(doc or {}).get('seq', 1):06d}"


@api.post("/pos/sales")
async def create_sale(payload: SaleCreate, user=Depends(get_current_user_dep)):
    if payload.external_id:
        existing = await db.sales.find_one({"external_id": payload.external_id})
        if existing:
            return clean(existing)
    location = await db.locations.find_one({"id": payload.location_id})
    if not location:
        raise HTTPException(400, "Punto vendita non trovato")

    items_out = []; subtotal = 0.0; discount_total = 0.0
    for it in payload.items:
        v = await db.variants.find_one({"id": it.variant_id})
        if not v:
            raise HTTPException(400, "Articolo non trovato nel catalogo")
        inv = await db.inventory.find_one({"variant_id": it.variant_id, "location_id": payload.location_id})
        available = int((inv or {}).get("on_hand", 0))
        if available < it.quantity:
            raise HTTPException(400, f"Stock insufficiente per {v['sku']} in {location['name']} (disponibili: {available})")
        gross = it.unit_price * it.quantity
        disc = gross * (it.discount_pct or 0) / 100.0
        subtotal += gross; discount_total += disc
        items_out.append({
            "variant_id": it.variant_id, "sku": v["sku"],
            "product_name": (await db.products.find_one({"id": v["product_id"]}) or {}).get("name", ""),
            "color": v.get("color"), "size": v.get("size"),
            "quantity": it.quantity, "unit_price": it.unit_price,
            "discount_pct": it.discount_pct, "line_total": round(gross - disc, 2),
        })
    total = subtotal - discount_total
    number = await _next_number("sales", "V")
    sale_doc = {
        "id": new_id(), "number": number, "location_id": payload.location_id,
        "items": items_out, "subtotal": round(subtotal, 2), "discount_total": round(discount_total, 2),
        "total": round(total, 2), "payment_method": payload.payment_method,
        "customer_id": payload.customer_id, "user_id": user["id"], "is_return": False,
        "original_sale_id": None, "channel": "POS", "note": payload.note or "",
        "external_id": payload.external_id, "created_at": now_utc().isoformat(),
    }
    await db.sales.insert_one(sale_doc)
    for it in payload.items:
        await apply_movement(it.variant_id, payload.location_id, -int(it.quantity),
                             "SALE", "POS", number, user["id"], None, f"Vendita {number}")
    await log_audit("SALE", "sale", sale_doc["id"], user, {"number": number, "total": total})
    return clean(sale_doc)


@api.get("/pos/sales")
async def list_sales(limit: int = 100, user=Depends(get_current_user_dep)):
    return clean_list(await db.sales.find({}).sort("created_at", -1).to_list(limit))


@api.post("/pos/returns")
async def create_return(payload: dict, user=Depends(get_current_user_dep)):
    location_id = payload["location_id"]
    restockable = payload.get("restockable", True)
    items = payload["items"]
    total = sum(i["unit_price"] * i["quantity"] for i in items)
    number = await _next_number("sales", "R")
    doc = {
        "id": new_id(), "number": number, "location_id": location_id,
        "items": items, "subtotal": -total, "discount_total": 0.0, "total": -total,
        "payment_method": "RESO", "customer_id": None, "user_id": user["id"],
        "is_return": True, "original_sale_id": payload.get("original_sale_id"),
        "channel": "POS", "note": payload.get("note", ""),
        "external_id": None, "created_at": now_utc().isoformat(),
    }
    await db.sales.insert_one(doc)
    for it in items:
        qty = int(it["quantity"])
        if restockable:
            await apply_movement(it["variant_id"], location_id, qty, "RETURN", "POS", number, user["id"], None, f"Reso {number}")
        else:
            await db.inventory_movements.insert_one({
                "id": new_id(), "variant_id": it["variant_id"], "location_id": location_id,
                "type": "DAMAGED", "quantity": 0, "origin": "POS", "document_ref": number,
                "user_id": user["id"], "external_id": None,
                "note": "Reso non rivendibile", "created_at": now_utc().isoformat(),
            })
    await log_audit("RETURN", "sale", doc["id"], user, {"number": number})
    return clean(doc)


@api.post("/transfers")
async def create_transfer(payload: TransferCreate, user=Depends(get_current_user_dep)):
    if payload.from_location_id == payload.to_location_id:
        raise HTTPException(400, "Il punto vendita di origine e destinazione devono essere diversi")
    from_loc = await db.locations.find_one({"id": payload.from_location_id})
    to_loc = await db.locations.find_one({"id": payload.to_location_id})
    if not from_loc or not to_loc:
        raise HTTPException(400, "Punto vendita non valido")
    if from_loc["pool_id"] != to_loc["pool_id"]:
        raise HTTPException(400, "Puoi trasferire merce solo tra i due negozi Donna (o all'interno della stessa area). Donna e Uomo non possono essere mescolati.")
    number = await _next_number("transfers", "T")
    items_out = []
    for it in payload.items:
        inv = await db.inventory.find_one({"variant_id": it.variant_id, "location_id": payload.from_location_id})
        if not inv or int(inv.get("on_hand", 0)) < it.quantity:
            raise HTTPException(400, "Stock insufficiente nel negozio di origine")
        await apply_movement(it.variant_id, payload.from_location_id, -int(it.quantity), "TRANSFER_OUT", "TRANSFER", number, user["id"], None, f"Trasferimento {number}")
        await apply_movement(it.variant_id, payload.to_location_id, int(it.quantity), "TRANSFER_IN", "TRANSFER", number, user["id"], None, f"Trasferimento {number}")
        v = await db.variants.find_one({"id": it.variant_id})
        items_out.append({"variant_id": it.variant_id, "sku": (v or {}).get("sku"), "quantity": it.quantity})
    doc = {
        "id": new_id(), "number": number,
        "from_location_id": payload.from_location_id, "to_location_id": payload.to_location_id,
        "items": items_out, "status": "COMPLETATO", "user_id": user["id"],
        "note": payload.note or "", "created_at": now_utc().isoformat(),
    }
    await db.transfers.insert_one(doc)
    await log_audit("TRANSFER", "transfer", doc["id"], user, {"number": number})
    return clean(doc)


@api.get("/transfers")
async def list_transfers(user=Depends(get_current_user_dep)):
    return clean_list(await db.transfers.find({}).sort("created_at", -1).to_list(200))


@api.get("/dashboard/summary")
async def dashboard_summary(user=Depends(get_current_user_dep)):
    now = datetime.now(timezone.utc)
    start_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    sales_today = await db.sales.find({"created_at": {"$gte": start_day}, "is_return": False}).to_list(2000)
    all_sales = await db.sales.find({"is_return": False}).to_list(5000)
    inventory = await db.inventory.find({}).to_list(5000)
    variants = {v["id"]: clean(v) for v in await db.variants.find({}).to_list(5000)}
    products = {p["id"]: clean(p) for p in await db.products.find({}).to_list(5000)}
    total_stock_value = 0.0
    stock_by_variant = {}
    for r in inventory:
        v = variants.get(r["variant_id"])
        if not v:
            continue
        total_stock_value += v.get("cost", 0) * int(r.get("on_hand", 0))
        stock_by_variant[v["id"]] = stock_by_variant.get(v["id"], 0) + int(r.get("on_hand", 0))
    understock = sum(1 for _, q in stock_by_variant.items() if 0 < q <= 2)
    outofstock = sum(1 for _, q in stock_by_variant.items() if q == 0)
    locations = {l["id"]: l for l in await db.locations.find({}).to_list(10)}

    def sum_sales(sales, key="total"):
        return round(sum(s.get(key, 0) for s in sales), 2)

    def area_of(lid):
        return (locations.get(lid) or {}).get("area")

    sales_donna_today = [s for s in sales_today if area_of(s.get("location_id")) == "DONNA" and s.get("channel") == "POS"]
    sales_uomo_today = [s for s in sales_today if area_of(s.get("location_id")) == "UOMO" and s.get("channel") == "POS"]
    sales_sd = [s for s in sales_today if s.get("channel") == "SHOPIFY_DONNA"]
    sales_su = [s for s in sales_today if s.get("channel") == "SHOPIFY_UOMO"]
    per_location = []
    for lid, loc in locations.items():
        s = [x for x in sales_today if x.get("location_id") == lid and x.get("channel") == "POS"]
        per_location.append({"location_id": lid, "name": loc["name"], "code": loc["code"], "count": len(s), "total": sum_sales(s)})
    last_movements = clean_list(await db.inventory_movements.find({}).sort("created_at", -1).to_list(10))
    for m in last_movements:
        v = variants.get(m["variant_id"], {}); p = products.get(v.get("product_id"), {})
        m["sku"] = v.get("sku"); m["product_name"] = p.get("name", "")
    conns = clean_list(await db.shopify_connections.find({}).to_list(10))
    errors = await db.sync_jobs.count_documents({"status": {"$in": ["FAILED", "RETRY"]}})
    return {
        "sales_today": {"count": len(sales_today), "total": sum_sales(sales_today)},
        "sales_donna": {"count": len(sales_donna_today), "total": sum_sales(sales_donna_today)},
        "sales_uomo": {"count": len(sales_uomo_today), "total": sum_sales(sales_uomo_today)},
        "sales_shopify_donna": {"count": len(sales_sd), "total": sum_sales(sales_sd)},
        "sales_shopify_uomo": {"count": len(sales_su), "total": sum_sales(sales_su)},
        "per_location": per_location,
        "stock_value": round(total_stock_value, 2),
        "understock_count": understock,
        "outofstock_count": outofstock,
        "last_movements": last_movements,
        "online_pending": 0,
        "shopify_connections": conns,
        "sync_errors": errors,
        "total_sales_all_time": sum_sales(all_sales),
    }


@api.get("/users")
async def list_users(user=Depends(require_roles("ADMIN", "MANAGER"))):
    users = await db.users.find({}, {"password_hash": 0}).to_list(500)
    return clean_list(users)


@api.post("/users")
async def create_user(payload: dict, user=Depends(require_roles("ADMIN"))):
    email = payload["email"].lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email già esistente")
    doc = {"id": new_id(), "email": email, "name": payload["name"], "role": payload["role"],
           "location_id": payload.get("location_id"), "is_demo": False,
           "password_hash": hash_password(payload["password"]),
           "created_at": now_utc().isoformat()}
    await db.users.insert_one(doc)
    await log_audit("CREATE_USER", "user", doc["id"], user, {"email": email})
    return clean(doc)


@api.get("/shopify/connections")
async def get_shopify_connections(user=Depends(get_current_user_dep)):
    conns = await db.shopify_connections.find({}).to_list(10)
    out = []
    for c in conns:
        c = clean(c)
        if c.get("access_token"):
            c["access_token"] = "***" + c["access_token"][-4:]
        out.append(c)
    return out


@api.put("/shopify/connections/{code}")
async def update_shopify_connection(code: str, payload: ShopifyConnectionIn, user=Depends(require_roles("ADMIN", "MANAGER"))):
    if code not in ("SHOPIFY_DONNA", "SHOPIFY_UOMO"):
        raise HTTPException(400, "Codice connessione non valido")
    await db.shopify_connections.update_one({"code": code}, {"$set": {
        "store_domain": payload.store_domain, "access_token": payload.access_token,
        "connected": True, "last_error": None,
    }})
    await log_audit("UPDATE_SHOPIFY", "shopify", code, user, {"store": payload.store_domain})
    return {"ok": True}


@api.post("/shopify/connections/{code}/test")
async def test_shopify_connection(code: str, user=Depends(require_roles("ADMIN", "MANAGER"))):
    c = await db.shopify_connections.find_one({"code": code})
    if not c or not c.get("access_token"):
        raise HTTPException(400, "Connessione non configurata. Inserisci prima Dominio e Access Token.")
    return {"ok": True, "message": "Credenziali salvate. Il test reale su Shopify verrà eseguito dopo la tua autorizzazione."}


@api.post("/shopify/connections/{code}/sync")
async def sync_shopify(code: str, user=Depends(require_roles("ADMIN", "MANAGER"))):
    c = await db.shopify_connections.find_one({"code": code})
    if not c:
        raise HTTPException(404, "Connessione non trovata")
    products = await db.products.find({"channels": code}).to_list(5000)
    count = 0
    for p in products:
        for v in await db.variants.find({"product_id": p["id"]}).to_list(200):
            await enqueue_shopify_sync_for_variant(v["id"], forced_destination=code)
            count += 1
    await db.shopify_connections.update_one({"code": code}, {"$set": {"last_sync_at": now_utc().isoformat()}})
    return {"ok": True, "enqueued": count}


async def enqueue_shopify_sync_for_variant(variant_id, forced_destination=None):
    v = await db.variants.find_one({"id": variant_id})
    if not v:
        return
    p = await db.products.find_one({"id": v["product_id"]})
    if not p:
        return
    destinations = [forced_destination] if forced_destination else []
    if not forced_destination:
        if "SHOPIFY_DONNA" in (p.get("channels") or []):
            destinations.append("SHOPIFY_DONNA")
        if "SHOPIFY_UOMO" in (p.get("channels") or []):
            destinations.append("SHOPIFY_UOMO")
    for dest in destinations:
        existing = await db.sync_jobs.find_one({"sku": v["sku"], "destination": dest, "status": {"$in": ["PENDING", "RETRY"]}})
        if existing:
            continue
        await db.sync_jobs.insert_one({
            "id": new_id(), "origin": "ERP", "destination": dest, "type": "INVENTORY_UPDATE",
            "sku": v["sku"], "payload": {"variant_id": v["id"], "product_id": p["id"]},
            "status": "PENDING", "attempts": 0, "last_error": None,
            "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
        })


@api.get("/sync/jobs")
async def list_sync_jobs(status: Optional[str] = None, user=Depends(get_current_user_dep)):
    q = {"status": status} if status else {}
    return clean_list(await db.sync_jobs.find(q).sort("created_at", -1).to_list(500))


@api.post("/sync/jobs/{job_id}/retry")
async def retry_sync_job(job_id: str, user=Depends(require_roles("ADMIN", "MANAGER"))):
    await db.sync_jobs.update_one({"id": job_id}, {"$set": {"status": "PENDING", "last_error": None, "updated_at": now_utc().isoformat()}})
    return {"ok": True}


@api.post("/shopify/webhook/order")
async def shopify_webhook_order(payload: dict, user=Depends(get_current_user_dep)):
    channel = payload["channel"]
    if channel not in ("SHOPIFY_DONNA", "SHOPIFY_UOMO"):
        raise HTTPException(400, "Canale non valido")
    external_id = payload["external_id"]
    if await db.sales.find_one({"external_id": external_id}):
        return {"ok": True, "idempotent": True}
    pool_code = "POOL_DONNA" if channel == "SHOPIFY_DONNA" else "POOL_UOMO"
    pool = await db.inventory_pools.find_one({"code": pool_code})
    locs = await db.locations.find({"pool_id": pool["id"]}).to_list(10)
    items_out = []; subtotal = 0.0
    for it in payload["items"]:
        v = await db.variants.find_one({"sku": it["sku"]})
        if not v:
            continue
        qty_remaining = int(it["quantity"])
        for loc in locs:
            if qty_remaining <= 0:
                break
            inv = await db.inventory.find_one({"variant_id": v["id"], "location_id": loc["id"]})
            available = int((inv or {}).get("on_hand", 0))
            if available <= 0:
                continue
            take = min(available, qty_remaining)
            await apply_movement(v["id"], loc["id"], -take, "SHOPIFY_SALE", channel, external_id,
                                 user["id"], f"{external_id}:{loc['code']}", f"Ordine {channel} {external_id}")
            qty_remaining -= take
        gross = float(it["unit_price"]) * int(it["quantity"])
        subtotal += gross
        items_out.append({"sku": it["sku"], "quantity": it["quantity"], "unit_price": it["unit_price"], "line_total": gross})
    number = await _next_number("sales", channel[:2])
    sale_doc = {
        "id": new_id(), "number": number, "location_id": locs[0]["id"] if locs else None,
        "items": items_out, "subtotal": round(subtotal, 2), "discount_total": 0.0,
        "total": round(subtotal, 2), "payment_method": "SHOPIFY", "customer_id": None,
        "user_id": None, "is_return": False, "original_sale_id": None, "channel": channel,
        "note": "", "external_id": external_id, "created_at": now_utc().isoformat(),
    }
    await db.sales.insert_one(sale_doc)
    await log_audit("SHOPIFY_ORDER", "sale", sale_doc["id"], user, {"channel": channel})
    return clean(sale_doc)


@api.get("/csv/profiles")
async def list_csv_profiles(user=Depends(get_current_user_dep)):
    return clean_list(await db.csv_profiles.find({}).to_list(200))


@api.post("/csv/preview")
async def csv_preview(file: UploadFile = File(...), user=Depends(get_current_user_dep)):
    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)[:20]
    return {"headers": reader.fieldnames or [], "rows": rows, "total": len(rows)}


@api.post("/csv/import")
async def csv_import(
    supplier_name: str = Form(...), mapping: str = Form(...),
    save_profile: str = Form("false"), file: UploadFile = File(...),
    user=Depends(get_current_user_dep),
):
    import json
    mapping_dict = json.loads(mapping)
    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    if save_profile.lower() == "true":
        await db.csv_profiles.insert_one({
            "id": new_id(), "supplier_name": supplier_name, "mapping": mapping_dict,
            "created_at": now_utc().isoformat(),
        })
    rows_ok = 0; rows_err = 0; errors = []
    for i, row in enumerate(reader, start=2):
        try:
            model_code = row.get(mapping_dict.get("model_code", ""), "").strip()
            color = row.get(mapping_dict.get("color", ""), "").strip()
            size = row.get(mapping_dict.get("size", ""), "").strip()
            ean = row.get(mapping_dict.get("ean", ""), "").strip() or None
            qty = int(float(row.get(mapping_dict.get("quantity", ""), "0") or 0))
            cost = float(row.get(mapping_dict.get("cost", ""), "0") or 0)
            price = float(row.get(mapping_dict.get("price", ""), "0") or 0)
            location_id = mapping_dict.get("default_location_id", "loc-donna-1")
            name = row.get(mapping_dict.get("name", ""), model_code)
            gender = mapping_dict.get("gender", "DONNA")
            channels = mapping_dict.get("channels", ["DONNA_1", "SHOPIFY_DONNA"] if gender == "DONNA" else ["UOMO", "SHOPIFY_UOMO"])
            if not model_code or not size:
                raise ValueError("Codice modello o taglia mancante")
            prod = await db.products.find_one({"model_code": model_code})
            if not prod:
                prod = {
                    "id": new_id(), "model_code": model_code, "name": name or model_code,
                    "description": "", "brand_id": None, "supplier_id": None, "category_id": None,
                    "season_id": None, "gender": gender, "vat_rate": 22.0, "status": "ATTIVO",
                    "channels": channels, "images": [], "is_demo": False,
                    "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
                }
                await db.products.insert_one(prod)
            sku = f"{model_code}-{color[:5].upper() if color else 'DEF'}-{size}"
            var = await db.variants.find_one({"sku": sku})
            if not var:
                var = {
                    "id": new_id(), "product_id": prod["id"], "color": color or "N/A",
                    "color_code": "", "size": size, "sku": sku, "ean": ean,
                    "cost": cost, "price": price, "compare_at_price": None,
                    "promo_price": None, "promo_start": None, "promo_end": None,
                    "created_at": now_utc().isoformat(),
                }
                await db.variants.insert_one(var)
            if qty > 0:
                await apply_movement(var["id"], location_id, qty, "PURCHASE", "IMPORT", supplier_name, user["id"], None, f"Import {supplier_name}")
            rows_ok += 1
        except Exception as e:
            rows_err += 1
            errors.append({"row": i, "error": str(e)})
    report = {"id": new_id(), "supplier_name": supplier_name, "filename": file.filename,
              "rows_total": rows_ok + rows_err, "rows_ok": rows_ok, "rows_error": rows_err,
              "errors": errors[:50], "created_at": now_utc().isoformat()}
    await db.csv_imports.insert_one(report)
    await log_audit("CSV_IMPORT", "csv", report["id"], user, {"supplier": supplier_name, "ok": rows_ok, "error": rows_err})
    return clean(report)


@api.get("/csv/imports")
async def list_csv_imports(user=Depends(get_current_user_dep)):
    return clean_list(await db.csv_imports.find({}).sort("created_at", -1).to_list(200))


@api.get("/promotions")
async def list_promotions(user=Depends(get_current_user_dep)):
    return clean_list(await db.promotions.find({}).sort("created_at", -1).to_list(500))


@api.post("/promotions")
async def create_promotion(payload: dict, user=Depends(require_roles("ADMIN", "MANAGER"))):
    doc = {"id": new_id(), "name": payload["name"], "scope": payload["scope"],
           "scope_id": payload["scope_id"], "discount_pct": float(payload["discount_pct"]),
           "start": payload["start"], "end": payload["end"], "active": True,
           "created_at": now_utc().isoformat()}
    await db.promotions.insert_one(doc)
    scope = payload["scope"]; sid = payload["scope_id"]
    variants_q = {}
    if scope == "BRAND":
        prods = await db.products.find({"brand_id": sid}).to_list(2000)
        variants_q = {"product_id": {"$in": [p["id"] for p in prods]}}
    elif scope == "CATEGORY":
        prods = await db.products.find({"category_id": sid}).to_list(2000)
        variants_q = {"product_id": {"$in": [p["id"] for p in prods]}}
    elif scope == "SEASON":
        prods = await db.products.find({"season_id": sid}).to_list(2000)
        variants_q = {"product_id": {"$in": [p["id"] for p in prods]}}
    elif scope == "PRODUCT":
        variants_q = {"product_id": sid}
    if variants_q:
        variants = await db.variants.find(variants_q).to_list(5000)
        for v in variants:
            new_price = round(v["price"] * (1 - float(payload["discount_pct"]) / 100.0), 2)
            await db.variants.update_one({"id": v["id"]}, {"$set": {
                "promo_price": new_price, "promo_start": payload["start"], "promo_end": payload["end"],
                "compare_at_price": v.get("compare_at_price") or v["price"],
            }})
            await enqueue_shopify_sync_for_variant(v["id"])
    await log_audit("PROMOTION", "promotion", doc["id"], user, {k: v for k, v in doc.items() if k != "_id"})
    return clean(doc)


@api.get("/customers")
async def list_customers(user=Depends(get_current_user_dep)):
    return clean_list(await db.customers.find({}).to_list(1000))


@api.post("/customers")
async def create_customer(payload: dict, user=Depends(get_current_user_dep)):
    doc = {"id": new_id(), "name": payload["name"], "email": payload.get("email"),
           "phone": payload.get("phone"), "created_at": now_utc().isoformat()}
    await db.customers.insert_one(doc)
    return clean(doc)


@api.get("/audit-logs")
async def list_audit(limit: int = 300, user=Depends(require_roles("ADMIN", "MANAGER"))):
    docs = await db.audit_logs.find({}).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
        det = d.get("details")
        if isinstance(det, dict):
            det.pop("_id", None)
    return docs


app.include_router(api)

app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"], expose_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    pass
