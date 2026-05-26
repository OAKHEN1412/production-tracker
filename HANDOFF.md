# Production Tracker — Handoff

ระบบติดตามการผลิตกระบอกลม (pneumatic cylinder). Production/Support กรอกงาน → ระบบคำนวณ ETA อัตโนมัติ → Sales เห็น read-only. มีจัดการสต๊อกวัสดุ + recipe รุ่นกระบอก + รับเข้าคลังพร้อมรูปยืนยัน + ตัดสต๊อกอัตโนมัติตามการผลิต.

- **Production URL:** https://production-tracker-beige.vercel.app
- **GitHub:** https://github.com/OAKHEN1412/production-tracker (`main` = production)
- **Owner:** owner@autocluster.com / owner1234

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Auth | NextAuth (Credentials, JWT session) |
| DB | Postgres (Neon, **ap-southeast-1 / Singapore**) |
| ORM | Prisma 5 |
| UI | Tailwind CSS |
| Excel | xlsx (client-side parse) |
| Hosting | Vercel (auto-deploy on push to `main`, **region pinned `sin1`**) |

---

## Quick start (local)

```powershell
git clone https://github.com/OAKHEN1412/production-tracker.git
cd production-tracker
npm install
cp .env.example .env   # ใส่ DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npx prisma db push     # sync schema (ใช้ Neon URL เดียวกับ prod ก็ได้)
npm run db:seed        # สร้าง user เริ่มต้น
npm run dev
```

หรือใช้ `setup.bat` / `setup.ps1` ใน repo. Default accounts ดูใน `prisma/seed.ts`.

---

## Roles

| Role | สิทธิ์ |
|---|---|
| **OWNER** | ทุกอย่าง + จัดการ user ที่ `/admin/users` |
| **PRODUCTION** | สร้าง/แก้/ลบงาน, เปลี่ยน status, override ETA, จัดการวัสดุ, รับเข้าคลัง, recipe รุ่นกระบอก, **อนุมัติคำขอ SUPPORT** (`/approvals`) |
| **SUPPORT** | สร้าง**คำขอ**งาน (→ status `WAITING_APPROVAL`) + แก้/ลบเฉพาะของตัวเอง. **ไม่ตั้ง** ช่าง/วัสดุ/รุ่น/status/ETA (PRODUCTION กรอกตอน approve). อ่านอย่างเดียวบนวัสดุ/รุ่น |
| **SHIPPING** | รับเข้าคลัง + จัดการสต๊อกวัสดุ (ไม่ยุ่งงานผลิต/recipe/user) |
| **SALES** | read-only |

Helpers ใน `src/lib/auth.ts`:
- `canCreateJob` = OWNER / PRODUCTION / SUPPORT
- `canFullEdit` = OWNER / PRODUCTION (ใช้กับ products/recipe)
- `canReceiveStock` = OWNER / PRODUCTION / SHIPPING (รับเข้าคลัง)
- `canEditMaterials` = OWNER / PRODUCTION / SHIPPING (จัดการวัสดุ — SUPPORT อ่านอย่างเดียว)

ทุก API route เช็ค role; page ส่ง `canEdit`/`canReceive` ลง component เพื่อซ่อนปุ่ม. SUPPORT ที่เปิดฟอร์มงานจะไม่เห็นช่อง ช่าง/รุ่น/วัสดุ/status/ETA (server ignore อยู่แล้ว — ดู PATCH `jobs/[id]` strip `assignedToId`+`materials` สำหรับ SUPPORT).

**Nav แสดงตาม role** (`NavBar.tsx`): OWNER เห็นทุกเมนู; PRODUCTION = Dashboard·รออนุมัติ·ประวัติ·คลัง·รุ่น·งานใหม่; SUPPORT = Dashboard·ประวัติ·งานใหม่; SHIPPING = Dashboard·คลัง; SALES = Dashboard·ประวัติ. ลิงก์ "รออนุมัติ" มี badge นับจาก `/api/jobs/pending-approval`.

**คลัง** = หน้าเดียว `/warehouse` (tab สต๊อกวัสดุ + รับเข้าคลัง, `WarehouseTabs`). `/materials`→redirect `/warehouse`, `/deliveries`→`/warehouse?tab=receive`. BOM editor ใช้ component กลาง `BomEditor` (ProductsTable/JobForm/ApprovalsView ใช้ร่วม — กัน drift).

### Approval workflow (SUPPORT → PRODUCTION)

SUPPORT สร้างงาน = **คำขอ** (กรอกแค่ docNo/วันสั่ง/ลูกค้า/รายการ/จำนวน/เซล/หมายเหตุ) → บันทึกเป็น status `WAITING_APPROVAL` (ไม่มี BOM/ช่าง/ETA, ไม่ตัดสต๊อก, scheduler ข้าม). PRODUCTION/OWNER เปิด `/approvals` → เลือกรุ่น/ระบุวัสดุ/เลือกช่าง → **อนุมัติ** = PATCH `{status: PENDING, assignedToId, materials, item, qty}` (เข้าคิวรอผลิต + ตัดสต๊อก + คิด ETA) หรือ **ไม่อนุมัติ** = CANCELLED. ผู้สร้างคำขอ (`createdBy`) แสดงในหน้า approvals + job detail.

---

## ETA Logic

อยู่ใน `src/lib/scheduler.ts`. Trigger ทุกครั้งที่ POST/PATCH/DELETE /api/jobs ผ่าน `recomputeWorkerQueues()`.

**Rate (ชิ้น / วันทำการ):**
- มีช่าง + `item` ตรงกับงานก่อนหน้าในคิวช่าง → **8**
- มีช่าง + `item` ต่าง → **4**
- ไม่ assign ช่าง → **6**

**คิว:** 1 ช่าง = serial ทีละงาน เรียง `createdAt`; งาน unassigned baseline = ETA งานช้าสุดในระบบ; ข้ามเสาร์-อาทิตย์.

**Popup:** หลัง save (สร้าง / แก้ assignee·qty·item·ETA) pop แสดงวันเสร็จ + ช่าง + เซล + delivery label.

---

## Stock / Materials (สำคัญ)

Logic อยู่ใน `src/lib/stock.ts`. แนวคิด: **`Job.materialsDeducted` flag + reconcile แบบ delta**.

- **ตัดสต๊อก:** งานมี BOM (วัสดุที่ใช้/ชิ้น) → ตัดทันทีเมื่อบันทึก = `qtyPerUnit × job.qty`.
- **`reconcileJobMaterials`** — คำนวณส่วนต่างระหว่าง "ที่ตัดไปแล้ว" กับ "ที่ควรเป็น" แล้วปรับเฉพาะ delta ใน transaction เดียว. ครอบ: แก้ qty / เพิ่ม-ลบ-เปลี่ยนวัสดุ / ยกเลิก-reactivate / ลบงาน.
- **ยกเลิกงาน** (cancelled flag หรือ status CANCELLED) → คืนสต๊อก; reactivate → ตัดกลับ. (`shouldDeduct = มี BOM && ไม่ยกเลิก`)
- **ลบงาน** → `restoreDeductedMaterials` คืนตาม flag.
- **deduct-on-DONE** เป็น safety net สำหรับ row เก่าที่มี BOM แต่ flag ยังไม่ตัด.
- **invariant:** เมื่อ `materialsDeducted=true` ⇒ สต๊อกที่ตัด = BOM ปัจจุบัน × qty ปัจจุบันเสมอ.
- **สต๊อกติดลบได้** (by design — สร้างงานก่อนของเข้า / backorder). `minQty` = เกณฑ์เตือนใกล้หมดเท่านั้น.

หน้าวัสดุ (`/materials`): ค้นหา, filter หมวด/ใกล้หมด, เพิ่ม/แก้/ลบ, **± ปรับ** (relative adjustDelta — ทางเดียวที่เปลี่ยน qty ตอนแก้ เพื่อกัน lost-update), อัปโหลด Excel. การลบวัสดุถูก block ถ้าถูกใช้ในงาน/รุ่น.

### Length tracking (TUBE/ROD)

วัสดุหน่วย **"เส้น" / "เมตร"** (`LENGTH_UNITS` ใน `src/lib/materials.ts`) เก็บความยาวต่อเส้น (mm):

- ตาราง **`MaterialLength`** (materialId, lengthMm, qty) — จำนวนเส้นแยกตามความยาว. `Material.qty` = ผลรวมทุก bucket (จำนวนเส้นรวม) → logic นับชิ้นเดิมไม่กระทบ.
- helper: `addPieces`, `removePiecesAtLength`, `syncMaterialBuckets` (จัดให้ Σbucket == qty หลัง count-only change; production deduct ตัดเส้นสั้นสุดก่อน; คืน → เข้า bucket `lengthMm=0` "ไม่ระบุ").
- **บังคับระบุความยาว 3 จุด:** รับเข้าคลัง, ± ปรับ, เพิ่มวัสดุใหม่ (validate ทั้ง client + server).
- แสดง: `7 เส้น · รวม 41.60 ม. · 6000×5, 5800×2 mm`.
### Length-cut deduction (ตัดตามความยาวจริง)

recipe/BOM เก็บ `cutLengthMm` = ความยาวตัด (mm) ต่อหน่วยผลิต สำหรับวัสดุ length-tracked (UI หน้ารุ่น/ฟอร์มงาน/approve ใส่เป็น mm, set `qtyPerUnit=1`). เมื่อตัดสต๊อก (`reconcileJobMaterials` → `cutFromBuckets`):
- **best-fit**: ตัดจากเส้นสั้นสุดที่ ≥ ความยาวตัด, เศษกลับเป็น bucket ใหม่ (offcut). lengthMm 0 = ไม่ระบุ ตัดไม่ได้.
- **ความยาวไม่พอ** → throw `InsufficientStockError` → route คืน 400 (ก่อนเขียน DB; PATCH reconcile **ก่อน** job.update; POST ลบงานที่เพิ่งสร้าง).
- **แก้/ยกเลิก/ลบ** → คืน cut pieces เป็น offcut ยาว `cutLengthMm` (`addPieces`). edit = restore เก่า + cut ใหม่ (มม.รวมคงที่).
- `Material.qty` (จำนวนเส้น) = Σ buckets เสมอ (cut path เซ็ต qty = Σ final buckets).
- วัสดุ length-tracked ที่ `cutLengthMm=0` → ใช้ count path เดิม (ตัดจำนวนเส้น, trim สั้นสุด) — backward compatible.
- หน้าคลัง แสดง breakdown ความยาว → เห็นเศษเหลือหลังตัด. ปุ่ม **📏 ความยาว** (`LengthEditor`) เปิดตารางเพิ่ม/แก้/ลบ จำนวนเส้นต่อความยาว → `PUT /api/materials/[id]/lengths` (replace buckets, set qty=Σ). buckets นี้คือตัวที่ recipe/approve ตัด.

---

## Receiving / Deliveries

`/deliveries` (canReceiveStock). รับพัสดุเข้าคลัง + **รูปยืนยัน** (บังคับ).
- รูปถูก compress client-side (max 1024px, jpeg 0.7), เก็บเป็น base64 ใน `Delivery.photo`, serve ผ่าน `/api/deliveries/[id]/photo` (lazy thumbnail, cache immutable).
- เลือกวัสดุ + จำนวน → **บวกสต๊อก**. วัสดุ length-tracked ต้องใส่ความยาว/เส้น (mm) → `addPieces`.

---

## Products (recipe รุ่นกระบอก)

`/products` (canFullEdit). ตั้งสูตรว่ารุ่นกระบอกใช้วัสดุอะไร/ชิ้น. ตอนสร้างงานเลือกรุ่น → prefill `item` + BOM ของงาน. ไม่มี FK กลับ (งาน copy recipe ตอนสร้างเท่านั้น). ลบรุ่นไม่กระทบงาน.

---

## Excel import

**งาน** — ปุ่มในหน้า dashboard (`UploadExcel`). คอลัมน์ไทย/อังกฤษ: เลขที่เอกสาร, วันที่สั่งผลิต, เช็ค (TRUE=เสร็จ), Delivery time, ลูกค้า, รายการ, จำนวน, ผู้รับผิดชอบ, ETA Manual. ขาด field → default. → `POST /api/jobs/bulk`.

**วัสดุ** — ปุ่มในหน้า materials (`UploadMaterialsExcel`). คอลัมน์: รหัส, ชื่อวัสดุ, หมวด, หน่วย, คงเหลือ, ขั้นต่ำ, ที่เก็บ, หมายเหตุ. ซ้ำ (code/name) → ข้าม + รายงาน. header ไม่ตรง → เตือน (ไม่เงียบ). → `POST /api/materials/bulk`.
- ไฟล์ master TUBE/ROD 63 รายการถูก import แล้ว (จาก `materials-import.xlsx`, gitignored). `*.xlsx` อยู่ใน .gitignore.

---

## Schema (`prisma/schema.prisma`)

```
User      id, username (unique), password (bcrypt), name, role
Job       id, seq (unique), docNo (unique), orderDate, deliveryTime (auto),
          customer, item, qty, status, cancelled, notes,
          rate, etaAuto (auto), etaManual, startedAt, finishedAt,
          materialsDeducted (bool),
          assignedToId, salesOwnerId, createdById → User
JobLog        id, jobId, status, message, createdAt
JobMaterial   id, jobId, materialId, qtyPerUnit, cutLengthMm   @@unique([jobId, materialId])   # BOM ของงาน
Material      id, code (unique?), name, category, unit, qty, minQty, location, notes
MaterialLength id, materialId, lengthMm, qty       @@unique([materialId, lengthMm]) # breakdown ความยาว
Product       id, code (unique?), name (unique), notes              # รุ่นกระบอก
ProductMaterial id, productId, materialId, qtyPerUnit, cutLengthMm @@unique([productId, materialId]) # recipe
Delivery      id, title, note, photo (base64), qtyReceived, lengthMm, materialId, createdById
```

**Status** (string): WAITING_APPROVAL / PENDING / IN_PROGRESS / PAUSED / QC / DONE / CANCELLED — label/สีใน `src/lib/eta.ts`. (string column → เพิ่ม status ใหม่ไม่ต้อง migrate)
**Material categories / units** — `src/lib/materials.ts` (MATERIAL_CATEGORIES, MATERIAL_UNITS, LENGTH_UNITS).

---

## Project layout

```
prisma/  schema.prisma, seed.ts, cleanup-users.ts
src/
  app/
    page.tsx                 # dashboard (JobTable + StatsSidebar)
    login/  history/  products/  warehouse/    # pages (force-dynamic)
    materials/ deliveries/            # redirect → /warehouse (เก็บ link เก่า)
    approvals/page.tsx       # PRODUCTION/OWNER อนุมัติคำขอ SUPPORT
    admin/users/page.tsx     # OWNER only
    jobs/new, jobs/[id]      # JobForm
    api/
      jobs/ (route, [id], bulk, pending-approval)
      materials/ (route, [id], bulk)
      products/ (route, [id])
      deliveries/ (route, [id]/photo)
      users/ (route, [id])
      auth/[...nextauth]/route.ts
  components/
    JobTable, JobForm, EtaPopup, StatsSidebar, UploadExcel,
    MaterialsTable, UploadMaterialsExcel, ProductsTable,
    DeliveriesView, HistoryView, UsersAdmin, NavBar, Providers,
    ApprovalsView, WarehouseTabs, BomEditor
  lib/
    auth.ts        # NextAuth + role helpers
    prisma.ts      # singleton
    eta.ts         # STATUSES, labels, colors
    scheduler.ts   # ⭐ ETA queue
    stock.ts       # ⭐ reconcile / deduct / restore / length buckets
    materials.ts   # categories, units, length helpers, formatters
    stats.ts       # computeOverall + computeWorkers
    history.ts     # computeDurations (เวลาต่อ status จาก JobLog)
```

---

## Deploy

Auto: push to `main` → Vercel rebuild (Git integration). Manual fallback: `vercel --prod --yes` (team `kik0800269066-5722`).

**`vercel.json`** pin `regions: ["sin1"]` ให้ function อยู่ติด DB (Singapore) — เคยช้าเพราะ function รัน US แต่ DB Singapore (ข้ามทวีป ~200-250ms/query).

**Env vars (Vercel):** `DATABASE_URL` (Neon), `NEXTAUTH_SECRET` (≥32 char), `NEXTAUTH_URL`.

เช็ค deploy ผ่าน GitHub deployments API:
```bash
gh api repos/OAKHEN1412/production-tracker/deployments --jq '.[0]'
gh api repos/OAKHEN1412/production-tracker/deployments/<id>/statuses --jq '.[0]|{state,url:.environment_url}'
```

**Schema change:** แก้ `schema.prisma` → `npx prisma db push` (ชี้ prod ได้, additive ปลอดภัย) → `npx prisma generate` → commit + push.

---

## Known issues / Gotchas

1. **DB region** — DB อยู่ Singapore; function ต้อง `sin1` (ตั้งใน vercel.json). อย่าเปลี่ยน region ไม่ตรง DB.
2. **Neon free tier auto-suspend** — DB หลับเมื่อ idle → request แรกหลังหยุดนานช้า (~0.5-2s). แก้: upgrade Neon.
3. **Pooled connection** — `DATABASE_URL` ควรใช้ Neon `-pooler` host สำหรับ serverless concurrency.
4. **สต๊อกติดลบได้** — by design (backorder). ไม่มี hard guard.
5. **Length deduction** — production ตัดเส้นสั้นสุดก่อน (BOM ไม่ระบุความยาว). คืน → bucket "ไม่ระบุ".
6. **seq / docNo unique** — สร้างพร้อมกัน 2 คนอาจชน seq → 500 (โอกาสต่ำ). docNo ซ้ำ → 409.
7. **Excel "เช็ค" ว่าง** override status เป็น PENDING ถ้ามีทั้งคอลัมน์ status + เช็ค.
8. **Material `test`** — qty -72 ค้างจากการเทส (ลบได้ถ้าไม่ถูกใช้).
9. **Prisma EPERM บน Windows** — หยุด dev server ก่อน `prisma generate`.
10. **NEXTAUTH_URL** — เปลี่ยน alias ต้องอัปเดต env + redeploy.

---

## Common dev tasks

| งาน | ที่แก้ |
|---|---|
| เพิ่ม status | `lib/eta.ts` STATUSES + label + color |
| เปลี่ยน rate ETA | `lib/scheduler.ts` RATE_* |
| เพิ่ม role | `lib/auth.ts` ROLES + helpers + `next-auth.d.ts` + dropdowns (UsersAdmin/JobTable/JobForm) |
| เพิ่ม field Job | schema → `db push` → zod POST/PATCH → Draft → DraftFields → column → popup |
| เพิ่มหมวด/หน่วยวัสดุ | `lib/materials.ts` MATERIAL_CATEGORIES / MATERIAL_UNITS / LENGTH_UNITS |
| แก้ logic ตัดสต๊อก | `lib/stock.ts` reconcileJobMaterials / addPieces / syncMaterialBuckets |
| Reset DB | `npx prisma db push --force-reset && npm run db:seed` (อย่าชี้ prod) |

---

## Roadmap / ที่เหลือ-ไอเดียต่อ

- ~~ตัดสต๊อกตามความยาวจริง~~ ✅ ทำแล้ว (cutLengthMm + best-fit cut, ดู "Length-cut deduction")
- ประวัติการเคลื่อนไหวสต๊อก (stock movement log) + ใครปรับเมื่อไหร่
- Export Excel กลับ (งาน / สต๊อก)
- แจ้งเตือนใกล้หมด / เกิน ETA (LINE Notify / email)
- วันหยุดนักขัตฤกษ์ใน ETA calc
- กราฟ Gantt คิวต่อช่าง / รายงาน performance รายเดือน
- realtime update ฝั่ง Sales (SSE)
- ลบ material `test` ที่ค้าง

---

## Contact

- Owner: tech3@automationcluster.com
- GitHub: OAKHEN1412 · Vercel team: kik0800269066-5722
