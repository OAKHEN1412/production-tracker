"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type U = {
  id: string;
  username: string;
  name: string;
  role: "OWNER" | "PRODUCTION" | "SALES";
  createdAt: string | Date;
};

const ROLE_LABEL: Record<U["role"], string> = {
  OWNER: "Owner",
  PRODUCTION: "ฝ่ายผลิต",
  SALES: "ฝ่ายขาย",
};

export default function UsersAdmin({ initial, meId }: { initial: U[]; meId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<U[]>(initial);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "PRODUCTION" as U["role"],
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newUser),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : JSON.stringify(j.error));
      return;
    }
    const u = await res.json();
    setUsers([...users, u]);
    setNewUser({ username: "", password: "", name: "", role: "PRODUCTION" });
    router.refresh();
  }

  async function changeRole(id: string, role: U["role"]) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "เปลี่ยน role ไม่ได้");
      return;
    }
    setUsers(users.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  async function resetPassword(id: string) {
    const pw = prompt("password ใหม่ (อย่างน้อย 6 ตัว)");
    if (!pw) return;
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) {
      alert("reset ไม่ได้");
      return;
    }
    alert("เปลี่ยนรหัสแล้ว");
  }

  async function del(id: string) {
    if (!confirm("ลบผู้ใช้นี้?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "ลบไม่ได้");
      return;
    }
    setUsers(users.filter((u) => u.id !== id));
  }

  const input = "border rounded px-2 py-1 text-sm";

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 font-semibold">เพิ่มผู้ใช้ใหม่</div>
        <input className={input} placeholder="Username / email" required
          value={newUser.username}
          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
        <input className={input} placeholder="ชื่อ" required
          value={newUser.name}
          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
        <input className={input} placeholder="Password (>=6)" type="password" required
          value={newUser.password}
          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
        <select className={input} value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value as U["role"] })}>
          <option value="OWNER">Owner</option>
          <option value="PRODUCTION">ฝ่ายผลิต</option>
          <option value="SALES">ฝ่ายขาย</option>
        </select>
        {err && <div className="sm:col-span-2 text-red-600 text-sm">{err}</div>}
        <div className="sm:col-span-2 flex justify-end">
          <button disabled={busy} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm">
            {busy ? "..." : "+ สร้างผู้ใช้"}
          </button>
        </div>
      </form>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>ชื่อ</th>
              <th>Role</th>
              <th>สร้างเมื่อ</th>
              <th className="text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono text-xs">{u.username}</td>
                <td>{u.name}</td>
                <td>
                  <select className={input} value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as U["role"])}
                    disabled={u.id === meId}>
                    <option value="OWNER">Owner</option>
                    <option value="PRODUCTION">ฝ่ายผลิต</option>
                    <option value="SALES">ฝ่ายขาย</option>
                  </select>
                </td>
                <td className="text-xs">
                  {new Date(u.createdAt).toLocaleDateString("th-TH")}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => resetPassword(u.id)}
                    className="text-blue-600 text-xs px-2 py-1 hover:underline">
                    reset pw
                  </button>
                  <button onClick={() => del(u.id)}
                    disabled={u.id === meId}
                    className="text-red-600 text-xs px-2 py-1 hover:underline disabled:opacity-30">
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {users.map((u) => (
          <div key={u.id} className="bg-white rounded shadow p-3 text-sm">
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{u.name}</div>
                <div className="font-mono text-xs text-gray-600 truncate">{u.username}</div>
              </div>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                {ROLE_LABEL[u.role]}
              </span>
            </div>
            <div className="mt-2">
              <label className="text-xs text-gray-500">Role</label>
              <select className={input + " w-full"} value={u.role}
                onChange={(e) => changeRole(u.id, e.target.value as U["role"])}
                disabled={u.id === meId}>
                <option value="OWNER">Owner</option>
                <option value="PRODUCTION">ฝ่ายผลิต</option>
                <option value="SALES">ฝ่ายขาย</option>
              </select>
            </div>
            <div className="flex gap-2 mt-3 pt-2 border-t">
              <button onClick={() => resetPassword(u.id)}
                className="text-xs px-3 py-1.5 rounded border border-blue-600 text-blue-600">
                Reset password
              </button>
              <button onClick={() => del(u.id)}
                disabled={u.id === meId}
                className="text-xs px-3 py-1.5 rounded border border-red-600 text-red-600 disabled:opacity-30 ml-auto">
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
