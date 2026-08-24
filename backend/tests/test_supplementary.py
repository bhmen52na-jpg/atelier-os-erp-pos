"""Supplementary integration checks: MongoDB indexes, permissions, SKU duplicates,
pool consistency, cashier restrictions."""
import os, time, requests, pytest
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://omni-retail-hub-7.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("bhmen52na@gmail.com", "Admin123!")
CASSA = ("cassa.donna1@demo.local", "Demo123!")


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(*ADMIN)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cassa_h():
    return {"Authorization": f"Bearer {_login(*CASSA)}", "Content-Type": "application/json"}


class TestCashierPermissions:
    def test_cassiere_cannot_list_users(self, cassa_h):
        r = requests.get(f"{API}/users", headers=cassa_h)
        assert r.status_code == 403, r.text

    def test_cassiere_cannot_create_users(self, cassa_h):
        r = requests.post(f"{API}/users", json={"email": "x@y.local", "name": "X", "role": "CASSIERE_UOMO", "password": "Demo123!"}, headers=cassa_h)
        assert r.status_code == 403


class TestDuplicateSKU:
    def test_duplicate_sku_rejected(self, admin_h):
        sku = f"DUP-SKU-{int(time.time()*1000)}"
        payload1 = {
            "model_code": f"DUP-M-{int(time.time()*1000)}", "name": "dup test", "gender": "DONNA",
            "channels": ["DONNA_1"],
            "variants": [{"color": "N", "size": "M", "sku": sku, "ean": None, "cost": 1.0, "price": 10.0, "initial_stock": {"loc-donna-1": 1}}],
        }
        r1 = requests.post(f"{API}/products", json=payload1, headers=admin_h)
        assert r1.status_code == 200, r1.text
        # Duplicate
        payload2 = dict(payload1)
        payload2["model_code"] = f"DUP-M2-{int(time.time()*1000)}"
        r2 = requests.post(f"{API}/products", json=payload2, headers=admin_h)
        assert r2.status_code == 400, r2.text


class TestChannelValidation:
    def test_donna_with_shopify_uomo_rejected(self, admin_h):
        payload = {
            "model_code": f"CH-{int(time.time()*1000)}", "name": "ch test", "gender": "DONNA",
            "channels": ["DONNA_1", "SHOPIFY_UOMO"], "variants": []
        }
        r = requests.post(f"{API}/products", json=payload, headers=admin_h)
        assert r.status_code == 400


class TestAuditLogsAfterWrites:
    def test_audit_logs_ok_after_activity(self, admin_h):
        # After many writes across the suite, audit-logs must still be 200 (ObjectId regression)
        r = requests.get(f"{API}/audit-logs?limit=200", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestPoolConsistency:
    def test_donna_pool_invariant_after_transfer(self, admin_h):
        sku = f"POOL-{int(time.time()*1000)}"
        payload = {
            "model_code": f"POOL-M-{int(time.time()*1000)}", "name": "pool test", "gender": "DONNA",
            "channels": ["DONNA_1", "DONNA_2"],
            "variants": [{"color": "N", "size": "M", "sku": sku, "cost": 1.0, "price": 10.0, "initial_stock": {"loc-donna-1": 5, "loc-donna-2": 3}}],
        }
        r = requests.post(f"{API}/products", json=payload, headers=admin_h)
        assert r.status_code == 200
        v = requests.get(f"{API}/variants/lookup?code={sku}", headers=admin_h).json()
        pool_before = v["stock_by_location"]["loc-donna-1"] + v["stock_by_location"]["loc-donna-2"]

        # Transfer 2 D1 -> D2
        r = requests.post(f"{API}/transfers", json={"from_location_id": "loc-donna-1", "to_location_id": "loc-donna-2",
                                                     "items": [{"variant_id": v["id"], "quantity": 2}]}, headers=admin_h)
        assert r.status_code == 200
        v2 = requests.get(f"{API}/variants/lookup?code={sku}", headers=admin_h).json()
        pool_after = v2["stock_by_location"]["loc-donna-1"] + v2["stock_by_location"]["loc-donna-2"]
        assert pool_after == pool_before


class TestWebhookIdempotencyStrict:
    def test_double_webhook_same_external_id(self, admin_h):
        sku = f"WHK-{int(time.time()*1000)}"
        payload = {
            "model_code": f"WHK-M-{int(time.time()*1000)}", "name": "webhook test", "gender": "DONNA",
            "channels": ["DONNA_1", "SHOPIFY_DONNA"],
            "variants": [{"color": "N", "size": "M", "sku": sku, "cost": 1.0, "price": 20.0, "initial_stock": {"loc-donna-1": 4}}],
        }
        r = requests.post(f"{API}/products", json=payload, headers=admin_h)
        assert r.status_code == 200
        v = requests.get(f"{API}/variants/lookup?code={sku}", headers=admin_h).json()
        before = sum(v["stock_by_location"].values())
        ext = f"WHK-EXT-{int(time.time()*1000)}"
        wh = {"channel": "SHOPIFY_DONNA", "external_id": ext,
              "items": [{"sku": sku, "quantity": 1, "unit_price": v["price"]}]}
        r1 = requests.post(f"{API}/shopify/webhook/order", json=wh, headers=admin_h)
        r2 = requests.post(f"{API}/shopify/webhook/order", json=wh, headers=admin_h)
        r3 = requests.post(f"{API}/shopify/webhook/order", json=wh, headers=admin_h)
        assert r1.status_code == 200
        assert r2.status_code == 200 and r2.json().get("idempotent") is True
        assert r3.status_code == 200 and r3.json().get("idempotent") is True
        v2 = requests.get(f"{API}/variants/lookup?code={sku}", headers=admin_h).json()
        after = sum(v2["stock_by_location"].values())
        assert after == before - 1, f"expected {before-1} got {after}"


# ---------- MONGO INDEXES ----------
@pytest.mark.asyncio
async def test_mongo_indexes_present():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not set")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    checks = {
        "variants": ["sku_1", "ean_1"],
        "inventory": ["variant_id_1_location_id_1"],
        "users": ["email_1"],
        "sales": ["number_1"],
        "inventory_movements": ["external_id_1"],
    }
    missing = []
    for coll, wanted in checks.items():
        idx = await db[coll].index_information()
        for w in wanted:
            if w not in idx:
                # Try alternative naming
                found = any(w.split("_")[0] in "".join(k) for k in idx.keys())
                if not found:
                    missing.append(f"{coll}:{w}")
    client.close()
    assert not missing, f"Missing indexes: {missing}"
