import { useEffect, useState } from "react";
import { api, apiError, fmtEUR } from "@/lib/api";
import { toast } from "sonner";

export default function ShopifyPage() {
    const [conns, setConns] = useState([]);
    const [jobs, setJobs] = useState([]);
    const load = () => {
        api.get("/shopify/connections").then((r) => setConns(r.data));
        api.get("/sync/jobs").then((r) => setJobs(r.data));
    };
    useEffect(load, []);

    return (
        <div className="space-y-6" data-testid="shopify-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Integrazioni</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Shopify Donna & Uomo</h1>
                <p className="text-sm text-neutral-500 mt-1">Collega i due negozi Shopify. Le credenziali vengono salvate in modo sicuro; il test reale verrà eseguito su tua autorizzazione.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                {conns.map((c) => <ShopifyCard key={c.code} conn={c} onSave={load} />)}
            </div>
            <div>
                <h2 className="text-lg font-medium mb-2">Coda di sincronizzazione</h2>
                <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Destinazione</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">SKU</th><th className="text-left p-3">Stato</th><th className="text-right p-3">Tentativi</th></tr></thead>
                        <tbody>
                            {jobs.slice(0, 30).map((j) => (
                                <tr key={j.id} className="border-t border-neutral-100">
                                    <td className="p-3 text-xs text-neutral-500">{j.created_at?.slice(0, 19).replace("T", " ")}</td>
                                    <td className="p-3">{j.destination}</td>
                                    <td className="p-3">{j.type}</td>
                                    <td className="p-3 font-mono text-xs">{j.sku}</td>
                                    <td className="p-3"><span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${j.status === "SUCCESS" ? "bg-emerald-100 text-emerald-800" : j.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-700"}`}>{j.status}</span></td>
                                    <td className="p-3 text-right">{j.attempts}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ShopifyCard({ conn, onSave }) {
    const [domain, setDomain] = useState(conn.store_domain || "");
    const [token, setToken] = useState("");
    const [loading, setLoading] = useState(false);
    const label = conn.code === "SHOPIFY_DONNA" ? "Shopify Donna" : "Shopify Uomo";
    const save = async () => {
        if (!domain || !token) { toast.error("Compila dominio e access token"); return; }
        setLoading(true);
        try {
            await api.put(`/shopify/connections/${conn.code}`, { store_domain: domain, access_token: token });
            toast.success("Credenziali salvate");
            setToken(""); onSave();
        } catch (e) { toast.error(apiError(e)); }
        finally { setLoading(false); }
    };
    const test = async () => {
        try { const { data } = await api.post(`/shopify/connections/${conn.code}/test`); toast.success(data.message || "OK"); }
        catch (e) { toast.error(apiError(e)); }
    };
    const sync = async () => {
        try { const { data } = await api.post(`/shopify/connections/${conn.code}/sync`); toast.success(`Sincronizzazione avviata · ${data.enqueued} varianti in coda`); onSave(); }
        catch (e) { toast.error(apiError(e)); }
    };
    return (
        <div className="bg-white border border-neutral-200 rounded-md p-5" data-testid={`conn-${conn.code}`}>
            <div className="flex justify-between items-start">
                <div>
                    <div className="text-lg font-medium">{label}</div>
                    <div className="text-xs text-neutral-500">Pool: {conn.pool_id === "pool-donna" ? "Donna (Negozio 1 + Negozio 2)" : "Uomo"}</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${conn.connected ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>{conn.connected ? "Configurato" : "Non collegato"}</span>
            </div>
            <div className="mt-4 space-y-3">
                <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Dominio store</label>
                    <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mio-negozio.myshopify.com" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm" data-testid={`conn-domain-${conn.code}`} /></div>
                <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Access Token</label>
                    <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={conn.access_token || "shpat_…"} type="password" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm" data-testid={`conn-token-${conn.code}`} />
                    <p className="text-xs text-neutral-500 mt-1">Come ottenerlo: Shopify Admin → Impostazioni → App e canali di vendita → Sviluppa app → Crea app → Configura Admin API → Installa → copia l'Access Token.</p>
                </div>
                <div className="flex gap-2 pt-1">
                    <button onClick={save} disabled={loading} className="flex-1 py-2 bg-black text-white rounded-md text-sm font-medium disabled:opacity-40" data-testid={`conn-save-${conn.code}`}>Salva</button>
                    <button onClick={test} disabled={!conn.access_token} className="flex-1 py-2 border border-neutral-200 rounded-md text-sm disabled:opacity-40">Testa</button>
                    <button onClick={sync} disabled={!conn.access_token} className="flex-1 py-2 border border-neutral-200 rounded-md text-sm disabled:opacity-40" data-testid={`conn-sync-${conn.code}`}>Sincronizza</button>
                </div>
                <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">Ultima sincronizzazione: {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString("it-IT") : "mai"}</div>
            </div>
        </div>
    );
}
