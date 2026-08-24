import { useEffect, useState } from "react";
import { api, apiError, fmtDate, fmtEUR } from "@/lib/api";
import { toast } from "sonner";

export function SalesHistory() {
    const [sales, setSales] = useState([]);
    const [locations, setLocations] = useState([]);
    useEffect(() => {
        api.get("/pos/sales").then((r) => setSales(r.data));
        api.get("/meta/locations").then((r) => setLocations(r.data));
    }, []);
    const locName = (id) => locations.find((l) => l.id === id)?.name || id;
    return (
        <div className="space-y-6" data-testid="sales-history">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Vendite</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Storico vendite</h1>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Numero</th><th className="text-left p-3">Data</th><th className="text-left p-3">Punto vendita / Canale</th><th className="text-left p-3">Articoli</th><th className="text-left p-3">Pagamento</th><th className="text-right p-3">Totale</th></tr></thead>
                    <tbody>
                        {sales.map((s) => (
                            <tr key={s.id} className="border-t border-neutral-100">
                                <td className="p-3 font-mono text-xs">{s.number}{s.is_return && <span className="ml-2 text-[9px] bg-red-100 text-red-700 px-1 rounded">RESO</span>}</td>
                                <td className="p-3 text-xs text-neutral-500">{fmtDate(s.created_at)}</td>
                                <td className="p-3">{s.channel === "POS" ? locName(s.location_id) : s.channel}</td>
                                <td className="p-3 text-xs">{s.items?.length} righe</td>
                                <td className="p-3 text-xs">{s.payment_method}</td>
                                <td className={`p-3 text-right tabular-nums font-medium ${s.is_return ? "text-red-600" : ""}`}>{fmtEUR(s.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function Customers() {
    const [items, setItems] = useState([]);
    const [f, setF] = useState({ name: "", email: "", phone: "" });
    const load = () => api.get("/customers").then((r) => setItems(r.data));
    useEffect(() => { load(); }, []);
    const submit = async (e) => {
        e.preventDefault();
        try { await api.post("/customers", f); toast.success("Cliente creato"); setF({ name: "", email: "", phone: "" }); load(); }
        catch (err) { toast.error(apiError(err)); }
    };
    return (
        <div className="space-y-6" data-testid="customers-page">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Clienti</div><h1 className="text-3xl font-light tracking-tight mt-1">Rubrica clienti</h1></div>
            <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-5 grid grid-cols-4 gap-3">
                <input required placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" data-testid="cust-name" />
                <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <input placeholder="Telefono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <button className="px-4 py-2 bg-black text-white rounded-md text-sm">Aggiungi cliente</button>
            </form>
            <div className="bg-white border border-neutral-200 rounded-md">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Nome</th><th className="text-left p-3">Email</th><th className="text-left p-3">Telefono</th></tr></thead>
                    <tbody>{items.map((c) => <tr key={c.id} className="border-t border-neutral-100"><td className="p-3">{c.name}</td><td className="p-3">{c.email}</td><td className="p-3">{c.phone}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}

export function Promotions() {
    const [items, setItems] = useState([]);
    const [brands, setBrands] = useState([]); const [cats, setCats] = useState([]); const [seasons, setSeasons] = useState([]);
    const [f, setF] = useState({ name: "", scope: "CATEGORY", scope_id: "", discount_pct: 20, start: "", end: "" });
    const load = () => api.get("/promotions").then((r) => setItems(r.data));
    useEffect(() => {
        load();
        api.get("/meta/brands").then((r) => setBrands(r.data));
        api.get("/meta/categories").then((r) => setCats(r.data));
        api.get("/meta/seasons").then((r) => setSeasons(r.data));
    }, []);
    const scopeOptions = f.scope === "BRAND" ? brands : f.scope === "CATEGORY" ? cats : f.scope === "SEASON" ? seasons : [];
    const submit = async (e) => {
        e.preventDefault();
        try { await api.post("/promotions", { ...f, discount_pct: Number(f.discount_pct), start: new Date(f.start).toISOString(), end: new Date(f.end).toISOString() }); toast.success("Promozione creata"); load(); }
        catch (err) { toast.error(apiError(err)); }
    };
    return (
        <div className="space-y-6" data-testid="promotions-page">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Prezzi</div><h1 className="text-3xl font-light tracking-tight mt-1">Promozioni & Saldi</h1><p className="text-sm text-neutral-500 mt-1">Applica sconti per categoria, brand, stagione o singolo prodotto. I prezzi promozionali vengono propagati a Shopify.</p></div>
            <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-5 grid grid-cols-6 gap-3">
                <input required placeholder="Nome (es. Saldi FW26)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md col-span-2" />
                <select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value, scope_id: "" })} className="px-3 py-2 border border-neutral-200 rounded-md"><option value="CATEGORY">Categoria</option><option value="BRAND">Brand</option><option value="SEASON">Stagione</option></select>
                <select required value={f.scope_id} onChange={(e) => setF({ ...f, scope_id: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md"><option value="">—</option>{scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                <input required type="number" min="1" max="90" placeholder="Sconto %" value={f.discount_pct} onChange={(e) => setF({ ...f, discount_pct: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <input required type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <input required type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <button className="px-4 py-2 bg-black text-white rounded-md text-sm col-span-6" data-testid="promo-submit">Attiva promozione</button>
            </form>
            <div className="bg-white border border-neutral-200 rounded-md">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Nome</th><th className="text-left p-3">Ambito</th><th className="text-right p-3">Sconto</th><th className="text-left p-3">Dal</th><th className="text-left p-3">Al</th></tr></thead>
                    <tbody>{items.map((p) => <tr key={p.id} className="border-t border-neutral-100"><td className="p-3">{p.name}</td><td className="p-3">{p.scope}</td><td className="p-3 text-right tabular-nums">−{p.discount_pct}%</td><td className="p-3 text-xs">{p.start?.slice(0, 10)}</td><td className="p-3 text-xs">{p.end?.slice(0, 10)}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}

export function UsersPage() {
    const [items, setItems] = useState([]);
    const [denied, setDenied] = useState(false);
    const [f, setF] = useState({ name: "", email: "", password: "", role: "CASSIERE_DONNA_1", location_id: "" });
    const [locations, setLocations] = useState([]);
    const load = () => api.get("/users").then((r) => setItems(r.data)).catch((e) => {
        if (e?.response?.status === 403) { setDenied(true); toast.error("Accesso negato: solo Admin e Manager possono visualizzare gli utenti."); }
        else toast.error(apiError(e));
    });
    useEffect(() => { load(); api.get("/meta/locations").then((r) => setLocations(r.data)).catch(() => {}); }, []);
    if (denied) return <div className="max-w-md mx-auto text-center py-24" data-testid="users-denied"><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Accesso negato</div><h1 className="text-2xl font-light mt-1">Solo Admin</h1><p className="text-sm text-neutral-500 mt-2">Questa sezione è riservata all'amministratore del sistema.</p></div>;
    const submit = async (e) => {
        e.preventDefault();
        try { await api.post("/users", f); toast.success("Utente creato"); setF({ name: "", email: "", password: "", role: "CASSIERE_DONNA_1", location_id: "" }); load(); }
        catch (err) { toast.error(apiError(err)); }
    };
    return (
        <div className="space-y-6" data-testid="users-page">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Sistema</div><h1 className="text-3xl font-light tracking-tight mt-1">Utenti & Ruoli</h1></div>
            <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-5 grid grid-cols-5 gap-3">
                <input required placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <input required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <input required type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md">
                    <option value="ADMIN">Admin</option><option value="MANAGER">Manager</option>
                    <option value="CASSIERE_DONNA_1">Cassiere Donna 1</option><option value="CASSIERE_DONNA_2">Cassiere Donna 2</option><option value="CASSIERE_UOMO">Cassiere Uomo</option>
                </select>
                <select value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md">
                    <option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button className="px-4 py-2 bg-black text-white rounded-md text-sm col-span-5">Crea utente</button>
            </form>
            <div className="bg-white border border-neutral-200 rounded-md">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Nome</th><th className="text-left p-3">Email</th><th className="text-left p-3">Ruolo</th><th className="text-left p-3">Punto vendita</th></tr></thead>
                    <tbody>{items.map((u) => <tr key={u.id} className="border-t border-neutral-100"><td className="p-3">{u.name} {u.is_demo && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded ml-1">DEMO</span>}</td><td className="p-3 text-xs">{u.email}</td><td className="p-3 text-xs">{u.role?.replaceAll("_", " ")}</td><td className="p-3 text-xs">{u.location_id || "—"}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}

export function AuditLog() {
    const [rows, setRows] = useState([]);
    const [denied, setDenied] = useState(false);
    useEffect(() => {
        api.get("/audit-logs").then((r) => setRows(r.data)).catch((e) => {
            if (e?.response?.status === 403) setDenied(true);
            else toast.error(apiError(e));
        });
    }, []);
    if (denied) return <div className="max-w-md mx-auto text-center py-24"><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Accesso negato</div><h1 className="text-2xl font-light mt-1">Solo Admin e Manager</h1><p className="text-sm text-neutral-500 mt-2">Il registro attività è riservato ai ruoli con visione totale.</p></div>;
    return (
        <div className="space-y-4" data-testid="audit-page">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Sistema</div><h1 className="text-3xl font-light tracking-tight mt-1">Registro attività</h1></div>
            <div className="bg-white border border-neutral-200 rounded-md">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Azione</th><th className="text-left p-3">Entità</th><th className="text-left p-3">Utente</th><th className="text-left p-3">Dettagli</th></tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-neutral-100"><td className="p-3 text-xs text-neutral-500">{fmtDate(r.created_at)}</td><td className="p-3 text-xs font-medium">{r.action}</td><td className="p-3 text-xs">{r.entity}</td><td className="p-3 text-xs">{r.user_email}</td><td className="p-3 text-xs text-neutral-500">{JSON.stringify(r.details).slice(0, 80)}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}

export function SyncLog() {
    const [rows, setRows] = useState([]);
    const load = () => api.get("/sync/jobs").then((r) => setRows(r.data));
    useEffect(() => { load(); }, []);
    const retry = async (id) => { try { await api.post(`/sync/jobs/${id}/retry`); toast.success("Rimesso in coda"); load(); } catch (e) { toast.error(apiError(e)); } };
    return (
        <div className="space-y-4" data-testid="sync-log-page">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Sistema</div><h1 className="text-3xl font-light tracking-tight mt-1">Log sincronizzazioni</h1></div>
            <div className="bg-white border border-neutral-200 rounded-md">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Destinazione</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">SKU</th><th className="text-left p-3">Stato</th><th className="text-right p-3">Tentativi</th><th></th></tr></thead>
                    <tbody>{rows.map((j) => <tr key={j.id} className="border-t border-neutral-100"><td className="p-3 text-xs">{fmtDate(j.created_at)}</td><td className="p-3">{j.destination}</td><td className="p-3 text-xs">{j.type}</td><td className="p-3 font-mono text-xs">{j.sku}</td><td className="p-3"><span className={`text-[10px] uppercase px-2 py-0.5 rounded ${j.status === "SUCCESS" ? "bg-emerald-100 text-emerald-800" : j.status === "FAILED" || j.status === "RETRY" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-700"}`}>{j.status}</span></td><td className="p-3 text-right text-xs">{j.attempts}</td><td className="p-3">{(j.status === "FAILED" || j.status === "RETRY") && <button onClick={() => retry(j.id)} className="text-xs underline">Riprova</button>}</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
}
