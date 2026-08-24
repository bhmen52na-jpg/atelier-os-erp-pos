import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/api";

const TYPE_LABELS = {
    INITIAL_STOCK: "Stock iniziale", PURCHASE: "Acquisto", SALE: "Vendita",
    SHOPIFY_SALE: "Vendita Shopify", RETURN: "Reso", TRANSFER_IN: "Trasf. in entrata",
    TRANSFER_OUT: "Trasf. in uscita", ADJUSTMENT: "Rettifica", DAMAGED: "Danneggiato",
    RESERVED: "Riservato", RELEASED: "Rilasciato",
};

export default function Movements() {
    const [rows, setRows] = useState([]);
    const [locations, setLocations] = useState([]);
    const [f, setF] = useState({ type: "", location: "" });
    useEffect(() => {
        api.get("/inventory/movements").then((r) => setRows(r.data));
        api.get("/meta/locations").then((r) => setLocations(r.data));
    }, []);
    const filtered = rows.filter((r) => (!f.type || r.type === f.type) && (!f.location || r.location_id === f.location));
    const locName = (id) => locations.find((l) => l.id === id)?.name || id;
    return (
        <div className="space-y-6" data-testid="movements-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Magazzino</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Movimenti (registro)</h1>
                <p className="text-sm text-neutral-500 mt-1">Ogni variazione di magazzino con origine, punto vendita, quantità e responsabile.</p>
            </div>
            <div className="flex gap-2">
                <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md bg-white" data-testid="mv-filter-type">
                    <option value="">Tutti i tipi</option>{Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="px-3 py-2 border border-neutral-200 rounded-md bg-white">
                    <option value="">Tutti i punti vendita</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                        <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Articolo</th><th className="text-left p-3">Punto vendita</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Origine</th><th className="text-left p-3">Documento</th><th className="text-right p-3">Qtà</th></tr>
                    </thead>
                    <tbody>
                        {filtered.map((m) => (
                            <tr key={m.id} className="border-t border-neutral-100">
                                <td className="p-3 text-xs text-neutral-500">{fmtDate(m.created_at)}</td>
                                <td className="p-3"><div className="font-medium">{m.product_name}</div><div className="text-xs text-neutral-500 font-mono">{m.sku}</div></td>
                                <td className="p-3">{locName(m.location_id)}</td>
                                <td className="p-3"><span className="text-xs px-2 py-0.5 bg-neutral-100 rounded">{TYPE_LABELS[m.type] || m.type}</span></td>
                                <td className="p-3 text-xs">{m.origin}</td>
                                <td className="p-3 text-xs font-mono">{m.document_ref || "—"}</td>
                                <td className={`p-3 text-right tabular-nums font-medium ${m.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
