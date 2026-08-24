import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Products from "@/pages/Products";
import ProductForm from "@/pages/ProductForm";
import Inventory from "@/pages/Inventory";
import Movements from "@/pages/Movements";
import Transfers from "@/pages/Transfers";
import ShopifyPage from "@/pages/Shopify";
import ImportCSV from "@/pages/ImportCSV";
import Orders from "@/pages/Orders";
import { SalesHistory, Customers, Promotions, UsersPage, AuditLog, SyncLog } from "@/pages/OtherPages";
import { Toaster } from "sonner";
import React from "react";

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    componentDidCatch(err) { console.error("App error:", err); }
    render() {
        if (this.state.err) {
            return (
                <div className="min-h-screen flex items-center justify-center p-8 bg-neutral-50">
                    <div className="max-w-md text-center">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Errore</div>
                        <h1 className="text-2xl font-light mt-1">Qualcosa è andato storto</h1>
                        <p className="text-sm text-neutral-500 mt-2">Ricarica la pagina. Se il problema persiste, contatta l'amministratore.</p>
                        <button onClick={() => window.location.reload()} className="mt-4 px-5 py-2 bg-black text-white rounded-md text-sm">Ricarica</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const P = ({ children }) => <ProtectedRoute><Layout><ErrorBoundary>{children}</ErrorBoundary></Layout></ProtectedRoute>;

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster position="top-right" richColors />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<P><Dashboard /></P>} />
                    <Route path="/pos" element={<P><POS /></P>} />
                    <Route path="/vendite/storico" element={<P><SalesHistory /></P>} />
                    <Route path="/prodotti" element={<P><Products /></P>} />
                    <Route path="/prodotti/nuovo" element={<P><ProductForm /></P>} />
                    <Route path="/magazzino" element={<P><Inventory /></P>} />
                    <Route path="/magazzino/movimenti" element={<P><Movements /></P>} />
                    <Route path="/magazzino/trasferimenti" element={<P><Transfers /></P>} />
                    <Route path="/ordini" element={<P><Orders /></P>} />
                    <Route path="/clienti" element={<P><Customers /></P>} />
                    <Route path="/promozioni" element={<P><Promotions /></P>} />
                    <Route path="/importa" element={<P><ImportCSV /></P>} />
                    <Route path="/integrazioni/shopify" element={<P><ShopifyPage /></P>} />
                    <Route path="/sistema/utenti" element={<P><UsersPage /></P>} />
                    <Route path="/sistema/sincronizzazioni" element={<P><SyncLog /></P>} />
                    <Route path="/sistema/audit" element={<P><AuditLog /></P>} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
