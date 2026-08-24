import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";

export default function ImportCSV() {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [mapping, setMapping] = useState({ model_code: "", name: "", color: "", size: "", ean: "", quantity: "", cost: "", price: "" });
    const [supplier, setSupplier] = useState("");
    const [gender, setGender] = useState("DONNA");
    const [defaultLocation, setDefaultLocation] = useState("loc-donna-1");
    const [locations, setLocations] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [saveProfile, setSaveProfile] = useState(false);
    const [imports, setImports] = useState([]);
    const load = () => { api.get("/csv/imports").then((r) => setImports(r.data)); api.get("/csv/profiles").then((r) => setProfiles(r.data)); };
    useEffect(() => { api.get("/meta/locations").then((r) => setLocations(r.data)); load(); }, []);

    const doPreview = async () => {
        if (!file) return;
        const fd = new FormData(); fd.append("file", file);
        try { const { data } = await api.post("/csv/preview", fd); setPreview(data); }
        catch (e) { toast.error(apiError(e)); }
    };

    const applyProfile = (id) => {
        const p = profiles.find((x) => x.id === id);
        if (p) { setMapping({ ...mapping, ...p.mapping }); setSupplier(p.supplier_name); toast.success(`Profilo ${p.supplier_name} applicato`); }
    };

    const doImport = async () => {
        if (!file || !supplier) { toast.error("Serve un file e il nome del fornitore"); return; }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("supplier_name", supplier);
        fd.append("save_profile", saveProfile ? "true" : "false");
        fd.append("mapping", JSON.stringify({ ...mapping, default_location_id: defaultLocation, gender }));
        try { const { data } = await api.post("/csv/import", fd); toast.success(`Importazione completata · ${data.rows_ok} righe OK, ${data.rows_error} errori`); load(); }
        catch (e) { toast.error(apiError(e)); }
    };

    return (
        <div className="space-y-6" data-testid="import-page">
            <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Importa</div>
                <h1 className="text-3xl font-light tracking-tight mt-1">Importa da CSV</h1>
                <p className="text-sm text-neutral-500 mt-1">Carica il listino del fornitore, mappa le colonne una sola volta e salva il profilo per la volta successiva.</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-md p-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome fornitore</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md" placeholder="Imperial, Liu Jo…" /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Genere</label><select value={gender} onChange={(e) => { setGender(e.target.value); setDefaultLocation(e.target.value === "DONNA" ? "loc-donna-1" : "loc-uomo"); }} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md"><option value="DONNA">Donna</option><option value="UOMO">Uomo</option></select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Carica in negozio</label><select value={defaultLocation} onChange={(e) => setDefaultLocation(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md">{locations.filter((l) => gender === "DONNA" ? l.area === "DONNA" : l.area === "UOMO").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                </div>
                {profiles.length > 0 && (
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Riapplica un profilo salvato</label>
                        <select onChange={(e) => e.target.value && applyProfile(e.target.value)} className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-md">
                            <option value="">— Seleziona profilo —</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.supplier_name}</option>)}
                        </select>
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} data-testid="csv-file" className="flex-1" />
                    <button onClick={doPreview} disabled={!file} className="px-4 py-2 border border-neutral-200 rounded-md text-sm disabled:opacity-40" data-testid="csv-preview-btn">Anteprima</button>
                </div>
            </div>
            {preview && (
                <div className="bg-white border border-neutral-200 rounded-md p-5">
                    <div className="text-sm font-medium mb-3">Mappa le colonne del tuo CSV con i campi del gestionale</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.keys(mapping).map((k) => (
                            <div key={k}>
                                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{k}</label>
                                <select value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })} className="mt-1 w-full px-2 py-2 border border-neutral-200 rounded-md text-sm">
                                    <option value="">—</option>{preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3">
                        <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} /> Salva questo mapping come profilo del fornitore</label>
                    </div>
                    <div className="mt-4 overflow-x-auto max-h-64 border border-neutral-100 rounded">
                        <table className="w-full text-xs">
                            <thead className="bg-neutral-50"><tr>{preview.headers.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                            <tbody>{preview.rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-neutral-100">{preview.headers.map((h) => <td key={h} className="p-2">{r[h]}</td>)}</tr>)}</tbody>
                        </table>
                    </div>
                    <button onClick={doImport} className="mt-4 px-6 py-3 bg-black text-white rounded-md text-sm font-medium" data-testid="csv-import-btn">Importa nel gestionale</button>
                </div>
            )}
            <div>
                <h2 className="text-lg font-medium mb-2">Storico importazioni</h2>
                <div className="bg-white border border-neutral-200 rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Fornitore</th><th className="text-left p-3">File</th><th className="text-right p-3">OK</th><th className="text-right p-3">Errori</th></tr></thead>
                        <tbody>{imports.map((i) => <tr key={i.id} className="border-t border-neutral-100"><td className="p-3 text-xs text-neutral-500">{new Date(i.created_at).toLocaleString("it-IT")}</td><td className="p-3">{i.supplier_name}</td><td className="p-3 text-xs">{i.filename}</td><td className="p-3 text-right text-emerald-600">{i.rows_ok}</td><td className="p-3 text-right text-red-600">{i.rows_error}</td></tr>)}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
