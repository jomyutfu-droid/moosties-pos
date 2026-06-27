# MOOSTTIES POS

ระบบขายหน้าร้าน (POS) สำหรับร้านเครื่องดื่ม/สมูทตี้ — React + TypeScript + Vite + Tailwind, ทำงานแบบ PWA
ออฟไลน์-ก่อน (offline-first) เชื่อมต่อ Supabase (PostgreSQL + Auth + Realtime)

ดูสเปกฉบับเต็มที่ `../MOOSTTIES_POS_System_Spec.md`

## สแต็กเทคโนโลยี

- React 18 + TypeScript + Vite, Tailwind CSS
- PWA: `vite-plugin-pwa` (service worker + manifest)
- ข้อมูล: TanStack Query (server cache) + Zustand (UI state) + Dexie.js (IndexedDB แคช + outbox)
- แบ็กเอนด์: Supabase (Postgres, Auth, RLS, Realtime, Storage)
- คิวอาร์ PromptPay: `promptpay-qr`

## โครงสร้างโฟลเดอร์

```
src/
  domain/      ตรรกะธุรกิจ (cogs.ts ต้นทุน/กำไร, stock.ts ตัดสต็อก/คืนสต็อก)
  lib/         supabase client, Dexie db, money helpers, sync (outbox)
  types/       ชนิดข้อมูลตรงกับตาราง Supabase
  pages/       หน้าจอแต่ละโมดูล (POS, เมนู, สต็อก, รายงาน, ผู้ใช้, ตั้งค่า)
  components/  UI ที่ใช้ร่วมกัน
  store/       Zustand stores (session, cart)
supabase/
  migrations/  0001_init.sql (schema หลัก), 0002_order_functions.sql (ขายบิล/ยกเลิกบิล),
               0003_stock_functions.sql (รับ/ปรับ/ตัดสต็อกวัตถุดิบ)
  seed.sql     ข้อมูลตัวอย่าง (หมวด/เมนู/สูตร/วัตถุดิบ ตามสเปกหัวข้อ 15)
```

## เริ่มต้นใช้งาน

### 1) สร้างโปรเจกต์ Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com)
2. ไปที่ SQL Editor แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_order_functions.sql`
   - `supabase/migrations/0003_stock_functions.sql`
   - `supabase/seed.sql` (ข้อมูลตัวอย่าง — ข้ามได้ถ้าจะกรอกเมนูเอง)
3. ไปที่ Project Settings → API คัดลอก `Project URL` และ `anon public key`

### 2) ตั้งค่า environment

```bash
cp .env.example .env
```

แก้ไข `.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

### 3) ติดตั้งและรัน

```bash
npm install
npm run dev
```

เปิด http://localhost:5173

### 4) สร้างผู้ใช้แรก (เจ้าของร้าน)

ใน Supabase → Authentication → Users → Add user (อีเมล/รหัสผ่าน)
จากนั้นเพิ่มแถวใน `public.users` ที่มี `email` ตรงกัน และ `role = 'owner'`

## คำสั่งที่ใช้บ่อย

```bash
npm run dev      # dev server
npm run build    # build production (รวม PWA)
npm run preview  # preview build
npm run lint     # ตรวจ ESLint
```

## Deploy (Vercel)

1. Push โค้ดขึ้น Git repository
2. สร้างโปรเจกต์ใหม่ใน [Vercel](https://vercel.com) แล้วเชื่อม repo
3. ตั้งค่า Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel จะรัน `npm run build` และ serve โฟลเดอร์ `dist/`

## หลักการสำคัญ (ตามสเปก)

- **เงิน**: ทศนิยม 2 ตำแหน่ง | **สต็อก**: ทศนิยม 3 ตำแหน่ง
- **COGS/แก้ว** = Σ(recipe_item.qty × ingredient.cost_per_unit) + ส่วนปรับจากตัวเลือก
- **กำไร/แก้ว** = ราคาขาย − COGS
- **ตัดสต็อก** เกิดขึ้นเมื่อบิลมีสถานะ `paid` เท่านั้น (ผ่าน RPC `submit_order` แบบ atomic)
- **ยกเลิกบิล** (`void_order`) จะคืนสต็อกที่ตัดไปโดยอัตโนมัติ
- **เลขบิล**: รูปแบบ `YYYYMMDD-NNN` รันต่อวัน
- **ออฟไลน์**: ข้อมูลเมนู/สูตร/วัตถุดิบแคชใน IndexedDB (Dexie); บิลที่ขายตอนออฟไลน์เก็บใน outbox แล้ว sync ด้วย `client_uuid` (ป้องกันบันทึกซ้ำ)
- **สิทธิ์**: owner / manager / staff ตามตารางสิทธิ์ในสเปกหัวข้อ 3, สลับผู้ใช้ด้วย PIN
- ทุกการกระทำที่กระทบเงิน/สต็อก/สิทธิ์ บันทึกลง `audit_log`

## สถานะการพัฒนา

ครบทุกโมดูล v1 ตามสเปกหัวข้อ 13: โครงโปรเจกต์/PWA, schema+seed+ฟังก์ชัน SQL, ชั้น lib (supabase/Dexie/money/sync),
domain logic (cogs/stock), auth & routing (login + PIN + สิทธิ์), เมนู/สูตร, POS (ตะกร้า/ชำระเงิน/ใบเสร็จ),
สต็อก (รับ/ปรับ/แจ้งเตือนของใกล้หมด), รายงาน + ปิดกะ, ผู้ใช้/สิทธิ์ และตั้งค่าระบบ

**สิ่งที่ต้องทำต่อก่อนใช้งานจริง:**
- สร้างโปรเจกต์ Supabase แล้วรัน migrations + seed ตามขั้นตอนด้านบน
- ตั้งค่า `.env` แล้ว `npm install` (ยังไม่ได้รันในเครื่องนี้ — ต้องรันเองครั้งแรก)
- สร้างผู้ใช้เจ้าของร้านคนแรกตามขั้นตอนที่ 4
- ตรวจสอบ RLS policies ใน `0001_init.sql` ให้ตรงกับสิทธิ์ที่ต้องการก่อน deploy จริง
- เปลี่ยนไอคอนแอป (`public/icons/icon.svg`) เป็นโลโก้จริงของร้าน
- `audit_log` ยังไม่ถูกเขียนจากฝั่งแอป (โครงตารางพร้อมแล้ว แต่ยังไม่ได้ wire การบันทึก)
