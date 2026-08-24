import { useEffect, useState } from "react";
import { api, apiError, fmtDate } from "@/lib/api";
import { toast } from "sonner";

export default function Transfers() {
    const [locations, setLocations] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [from, setFrom] = useState(""); const [to, setTo] = useState("");
    const [code, setCode] = useState(""); const [items, setItems] = useState([]);

    const load = () => api.get("/transfers").then((r) => setTransfers(r.data));
    useEffect(() => {
        api.get("/meta/locations").then((r) => {
            const donna = r.data.filter((l) => l.area === "DONNA");
            setLocations(r.data); setFrom(donna[0]?.id || ""); setTo(donna[1]?.id || "");
        });
        load();
    }, []);

    const addItem = async () => {
        if (!code.trim()) return;
        try {
            const { data } = await api.get("/variants/lookup", { params: { code: code.trim() } });
            const avail = data.stock_by_location?.[from] || 0;
            if (avail <= 0) { toast.error("Stock non disponibile nel punto vendita di origine"); return; }
            setItems((it) => {
                const idx = it.findIndex((x) => x.variant_id === data.id);
                if (idx >= 0) { const c = [...it]; c[idx].quantity = Math.min(avail, c[idx].quantity + 1); return c; }
                return [...it, { variant_id: data.id, sku: data.sku, product_name: data.product?.name, quantity: 1, max: avail }];
            });
            setCode("");
        } catch (e) { toast.error(apiError(e)); }
    };

    const submit = async () => {
        try {
            await api.post("/transfers", { from_location_id: from, to_location_id: to, items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })) });
            toast.success("Trasferimento completato");
            setItems([]); load();
        } catch (e) { toast.error(apiError(e)); }
    };

    const locName = (id) => locations.find((l) => l.id === id)?.name || id;

    return (
        <div className="space-y-6" data-testid="transfers-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Magazzino</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Trasferimenti tra negozi</h1>
                <p className="text-sm text-neutral-500 mt-1">Sposta merce tra Donna 1 e Donna 2. Il totale del Pool Donna non cambia — cambia solo la posizione fisica.</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Da</label>
                        <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" data-testid="transfer-from">
                            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">A</label>
                        <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" data-testid="transfer-to">
                            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select></div>
                </div>
                <div className="flex gap-2">
                    <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Scansiona barcode o inserisci SKU…" className="flex-1 px-3 py-2 border border-neutral-200 rounded-md" data-testid="transfer-scan" />
                    <button onClick={addItem} className="px-4 py-2 bg-black text-white rounded-md text-sm" data-testid="transfer-add">Aggiungi</button>
                </div>
                {items.length > 0 && (
                    <table className="w-full text-sm border border-neutral-200 rounded">
                        <thead className="text-xs uppercase text-neutral-500"><tr><th className="text-left p-2">Articolo</th><th className="text-right p-2">Qtà</th><th className="w-10"></th></tr></thead>
                        <tbody>
                            {items.map((i) => (
                                <tr key={i.variant_id} className="border-t border-neutral-100">
                                    <td className="p-2"><div className="font-medium">{i.product_name}</div><div className="text-xs text-neutral-500 font-mono">{i.sku}</div></td>
                                    <td className="p-2 text-right"><input type="number" min="1" max={i.max} value={i.quantity} onChange={(e) => setItems((it) => it.map((x) => x.variant_id === i.variant_id ? { ...x, quantity: Number(e.target.value) } : x))} className="w-16 text-right border border-neutral-200 rounded px-1 py-0.5" /></td>
                                    <td className="p-2"><button onClick={() => setItems((it) => it.filter((x) => x.variant_id !== i.variant_id))} className="text-neutral-400 hover:text-red-600 text-xs">×</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <button onClick={submit} disabled={items.length === 0} className="px-6 py-3 bg-black text-white rounded-md text-sm font-medium disabled:opacity-40" data-testid="transfer-submit">Conferma trasferimento</button>
            </div>
            <div>
                <h2 className="text-lg font-medium mb-2">Storico trasferimenti</h2>
                <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Numero</th><th className="text-left p-3">Data</th><th className="text-left p-3">Da</th><th className="text-left p-3">A</th><th className="text-right p-3">Articoli</th></tr></thead>
                        <tbody>
                            {transfers.map((t) => (
                                <tr key={t.id} className="border-t border-neutral-100"><td className="p-3 font-mono text-xs">{t.number}</td><td className="p-3 text-xs text-neutral-500">{fmtDate(t.created_at)}</td><td className="p-3">{locName(t.from_location_id)}</td><td className="p-3">{locName(t.to_location_id)}</td><td className="p-3 text-right tabular-nums">{t.items.reduce((s, i) => s + i.quantity, 0)}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
