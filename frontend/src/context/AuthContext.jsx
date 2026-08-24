import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/auth/me");
                setUser(data);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data?.token) localStorage.setItem("erp_token", data.token);
        setUser(data.user);
        return data.user;
    };
    const logout = async () => {
        try { await api.post("/auth/logout"); } catch {}
        localStorage.removeItem("erp_token");
        setUser(null);
    };
    return (
        <AuthCtx.Provider value={{ user, setUser, login, logout, loading }}>
            {children}
        </AuthCtx.Provider>
    );
}

export const useAuth = () => useContext(AuthCtx);
