import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiError, fmtEUR } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Trash2, ScanLine } from "lucide-react";

export default function POS() {
    const { user } = useAuth();
    const [locations, setLocations] = useState([]);
    const [locationId, setLocationId] = useState("");
    const [code, setCode] = useState("");
    const [cart, setCart] = useState([]);
    const [payment, setPayment] = useState("CARTA");
    const [suggestions, setSuggestions] = useState([]);
    const inputRef = useRef(null);

    useEffect(() => {
        api.get("/meta/locations").then((r) => {
            setLocations(r.data);
            const preferred = user?.location_id ? r.data.find((l) => l.id === user.location_id) : r.data[0];
            setLocationId((preferred || r.data[0])?.id);
        });
    }, [user]);

    useEffect(() => { inputRef.current?.focus(); }, [locationId]);

    const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);
    const discount = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity * (l.discount_pct || 0) / 100, 0), [cart]);
    const total = subtotal - discount;

    const addByCode = async (val) => {
        if (!val?.trim()) return;
        try {
            const { data } = await api.get("/variants/lookup", { params: { code: val.trim() } });
            const inStock = data.stock_by_location?.[locationId] || 0;
            if (inStock <= 0) {
                toast.error(`${data.product?.name} · ${data.color} ${data.size}: 0 pezzi in questo punto vendita`);
                return;
            }
            setCart((c) => {
                const idx = c.findIndex((x) => x.variant_id === data.id);
                if (idx >= 0) {
                    const copy = [...c];
                    if (copy[idx].quantity + 1 > inStock) { toast.error("Stock esaurito nel punto vendita corrente"); return c; }
                    copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
                    return copy;
                }
                return [...c, {
                    variant_id: data.id, sku: data.sku, product_name: data.product?.name,
                    color: data.color, size: data.size,
                    unit_price: data.promo_price ?? data.price, quantity: 1, discount_pct: 0,
                    max: inStock,
                }];
            });
            setCode(""); setSuggestions([]);
        } catch (e) {
            toast.error(apiError(e, "Articolo non trovato"));
        }
    };

    const onCodeChange = async (v) => {
        setCode(v);
        if (v.length >= 2) {
            try { const { data } = await api.get("/variants/search", { params: { q: v } }); setSuggestions(data.slice(0, 6)); }
            catch { setSuggestions([]); }
        } else { setSuggestions([]); }
    };

    const removeLine = (id) => setCart((c) => c.filter((l) => l.variant_id !== id));
    const updateQty = (id, q) => setCart((c) => c.map((l) => l.variant_id === id ? { ...l, quantity: Math.max(1, Math.min(l.max, Number(q))) } : l));
    const updateDiscount = (id, d) => setCart((c) => c.map((l) => l.variant_id === id ? { ...l, discount_pct: Math.max(0, Math.min(100, Number(d))) } : l));

    const closeSale = async () => {
        if (cart.length === 0) return toast.error("Il carrello è vuoto");
        try {
            const items = cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct }));
            const { data } = await api.post("/pos/sales", { location_id: locationId, items, payment_method: payment });
            toast.success(`Vendita ${data.number} chiusa · ${fmtEUR(data.total)}`);
            setCart([]); inputRef.current?.focus();
        } catch (e) { toast.error(apiError(e, "Impossibile completare la vendita")); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="pos-page">
            <div className="lg:col-span-2 space-y-4">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Cassa</div>
                    <h1 className="text-3xl font-light tracking-tight mt-1">POS · Vendita rapida</h1>
                </div>
                <div className="bg-white border border-neutral-200 rounded-md p-5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Punto vendita</label>
                    <select data-testid="pos-location-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md bg-white">
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                    </select>
                    <div className="mt-4">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Scansiona barcode o cerca prodotto</label>
                        <div className="relative">
                            <ScanLine className="absolute left-3 top-3.5 text-neutral-400" size={18} />
                            <input ref={inputRef} data-testid="pos-scan-input" autoFocus value={code}
                                onChange={(e) => onCodeChange(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addByCode(code)}
                                placeholder="Scansiona EAN o digita SKU/nome…"
                                className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-md bg-white text-lg focus:outline-none focus:ring-2 focus:ring-black" />
                            {suggestions.length > 0 && (
                                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-sm">
                                    {suggestions.map((s) => (
                                        <button key={s.id} data-testid={`pos-suggestion-${s.sku}`} type="button" onClick={() => addByCode(s.sku)}
                                            className="w-full flex justify-between px-3 py-2 text-left hover:bg-neutral-50 text-sm">
                                            <span>{s.product_name} · {s.color} {s.size}</span>
                                            <span className="text-neutral-500 font-mono text-xs">{s.sku}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-md">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase tracking-wider text-neutral-500">
                            <tr><th className="text-left p-3">Articolo</th><th className="text-right p-3 w-24">Qtà</th><th className="text-right p-3 w-24">Sconto %</th><th className="text-right p-3 w-28">Prezzo</th><th className="text-right p-3 w-28">Totale</th><th className="w-10"></th></tr>
                        </thead>
                        <tbody>
                            {cart.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-neutral-500">Il carrello è vuoto. Scansiona un barcode per iniziare.</td></tr>}
                            {cart.map((l) => (
                                <tr key={l.variant_id} className="border-t border-neutral-100" data-testid={`cart-line-${l.sku}`}>
                                    <td className="p-3"><div className="font-medium">{l.product_name}</div><div className="text-xs text-neutral-500">{l.color} · {l.size} · {l.sku}</div></td>
                                    <td className="p-3 text-right"><input type="number" min="1" max={l.max} value={l.quantity} onChange={(e) => updateQty(l.variant_id, e.target.value)} className="w-16 text-right border border-neutral-200 rounded px-2 py-1" /></td>
                                    <td className="p-3 text-right"><input type="number" min="0" max="100" value={l.discount_pct} onChange={(e) => updateDiscount(l.variant_id, e.target.value)} className="w-16 text-right border border-neutral-200 rounded px-2 py-1" /></td>
                                    <td className="p-3 text-right tabular-nums">{fmtEUR(l.unit_price)}</td>
                                    <td className="p-3 text-right tabular-nums font-medium">{fmtEUR(l.unit_price * l.quantity * (1 - (l.discount_pct || 0) / 100))}</td>
                                    <td className="p-3"><button onClick={() => removeLine(l.variant_id)} className="text-neutral-400 hover:text-red-600" data-testid={`remove-${l.sku}`}><Trash2 size={16} /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="space-y-4">
                <div className="bg-white border border-neutral-200 rounded-md p-5">
                    <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500">Riepilogo</div>
                    <div className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-neutral-500">Subtotale</span><span className="tabular-nums">{fmtEUR(subtotal)}</span></div>
                        <div className="flex justify-between"><span className="text-neutral-500">Sconti</span><span className="tabular-nums">- {fmtEUR(discount)}</span></div>
                        <div className="pt-2 border-t border-neutral-200 flex justify-between text-lg"><span>Totale</span><span data-testid="pos-total" className="tabular-nums font-medium">{fmtEUR(total)}</span></div>
                    </div>
                    <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Pagamento</label>
                    <select data-testid="pos-payment" value={payment} onChange={(e) => setPayment(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md">
                        <option value="CARTA">Carta</option><option value="CONTANTI">Contanti</option><option value="BONIFICO">Bonifico</option><option value="ALTRO">Altro</option>
                    </select>
                    <button data-testid="pos-checkout" onClick={closeSale} disabled={cart.length === 0}
                        className="mt-4 w-full py-4 bg-black text-white rounded-md font-medium text-base disabled:opacity-40" style={{ transition: "background-color 0.15s ease" }}>
                        Chiudi vendita · {fmtEUR(total)}
                    </button>
                    <p className="mt-3 text-xs text-neutral-500 leading-relaxed">Alla conferma verrà creato uno scontrino, aggiornato il magazzino del punto vendita selezionato e programmato l'aggiornamento su Shopify.</p>
                </div>
            </div>
        </div>
    );
}
