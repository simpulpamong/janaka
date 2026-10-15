import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertOctagon, Home, RotateCcw } from "lucide-react"
import { JanakaLogo } from "@/components/layout/JanakaLogo"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * Error Boundary tingkat aplikasi.
 *
 * Tanpa boundary ini, satu kesalahan render membuat seluruh aplikasi kosong dan
 * hanya menampilkan pesan teknis berbahasa Inggris. Boundary ini menampilkan
 * pesan ramah + aksi pemulihan, plus detail teknis di balik `<details>` —
 * cukup untuk dilaporkan, tapi tidak-take up layar saat yang dibutuhkan adalah
 * tombol "Coba Lagi".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error("[ErrorBoundary] Kesalahan aplikasi:", error, info)
  }

  private handleReset = () => {
    this.setState({ error: null, info: null })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B1120] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
            <AlertOctagon className="h-7 w-7 text-rose-600 dark:text-rose-400" />
          </div>

          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Terjadi Kesalahan
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Aplikasi mengalami gangguan dan tidak dapat ditampilkan. Coba salah satu tindakan di
            bawah ini.
          </p>

          <details className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-left">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Detail teknis
            </summary>
            <p className="mt-2 break-words font-mono text-xs text-rose-600 dark:text-rose-400">
              {error.message}
            </p>
            {info?.componentStack ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {info.componentStack}
              </pre>
            ) : null}
          </details>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/"
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
            >
              <Home className="h-4 w-4" />
              Ke Dashboard
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4" />
              Coba Lagi
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <JanakaLogo className="h-4 w-4" />
            JANAKA — Satpol PP Kabupaten Ponorogo
          </div>
        </div>
      </div>
    )
  }
}