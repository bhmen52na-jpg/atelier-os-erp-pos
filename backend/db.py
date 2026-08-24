"""MongoDB setup + startup: indexes + seed base locations/pools + demo data + admin."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from auth_utils import hash_password, verify_password
from models import now_utc

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.locations.create_index("code", unique=True)
    await db.inventory_pools.create_index("code", unique=True)
    await db.products.create_index("id", unique=True)
    await db.products.create_index("model_code")
    await db.variants.create_index("id", unique=True)
    await db.variants.create_index("sku", unique=True)
    await db.variants.create_index("ean")
    await db.variants.create_index("product_id")
    await db.inventory.create_index([("variant_id", 1), ("location_id", 1)], unique=True)
    await db.inventory_movements.create_index("variant_id")
    await db.inventory_movements.create_index("created_at")
    try:
        await db.inventory_movements.drop_index("external_id_1")
    except Exception:
        pass
    await db.inventory_movements.create_index(
        "external_id", unique=True,
        partialFilterExpression={"external_id": {"$type": "string"}},
    )
    await db.sales.create_index("number", unique=True)
    await db.sales.create_index("created_at")
    try:
        await db.sales.drop_index("external_id_1")
    except Exception:
        pass
    await db.sales.create_index(
        "external_id", unique=True,
        partialFilterExpression={"external_id": {"$type": "string"}},
    )
    await db.transfers.create_index("number", unique=True)
    await db.sync_jobs.create_index("status")
    await db.sync_jobs.create_index("sku")
    await db.audit_logs.create_index("created_at")
    await db.shopify_connections.create_index("code", unique=True)


async def seed_base():
    # Pools
    pools = [
        {"id": "pool-donna", "code": "POOL_DONNA", "name": "Pool Donna", "area": "DONNA"},
        {"id": "pool-uomo", "code": "POOL_UOMO", "name": "Pool Uomo", "area": "UOMO"},
    ]
    for p in pools:
        await db.inventory_pools.update_one({"code": p["code"]}, {"$setOnInsert": p}, upsert=True)

    # Locations
    locs = [
        {"id": "loc-donna-1", "code": "LOCATION_DONNA_1", "name": "Negozio Donna 1", "area": "DONNA", "pool_id": "pool-donna"},
        {"id": "loc-donna-2", "code": "LOCATION_DONNA_2", "name": "Negozio Donna 2", "area": "DONNA", "pool_id": "pool-donna"},
        {"id": "loc-uomo", "code": "LOCATION_UOMO", "name": "Negozio Uomo", "area": "UOMO", "pool_id": "pool-uomo"},
    ]
    for l in locs:
        await db.locations.update_one({"code": l["code"]}, {"$setOnInsert": l}, upsert=True)

    # Shopify connection stubs
    for c in [
        {"id": "shopify-donna", "code": "SHOPIFY_DONNA", "pool_id": "pool-donna", "connected": False},
        {"id": "shopify-uomo", "code": "SHOPIFY_UOMO", "pool_id": "pool-uomo", "connected": False},
    ]:
        await db.shopify_connections.update_one({"code": c["code"]}, {"$setOnInsert": c}, upsert=True)


async def seed_admin_and_demo_users():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    users = [
        {"id": "user-admin", "email": admin_email, "name": "Amministratore", "role": "ADMIN", "location_id": None, "is_demo": False, "password": admin_password},
        {"id": "user-manager", "email": "manager@demo.local", "name": "Manager Demo", "role": "MANAGER", "location_id": None, "is_demo": True, "password": "Demo123!"},
        {"id": "user-cass-d1", "email": "cassa.donna1@demo.local", "name": "Cassa Donna 1", "role": "CASSIERE_DONNA_1", "location_id": "loc-donna-1", "is_demo": True, "password": "Demo123!"},
        {"id": "user-cass-d2", "email": "cassa.donna2@demo.local", "name": "Cassa Donna 2", "role": "CASSIERE_DONNA_2", "location_id": "loc-donna-2", "is_demo": True, "password": "Demo123!"},
        {"id": "user-cass-u", "email": "cassa.uomo@demo.local", "name": "Cassa Uomo", "role": "CASSIERE_UOMO", "location_id": "loc-uomo", "is_demo": True, "password": "Demo123!"},
    ]
    for u in users:
        pwd = u.pop("password")
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            u["password_hash"] = hash_password(pwd)
            u["created_at"] = now_utc().isoformat()
            await db.users.insert_one(u)
        else:
            # keep admin password in sync with .env
            if u["email"] == admin_email and not verify_password(pwd, existing.get("password_hash", "")):
                await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(pwd)}})


async def seed_demo_catalog():
    if await db.products.count_documents({"is_demo": True}) >= 8:
        return

    # Brands + season + category
    brand_imp = {"id": "brand-imperial", "name": "Imperial"}
    brand_liu = {"id": "brand-liujo", "name": "Liu Jo"}
    brand_diesel = {"id": "brand-diesel", "name": "Diesel"}
    brand_gaudi = {"id": "brand-gaudi", "name": "Gaudì"}
    for b in [brand_imp, brand_liu, brand_diesel, brand_gaudi]:
        await db.brands.update_one({"id": b["id"]}, {"$setOnInsert": b}, upsert=True)

    for s in [
        {"id": "season-fw26", "code": "FW26", "name": "Autunno/Inverno 2026"},
        {"id": "season-ss27", "code": "SS27", "name": "Primavera/Estate 2027"},
    ]:
        await db.seasons.update_one({"id": s["id"]}, {"$setOnInsert": s}, upsert=True)

    for c in [
        {"id": "cat-camicie", "name": "Camicie", "parent_id": None},
        {"id": "cat-giacche", "name": "Giacche", "parent_id": None},
        {"id": "cat-jeans", "name": "Jeans", "parent_id": None},
        {"id": "cat-tshirt", "name": "T-Shirt", "parent_id": None},
        {"id": "cat-vestiti", "name": "Vestiti", "parent_id": None},
    ]:
        await db.categories.update_one({"id": c["id"]}, {"$setOnInsert": c}, upsert=True)

    # ---------- Products ----------
    now = now_utc().isoformat()
    products_data = [
        # DONNA
        {"model": "IMP-CAM-001", "name": "Camicia Imperial Nera", "brand": "brand-imperial", "cat": "cat-camicie", "gender": "DONNA", "channels": ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA"], "variants": [
            {"color": "Nero", "size": "S", "sku": "IMP001-NERO-S", "ean": "8001234500011", "price": 89.00, "cost": 32.0, "stock": {"loc-donna-1": 3, "loc-donna-2": 2}},
            {"color": "Nero", "size": "M", "sku": "IMP001-NERO-M", "ean": "8001234500028", "price": 89.00, "cost": 32.0, "stock": {"loc-donna-1": 2, "loc-donna-2": 1}},
            {"color": "Nero", "size": "L", "sku": "IMP001-NERO-L", "ean": "8001234500035", "price": 89.00, "cost": 32.0, "stock": {"loc-donna-1": 1, "loc-donna-2": 0}},
        ]},
        {"model": "LJ-VEST-014", "name": "Vestito Liu Jo Floreale", "brand": "brand-liujo", "cat": "cat-vestiti", "gender": "DONNA", "channels": ["DONNA_1", "SHOPIFY_DONNA"], "variants": [
            {"color": "Rosa", "size": "S", "sku": "LJ014-ROSA-S", "ean": "8001234500042", "price": 179.00, "compare": 219.00, "cost": 64.0, "stock": {"loc-donna-1": 2, "loc-donna-2": 0}},
            {"color": "Rosa", "size": "M", "sku": "LJ014-ROSA-M", "ean": "8001234500059", "price": 179.00, "compare": 219.00, "cost": 64.0, "stock": {"loc-donna-1": 1, "loc-donna-2": 1}},
        ]},
        {"model": "IMP-GIAC-207", "name": "Giacca Imperial Doppiopetto", "brand": "brand-imperial", "cat": "cat-giacche", "gender": "DONNA", "channels": ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA"], "variants": [
            {"color": "Beige", "size": "M", "sku": "IMP207-BEIGE-M", "ean": "8001234500066", "price": 259.00, "cost": 92.0, "stock": {"loc-donna-1": 1, "loc-donna-2": 2}},
            {"color": "Beige", "size": "L", "sku": "IMP207-BEIGE-L", "ean": "8001234500073", "price": 259.00, "cost": 92.0, "stock": {"loc-donna-1": 0, "loc-donna-2": 1}},
        ]},
        {"model": "LJ-JEAN-050", "name": "Jeans Liu Jo Skinny", "brand": "brand-liujo", "cat": "cat-jeans", "gender": "DONNA", "channels": ["DONNA_2", "SHOPIFY_DONNA"], "variants": [
            {"color": "Denim", "size": "26", "sku": "LJ050-DEN-26", "ean": "8001234500080", "price": 129.00, "cost": 45.0, "stock": {"loc-donna-1": 0, "loc-donna-2": 3}},
            {"color": "Denim", "size": "28", "sku": "LJ050-DEN-28", "ean": "8001234500097", "price": 129.00, "cost": 45.0, "stock": {"loc-donna-1": 0, "loc-donna-2": 2}},
        ]},
        {"model": "IMP-TSH-088", "name": "T-Shirt Imperial Basic", "brand": "brand-imperial", "cat": "cat-tshirt", "gender": "DONNA", "channels": ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA"], "variants": [
            {"color": "Bianco", "size": "S", "sku": "IMP088-BIA-S", "ean": "8001234500103", "price": 39.00, "cost": 12.0, "stock": {"loc-donna-1": 5, "loc-donna-2": 4}},
            {"color": "Bianco", "size": "M", "sku": "IMP088-BIA-M", "ean": "8001234500110", "price": 39.00, "cost": 12.0, "stock": {"loc-donna-1": 6, "loc-donna-2": 3}},
        ]},
        # UOMO
        {"model": "DSL-JEAN-901", "name": "Jeans Diesel Slim", "brand": "brand-diesel", "cat": "cat-jeans", "gender": "UOMO", "channels": ["UOMO", "SHOPIFY_UOMO"], "variants": [
            {"color": "Blu", "size": "30", "sku": "DSL901-BLU-30", "ean": "8009000000017", "price": 149.00, "cost": 55.0, "stock": {"loc-uomo": 4}},
            {"color": "Blu", "size": "32", "sku": "DSL901-BLU-32", "ean": "8009000000024", "price": 149.00, "cost": 55.0, "stock": {"loc-uomo": 3}},
            {"color": "Blu", "size": "34", "sku": "DSL901-BLU-34", "ean": "8009000000031", "price": 149.00, "cost": 55.0, "stock": {"loc-uomo": 2}},
        ]},
        {"model": "GAU-CAM-421", "name": "Camicia Gaudì Slim Fit", "brand": "brand-gaudi", "cat": "cat-camicie", "gender": "UOMO", "channels": ["UOMO", "SHOPIFY_UOMO"], "variants": [
            {"color": "Azzurro", "size": "M", "sku": "GAU421-AZZ-M", "ean": "8009000000048", "price": 79.00, "cost": 28.0, "stock": {"loc-uomo": 3}},
            {"color": "Azzurro", "size": "L", "sku": "GAU421-AZZ-L", "ean": "8009000000055", "price": 79.00, "cost": 28.0, "stock": {"loc-uomo": 2}},
        ]},
        {"model": "DSL-GIAC-311", "name": "Giacca Diesel Denim", "brand": "brand-diesel", "cat": "cat-giacche", "gender": "UOMO", "channels": ["UOMO", "SHOPIFY_UOMO"], "variants": [
            {"color": "Denim", "size": "M", "sku": "DSL311-DEN-M", "ean": "8009000000062", "price": 229.00, "cost": 78.0, "stock": {"loc-uomo": 2}},
            {"color": "Denim", "size": "L", "sku": "DSL311-DEN-L", "ean": "8009000000079", "price": 229.00, "cost": 78.0, "stock": {"loc-uomo": 1}},
        ]},
    ]

    from models import new_id
    for pd in products_data:
        prod_id = new_id()
        prod_doc = {
            "id": prod_id, "model_code": pd["model"], "name": pd["name"],
            "description": f"{pd['name']} - Prodotto DEMO", "brand_id": pd["brand"],
            "supplier_id": None, "category_id": pd["cat"], "season_id": "season-fw26",
            "gender": pd["gender"], "vat_rate": 22.0, "status": "ATTIVO",
            "channels": pd["channels"], "images": [], "is_demo": True,
            "created_at": now, "updated_at": now,
        }
        await db.products.insert_one(prod_doc)
        for v in pd["variants"]:
            var_id = new_id()
            var_doc = {
                "id": var_id, "product_id": prod_id, "color": v["color"], "color_code": "",
                "size": v["size"], "sku": v["sku"], "ean": v["ean"],
                "cost": v["cost"], "price": v["price"],
                "compare_at_price": v.get("compare"), "promo_price": None,
                "promo_start": None, "promo_end": None, "created_at": now,
            }
            await db.variants.insert_one(var_doc)
            for loc_id, qty in v["stock"].items():
                await db.inventory.insert_one({
                    "id": new_id(), "variant_id": var_id, "location_id": loc_id,
                    "on_hand": qty, "reserved": 0, "updated_at": now,
                })
                if qty > 0:
                    await db.inventory_movements.insert_one({
                        "id": new_id(), "variant_id": var_id, "location_id": loc_id,
                        "type": "INITIAL_STOCK", "quantity": qty, "origin": "SEED",
                        "document_ref": "DEMO", "user_id": "user-admin",
                        "external_id": None, "note": "Stock iniziale DEMO",
                        "created_at": now,
                    })
