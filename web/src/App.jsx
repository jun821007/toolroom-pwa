import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import Toast from "./components/Toast";
import Sheet from "./components/Sheet";
import StockPage from "./pages/StockPage";
import DistributePage from "./pages/DistributePage";
import TransferPage from "./pages/TransferPage";
import LogsPage from "./pages/LogsPage";

const TABS = [
  { key: "stock", label: "公庫", icon: "🧰" },
  { key: "give", label: "發放", icon: "🚚" },
  { key: "move", label: "調貨", icon: "🔄" },
  { key: "logs", label: "流水", icon: "🧾" },
];

export default function App() {
  const [tab, setTab] = useState("stock");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [operator, setOperator] = useState(() => localStorage.getItem("operator") || "");
  const [askName, setAskName] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api.bootstrap());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 第一次開啟先問經手人，之後記在手機上不再詢問
  useEffect(() => {
    if (data && !operator) setAskName(true);
  }, [data, operator]);

  const saveOperator = (name) => {
    const clean = name.trim() || "未署名";
    localStorage.setItem("operator", clean);
    setOperator(clean);
    setAskName(false);
  };

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

  const shared = { ...data, operator, reload, toast: setToast };

  return (
    <div className="mx-auto max-w-lg">
      <header className="sticky top-0 z-40 bg-mint-50/85 px-4 pt-safe backdrop-blur-md">
        <div className="flex items-center justify-between py-3">
          <h1 className="text-lg font-extrabold text-slate-800">
            🧹 衛生組工具室
          </h1>
          <button
            onClick={() => setAskName(true)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-card"
          >
            {operator || "設定經手人"}
          </button>
        </div>
      </header>

      <main className="px-4 pb-32 pt-1">
        {tab === "stock" ? <StockPage {...shared} /> : null}
        {tab === "give" ? <DistributePage {...shared} /> : null}
        {tab === "move" ? <TransferPage {...shared} /> : null}
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
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-extrabold transition ${
                  active ? "text-mint-600" : "text-slate-400"
                }`}
              >
                <span className={`text-2xl transition ${active ? "scale-110" : ""}`}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <NameSheet open={askName} current={operator} onSave={saveOperator} onClose={() => setAskName(false)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function NameSheet({ open, current, onSave, onClose }) {
  const [name, setName] = useState(current);

  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);

  return (
    <Sheet
      open={open}
      title="你是誰？"
      onClose={current ? onClose : () => onSave(name)}
      footer={
        <button className="btn-mint w-full" onClick={() => onSave(name)}>
          記住我
        </button>
      }
    >
      <p className="mb-3 text-sm font-bold text-slate-500">
        每筆異動都會記下經手人，設定一次就好，之後這支手機不會再問。
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例如：王小明"
        className="field text-center text-lg font-extrabold"
      />
    </Sheet>
  );
}

function Center({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>{children}</div>
    </div>
  );
}
