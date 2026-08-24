"""ERP/POS backend regression suite (pytest).

Covers: auth, catalog, POS sale + stock decrement, transfers, Shopify webhook idempotency,
channel validation, dashboard, sync jobs, audit, users."""
import os
import io
import json
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://omni-retail-hub-7.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("bhmen52na@gmail.com", "Admin123!")
CASSA_D1 = ("cassa.donna1@demo.local", "Demo123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- AUTH ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["user"]["email"] == ADMIN[0]
        assert data["user"]["role"] == "ADMIN"

    def test_login_demo_cassa_donna1(self):
        r = requests.post(f"{API}/auth/login", json={"email": CASSA_D1[0], "password": CASSA_D1[1]})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "CASSIERE_DONNA_1"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN[0]

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_demo_users_list(self):
        r = requests.get(f"{API}/auth/demo-users")
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        for e in ["manager@demo.local", "cassa.donna1@demo.local", "cassa.donna2@demo.local", "cassa.uomo@demo.local"]:
            assert e in emails


# ---------- META / SEEDS ----------
class TestMeta:
    def test_locations(self, admin_headers):
        r = requests.get(f"{API}/meta/locations")
        assert r.status_code == 200
        codes = {l["code"] for l in r.json()}
        assert {"LOCATION_DONNA_1", "LOCATION_DONNA_2", "LOCATION_UOMO"}.issubset(codes)

    def test_pools(self):
        r = requests.get(f"{API}/meta/pools")
        assert r.status_code == 200
        codes = {p["code"] for p in r.json()}
        assert {"POOL_DONNA", "POOL_UOMO"}.issubset(codes)

    def test_products_seed(self, admin_headers):
        r = requests.get(f"{API}/products", headers=admin_headers)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) >= 8
        donna = [p for p in prods if p["gender"] == "DONNA"]
        uomo = [p for p in prods if p["gender"] == "UOMO"]
        assert len(donna) >= 5 and len(uomo) >= 3


# ---------- CATALOG / VARIANT LOOKUP ----------
class TestVariantLookup:
    def test_lookup_by_ean(self, admin_headers):
        r = requests.get(f"{API}/variants/lookup?code=8001234500028", headers=admin_headers)
        assert r.status_code == 200
        v = r.json()
        assert v["sku"] == "IMP001-NERO-M"
        assert "stock_by_location" in v

    def test_lookup_by_sku(self, admin_headers):
        r = requests.get(f"{API}/variants/lookup?code=DSL901-BLU-30", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["sku"] == "DSL901-BLU-30"

    def test_lookup_not_found(self, admin_headers):
        r = requests.get(f"{API}/variants/lookup?code=NON_EXISTENT_XYZ", headers=admin_headers)
        assert r.status_code == 404


def _get_variant(sku, headers):
    r = requests.get(f"{API}/variants/lookup?code={sku}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- POS SALE + STOCK DECREMENT (TEST A/B/C) ----------
def _create_fresh_product(headers, model_code, sku, gender, initial_stock, price=99.0):
    """Create a fresh product with known stock so tests are self-sufficient."""
    payload = {
        "model_code": model_code, "name": f"Regression {model_code}", "gender": gender,
        "channels": ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA"] if gender == "DONNA" else ["UOMO", "SHOPIFY_UOMO"],
        "variants": [{
            "color": "RegColor", "size": "M", "sku": sku, "ean": None,
            "cost": 10.0, "price": price, "initial_stock": initial_stock,
        }],
    }
    r = requests.post(f"{API}/products", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


class TestPOSAndStock:
    def test_A_sale_donna1_decrements_only_donna1(self, admin_headers):
        # Provision own stock: Donna1=2, Donna2=1
        sku = f"REG-A-{int(time.time()*1000)}"
        prod = _create_fresh_product(admin_headers, f"REG-A-{int(time.time()*1000)}", sku, "DONNA",
                                     {"loc-donna-1": 2, "loc-donna-2": 1})
        v = _get_variant(sku, admin_headers)
        before_d1 = v["stock_by_location"].get("loc-donna-1", 0)
        before_d2 = v["stock_by_location"].get("loc-donna-2", 0)
        assert before_d1 == 2 and before_d2 == 1

        payload = {
            "location_id": "loc-donna-1",
            "items": [{"variant_id": v["id"], "quantity": 1, "unit_price": v["price"], "discount_pct": 0}],
            "payment_method": "CARTA",
        }
        r = requests.post(f"{API}/pos/sales", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["channel"] == "POS" and sale["total"] > 0

        v2 = _get_variant(sku, admin_headers)
        assert v2["stock_by_location"].get("loc-donna-1", 0) == before_d1 - 1
        assert v2["stock_by_location"].get("loc-donna-2", 0) == before_d2
        # Pool total decremented by exactly 1
        assert sum(v2["stock_by_location"].values()) == before_d1 + before_d2 - 1

    def test_B_sale_donna2_decrements_only_donna2(self, admin_headers):
        sku = f"REG-B-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-B-{int(time.time()*1000)}", sku, "DONNA",
                              {"loc-donna-1": 1, "loc-donna-2": 2})
        v = _get_variant(sku, admin_headers)
        before_d1 = v["stock_by_location"].get("loc-donna-1", 0)
        before_d2 = v["stock_by_location"].get("loc-donna-2", 0)
        payload = {"location_id": "loc-donna-2", "items": [{"variant_id": v["id"], "quantity": 1, "unit_price": v["price"]}], "payment_method": "CONTANTI"}
        r = requests.post(f"{API}/pos/sales", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        v2 = _get_variant(sku, admin_headers)
        assert v2["stock_by_location"].get("loc-donna-2", 0) == before_d2 - 1
        assert v2["stock_by_location"].get("loc-donna-1", 0) == before_d1

    def test_C_sale_uomo_does_not_affect_donna(self, admin_headers):
        # UOMO product with stock
        sku_u = f"REG-CU-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-CU-{int(time.time()*1000)}", sku_u, "UOMO",
                              {"loc-uomo": 2})
        # DONNA product for snapshot
        sku_d = f"REG-CD-{int(time.time()*1000)+1}"
        _create_fresh_product(admin_headers, f"REG-CD-{int(time.time()*1000)+1}", sku_d, "DONNA",
                              {"loc-donna-1": 2, "loc-donna-2": 1})
        vu = _get_variant(sku_u, admin_headers)
        before_u = vu["stock_by_location"].get("loc-uomo", 0)
        vd = _get_variant(sku_d, admin_headers)
        d1_before = vd["stock_by_location"].get("loc-donna-1", 0)
        d2_before = vd["stock_by_location"].get("loc-donna-2", 0)

        payload = {"location_id": "loc-uomo", "items": [{"variant_id": vu["id"], "quantity": 1, "unit_price": vu["price"]}], "payment_method": "CARTA"}
        r = requests.post(f"{API}/pos/sales", json=payload, headers=admin_headers)
        assert r.status_code == 200

        vu2 = _get_variant(sku_u, admin_headers)
        assert vu2["stock_by_location"].get("loc-uomo", 0) == before_u - 1

        vd2 = _get_variant(sku_d, admin_headers)
        assert vd2["stock_by_location"].get("loc-donna-1", 0) == d1_before
        assert vd2["stock_by_location"].get("loc-donna-2", 0) == d2_before

    def test_sale_insufficient_stock_400(self, admin_headers):
        sku = f"REG-IS-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-IS-{int(time.time()*1000)}", sku, "UOMO",
                              {"loc-uomo": 1})
        v = _get_variant(sku, admin_headers)
        payload = {"location_id": "loc-uomo", "items": [{"variant_id": v["id"], "quantity": 9999, "unit_price": v["price"]}], "payment_method": "CARTA"}
        r = requests.post(f"{API}/pos/sales", json=payload, headers=admin_headers)
        assert r.status_code == 400


# ---------- TRANSFERS (TEST D) ----------
class TestTransfers:
    def test_D_transfer_donna1_to_donna2(self, admin_headers):
        sku = f"REG-D-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-D-{int(time.time()*1000)}", sku, "DONNA",
                              {"loc-donna-1": 3, "loc-donna-2": 2})
        v = _get_variant(sku, admin_headers)
        d1 = v["stock_by_location"].get("loc-donna-1", 0)
        d2 = v["stock_by_location"].get("loc-donna-2", 0)
        payload = {"from_location_id": "loc-donna-1", "to_location_id": "loc-donna-2",
                   "items": [{"variant_id": v["id"], "quantity": 1}]}
        r = requests.post(f"{API}/transfers", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        v2 = _get_variant(sku, admin_headers)
        assert v2["stock_by_location"].get("loc-donna-1", 0) == d1 - 1
        assert v2["stock_by_location"].get("loc-donna-2", 0) == d2 + 1
        # Pool total invariant
        assert (v2["stock_by_location"].get("loc-donna-1", 0) + v2["stock_by_location"].get("loc-donna-2", 0)) == d1 + d2

    def test_transfer_cross_pool_rejected(self, admin_headers):
        sku = f"REG-XP-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-XP-{int(time.time()*1000)}", sku, "DONNA",
                              {"loc-donna-1": 2})
        v = _get_variant(sku, admin_headers)
        payload = {"from_location_id": "loc-donna-1", "to_location_id": "loc-uomo",
                   "items": [{"variant_id": v["id"], "quantity": 1}]}
        r = requests.post(f"{API}/transfers", json=payload, headers=admin_headers)
        assert r.status_code == 400


# ---------- SHOPIFY WEBHOOK IDEMPOTENCY (TEST E) ----------
class TestShopifyWebhook:
    def test_E_webhook_idempotent(self, admin_headers):
        # Provision a fresh product with known stock in Donna pool
        sku = f"REG-E-{int(time.time()*1000)}"
        _create_fresh_product(admin_headers, f"REG-E-{int(time.time()*1000)}", sku, "DONNA",
                              {"loc-donna-1": 3, "loc-donna-2": 2})
        v = _get_variant(sku, admin_headers)
        before_total = sum(v["stock_by_location"].values())
        assert before_total == 5

        ext = f"TEST-ORDER-{int(time.time()*1000)}"
        payload = {"channel": "SHOPIFY_DONNA", "external_id": ext,
                   "items": [{"sku": sku, "quantity": 1, "unit_price": v["price"]}]}
        r1 = requests.post(f"{API}/shopify/webhook/order", json=payload, headers=admin_headers)
        assert r1.status_code == 200, r1.text
        # Second call - idempotent
        r2 = requests.post(f"{API}/shopify/webhook/order", json=payload, headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json().get("idempotent") is True

        v2 = _get_variant(sku, admin_headers)
        after_total = sum(v2["stock_by_location"].values())
        assert after_total == before_total - 1  # decremented once only


# ---------- PRODUCT CREATE + CHANNEL VALIDATION ----------
class TestProductCreate:
    def test_create_product_invalid_channel_for_donna(self, admin_headers):
        payload = {
            "model_code": "TEST-INVALID-001", "name": "TEST invalid", "gender": "DONNA",
            "channels": ["SHOPIFY_UOMO"], "variants": []
        }
        r = requests.post(f"{API}/products", json=payload, headers=admin_headers)
        assert r.status_code == 400

    def test_create_product_valid(self, admin_headers):
        payload = {
            "model_code": f"TEST-M-{int(time.time())}", "name": "TEST prodotto", "gender": "DONNA",
            "channels": ["DONNA_1", "SHOPIFY_DONNA"],
            "variants": [{
                "color": "Rosso", "size": "M", "sku": f"TSTSKU-{int(time.time())}",
                "ean": None, "cost": 10.0, "price": 30.0, "initial_stock": {"loc-donna-1": 5}
            }]
        }
        r = requests.post(f"{API}/products", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["total_stock"] == 5


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_dashboard_summary(self, admin_headers):
        r = requests.get(f"{API}/dashboard/summary", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["sales_today", "sales_donna", "sales_uomo", "sales_shopify_donna",
                  "sales_shopify_uomo", "stock_value", "understock_count", "outofstock_count",
                  "last_movements", "shopify_connections"]:
            assert k in d


# ---------- INVENTORY MOVEMENTS ----------
class TestMovements:
    def test_movements_list(self, admin_headers):
        r = requests.get(f"{API}/inventory/movements?limit=50", headers=admin_headers)
        assert r.status_code == 200
        mvs = r.json()
        assert isinstance(mvs, list) and len(mvs) > 0
        types = {m["type"] for m in mvs}
        assert any(t in types for t in ["SALE", "TRANSFER_IN", "TRANSFER_OUT", "INITIAL_STOCK", "SHOPIFY_SALE"])


# ---------- SHOPIFY CONNECTIONS ----------
class TestShopifyConn:
    def test_list_connections(self, admin_headers):
        r = requests.get(f"{API}/shopify/connections", headers=admin_headers)
        assert r.status_code == 200
        codes = {c["code"] for c in r.json()}
        assert {"SHOPIFY_DONNA", "SHOPIFY_UOMO"}.issubset(codes)

    def test_update_and_test_connection(self, admin_headers):
        r = requests.put(f"{API}/shopify/connections/SHOPIFY_DONNA",
                         json={"store_domain": "test-donna.myshopify.com", "access_token": "shpat_TESTTOKEN1234"},
                         headers=admin_headers)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/shopify/connections/SHOPIFY_DONNA/test", headers=admin_headers)
        assert r2.status_code == 200
        assert "autorizzazione" in r2.json()["message"].lower()

    def test_sync_enqueues(self, admin_headers):
        r = requests.post(f"{API}/shopify/connections/SHOPIFY_DONNA/sync", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_sync_jobs_list(self, admin_headers):
        r = requests.get(f"{API}/sync/jobs", headers=admin_headers)
        assert r.status_code == 200


# ---------- USERS ----------
class TestUsers:
    def test_list_users_admin(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_create_user_requires_admin(self):
        cassa_token = _login(*CASSA_D1)
        h = {"Authorization": f"Bearer {cassa_token}", "Content-Type": "application/json"}
        r = requests.post(f"{API}/users", json={"email": "x@y.local", "name": "X", "role": "CASSIERE_UOMO", "password": "Demo123!"}, headers=h)
        assert r.status_code == 403


# ---------- AUDIT LOGS ----------
class TestAudit:
    def test_audit_logs(self, admin_headers):
        r = requests.get(f"{API}/audit-logs?limit=50", headers=admin_headers)
        assert r.status_code == 200
        actions = {a["action"] for a in r.json()}
        assert "LOGIN" in actions


# ---------- CSV IMPORT ----------
class TestCSV:
    def test_csv_preview(self, admin_token):
        csv_content = "ARTICOLO,COLORE,TAGLIA,EAN,QUANTITA,COSTO,PREZZO\nTEST-CSV-001,Nero,M,9999999999999,3,10.5,29.9\n"
        files = {"file": ("test.csv", csv_content, "text/csv")}
        r = requests.post(f"{API}/csv/preview", files=files, headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "ARTICOLO" in data["headers"]

    def test_csv_import(self, admin_token):
        csv_content = f"ARTICOLO,COLORE,TAGLIA,EAN,QUANTITA,COSTO,PREZZO\nTEST-CSV-{int(time.time())},Verde,M,,2,15,45\n"
        files = {"file": ("test.csv", csv_content, "text/csv")}
        data = {
            "supplier_name": "TEST_SUPPLIER",
            "mapping": json.dumps({"model_code": "ARTICOLO", "color": "COLORE", "size": "TAGLIA",
                                   "ean": "EAN", "quantity": "QUANTITA", "cost": "COSTO", "price": "PREZZO",
                                   "default_location_id": "loc-donna-1", "gender": "DONNA",
                                   "channels": ["DONNA_1", "SHOPIFY_DONNA"]}),
            "save_profile": "false",
        }
        r = requests.post(f"{API}/csv/import", files=files, data=data, headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["rows_ok"] >= 1


# ---------- PROMOTIONS ----------
class TestPromotions:
    def test_create_promotion(self, admin_headers):
        payload = {
            "name": f"TEST Promo {int(time.time())}", "scope": "CATEGORY",
            "scope_id": "cat-tshirt", "discount_pct": 10,
            "start": "2026-01-01T00:00:00", "end": "2026-12-31T23:59:59"
        }
        r = requests.post(f"{API}/promotions", json=payload, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["discount_pct"] == 10
