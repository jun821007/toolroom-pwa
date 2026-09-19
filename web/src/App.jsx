import { useCallback, useEffect, useState } from "react";
import { api, AuthExpiredError } from "./api";
import { supabase, authConfigured, signOut } from "./auth";
import Toast from "./components/Toast";
import StockPage from "./pages/StockPage";
import ClassStockPage from "./pages/ClassStockPage";
import DistributePage from "./pages/DistributePage";
import TransferPage from "./pages/TransferPage";
import TodoPage from "./pages/TodoPage";
import LogsPage from "./pages/LogsPage";
import LoginPage from "./pages/LoginPage";

const TABS = [
  { key: "stock", label: "公庫", icon: "🧰" },
  { key: "class", label: "班級", icon: "🏫" },
  { key: "give", label: "發放", icon: "🚚" },
  { key: "move", label: "調貨", icon: "🔄" },
  { key: "todo", label: "待辦", icon: "✅" },
  { key: "logs", label: "流水", icon: "🧾" },
];

export default function App() {
  const [tab, setTab] = useState("stock");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // undefined = 還在確認有沒有登入紀錄，null = 沒登入
  const [session, setSession] = useState(undefined);

  // 開 App 時先還原上次的登入，之後持續跟著登入／登出／權杖換新變動
  useEffect(() => {
    if (!authConfigured) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      setData(await api.bootstrap());
      setError(null);
    } catch (err) {
      // 權杖失效就退回登入畫面，不要卡在錯誤頁
      if (err instanceof AuthExpiredError) return signOut();
      setError(err.message);
    }
  }, []);

  // 登入後才載入資料；登出時把資料清掉，避免下一個人看到殘影
  useEffect(() => {
    if (session) reload();
    else if (session === null) setData(null);
  }, [session, reload]);

  if (!authConfigured) {
    return (
      <Center>
        <p className="text-4xl">🔑</p>
        <p className="mt-3 text-base font-extrabold text-slate-700">還沒設定登入</p>
        <p className="mt-2 text-sm font-bold text-slate-500">
          請到 Netlify 補上 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY，再重新部署。
        </p>
      </Center>
    );
  }

  if (session === undefined) {
    return (
      <Center>
        <p className="animate-pulse text-4xl">🧹</p>
      </Center>
    );
  }

  if (!session) return <LoginPage />;

  if (error) {
    return (
      <Center>
        <p className="text-4xl">🔌</p>
        <p className="mt-3 text-base font-extrabold text-slate-700">連不上伺服器</p>
        <p className="mt-2 text-sm font-bold text-slate-500">{error}</p>
        <button className="btn-mint mt-5" onClick={reload}>
          重試
        </button>
      </Center>
    );
  }

  if (!data) {
    return (
      <Center>
        <p className="animate-pulse text-4xl">🧹</p>
        <p className="mt-3 text-sm font-bold text-slate-500">載入中…</p>
      </Center>
    );
  }

  // 經手人由後端依登入身分決定，前端只負責顯示
  const operator = data.me?.name || "";
  const shared = { ...data, reload, toast: setToast };

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-40 bg-mint-50/85 px-4 pt-safe backdrop-blur-md">
        <div className="flex items-center justify-between py-3">
          <h1 className="text-lg font-extrabold text-slate-800">
            🧹 衛生組工具室
          </h1>
          <button
            onClick={() => {
              if (confirm(`要登出「${operator}」嗎？`)) signOut();
            }}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-card"
          >
            {operator}
          </button>
        </div>
      </header>

      <main className="px-4 pb-32 pt-1">
        {tab === "stock" ? <StockPage {...shared} /> : null}
        {tab === "class" ? <ClassStockPage {...shared} /> : null}
        {tab === "give" ? <DistributePage {...shared} /> : null}
        {tab === "move" ? <TransferPage {...shared} /> : null}
        {tab === "todo" ? <TodoPage toast={setToast} /> : null}
        {tab === "logs" ? <LogsPage {...shared} /> : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white bg-white/95 pb-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-extrabold transition sm:text-xs ${
                  active ? "text-mint-600" : "text-slate-400"
                }`}
              >
                <span className={`text-xl transition sm:text-2xl ${active ? "scale-110" : ""}`}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>{children}</div>
    </div>
  );
}
