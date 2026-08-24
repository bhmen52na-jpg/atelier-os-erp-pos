import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, ShoppingCart, Package, Warehouse, Store, Users, Upload, Tag, Cable, Settings, LogOut, ArrowLeftRight, ScrollText, Activity, History } from "lucide-react";
import { Toaster } from "sonner";

const NAV = [
    { section: "Panoramica" },
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
    { section: "Vendite" },
    { to: "/pos", label: "Cassa (POS)", icon: ShoppingCart, testid: "nav-pos" },
    { to: "/vendite/storico", label: "Storico vendite", icon: History, testid: "nav-sales-history" },
    { section: "Catalogo", roles: ["ADMIN", "MANAGER"] },
    { to: "/prodotti", label: "Prodotti", icon: Package, testid: "nav-products", roles: ["ADMIN", "MANAGER"] },
    { section: "Magazzino" },
    { to: "/magazzino", label: "Disponibilità", icon: Warehouse, testid: "nav-inventory" },
    { to: "/magazzino/movimenti", label: "Movimenti", icon: Activity, testid: "nav-movements" },
    { to: "/magazzino/trasferimenti", label: "Trasferimenti", icon: ArrowLeftRight, testid: "nav-transfers" },
    { section: "Vendita online", roles: ["ADMIN", "MANAGER"] },
    { to: "/ordini", label: "Ordini Shopify", icon: Store, testid: "nav-orders", roles: ["ADMIN", "MANAGER"] },
    { section: "Clienti & Prezzi" },
    { to: "/clienti", label: "Clienti", icon: Users, testid: "nav-customers" },
    { to: "/promozioni", label: "Promozioni & Saldi", icon: Tag, testid: "nav-promotions", roles: ["ADMIN", "MANAGER"] },
    { section: "Dati", roles: ["ADMIN", "MANAGER"] },
    { to: "/importa", label: "Importa da CSV", icon: Upload, testid: "nav-import", roles: ["ADMIN", "MANAGER"] },
    { section: "Integrazioni", roles: ["ADMIN", "MANAGER"] },
    { to: "/integrazioni/shopify", label: "Shopify Donna & Uomo", icon: Cable, testid: "nav-shopify", roles: ["ADMIN", "MANAGER"] },
    { section: "Sistema", roles: ["ADMIN", "MANAGER"] },
    { to: "/sistema/utenti", label: "Utenti & Ruoli", icon: Users, testid: "nav-users", roles: ["ADMIN"] },
    { to: "/sistema/sincronizzazioni", label: "Log sincronizzazioni", icon: ScrollText, testid: "nav-sync-log", roles: ["ADMIN", "MANAGER"] },
    { to: "/sistema/audit", label: "Registro attività", icon: ScrollText, testid: "nav-audit", roles: ["ADMIN", "MANAGER"] },
];

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const nav = useNavigate();
    const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
    return (
        <div className="min-h-screen flex bg-neutral-50">
            <aside className="w-72 shrink-0 bg-white border-r border-neutral-200 flex flex-col" data-testid="sidebar">
                <div className="px-6 py-6 border-b border-neutral-200">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Fashion ERP</div>
                    <div className="text-xl font-light tracking-tight text-neutral-900 mt-1">Atelier<span className="font-semibold">·</span>OS</div>
                </div>
                <nav className="flex-1 overflow-y-auto py-2 px-3">
                    {visibleNav.map((item, idx) =>
                        item.section ? (
                            <div key={idx} className="sidebar-section">{item.section}</div>
                        ) : (
                            <NavLink key={item.to} to={item.to} data-testid={item.testid}
                                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                                <item.icon size={16} strokeWidth={1.5} />
                                <span>{item.label}</span>
                            </NavLink>
                        )
                    )}
                </nav>
                <div className="border-t border-neutral-200 p-4">
                    <div className="text-xs text-neutral-500">Connesso come</div>
                    <div className="text-sm font-medium text-neutral-900 truncate" data-testid="current-user-name">{user?.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{user?.email}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">{user?.role?.replaceAll("_", " ")}</div>
                    <button data-testid="logout-btn" onClick={() => { logout(); nav("/login"); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-neutral-200 rounded text-xs font-medium hover:bg-neutral-100" style={{ transition: "background-color 0.15s ease" }}>
                        <LogOut size={14} /> Esci
                    </button>
                </div>
            </aside>
            <main className="flex-1 min-w-0">
                <div className="max-w-[1400px] mx-auto px-8 py-8">{children}</div>
            </main>
            <Toaster position="top-right" richColors />
        </div>
    );
}
