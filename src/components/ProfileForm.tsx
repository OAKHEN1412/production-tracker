"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Me = { id: string; name: string; username: string; role: string };

export default function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setOk("");
    if (password && password !== confirm) { setErr("รหัสผ่านยืนยันไม่ตรงกัน"); return; }
    if (password && password.length < 6) { setErr("รหัสผ่านอย่างน้อย 6 ตัว"); return; }
    const body: any = {};
    if (name.trim() && name.trim() !== me.name) body.name = name.trim();
    if (username.trim() && username.trim() !== me.username) body.username = username.trim();
    if (password) body.password = password;
    if (Object.keys(body).length === 0) { setErr("ไม่มีการเปลี่ยนแปลง"); return; }

    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : JSON.stringify(j.error));
      return;
    }
    setPassword(""); setConfirm("");
    setOk("บันทึกแล้ว" + (body.username || body.password ? " — ครั้งหน้า login ด้วยข้อมูลใหม่" : ""));
    router.refresh();
  }

  const inp = "border rounded px-3 py-2 w-full text-sm";
  const lbl = "text-xs text-gray-600";

  return (
    <form onSubmit={save} className="bg-white p-4 rounded shadow space-y-3 max-w-md">
      <div className="text-xs text-gray-500">role: <b>{me.role}</b></div>
      <div>
        <div className={lbl}>ชื่อ</div>
        <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <div className={lbl}>อีเมล / ชื่อผู้ใช้ (สำหรับเข้าระบบ)</div>
        <input className={inp} value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="border-t pt-3">
        <div className={lbl}>รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)</div>
        <input type="password" className={inp} value={password} autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัว" />
      </div>
      {password && (
        <div>
          <div className={lbl}>ยืนยันรหัสผ่านใหม่</div>
          <input type="password" className={inp} value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} />
        </div>
      )}
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {ok && <div className="text-green-700 text-sm">{ok}</div>}
      <div className="flex justify-end">
        <button disabled={busy} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
          {busy ? "..." : "บันทึก"}
        </button>
      </div>
    </form>
  );
}
