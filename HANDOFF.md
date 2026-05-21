# Production Tracker — Handoff

ระบบติดตามการผลิต. Production / Support กรอกงาน → ระบบคำนวณ ETA อัตโนมัติ → Sales เห็น read-only.

- **Production URL:** https://production-tracker-beige.vercel.app
- **GitHub:** https://github.com/OAKHEN1412/production-tracker (`main` = production)
- **Owner:** owner@autocluster.com / owner1234

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Auth | NextAuth (Credentials, JWT session) |
| DB | Postgres (Neon, ap-southeast-1) |
| ORM | Prisma 5.22 |
| UI | Tailwind CSS |
| Excel | xlsx (client-side parse) |
| Hosting | Vercel (auto-deploy on push to `main`) |

---

## Quick start (local)

```powershell
git clone https://github.com/OAKHEN1412/production-tracker.git
cd production-tracker
npm install
cp .env.example .env   # แล้วใส่ DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npx prisma db push     # sync schema (ใช้ Neon URL เดียวกับ prod ก็ได้)
npm run db:seed        # สร้าง user เริ่มต้น
npm run dev
```

หรือใช้ `setup.bat` (Windows) / `setup.ps1` ที่อยู่ใน repo

Default account หลัง seed: owner / sales / chang_tee / chang_sak (รหัสดูใน `prisma/seed.ts`)

---

## Roles

| Role | สิทธิ์ |
|---|---|
| **OWNER** | ทุกอย่าง + จัดการ user ที่ `/admin/users` |
| **PRODUCTION** | สร้าง / แก้ / ลบ / เปลี่ยน status / override ETA |
| **SUPPORT** | สร้างงาน + แก้/ลบเฉพาะของตัวเอง ไม่เปลี่ยน status ไม่ override ETA |
| **SALES** | read-only |

Logic อยู่ใน `src/lib/auth.ts` (`canCreateJob`, `canFullEdit`). API endpoint check role ทุก route (ใน `src/app/api/jobs/`).

---

## ETA Logic (สำคัญ)

อยู่ใน `src/lib/scheduler.ts`. Trigger ทุกครั้งที่ POST/PATCH/DELETE /api/jobs ผ่าน `recomputeWorkerQueues()`.

**Rate (ชิ้น / วันทำการ):**
- มีช่าง + `item` ตรงกับงานก่อนหน้าในคิวช่างคนนั้น → **8**
- มีช่าง + `item` ต่าง → **4**
- ไม่ assign ช่าง → **6**

**คิว:**
- 1 ช่าง = serial ทีละงาน เรียงตาม `createdAt`
- งาน unassigned ใช้ baseline = ETA งานช้าสุดในระบบ (worst-case)
- ข้ามเสาร์-อาทิตย์

**Recompute ตอนไหน:**
- หลัง create / update assignee/qty/item / delete / bulk upload
- กระทบช่างเก่า + ช่างใหม่ + bucket unassigned

**Popup:** หลัง save จะ pop แสดงวันเสร็จ + ช่าง + เซล + delivery label (3-5 วันทำการ ฯลฯ)

---

## Schema

`prisma/schema.prisma`

```
User      id, username (unique), password (bcrypt), name, role
Job       id, seq (unique), docNo (unique), orderDate, deliveryTime (auto),
          customer, item, qty, status, cancelled, notes,
          rate, etaAuto (auto), etaManual,
          startedAt, finishedAt,
          assignedToId → User,
          salesOwnerId → User (เซลคนที่รับผิดชอบ),
          createdById → User
JobLog    id, jobId, status, message, createdAt
```

**Status enum** (เก็บเป็น string): PENDING / IN_PROGRESS / PAUSED / QC / DONE / CANCELLED  
Label/สีอยู่ใน `src/lib/eta.ts` (STATUS_LABEL, STATUS_COLOR)

---

## Project layout

```
prisma/
  schema.prisma
  seed.ts            # seed users + sample jobs
  cleanup-users.ts   # one-off util
src/
  app/
    page.tsx               # dashboard
    login/page.tsx
    admin/users/page.tsx   # OWNER only
    jobs/new/page.tsx      # full form
    jobs/[id]/page.tsx     # full form + log history
    api/
      auth/[...nextauth]/route.ts
      jobs/route.ts        # GET list, POST create
      jobs/[id]/route.ts   # GET, PATCH, DELETE
      jobs/bulk/route.ts   # POST Excel bulk import
      users/route.ts       # GET list, POST create (OWNER)
      users/[id]/route.ts  # PATCH role/pw, DELETE (OWNER)
  components/
    JobTable.tsx           # ตารางหลัก + inline add/edit + double-click + sort + filter
    JobForm.tsx            # full form (legacy, ใช้ที่ /jobs/new + /jobs/[id])
    StatsSidebar.tsx       # sidebar ซ้าย ภาพรวม + per-worker
    EtaPopup.tsx           # popup หลัง save
    UploadExcel.tsx        # ปุ่ม + modal upload Excel
    UsersAdmin.tsx         # /admin/users UI
    NavBar.tsx, Providers.tsx
  lib/
    auth.ts                # NextAuth config + role helpers
    prisma.ts              # singleton client
    eta.ts                 # STATUSES, DELIVERY_OPTIONS, computeAutoEta (legacy)
    scheduler.ts           # ⭐ Auto ETA queue logic
    stats.ts               # computeOverall + computeWorkers
  types/next-auth.d.ts     # extend Session.user.role
```

---

## Deploy

Auto: push to `main` → Vercel rebuilds ในไม่กี่นาที.

Manual: `npx vercel --prod`

**Env vars (Vercel):**
- `DATABASE_URL` — Neon pooled connection string (sslmode=require)
- `NEXTAUTH_SECRET` — random ≥32 char
- `NEXTAUTH_URL` — `https://production-tracker-beige.vercel.app`

**Schema change:**
```powershell
# แก้ prisma/schema.prisma แล้ว
$env:DATABASE_URL="<neon-url>"
npx prisma db push
npx prisma generate
git add -A; git commit -m "..."; git push
```

**Vercel logs:**
```bash
npx vercel logs --since 30m --level error --json
```

---

## Excel upload

- Template โหลดจากปุ่มในหน้า dashboard (modal upload)
- คอลัมน์รองรับ (ภาษาไทยและ English): เลขที่เอกสาร, วันที่สั่งผลิต, **เช็ค** (TRUE=เสร็จ), Delivery time, ลูกค้า, รายการ, จำนวน, ผู้รับผิดชอบ (ชื่อตรงกับ user), ETA Manual
- ไม่มี validation: ขาด field → เติม default (docNo ว่าง → `AUTO-<ts>-<i>`, qty ว่าง → 1, ฯลฯ)
- หลัง insert → recompute ETAs

---

## Known issues / Gotchas

1. **docNo unique** — สร้างซ้ำ → 409. ฟอร์มต้องใส่ unique value
2. **เซล dropdown** — ดึงจาก user ที่ role = SALES. ถ้ายังไม่มีใน /admin/users ก็ไม่มี option
3. **Prisma client lock บน Windows** — ตอน dev server รัน, `prisma generate` อาจ fail ด้วย EPERM. หยุด dev ก่อน
4. **Working days** — hard-code skip ส-อา. ถ้ามีวันหยุดนักขัตฤกษ์ต้องเพิ่มเอง
5. **NEXTAUTH_URL** — ถ้าเปลี่ยน Vercel alias ต้องอัพเดต env + redeploy
6. **Connection pool** — Neon มี built-in pooler. ถ้า cold start ช้า ดู Vercel function logs

---

## Common dev tasks

| งาน | คำสั่ง / ที่แก้ |
|---|---|
| เพิ่ม status ใหม่ | `src/lib/eta.ts` STATUSES + STATUS_LABEL + STATUS_COLOR |
| เปลี่ยน rate ETA | `src/lib/scheduler.ts` RATE_SAME / RATE_DIFF / RATE_UNASSIGNED |
| เพิ่ม role | `src/lib/auth.ts` ROLES + helpers + `next-auth.d.ts` + DropDowns ใน UsersAdmin/JobTable/JobForm |
| เพิ่ม field ใน Job | schema.prisma → `prisma db push` → zod schema ทั้ง POST/PATCH → Draft type → DraftFields → table column → popup |
| Reset DB | `npx prisma db push --force-reset && npm run db:seed` (อย่าเผลอชี้ prod) |
| สร้าง user batch | เขียน script เหมือน `prisma/seed.ts` |

---

## Roadmap / ไอเดียต่อ

- WebSocket / SSE update ฝั่ง Sales realtime
- กราฟ Gantt แสดงคิวต่อช่าง
- Export Excel กลับ
- แจ้งเตือนเกิน ETA (LINE Notify / email)
- วันหยุดนักขัตฤกษ์ใน ETA calc
- ETA preview ก่อน save (เห็นก่อนกด ✓)
- รายงาน performance ต่อช่างรายเดือน

---

## Contact / Account

- Owner: tech3@automationcluster.com
- GitHub: OAKHEN1412
- Vercel team: kik0800269066-5722
