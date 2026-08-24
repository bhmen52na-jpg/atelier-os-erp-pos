import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const DONNA_CHANNELS = ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA"];
const UOMO_CHANNELS = ["UOMO", "SHOPIFY_UOMO"];
const CH_LABEL = { DONNA_1: "Negozio Donna 1", DONNA_2: "Negozio Donna 2", SHOPIFY_DONNA: "Shopify Donna", UOMO: "Negozio Uomo", SHOPIFY_UOMO: "Shopify Uomo" };

export default function ProductForm() {
    const [locations, setLocations] = useState([]);
    const [brands, setBrands] = useState([]);
    const [cats, setCats] = useState([]);
    const [seasons, setSeasons] = useState([]);
    const [gender, setGender] = useState("DONNA");
    const [channels, setChannels] = useState(["DONNA_1", "SHOPIFY_DONNA"]);
    const [form, setForm] = useState({ model_code: "", name: "", description: "", brand_id: "", category_id: "", season_id: "", vat_rate: 22 });
    const [variants, setVariants] = useState([{ color: "", size: "", sku: "", ean: "", price: 0, cost: 0, initial_stock: {} }]);
    const nav = useNavigate();

    useEffect(() => {
        api.get("/meta/locations").then((r) => setLocations(r.data));
        api.get("/meta/brands").then((r) => setBrands(r.data));
        api.get("/meta/categories").then((r) => setCats(r.data));
        api.get("/meta/seasons").then((r) => setSeasons(r.data));
    }, []);

    const avail = gender === "DONNA" ? DONNA_CHANNELS : UOMO_CHANNELS;
    const validLocs = locations.filter((l) => gender === "DONNA" ? l.area === "DONNA" : l.area === "UOMO");

    const toggleChannel = (c) => setChannels((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);

    const submit = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...form, gender, channels, vat_rate: Number(form.vat_rate), variants: variants.map((v) => ({ ...v, price: Number(v.price), cost: Number(v.cost), initial_stock: Object.fromEntries(Object.entries(v.initial_stock).map(([k, val]) => [k, Number(val)])) })) };
            await api.post("/products", payload);
            toast.success("Prodotto creato");
            nav("/prodotti");
        } catch (err) { toast.error(apiError(err)); }
    };

    return (
        <form onSubmit={submit} className="space-y-6 max-w-4xl" data-testid="product-form">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Catalogo</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Nuovo prodotto</h1>
                <p className="text-sm text-neutral-500 mt-1">Crea un prodotto con più varianti (colore/taglia). Le quantità iniziali si distribuiscono sui punti vendita.</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Codice modello *</label><input required data-testid="pf-model" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={form.model_code} onChange={(e) => setForm({ ...form, model_code: e.target.value })} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome *</label><input required data-testid="pf-name" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Descrizione</label>
                    <textarea className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-4 gap-4">
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Genere</label>
                        <select data-testid="pf-gender" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={gender} onChange={(e) => { setGender(e.target.value); setChannels(e.target.value === "DONNA" ? ["DONNA_1", "SHOPIFY_DONNA"] : ["UOMO", "SHOPIFY_UOMO"]); }}>
                            <option value="DONNA">Donna</option><option value="UOMO">Uomo</option>
                        </select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Brand</label>
                        <select className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                            <option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Categoria</label>
                        <select className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                            <option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Stagione</label>
                        <select className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" value={form.season_id} onChange={(e) => setForm({ ...form, season_id: e.target.value })}>
                            <option value="">—</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select></div>
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Canali di vendita</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {avail.map((c) => (
                            <button key={c} type="button" onClick={() => toggleChannel(c)} data-testid={`pf-channel-${c}`}
                                className={`px-3 py-1.5 rounded-md text-xs border ${channels.includes(c) ? "bg-black text-white border-black" : "bg-white text-neutral-700 border-neutral-200"}`}>
                                {CH_LABEL[c]}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">I prodotti Donna vanno solo su Donna 1/2 e Shopify Donna. I prodotti Uomo solo su Uomo e Shopify Uomo.</p>
                </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-md p-6">
                <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">Varianti (colore · taglia · SKU · quantità iniziale)</div>
                    <button type="button" onClick={() => setVariants((v) => [...v, { color: "", size: "", sku: "", ean: "", price: 0, cost: 0, initial_stock: {} }])} className="text-xs px-3 py-1.5 border border-neutral-200 rounded" data-testid="add-variant-btn">+ Aggiungi variante</button>
                </div>
                <div className="mt-4 space-y-4">
                    {variants.map((v, i) => (
                        <div key={i} className="border border-neutral-200 rounded-md p-4">
                            <div className="grid grid-cols-6 gap-3">
                                <input placeholder="Colore" value={v.color} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm" />
                                <input placeholder="Taglia" value={v.size} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm" />
                                <input placeholder="SKU" value={v.sku} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm font-mono" />
                                <input placeholder="EAN/barcode" value={v.ean} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, ean: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm font-mono" />
                                <input placeholder="Prezzo €" type="number" step="0.01" value={v.price} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm" />
                                <input placeholder="Costo €" type="number" step="0.01" value={v.cost} onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, cost: e.target.value } : x))} className="px-2 py-2 border border-neutral-200 rounded-md text-sm" />
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                {validLocs.map((loc) => (
                                    <div key={loc.id}>
                                        <label className="text-[10px] uppercase tracking-wider text-neutral-500">Stock in {loc.name}</label>
                                        <input type="number" min="0" value={v.initial_stock[loc.id] || 0}
                                            onChange={(e) => setVariants((vs) => vs.map((x, j) => j === i ? { ...x, initial_stock: { ...x.initial_stock, [loc.id]: e.target.value } } : x))}
                                            className="mt-1 w-full px-2 py-2 border border-neutral-200 rounded-md text-sm" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => nav("/prodotti")} className="px-4 py-2 border border-neutral-200 rounded-md text-sm">Annulla</button>
                <button type="submit" data-testid="pf-submit" className="px-6 py-2 bg-black text-white rounded-md text-sm font-medium">Crea prodotto</button>
            </div>
        </form>
    );
}
