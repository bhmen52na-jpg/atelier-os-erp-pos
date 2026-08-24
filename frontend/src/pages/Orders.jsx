import { useEffect, useState } from "react";
import { api, apiError, fmtDate, fmtEUR } from "@/lib/api";
import { toast } from "sonner";

export default function Orders() {
    const [sales, setSales] = useState([]);
    const [form, setForm] = useState({ channel: "SHOPIFY_DONNA", sku: "", quantity: 1, price: 0 });
    const load = () => api.get("/pos/sales").then((r) => setSales(r.data));
    useEffect(() => { load(); }, []);

    const simulate = async () => {
        try {
            const external_id = `TEST-${Date.now()}`;
            await api.post("/shopify/webhook/order", { channel: form.channel, external_id, items: [{ sku: form.sku, quantity: Number(form.quantity), unit_price: Number(form.price) }] });
            toast.success("Ordine Shopify simulato · magazzino aggiornato");
            load();
        } catch (e) { toast.error(apiError(e)); }
    };

    const shopifyOrders = sales.filter((s) => s.channel !== "POS");

    return (
        <div className="space-y-6" data-testid="orders-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Vendita online</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Ordini Shopify Donna & Uomo</h1>
                <p className="text-sm text-neutral-500 mt-1">Ogni ordine arrivato da Shopify decrementa automaticamente il pool corretto. Puoi simulare un ordine per testare il flusso.</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md p-5">
                <div className="text-sm font-medium mb-3">Simula un ordine Shopify (per test)</div>
                <div className="grid grid-cols-4 gap-3">
                    <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md">
                        <option value="SHOPIFY_DONNA">Shopify Donna</option><option value="SHOPIFY_UOMO">Shopify Uomo</option>
                    </select>
                    <input placeholder="SKU esistente" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm" data-testid="sim-order-sku" />
                    <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                    <input type="number" step="0.01" placeholder="Prezzo" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md" />
                </div>
                <button onClick={simulate} className="mt-3 px-5 py-2 bg-black text-white rounded-md text-sm" data-testid="sim-order-btn">Ricevi ordine simulato</button>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Numero</th><th className="text-left p-3">Canale</th><th className="text-left p-3">Data</th><th className="text-left p-3">Articoli</th><th className="text-right p-3">Totale</th></tr></thead>
                    <tbody>
                        {shopifyOrders.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-neutral-500">Nessun ordine online ancora ricevuto.</td></tr>}
                        {shopifyOrders.map((s) => (
                            <tr key={s.id} className="border-t border-neutral-100">
                                <td className="p-3 font-mono text-xs">{s.number}</td>
                                <td className="p-3">{s.channel === "SHOPIFY_DONNA" ? "Shopify Donna" : "Shopify Uomo"}</td>
                                <td className="p-3 text-xs text-neutral-500">{fmtDate(s.created_at)}</td>
                                <td className="p-3">{s.items?.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}</td>
                                <td className="p-3 text-right tabular-nums font-medium">{fmtEUR(s.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
