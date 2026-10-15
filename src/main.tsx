import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createBrowserRouter } from "react-router-dom"
import { AuthProvider } from "@/context/AuthContext"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"
import { PwaRegister } from "@/components/pwa/PwaRegister"
import { ToastProvider } from "@/components/ui/Toast"
import { routes } from "@/routes"
import "./index.css"

const container = document.getElementById("root")
if (!container) throw new Error("Elemen #root tidak ditemukan pada index.html")

const router = createBrowserRouter(routes)

createRoot(container).render(
  <StrictMode>
    {/*
      * AuthProvider harus membungkus RouterProvider karena Sidebar, Topbar, dan
      * RouteGuards memakai `useAuth()`. Tanpa pembungkus ini, `useAuth()`
      * melempar error.
     *
      * ToastProvider berada di dalam AuthProvider supaya notifikasi bisa
      * dipanggil dari mana saja — termasuk dari dalam modal dan dari halaman
      * login yang berada di luar shell.
     */}
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
          {/*
           * PwaRegister memasang service worker &mdash; menampilkan prompt "Pasang
           * aplikasi". Harus di dalam AuthProvider supaya tidak ikut ter-gate
           * oleh RouteGuards: service worker harus tetap aktif di halaman
           * login juga.
           */}
          <PwaRegister />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)