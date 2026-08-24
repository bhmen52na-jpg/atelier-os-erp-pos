import { useEffect, useState } from "react";
import { api, fmtEUR } from "@/lib/api";
import { Link } from "react-router-dom";

const CHANNEL_LABELS = { DONNA_1: "Donna 1", DONNA_2: "Donna 2", SHOPIFY_DONNA: "Shopify Donna", UOMO: "Uomo", SHOPIFY_UOMO: "Shopify Uomo" };

export default function Products() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    useEffect(() => { api.get("/products").then((r) => setItems(r.data)); }, []);
    const filtered = items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.model_code.toLowerCase().includes(q.toLowerCase()));
    return (
        <div className="space-y-6" data-testid="products-page">
            <div className="flex items-end justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Catalogo</div>
                    <h1 className="text-3xl font-light tracking-tight mt-1">Prodotti</h1>
                    <p className="text-sm text-neutral-500 mt-1">Tutti i modelli con le loro varianti (colore, taglia) e la disponibilità totale.</p>
                </div>
                <Link to="/prodotti/nuovo" data-testid="new-product-btn" className="px-5 py-3 bg-black text-white rounded-md text-sm font-medium">Nuovo prodotto</Link>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o codice modello…" className="w-full max-w-md px-4 py-2 border border-neutral-200 rounded-md bg-white" data-testid="products-search" />
            <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                        <tr><th className="text-left p-3">Prodotto</th><th className="text-left p-3">Genere</th><th className="text-left p-3">Canali</th><th className="text-right p-3">Varianti</th><th className="text-right p-3">Stock totale</th><th className="text-right p-3">Prezzo</th></tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => (
                            <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50" data-testid={`product-row-${p.model_code}`}>
                                <td className="p-3">
                                    <div className="font-medium flex items-center gap-2">{p.name} {p.is_demo && <span className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">DEMO</span>}</div>
                                    <div className="text-xs text-neutral-500">{p.model_code}</div>
                                </td>
                                <td className="p-3"><span className="text-xs uppercase tracking-wider text-neutral-600">{p.gender}</span></td>
                                <td className="p-3"><div className="flex flex-wrap gap-1">{p.channels?.map((c) => <span key={c} className="text-[10px] px-2 py-0.5 bg-neutral-100 rounded">{CHANNEL_LABELS[c]}</span>)}</div></td>
                                <td className="p-3 text-right tabular-nums">{p.variants?.length || 0}</td>
                                <td className="p-3 text-right tabular-nums font-medium">{p.total_stock}</td>
                                <td className="p-3 text-right tabular-nums">{fmtEUR(p.variants?.[0]?.price || 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
