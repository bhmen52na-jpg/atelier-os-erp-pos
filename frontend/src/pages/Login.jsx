import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
    const { login, user } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [demoUsers, setDemoUsers] = useState([]);
    const [errMsg, setErrMsg] = useState("");

    useEffect(() => {
        if (user) nav("/dashboard");
        api.get("/auth/demo-users").then((r) => setDemoUsers(r.data)).catch(() => {});
    }, [user, nav]);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrMsg("");
        try {
            await login(email, password);
            toast.success("Accesso effettuato");
            nav("/dashboard");
        } catch (err) {
            const msg = apiError(err, "Impossibile accedere. Verifica email e password.");
            setErrMsg(msg);
            toast.error(msg);
        } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
            <div className="hidden md:block relative overflow-hidden bg-neutral-900">
                <img alt="" src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzh8MHwxfHNlYXJjaHwxfHxjbG90aGluZyUyMHJldGFpbCUyMHN0b3JlJTIwbWluaW1hbHxlbnwwfHx8fDE3ODc1OTMwODV8MA&ixlib=rb-4.1.0&q=85"
                    className="absolute inset-0 w-full h-full object-cover opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/30 to-transparent" />
                <div className="relative h-full flex flex-col justify-between p-12 text-white">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">Fashion ERP · POS</div>
                        <div className="mt-3 text-5xl font-light tracking-tight">Atelier<span className="font-semibold">·</span>OS</div>
                    </div>
                    <div className="text-sm opacity-80 max-w-md leading-relaxed">
                        Gestisci Donna 1, Donna 2, Uomo e i due Shopify da un unico gestionale. Vendi in cassa, sincronizza il magazzino, importa i fornitori.
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-center px-6 py-12 bg-neutral-50">
                <div className="w-full max-w-md">
                    <h1 className="text-3xl font-light tracking-tight">Accedi</h1>
                    <p className="text-sm text-neutral-500 mt-1">Inserisci le tue credenziali per entrare nel gestionale.</p>
                    <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Email</label>
                            <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 w-full px-4 py-3 bg-white border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-black" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Password</label>
                            <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 w-full px-4 py-3 bg-white border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-black" />
                        </div>
                        <button data-testid="login-submit" disabled={loading}
                            className="w-full py-3 bg-black text-white rounded-md font-medium disabled:opacity-50" style={{ transition: "background-color 0.15s ease" }}>
                            {loading ? "Accesso…" : "Entra"}
                        </button>
                        {errMsg && <div data-testid="login-error" className="mt-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{errMsg}</div>}
                    </form>
                    {demoUsers.length > 0 && (
                        <div className="mt-8 border border-dashed border-neutral-300 rounded-md p-4 bg-white">
                            <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-500 mb-2">Accessi DEMO (da sostituire in produzione)</div>
                            <div className="space-y-1.5">
                                {demoUsers.map((u) => (
                                    <button key={u.email} type="button" data-testid={`demo-${u.role}`}
                                        onClick={() => { setEmail(u.email); setPassword(u.password); }}
                                        className="w-full text-left flex justify-between items-center py-1.5 px-2 rounded hover:bg-neutral-100 text-xs">
                                        <span className="font-medium">{u.label}</span>
                                        <span className="text-neutral-500 font-mono">{u.email}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
