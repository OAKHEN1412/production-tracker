# Production Tracker

Web app ติดตามการผลิต — ฝ่ายผลิตจัดการ ฝ่ายขายดูสถานะ.

## Stack
- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite
- NextAuth (Credentials)
- Tailwind CSS

## Roles
- `PRODUCTION` — สร้าง / แก้ไข / อัปเดตสถานะ / กำหนด ETA
- `SALES` — read-only, ดูตาราง + สถานะ + ETA

## Features
- ตารางตามฟอร์มเดิม: ลำดับ, วันสั่งผลิต, กำหนดเสร็จ, Delivery time, เลขที่เอกสาร, ลูกค้า, รายการ, จำนวน, ยกเลิก, หมายเหตุ
- เพิ่ม: **สถานะการผลิต** (PENDING / IN_PROGRESS / PAUSED / QC / DONE / CANCELLED) + **ผู้รับผิดชอบ**
- ETA สองโหมด:
  - **Auto** — คำนวณจาก `rate (ชิ้น/ชม.) × qty` เริ่มนับตอน `IN_PROGRESS`
  - **Manual** — Production พิมพ์วันเสร็จเอง
- Log ประวัติเปลี่ยนสถานะ (JobLog)

## Setup

```bash
cd "production-tracker"
npm install
cp .env.example .env   # หรือใช้ .env ที่ generate ไว้
npx prisma db push
npm run db:seed
npm run dev
```

เปิด http://localhost:3000

## Seed accounts
| user | pass | role |
|---|---|---|
| production | production123 | PRODUCTION |
| sales | sales123 | SALES |
| worker1 | worker123 | PRODUCTION |

## โครงสร้าง
```
prisma/
  schema.prisma    # Job, User, JobLog
  seed.ts
src/
  app/
    api/auth/[...nextauth]/route.ts
    api/jobs/route.ts
    api/jobs/[id]/route.ts
    api/users/route.ts
    login/page.tsx
    jobs/new/page.tsx
    jobs/[id]/page.tsx
    page.tsx          # dashboard
    layout.tsx
    globals.css
  components/
    JobTable.tsx
    JobForm.tsx
    NavBar.tsx
    Providers.tsx
  lib/
    prisma.ts
    auth.ts
    eta.ts            # computeAutoEta + STATUS constants
```

## Deploy: Vercel + Neon Postgres

1. **Neon DB** — สร้าง project ที่ https://neon.tech (ฟรี)
   - Copy connection string (มี `?sslmode=require`)
2. **GitHub** — push repo (ทำให้แล้ว)
3. **Vercel** — https://vercel.com/new → import GitHub repo
   - Environment variables:
     - `DATABASE_URL` = Neon connection string
     - `NEXTAUTH_SECRET` = random 32+ char
     - `NEXTAUTH_URL` = https://your-app.vercel.app
   - Build command: `npm run build` (default)
4. **First-time DB push + seed** (ทำ local ชี้ไป prod DB):
   ```bash
   DATABASE_URL="<neon-url>" npx prisma db push
   DATABASE_URL="<neon-url>" npm run db:seed
   ```
5. เปลี่ยน `NEXTAUTH_URL` บน Vercel ให้ตรง production URL แล้ว redeploy

## Next ideas
- WebSocket / SSE สำหรับ realtime update ฝั่ง Sales
- กราฟ Gantt
- Export Excel
- แจ้งเตือนเกิน ETA
