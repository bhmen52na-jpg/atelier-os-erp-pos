import { useEffect, useState } from "react";
import { api, fmtEUR, fmtDate } from "@/lib/api";
import { TrendingUp, Package, AlertTriangle, Zap, Store } from "lucide-react";

function Kpi({ label, value, sub, icon: Icon, testid }) {
    return (
        <div className="kpi-card" data-testid={testid}>
            <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500">{label}</div>
                {Icon && <Icon size={16} strokeWidth={1.5} className="text-neutral-400" />}
            </div>
            <div className="mt-3 text-3xl font-light tabular-nums text-neutral-900">{value}</div>
            {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
        </div>
    );
}

export default function Dashboard() {
    const [d, setD] = useState(null);
    useEffect(() => { api.get("/dashboard/summary").then((r) => setD(r.data)); }, []);
    if (!d) return <div className="text-sm text-neutral-500">Caricamento dashboard…</div>;

    return (
        <div className="space-y-8" data-testid="dashboard">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Panoramica</div>
                <h1 className="text-4xl font-light tracking-tight mt-1">Dashboard</h1>
                <p className="text-sm text-neutral-500 mt-1">Un colpo d'occhio sull'andamento di oggi e sullo stato del magazzino.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi testid="kpi-sales-today" label="Vendite oggi" value={fmtEUR(d.sales_today.total)} sub={`${d.sales_today.count} scontrini`} icon={TrendingUp} />
                <Kpi testid="kpi-sales-donna" label="Vendite Donna" value={fmtEUR(d.sales_donna.total)} sub={`${d.sales_donna.count} scontrini · POS`} />
                <Kpi testid="kpi-sales-uomo" label="Vendite Uomo" value={fmtEUR(d.sales_uomo.total)} sub={`${d.sales_uomo.count} scontrini · POS`} />
                <Kpi testid="kpi-stock-value" label="Valore magazzino" value={fmtEUR(d.stock_value)} sub="A costo di acquisto" icon={Package} />
                <Kpi testid="kpi-shopify-donna" label="Shopify Donna oggi" value={fmtEUR(d.sales_shopify_donna.total)} sub={`${d.sales_shopify_donna.count} ordini online`} icon={Store} />
                <Kpi testid="kpi-shopify-uomo" label="Shopify Uomo oggi" value={fmtEUR(d.sales_shopify_uomo.total)} sub={`${d.sales_shopify_uomo.count} ordini online`} icon={Store} />
                <Kpi testid="kpi-understock" label="Sotto scorta" value={d.understock_count} sub="≤ 2 pezzi disponibili" icon={AlertTriangle} />
                <Kpi testid="kpi-outofstock" label="Esauriti" value={d.outofstock_count} sub="0 pezzi in tutti i negozi" icon={AlertTriangle} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-md">
                    <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500">Ultimi movimenti magazzino</div>
                            <div className="text-lg font-medium mt-0.5">Attività recente</div>
                        </div>
                        <Zap size={16} className="text-neutral-400" />
                    </div>
                    <div className="divide-y divide-neutral-100">
                        {d.last_movements.length === 0 && <div className="p-5 text-sm text-neutral-500">Nessun movimento recente.</div>}
                        {d.last_movements.map((m) => (
                            <div key={m.id} className="px-5 py-3 flex justify-between items-center text-sm">
                                <div>
                                    <div className="font-medium text-neutral-900">{m.product_name} <span className="text-neutral-400">·</span> <span className="text-neutral-500">{m.sku}</span></div>
                                    <div className="text-xs text-neutral-500">{m.type.replaceAll("_", " ")} · {m.origin} · {fmtDate(m.created_at)}</div>
                                </div>
                                <div className={`text-lg tabular-nums font-medium ${m.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                    {m.quantity > 0 ? "+" : ""}{m.quantity}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="bg-white border border-neutral-200 rounded-md p-5">
                        <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500">Vendite per punto vendita (oggi)</div>
                        <div className="mt-3 space-y-2">
                            {d.per_location.map((l) => (
                                <div key={l.location_id} className="flex justify-between text-sm">
                                    <span className="text-neutral-700">{l.name}</span>
                                    <span className="tabular-nums font-medium">{fmtEUR(l.total)} <span className="text-neutral-400">· {l.count}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-md p-5">
                        <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500">Stato Shopify</div>
                        <div className="mt-3 space-y-3">
                            {d.shopify_connections.map((c) => (
                                <div key={c.code} className="flex justify-between items-center text-sm">
                                    <div>
                                        <div className="font-medium">{c.code === "SHOPIFY_DONNA" ? "Shopify Donna" : "Shopify Uomo"}</div>
                                        <div className="text-xs text-neutral-500">{c.store_domain || "Non configurato"}</div>
                                    </div>
                                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${c.connected ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>
                                        {c.connected ? "Configurato" : "Da collegare"}
                                    </span>
                                </div>
                            ))}
                            <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                                {d.sync_errors > 0 ? <span className="text-red-600">{d.sync_errors} sincronizzazioni da riprovare</span> : "Nessun errore di sincronizzazione"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
