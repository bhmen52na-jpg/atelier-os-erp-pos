import { useEffect, useMemo, useState } from "react";
import { api, fmtEUR } from "@/lib/api";

export default function Inventory() {
    const [rows, setRows] = useState([]);
    const [locations, setLocations] = useState([]);
    const [q, setQ] = useState("");
    const [locFilter, setLocFilter] = useState("");
    useEffect(() => {
        api.get("/inventory").then((r) => setRows(r.data));
        api.get("/meta/locations").then((r) => setLocations(r.data));
    }, []);

    const byLoc = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
    const filtered = rows.filter((r) => (!q || r.product_name.toLowerCase().includes(q.toLowerCase()) || r.sku.toLowerCase().includes(q.toLowerCase())) && (!locFilter || r.location_id === locFilter));

    // Aggregate per variant to show pool availability
    const byVariant = useMemo(() => {
        const map = {};
        for (const r of rows) {
            const key = r.sku;
            if (!map[key]) map[key] = { sku: r.sku, product_name: r.product_name, color: r.color, size: r.size, gender: r.product_gender, price: r.price, per_loc: {} };
            map[key].per_loc[r.location_id] = (map[key].per_loc[r.location_id] || 0) + r.on_hand;
        }
        return Object.values(map);
    }, [rows]);

    return (
        <div className="space-y-6" data-testid="inventory-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Magazzino</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Disponibilità</h1>
                <p className="text-sm text-neutral-500 mt-1">Quantità per punto vendita. Il totale Pool Donna è la somma di Donna 1 e Donna 2 e viene inviato a Shopify Donna.</p>
            </div>
            <div className="flex gap-2">
                <input placeholder="Cerca articolo o SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="px-3 py-2 border border-neutral-200 rounded-md bg-white w-80" data-testid="inventory-search" />
                <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} className="px-3 py-2 border border-neutral-200 rounded-md bg-white">
                    <option value="">Tutti i punti vendita</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                        <tr>
                            <th className="text-left p-3">Articolo</th>
                            <th className="text-left p-3">SKU</th>
                            {locations.map((l) => <th key={l.id} className="text-right p-3">{l.name}</th>)}
                            <th className="text-right p-3 bg-neutral-100">Pool</th>
                            <th className="text-right p-3">Prezzo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {byVariant.filter((v) => !q || v.product_name.toLowerCase().includes(q.toLowerCase()) || v.sku.toLowerCase().includes(q.toLowerCase())).map((v) => {
                            const donnaPool = (v.per_loc["loc-donna-1"] || 0) + (v.per_loc["loc-donna-2"] || 0);
                            const uomoPool = v.per_loc["loc-uomo"] || 0;
                            const pool = v.gender === "DONNA" ? donnaPool : uomoPool;
                            return (
                                <tr key={v.sku} className="border-t border-neutral-100" data-testid={`inv-row-${v.sku}`}>
                                    <td className="p-3"><div className="font-medium">{v.product_name}</div><div className="text-xs text-neutral-500">{v.color} · {v.size}</div></td>
                                    <td className="p-3 font-mono text-xs">{v.sku}</td>
                                    {locations.map((l) => <td key={l.id} className="p-3 text-right tabular-nums">{v.per_loc[l.id] ?? "—"}</td>)}
                                    <td className="p-3 text-right tabular-nums font-medium bg-neutral-50">{pool}</td>
                                    <td className="p-3 text-right tabular-nums">{fmtEUR(v.price)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
