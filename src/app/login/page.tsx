"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    if (res?.error) setErr("เข้าสู่ระบบล้มเหลว");
    else router.push("/");
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded shadow">
      <h1 className="text-xl font-bold mb-4">เข้าสู่ระบบ</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="border w-full px-3 py-2 rounded"
          placeholder="Username"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />
        <input
          type="password"
          className="border w-full px-3 py-2 rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="bg-blue-600 text-white w-full py-2 rounded">
          เข้าระบบ
        </button>
      </form>
      <div className="text-xs text-gray-500 mt-4">
        Default seed:<br />
        owner@autocluster.com / owner1234 (OWNER)<br />
        production / production123 (PRODUCTION)<br />
        sales / sales123 (SALES)
      </div>
    </div>
  );
}
