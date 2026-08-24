import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// attach bearer token as fallback for browsers that block SameSite=None cookies on iframe/preview
api.interceptors.request.use((cfg) => {
    const t = localStorage.getItem("erp_token");
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
});

export function fmtEUR(n) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n || 0));
}

export function fmtDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    } catch {
        return iso;
    }
}

export function fmtDateShort(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
    } catch {
        return iso;
    }
}

export function apiError(e, fallback = "Si è verificato un errore. Riprova.") {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
    return d?.msg || e?.message || fallback;
}
