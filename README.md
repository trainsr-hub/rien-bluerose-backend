# Rose Beeper Gateway (Cloudflare Worker)

> **Serverless Edge Spoon-Feeder for Rien-Prescript-Beeper & ESP32 Microcontrollers**  
> **Backend Database**: Turso Cloud SQLite (`heraclitus-rien-bluerose`)  
> **Runtime**: Cloudflare Workers (V8 Edge Isolate, 0ms Cold Start, 100k requests/day Free Tier)

---

## 1. System Architecture

```
┌──────────────────────────┐       GET /?count=10       ┌──────────────────────────┐      SQL Pipeline v2       ┌──────────────────────────┐
│  ESP32 / Beeper Device   │ ─────────────────────────> │    Cloudflare Worker     │ ─────────────────────────> │    Turso Cloud SQLite    │
│ (WiFiClient / Arduino)   │ <───────────────────────── │   (rose-beeper-gateway)  │ <───────────────────────── │(heraclitus-rien-bluerose)│
└──────────────────────────┘      Spoon-Fed Clean       └──────────────────────────┘       Raw SQL Rows         └──────────────────────────┘
                                    JSON Array
```

---

## 2. Deployment Guide (Connecting to Cloudflare via Git)

### Step 1: Create GitHub Repository
Create a new GitHub repository named `rose-beeper-gateway` on your GitHub account (`trainsr-hub`) and push this folder:

```bash
cd "D:\My Drive\Blue AI\GithubTempRepos\rose-beeper-gateway"
git init
git add .
git commit -m "feat: initial commit for rose-beeper-gateway"
git branch -M main
git remote add origin https://github.com/trainsr-hub/rose-beeper-gateway.git
git push -u origin main
```

### Step 2: Connect to Cloudflare Workers
1. Open **[dash.cloudflare.com](https://dash.cloudflare.com)**.
2. In the sidebar, navigate to **Compute (Workers) -> Workers & Pages**.
3. Click **Create Application** -> Select **Pages / Workers** -> Click **Connect to Git**.
4. Select your GitHub repository: `trainsr-hub/rose-beeper-gateway`.
5. Select Project Name: `rose-beeper-gateway`.
6. Click **Save and Deploy**.

### Step 3: Configure Cloudflare Secrets
Once deployed, configure your database credentials:
1. Go to your Worker's dashboard in Cloudflare -> Click **Settings** -> **Variables and Secrets**.
2. Click **Add Variable / Secret** for:
   - `TURSO_DATABASE_URL`: `https://heraclitus-rien-bluerose.aws-ap-southeast-2.turso.io`
   - `TURSO_AUTH_TOKEN`: *(Paste your Turso JWT authentication token)*
   - `ESP32_SECRET_KEY`: *(Optional, e.g. `bluerose2026` if you wish to password-protect the endpoint)*
3. Click **Deploy / Save**.

---

## 3. API Contract (Spoon-Fed to ESP32)

### Endpoint: `GET /`
- **Query Params**:
  - `count`: Number of random quotes to return (default: `10`, max: `25`).
  - `key`: Optional security secret if `ESP32_SECRET_KEY` is configured.

### Response Payload:
```json
[
  {
    "idx": 6,
    "content": "Nỗi sợ lớn nhất của một người đàn ông chính là nước mắt đàn bà...",
    "context": "Backdrop: Suy ngẫm về sự yếu lòng...",
    "date": "2021~2023",
    "specific": "Đàn ông thích mèo, đàn bà yêu chó",
    "container": "Spiderum - Linh Vũ",
    "cat": "writing",
    "tags": ["#Heartbroken"]
  },
  {
    "idx": 1,
    "content": "Static, hum, tum, needle drops,\nSpinning, echo, time just stops.",
    "context": "",
    "date": "2025-07",
    "specific": "Vinyl Angel",
    "container": "Koi no Koe",
    "cat": "music",
    "tags": ["#Acoustic"]
  }
]
```

---

## 4. Minimal ESP32 Arduino C++ Code

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void fetch10QuotesFromGateway() {
  HTTPClient http;
  http.begin("https://rose-beeper-gateway.<your-subdomain>.workers.dev/?count=10");
  int code = http.GET();

  if (code == 200) {
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, http.getString());
    JsonArray quotes = doc.as<JsonArray>();

    Serial.printf("Received %d spoon-fed quotes!\n", quotes.size());
    for (JsonObject q : quotes) {
      long idx         = q["idx"];
      const char* text = q["content"];
      const char* auth = q["container"];
      Serial.printf("#%ld by %s\n", idx, auth);
    }
  }
  http.end();
}
```
