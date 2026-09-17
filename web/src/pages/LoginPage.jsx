import { useState } from "react";
import { signIn } from "../auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // 登入成功不用做別的，App 會收到狀態變化自己換頁
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-5xl">🧹</p>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-800">衛生組工具室</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">請先登入</p>
        </div>

        <div className="card space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-500">帳號（Email）</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold text-slate-500">密碼</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600">{error}</p>
          ) : null}

          <button type="submit" disabled={busy} className="btn-mint w-full disabled:opacity-50">
            {busy ? "登入中…" : "登入"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs font-bold text-slate-400">
          登入後會記住這支手機，平常開啟不用再輸入
        </p>
      </form>
    </div>
  );
}
