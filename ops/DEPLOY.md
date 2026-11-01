# Bajiman — VPS এ তোলা

এই Deploy ফোল্ডারে ছয়টা অংশ আছে:

| ফোল্ডার | কী | ঠিকানা |
| --- | --- | --- |
| `client/` | খেলোয়াড়ের সাইট (build) | https://bajiman.com |
| `affiliate/` | অ্যাফিলিয়েট (build) | https://m-affiliate.bajiman.com |
| `admin/` | admin প্যানেল (build) | admin এর ঠিকানা |
| `brand/` | ব্র্যান্ড সাইট (build) | https://brand.bajiman.com |
| `guide/` | গাইড সাইট (build) | https://guide.bajiman.com |
| `api/` | server — কোড আর `.env` (পোর্ট **3001**) | https://api.bajiman.com |

## তোলার নিয়ম

1. `client/`, `affiliate/`, `admin/`, `brand/`, `guide/` — VPS এ এখন যেখানে এই সাইটগুলো আছে, সেখানে পুরোনো ফাইলের উপর তুলুন।
2. `api/` — VPS এর server ফোল্ডারে পুরোনোর উপর তুলুন।
   - `api/.env` লুকানো ফাইল, সেটাও যেন যায়। তোলার পর `ls -a` দিয়ে দেখে নিন।
   - **VPS এর `uploads/` ফোল্ডার মুছবেন না।** ওখানে admin এর আপলোড করা ছবি আছে। এই Deploy এ `api/uploads` এ শুধু `nine-wicket.png` আছে, সেটা পাশে যোগ হবে।
   - `node_modules` তুলবেন না।
3. VPS এ server ফোল্ডারে:
   ```bash
   npm install --omit=dev
   pm2 restart <bajiman এর pm2 নাম>
   ```
   (pm2 এর নাম `pm2 list` এ দেখা যায়।)

## এই আপডেটে নতুন যা এসেছে

- **Personal Auto Deposit (MFSWallet):** admin › Deposit › **Personal Auto Deposit** এ MFSWallet এর API key দিয়ে চালু করুন, মাধ্যমগুলোর লোগো আপলোড করুন। শুরুতে বন্ধ। গেটওয়ে মেলাতে না পারা লেনদেন **Personal Deposit History** তে Confirm/Reject।
- **Pending notification:** সাইডবারে লাল ব্যাজ, উপরের ঘণ্টায় তালিকা, dashboard এ "Waiting for you"। কিছু বসাতে হয় না।
- **Dashboard:** ম্যানুয়াল/অটো/পার্সোনাল ডিপোজিট আর ম্যানুয়াল/অটো উত্তোলন আলাদা করে, মোট আর আজকের।
- **9 Wicket:** admin › Game › **9 Wicket** থেকে চালু করুন (শুরুতে বন্ধ)। চালু হলে client এর Sports এ দেখায়। Oracle এর সাথে গেমের callback একই (`/api/callback`)।

## `api/.env`

ডাটাবেস (`bajiman`) আর JWT এর গোপন তথ্য — কাউকে দেবেন না। পোর্ট 3001, `PUBLIC_BACKEND_URL=https://api.bajiman.com`, `PUBLIC_FRONTEND_URL=https://bajiman.com`।
